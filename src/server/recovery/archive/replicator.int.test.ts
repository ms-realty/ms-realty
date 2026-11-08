import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, expect, it } from "vitest";
import { grants, operations, passkeys, recoveryPayloads, recoverySource } from "@/db/schema";
import { createTestDatabase, type TestDatabase } from "@/db/test-utils";
import { admissionDigest, type Signer } from "../../../../gateway/recovery-coordinator-contract";
import { revokeStaffGrant } from "../../auth/grants";
import { createSession, readSession } from "../../auth/sessions";
import { can } from "../../authz";
import { createStaff } from "../../testing";
import { PreparationStore } from "./preparation";
import { type ReplicationDependencies, replicateOnce } from "./replicator";
import { readArchiveSource } from "./source";
import { PrivateDirectoryArchive } from "./storage";
import { type ArchiveFixture, archiveFixture, sqliteFixture } from "./testing";

let database: TestDatabase,
  f: ArchiveFixture,
  directory: string,
  coordinator: ReturnType<typeof sqliteFixture>;
beforeEach(async () => {
  database = await createTestDatabase();
  f = await archiveFixture();
  directory = await mkdtemp(join(tmpdir(), "msr-r08-c1-copy-"));
  coordinator = sqliteFixture(join(directory, "authority.sqlite"), f);
  for (const name of ["spool", "eu", "outside"])
    await mkdir(join(directory, name), { mode: 0o700 });
  await database.db
    .update(recoverySource)
    .set({
      state: "admitted",
      context: f.admission.context,
      contextDigest: f.contextDigest,
      admittedWriters: ["run_operation"],
    })
    .where(eq(recoverySource.key, "source"));
});
afterEach(async () => {
  coordinator?.db.close();
  if (directory) await rm(directory, { recursive: true, force: true });
  await database?.drop();
});
it("R08 D03/D28 actual C1 v2 grant/session denials and saved receipt survive unavailable archive/authority and resume", async () => {
  const manager = await createStaff(database.db, { roles: ["manager"] });
  await database.db.insert(passkeys).values(
    [0, 1].map(() => ({
      principalId: manager.id,
      credentialId: randomUUID(),
      publicKey: Buffer.from("synthetic-count-fixture"),
      deviceType: "singleDevice",
      backedUp: false,
    })),
  );
  const managerSession = await createSession(database.db, { kind: "staff", id: manager.id });
  const target = await createStaff(database.db);
  const live = await createSession(database.db, { kind: "staff", id: target.id });
  const [grant] = await database.db
    .insert(grants)
    .values({
      principalId: target.id,
      capability: "document.review",
      reason: "Synthetic archive fixture",
      version: 7,
    })
    .returning();
  if (!grant) throw new Error("synthetic grant absent");
  expect(await can(database.db, target.actor, "document.review")).toBe(true);
  const outcome = await revokeStaffGrant(
    database.db,
    managerSession.session,
    {
      operationId: randomUUID(),
      grantId: grant.id,
      expectedRevision: 7,
      reason: "Synthetic restriction",
    },
    { writer: "run_operation", context: f.admission.context },
  );
  const receipt = JSON.stringify(
    await database.db.select().from(operations).where(eq(operations.id, outcome.operationId)),
  );
  const source = await readArchiveSource(database.db, f.admission.context);
  const payloads = await database.db.select().from(recoveryPayloads);
  expect(payloads).toHaveLength(2);
  for (const row of payloads) {
    expect(JSON.parse(row.canonicalBody)[0]).toBe("recovery-access-restriction-v2");
    expect(source.bodies.get(row.digest)?.toString()).toBe(row.canonicalBody);
  }
  const preparations = new PreparationStore(
    join(directory, "spool"),
    f.admission.limits.maxObjectBytes,
  );
  const outside = new PrivateDirectoryArchive(
    f.admission.context.outsideAccount,
    join(directory, "outside"),
    f.admission.context.archiveNamespace,
    f.admission.limits.maxObjectBytes,
  );
  const dependencies: ReplicationDependencies = {
    selectedAdmissionDigest: admissionDigest(f.admission),
    source: () => readArchiveSource(database.db, f.admission.context),
    sourceSigner: f.signers.source as Signer,
    commandSigner: f.signers.command as Signer,
    copySigners: {
      euR2: f.signers.euR2 as Signer,
      outsideAccount: f.signers.outsideAccount as Signer,
    },
    profile: f.profile,
    preparations,
    retain: (event) => preparations.retainEvidence(event),
    transports: {
      euR2: new PrivateDirectoryArchive(
        f.admission.context.euR2,
        join(directory, "eu"),
        f.admission.context.archiveNamespace,
        f.admission.limits.maxObjectBytes,
      ),
      outsideAccount: {
        destinationId: outside.destinationId,
        put: async () => "uncertain",
        get: async () => null,
      },
    },
    coordinator: {
      execute: (raw) => coordinator.core.execute(raw),
      head: async () => coordinator.core.readHead(),
      selected: async (id) => coordinator.core.selectedPreparation(id),
    },
  };
  const assertDenial = async () => {
    expect(await can(database.db, target.actor, "document.review")).toBe(false);
    expect(await readSession(database.db, live.token)).toBeNull();
    expect(
      JSON.stringify(
        await database.db.select().from(operations).where(eq(operations.id, outcome.operationId)),
      ),
    ).toBe(receipt);
    expect(await database.db.select().from(recoveryPayloads)).toEqual(payloads);
  };
  expect((await replicateOnce(f.admission, dependencies)).state).toBe("pending");
  await assertDenial();
  const execute = dependencies.coordinator.execute;
  dependencies.coordinator.execute = async () => {
    throw new Error("authority unavailable");
  };
  await expect(replicateOnce(f.admission, dependencies)).rejects.toThrow("authority unavailable");
  await assertDenial();
  dependencies.coordinator.execute = execute;
  dependencies.transports.outsideAccount = outside;
  const finished = await replicateOnce(f.admission, dependencies);
  expect(finished.state).toBe("copied_prefix");
  expect(finished.head?.destinationPrefixes).toEqual({
    euR2: source.observation.through,
    outsideAccount: source.observation.through,
  });
  expect(finished.head?.packet).toBeNull();
  await assertDenial();
});
