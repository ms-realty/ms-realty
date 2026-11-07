import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import {
  admissionDigest,
  request,
  type Signer,
  verifyEvidence,
} from "../../../../gateway/recovery-coordinator-contract";
import { loadProductionArchive } from "./admission";
import { PreparationStore } from "./preparation";
import { type ReplicationDependencies, replicateOnce } from "./replicator";
import { PrivateDirectoryArchive } from "./storage";
import { type ArchiveFixture, archiveFixture, sqliteFixture } from "./testing";

let f: ArchiveFixture,
  dir: string,
  local: ReturnType<typeof sqliteFixture>,
  dependencies: ReplicationDependencies;
beforeEach(async () => {
  f = await archiveFixture();
  dir = await mkdtemp(join(tmpdir(), "msr-r08-replicate-"));
  local = sqliteFixture(join(dir, "authority.sqlite"), f);
  for (const name of ["spool", "eu", "outside"]) await mkdir(join(dir, name), { mode: 0o700 });
  const preparations = new PreparationStore(join(dir, "spool"), f.admission.limits.maxObjectBytes);
  dependencies = {
    selectedAdmissionDigest: admissionDigest(f.admission),
    source: async () => ({
      observation: f.observation,
      bodies: new Map([[f.payload.digest, Buffer.from(f.payload.canonicalBody)]]),
    }),
    sourceSigner: f.signers.source as Signer,
    commandSigner: f.signers.command as Signer,
    copySigners: {
      euR2: f.signers.euR2 as Signer,
      outsideAccount: f.signers.outsideAccount as Signer,
    },
    profile: f.profile,
    preparations,
    transports: {
      euR2: new PrivateDirectoryArchive(
        f.admission.context.euR2,
        join(dir, "eu"),
        f.admission.context.archiveNamespace,
        1048576,
      ),
      outsideAccount: new PrivateDirectoryArchive(
        f.admission.context.outsideAccount,
        join(dir, "outside"),
        f.admission.context.archiveNamespace,
        1048576,
      ),
    },
    retain: (event) => preparations.retainEvidence(event),
    coordinator: {
      execute: (raw) => local.core.execute(raw),
      head: async () => local.core.readHead(),
      selected: async (id) => local.core.selectedPreparation(id),
    },
  };
});
afterEach(async () => {
  local.db.close();
  await rm(dir, { recursive: true, force: true });
});
it("R08 D28 full offline iteration retains uncertain outside progress then resumes exact selected ciphertext", async () => {
  const outside = dependencies.transports.outsideAccount;
  dependencies.transports.outsideAccount = {
    destinationId: f.admission.context.outsideAccount,
    put: async () => "uncertain",
    get: async () => null,
  };
  const pending = await replicateOnce(f.admission, dependencies);
  expect(pending.state).toBe("pending");
  if (!pending.head) throw new Error("expected head");
  expect(pending.head.destinationPrefixes).toEqual({
    euR2: f.observation.through,
    outsideAccount: f.admission.anchor,
  });
  const selected = local.core.expectedScopes().map((s) => s.logicalId);
  const attempts = (await dependencies.preparations.retainedArtifacts()).filter((p) =>
    p.endsWith(".attempt"),
  );
  dependencies.transports.outsideAccount = outside;
  const complete = await replicateOnce(f.admission, dependencies);
  expect(complete.state).toBe("copied_prefix");
  if (!complete.head) throw new Error("expected head");
  expect(complete.head.destinationPrefixes).toEqual({
    euR2: f.observation.through,
    outsideAccount: f.observation.through,
  });
  expect(complete.head.packet).toBeNull();
  expect(complete.currentness).toBe("unknown");
  expect(local.core.expectedScopes().map((s) => s.logicalId)).toEqual(selected);
  expect(
    (await dependencies.preparations.retainedArtifacts()).filter((p) => p.endsWith(".attempt")),
  ).toEqual(attempts);
});
it("R08 D25 no admission/profile/destination and production mode fail before effects", async () => {
  let effects = 0;
  dependencies.source = async () => {
    effects++;
    throw new Error("effect");
  };
  await expect(replicateOnce(null, dependencies)).rejects.toThrow();
  await expect(
    replicateOnce({ ...f.admission, activationAuthorized: true }, dependencies),
  ).rejects.toThrow();
  dependencies.transports.outsideAccount = dependencies.transports.euR2;
  await expect(replicateOnce(f.admission, dependencies)).rejects.toThrow("destination");
  expect(effects).toBe(0);
  expect(() => loadProductionArchive()).toThrow("unsupported");
});
it("R08 D18 lost reserve/prepare/copy/advance responses reconcile the exact retained request", async () => {
  const lost = new Set<string>();
  const retained: string[] = [];
  const retain = dependencies.retain;
  dependencies.retain = async (e) => {
    await retain(e);
    if (e.state === "coordinator_intent") retained.push(e.raw as string);
  };
  dependencies.coordinator.execute = async (raw) => {
    expect(retained).toContain(raw);
    const command = await verifyEvidence(
      raw,
      "recovery-command",
      f.admission.authority.id,
      f.roots,
      request,
    );
    const result = await local.core.execute(raw);
    if (!lost.has(command.command.operation)) {
      lost.add(command.command.operation);
      throw new Error("response lost after durable commit");
    }
    return result;
  };
  const result = await replicateOnce(f.admission, dependencies);
  expect(result.state).toBe("copied_prefix");
  expect(local.core.readHead().generation).toBe(1);
  expect([...lost].sort()).toEqual(["advance", "copy", "prepare", "reserve"]);
});
