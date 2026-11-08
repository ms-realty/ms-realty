// R08: dormant separate Worker shell. No public command route, bootstrap, alarm or scheduled event.
import { importJWK, type JWK } from "jose";
import { type Floor, offlineAdmission, type TrustRoot } from "./recovery-coordinator-contract";
import { RecoveryCoordinatorCore, type RecoverySqlStorage } from "./recovery-coordinator-core";
export interface RecoveryCoordinatorEnvironment {
  RECOVERY_OFFLINE_FIXTURE?: string;
  RECOVERY_ADMISSION?: string;
  RECOVERY_FLOOR?: string;
  RECOVERY_TRUST?: string;
  RECOVERY_FIXTURE_SIGNER?: string;
}
export class RecoveryCoordinator {
  constructor(
    private readonly state: { storage: RecoverySqlStorage },
    private readonly env: RecoveryCoordinatorEnvironment,
  ) {}
  async fetch(request: Request) {
    const headers = { "cache-control": "no-store", "content-type": "application/jose" };
    if (this.env.RECOVERY_OFFLINE_FIXTURE !== "enabled")
      return new Response("inactive", { status: 503, headers });
    try {
      const url = new URL(request.url);
      const admission = offlineAdmission.parse(JSON.parse(this.env.RECOVERY_ADMISSION ?? "null"));
      if (
        request.method !== "POST" ||
        url.origin !== admission.origin ||
        !["/v1/command", "/v1/current"].includes(url.pathname) ||
        url.search ||
        url.hash
      )
        return new Response("unsupported", { status: 404, headers });
      const length = request.headers.get("content-length");
      if (length && Number(length) > 2 * 1024 * 1024)
        return new Response("oversized", { status: 413, headers });
      const reader = request.body?.getReader();
      if (!reader) return new Response("missing", { status: 400, headers });
      const chunks: Uint8Array[] = [];
      let size = 0;
      for (;;) {
        const chunk = await reader.read();
        if (chunk.done) break;
        size += chunk.value.length;
        if (size > 2 * 1024 * 1024) {
          await reader.cancel();
          return new Response("oversized", { status: 413, headers });
        }
        chunks.push(chunk.value);
      }
      const content = new Uint8Array(size);
      let at = 0;
      for (const c of chunks) {
        content.set(c, at);
        at += c.length;
      }
      const raw = new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(content);
      const key = JSON.parse(this.env.RECOVERY_FIXTURE_SIGNER ?? "null") as {
        keyId: string;
        privateKey: JWK;
      };
      const core = new RecoveryCoordinatorCore(
        this.state.storage,
        admission,
        JSON.parse(this.env.RECOVERY_FLOOR ?? "null") as Floor,
        JSON.parse(this.env.RECOVERY_TRUST ?? "null") as TrustRoot[],
        { keyId: key.keyId, privateKey: (await importJWK(key.privateKey, "EdDSA")) as CryptoKey },
      );
      const result =
        url.pathname === "/v1/current"
          ? await core.readCurrent(raw)
          : JSON.stringify(await core.execute(raw));
      return new Response(result, { headers });
    } catch {
      return new Response("unverified_or_conflict", { status: 409, headers });
    }
  }
}
export default {
  fetch() {
    return new Response("Recovery archive activation is disabled.", {
      status: 503,
      headers: { "cache-control": "no-store" },
    });
  },
};
