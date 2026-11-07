// R08 D20-D21: a supplied tail never supplies the trust root or rollback floor.
import { randomUUID } from "node:crypto";
import { recoveryDigest } from "@/domain/recovery-archive";
import {
  type Admission,
  admissionDigest,
  authorityResponse,
  demand,
  type Floor,
  maxWireBytes,
  type Signer,
  same,
  signEvidence,
  type TrustRoot,
  verifyEvidence,
} from "../../../../gateway/recovery-coordinator-contract";
import { headDigest } from "../../../../gateway/recovery-coordinator-core";
import { validateAuthorityPins } from "./admission";

type Transport = (body: string) => Promise<{ raw: string; cacheControl: string | null }>;
/** Only a fixed private authority origin is used; redirects and cacheable responses reject. */
export function privateAuthorityTransport(
  admission: Admission,
  fetcher: typeof fetch = fetch,
): Transport {
  return async (body) => {
    const response = await fetcher(`${admission.origin}/v1/current`, {
      method: "POST",
      body,
      headers: { "content-type": "application/jose", "cache-control": "no-store" },
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });
    demand(
      response.status === 200 && response.url === `${admission.origin}/v1/current`,
      "authority transport failed/redirected",
    );
    const reader = response.body?.getReader();
    demand(reader, "authority response body missing");
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      for (;;) {
        const chunk = await reader.read();
        if (chunk.done) break;
        size += chunk.value.length;
        if (size > maxWireBytes) {
          await reader.cancel();
          throw new Error("R08 archive: authority response exceeds bound");
        }
        chunks.push(chunk.value);
      }
    } finally {
      reader.releaseLock();
    }
    const raw = new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks));
    return { raw, cacheControl: response.headers.get("cache-control") };
  };
}
export class AuthorityReader {
  private readonly challenges = new Set<string>();
  private pending: Promise<void> = Promise.resolve();
  constructor(
    private readonly admission: Admission,
    private floor: Floor,
    private readonly roots: readonly TrustRoot[],
    private readonly signer: Signer,
    private readonly transport: Transport,
    private readonly retainOutsideAccount: (receipt: {
      floor: Floor;
      raw: string;
    }) => Promise<void>,
  ) {
    validateAuthorityPins(admission, floor, roots);
  }
  readCurrentWatermark(restoreId: string, destinationInstance: string, challenge = randomUUID()) {
    const result = this.pending.then(() =>
      this.readOnce(restoreId, destinationInstance, challenge),
    );
    this.pending = result.then(
      () => {},
      () => {},
    );
    return result;
  }
  private async readOnce(restoreId: string, destinationInstance: string, challenge: string) {
    demand(
      !this.challenges.has(challenge) &&
        destinationInstance !== this.admission.context.sourceInstance,
      "challenge reused or destination is source",
    );
    this.challenges.add(challenge);
    const expected = {
      contextDigest: recoveryDigest("context-v1", this.admission.context),
      authority: this.admission.authority,
      challenge,
      restoreId,
      destinationInstance,
    };
    const request = await signEvidence(
      "recovery-command",
      this.admission.authority.id,
      expected,
      this.signer,
    );
    const response = await this.transport(request);
    demand(response.cacheControl === "no-store", "authority response is cacheable");
    const observed = await verifyEvidence(
      response.raw,
      "recovery-authority",
      this.admission.authority.id,
      this.roots,
      authorityResponse,
    );
    const { head, ...binding } = observed;
    const { digest: headHash, ...headBody } = head;
    demand(
      same(binding, expected) &&
        same(head.authority, this.floor.authority) &&
        head.admissionDigest === admissionDigest(this.admission) &&
        headHash === headDigest(headBody),
      "challenge/authority response differs",
    );
    demand(
      head.generation >= this.floor.generation &&
        (head.generation !== this.floor.generation || head.digest === this.floor.digest),
      "authority rollback below retained floor",
    );
    const next = { authority: head.authority, generation: head.generation, digest: head.digest };
    // No usable result before an independent durable receipt is retained. Never stored in source DB.
    await this.retainOutsideAccount({ floor: next, raw: response.raw });
    this.floor = next;
    return {
      head,
      raw: response.raw,
      currentness: "unknown" as const,
      archiveBarrier: null,
      quarantine: "required" as const,
    };
  }
}
