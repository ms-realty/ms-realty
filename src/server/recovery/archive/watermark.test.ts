import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import {
  maxWireBytes,
  type Signer,
  signEvidence,
} from "../../../../gateway/recovery-coordinator-contract";
import { type ArchiveFixture, archiveFixture, sqliteFixture } from "./testing";
import { AuthorityReader, privateAuthorityTransport } from "./watermark";

let f: ArchiveFixture, dir: string, db: ReturnType<typeof sqliteFixture>;
beforeEach(async () => {
  f = await archiveFixture();
  dir = await mkdtemp(join(tmpdir(), "msr-r08-authority-"));
  db = sqliteFixture(join(dir, "authority.sqlite"), f);
});
it("R08 D20 rejects changed restore identity, corrupt signature and authority incarnation", async () => {
  const challenge = randomUUID();
  for (const kind of ["restore", "signature", "incarnation"] as const) {
    const response = {
      contextDigest: f.contextDigest,
      authority: f.admission.authority,
      challenge,
      restoreId: kind === "restore" ? "other-restore" : "synthetic-restore",
      destinationInstance: "synthetic-target",
      head: f.head,
    };
    if (kind === "incarnation")
      response.authority = { ...response.authority, incarnation: "other-incarnation" };
    let raw = await signEvidence(
      "recovery-authority",
      f.admission.authority.id,
      response,
      f.signers.authority as Signer,
    );
    if (kind === "signature") {
      const parts = raw.split(".");
      const signature = Buffer.from(parts[2] as string, "base64url");
      signature[0] = (signature[0] as number) ^ 1;
      parts[2] = signature.toString("base64url");
      raw = parts.join(".");
    }
    let retained = 0;
    const reader = new AuthorityReader(
      f.admission,
      f.floor,
      f.roots,
      f.signers.command as Signer,
      async () => ({ raw, cacheControl: "no-store" }),
      async () => {
        retained++;
      },
    );
    await expect(
      reader.readCurrentWatermark("synthetic-restore", "synthetic-target", challenge),
    ).rejects.toThrow();
    expect(retained).toBe(0);
  }
});
it("R08 D21 concurrent reads serialize outside-floor retention before the next authority request", async () => {
  let release!: () => void, entered!: () => void;
  const pause = new Promise<void>((r) => {
    release = r;
  });
  const firstRetain = new Promise<void>((r) => {
    entered = r;
  });
  let reads = 0,
    retained = 0;
  const reader = new AuthorityReader(
    f.admission,
    f.floor,
    f.roots,
    f.signers.command as Signer,
    async (raw) => {
      reads++;
      return { raw: await db.core.readCurrent(raw), cacheControl: "no-store" };
    },
    async () => {
      if (++retained === 1) {
        entered();
        await pause;
      }
    },
  );
  const first = reader.readCurrentWatermark("synthetic-restore", "synthetic-target");
  await firstRetain;
  const second = reader.readCurrentWatermark("synthetic-restore", "synthetic-target");
  await Promise.resolve();
  expect(reads).toBe(1);
  release();
  await Promise.all([first, second]);
  expect(reads).toBe(2);
  expect(retained).toBe(2);
});
it("R08 D27 authority transport cancels oversized streams and rejects redirected responses", async () => {
  let cancelled = false;
  const response = new Response(
    new ReadableStream({
      pull(controller) {
        controller.enqueue(new Uint8Array(maxWireBytes));
      },
      cancel() {
        cancelled = true;
      },
    }),
    { headers: { "cache-control": "no-store" } },
  );
  Object.defineProperty(response, "url", { value: `${f.admission.origin}/v1/current` });
  await expect(
    privateAuthorityTransport(f.admission, (async () => response) as typeof fetch)("synthetic"),
  ).rejects.toThrow("exceeds bound");
  expect(cancelled).toBe(true);
  const redirected = new Response("untrusted", { status: 302 });
  Object.defineProperty(redirected, "url", { value: "https://foreign.example.test/v1/current" });
  await expect(
    privateAuthorityTransport(f.admission, (async () => redirected) as typeof fetch)("synthetic"),
  ).rejects.toThrow("redirected");
});
afterEach(async () => {
  db.db.close();
  await rm(dir, { recursive: true, force: true });
});
it("R08 D20 authenticated noncacheable challenge read persists independent floor and keeps currentness unknown", async () => {
  const retained: unknown[] = [];
  const reader = new AuthorityReader(
    f.admission,
    f.floor,
    f.roots,
    f.signers.command as Signer,
    async (raw) => ({ raw: await db.core.readCurrent(raw), cacheControl: "no-store" }),
    async (receipt) => {
      retained.push(receipt);
    },
  );
  const challenge = randomUUID();
  expect(
    await reader.readCurrentWatermark("synthetic-restore", "synthetic-destination", challenge),
  ).toMatchObject({ currentness: "unknown", quarantine: "required", archiveBarrier: null });
  expect(retained).toHaveLength(1);
  await expect(
    reader.readCurrentWatermark("synthetic-restore", "synthetic-destination", challenge),
  ).rejects.toThrow("reused");
  const raw = await signEvidence(
    "recovery-command",
    f.admission.authority.id,
    {
      contextDigest: f.contextDigest,
      authority: f.admission.authority,
      challenge,
      restoreId: "synthetic-restore",
      destinationInstance: "synthetic-destination",
    },
    f.signers.command as Signer,
  );
  await expect(db.core.readCurrent(raw)).rejects.toThrow("already used");
});
it("R08 D20 rejects stale challenge, substituted destination, cacheable response, signature and purpose roots", async () => {
  const good = {
    contextDigest: f.contextDigest,
    authority: f.admission.authority,
    challenge: randomUUID(),
    restoreId: "synthetic-restore",
    destinationInstance: "synthetic-target",
    head: f.head,
  };
  for (const mutation of [good, { ...good, destinationInstance: "different-target" }]) {
    const raw = await signEvidence(
      "recovery-authority",
      f.admission.authority.id,
      mutation,
      f.signers.authority as Signer,
    );
    const reader = new AuthorityReader(
      f.admission,
      f.floor,
      f.roots,
      f.signers.command as Signer,
      async () => ({ raw, cacheControl: "no-store" }),
      async () => {
        throw new Error("must not retain");
      },
    );
    await expect(
      reader.readCurrentWatermark("synthetic-restore", "synthetic-target"),
    ).rejects.toThrow("response differs");
  }
  const reader = new AuthorityReader(
    f.admission,
    f.floor,
    f.roots,
    f.signers.command as Signer,
    async () => ({ raw: "invalid.signature", cacheControl: "public" }),
    async () => {},
  );
  await expect(
    reader.readCurrentWatermark("synthetic-restore", "synthetic-target"),
  ).rejects.toThrow("cacheable");
  const wrong = await signEvidence(
    "recovery-authority",
    f.admission.authority.id,
    good,
    f.signers.command as Signer,
  );
  const untrusted = new AuthorityReader(
    f.admission,
    f.floor,
    f.roots,
    f.signers.command as Signer,
    async () => ({ raw: wrong, cacheControl: "no-store" }),
    async () => {},
  );
  await expect(
    untrusted.readCurrentWatermark("synthetic-restore", "synthetic-target"),
  ).rejects.toThrow("trust root");
});
it("R08 D21 valid signature below retained floor remains unknown; failed outside persistence yields no proof", async () => {
  const reader = new AuthorityReader(
    f.admission,
    { ...f.floor, generation: 1 },
    f.roots,
    f.signers.command as Signer,
    async (raw) => ({ raw: await db.core.readCurrent(raw), cacheControl: "no-store" }),
    async () => {},
  );
  await expect(
    reader.readCurrentWatermark("synthetic-restore", "synthetic-target"),
  ).rejects.toThrow("rollback");
  const unavailable = new AuthorityReader(
    f.admission,
    f.floor,
    f.roots,
    f.signers.command as Signer,
    async (raw) => ({ raw: await db.core.readCurrent(raw), cacheControl: "no-store" }),
    async () => {
      throw new Error("outside custody unavailable");
    },
  );
  await expect(
    unavailable.readCurrentWatermark("synthetic-restore", "synthetic-target"),
  ).rejects.toThrow("custody unavailable");
});
