// C18/O26 · AT43/AT45: opaque, party-scoped safety revisions invalidate exact review.
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  privacyGovernanceRecords,
  privacyGovernanceRevisions,
  privacyProcessingRestrictions,
} from "@/db/schema";
import { createTestDatabase, type TestDatabase } from "@/db/test-utils";
import { governanceDocumentSchema } from "@/domain/privacy-governance";
import { hashRequest } from "../crypto";
import { LocalFileStorage } from "../files/storage";
import { createClient } from "../testing";
import { createTask } from "../work/create-task";
import { recordTaskEffort } from "../work/effort";
import { collectExportInventory } from "./export-coverage";
import {
  coverageEnvelope,
  exportCoverageRow,
  issueCoverage,
  privacyExportCoverageFixture,
  resolveCoverage,
} from "./export-coverage-testing";
import { completePrivacyExport, privacyExportDownload, staffPrivacyExports } from "./exports";
import { appendPrivacySafetyDecision, recordPrivacyPropagation } from "./safety-ledger";

let t: TestDatabase, root: string, storage: LocalFileStorage;
beforeAll(async () => {
  t = await createTestDatabase();
  root = await mkdtemp(join(tmpdir(), "msr-export-safety-fingerprint-"));
  storage = new LocalFileStorage(root);
});
afterAll(async () => {
  await t?.drop();
  if (root) await rm(root, { recursive: true, force: true });
});
const fixture = () => privacyExportCoverageFixture(t.db, storage);
type Fixture = Awaited<ReturnType<typeof fixture>>;
async function decision(partyId: string, requestId: string | null) {
  return appendPrivacySafetyDecision(t.db, {
    operationId: randomUUID(),
    partyId,
    requestId,
    requestHash: hashRequest({ synthetic: randomUUID() }),
    review: { note: "SYNTHETIC_SAFETY_REVIEW_NEVER_DISCLOSE" },
    effect: {
      kind: "subscription_withdrawal_v1",
      partyId,
      subscriptionIds: [randomUUID()],
    },
  });
}
async function boundary(f: Fixture) {
  const inventory = await collectExportInventory(
    t.db,
    f.staff.actor,
    {
      partyId: f.client.partyId as string,
      recipientId: f.client.id,
      requestId: f.requestId,
      requestVersion: 3,
      scope: { exportScope: "listed_categories" },
    },
    "synthetic-own-source",
  );
  return inventory.categories.find(
    (row) => row.category === "restricted_material_and_security_credentials",
  );
}
async function completion(f: Fixture) {
  const row = await exportCoverageRow(t.db, f.exportId);
  return { ...(await coverageEnvelope(f)), reviewDigest: row.reviewSha256, confirmed: true };
}

describe("AT45 reviewed exports follow actual party safety history", () => {
  it("invalidates a reviewed category after a new decision and requires fresh human review before issue", async () => {
    const f = await fixture();
    await resolveCoverage(f);
    const original = await boundary(f),
      added = await decision(f.client.partyId as string, f.requestId),
      current = await boundary(f);
    expect(current?.sources).toHaveLength(1);
    expect(current?.sources[0]).toEqual({
      key: "security_boundary",
      kind: "security_boundary",
      digest: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    expect(current).not.toEqual(original);
    for (const privateValue of [added.id, added.digest, "SYNTHETIC_SAFETY_REVIEW_NEVER_DISCLOSE"])
      expect(JSON.stringify(current)).not.toContain(privateValue);
    await expect(issueCoverage(f)).rejects.toMatchObject({ code: "version_conflict" });
    expect(
      (await staffPrivacyExports(t.db, f.staff.session, f.requestId, storage)).exports[0]?.review,
    ).toBeNull();
    await resolveCoverage(f);
    await expect(issueCoverage(f)).resolves.toBeDefined();
  });

  it.each(["decision", "restriction", "propagation"] as const)(
    "invalidates an issued frozen export after a new %s without exposing private history",
    async (change) => {
      const f = await fixture(),
        initial = await decision(f.client.partyId as string, f.requestId);
      await resolveCoverage(f);
      await issueCoverage(f);
      const original = await boundary(f);
      if (change === "decision") await decision(f.client.partyId as string, f.requestId);
      if (change === "restriction")
        await t.db.insert(privacyProcessingRestrictions).values({
          partyId: f.client.partyId as string,
          purpose: "marketing",
          decisionSequence: initial.sequence,
        });
      if (change === "propagation")
        await recordPrivacyPropagation(t.db, initial.sequence, "provider_data", "held", {
          note: "SYNTHETIC_PROVIDER_EVIDENCE_NEVER_DISCLOSE",
        });
      const current = await boundary(f);
      expect(current).not.toEqual(original);
      expect(current?.sources).toHaveLength(1);
      expect(JSON.stringify(current)).not.toContain(initial.id);
      expect(JSON.stringify(current)).not.toContain("SYNTHETIC_PROVIDER_EVIDENCE_NEVER_DISCLOSE");
      await expect(
        completePrivacyExport(t.db, f.staff.session, await completion(f), storage),
      ).rejects.toMatchObject({ code: "version_conflict" });
      await expect(privacyExportDownload(t.db, f.client.session, f.exportId)).rejects.toMatchObject(
        { code: "not_found" },
      );
      const work = await staffPrivacyExports(t.db, f.staff.session, f.requestId, storage);
      expect(work.exports[0]?.review).toBeNull();
    },
  );

  it("keeps unrelated-party safety and staff governance/effort records outside the client boundary", async () => {
    const f = await fixture();
    await resolveCoverage(f);
    await issueCoverage(f);
    const original = await boundary(f),
      other = await createClient(t.db),
      otherDecision = await decision(other.partyId, null);
    await t.db.insert(privacyProcessingRestrictions).values({
      partyId: other.partyId,
      purpose: "client_access",
      decisionSequence: otherDecision.sequence,
    });
    await recordPrivacyPropagation(t.db, otherDecision.sequence, "provider_data", "held", {
      otherParty: other.id,
    });
    const document = governanceDocumentSchema.parse({
      kind: "processing",
      title: "Synthetic minimised agency processing register",
      ownerId: f.staff.id,
      evidenceReference: null,
      reviewPolicyReference: null,
      nextAction: "Obtain the responsible human's reviewed policy references",
      nextReviewAt: null,
      lifecycle: "active",
      purpose: null,
      dataSubjects: null,
      dataClasses: null,
      recipients: null,
      systems: null,
      lawfulBasisReference: null,
      retentionReference: null,
      securityReference: null,
    });
    const [record] = await t.db
      .insert(privacyGovernanceRecords)
      .values({
        kind: document.kind,
        document,
        contentHash: hashRequest(document),
        updatedById: f.staff.id,
      })
      .returning();
    if (!record) throw new Error("Missing synthetic agency register");
    await t.db.insert(privacyGovernanceRevisions).values({
      recordId: record.id,
      recordVersion: 1,
      action: "saved",
      document,
      contentHash: record.contentHash,
      actorId: f.staff.id,
      operationId: randomUUID(),
    });
    const task = await createTask(t.db, f.staff.session, {
      operationId: randomUUID(),
      parent: null,
      title: "Synthetic internal fact review",
      purpose: "Review generic agency policy source references",
      type: "fact_verification",
    });
    await recordTaskEffort(t.db, f.staff.session, {
      operationId: randomUUID(),
      id: task.outcome.id,
      expectedVersion: 1,
      action: "record",
      category: "correction",
      minutes: 12,
      reason: "facts",
    });
    await t.db
      .update(privacyGovernanceRecords)
      .set({ version: 2, document: { ...document, title: "Synthetic revised agency register" } })
      .where(eq(privacyGovernanceRecords.id, record.id));
    expect(await boundary(f)).toEqual(original);
    await completePrivacyExport(t.db, f.staff.session, await completion(f), storage);
    const downloaded = await privacyExportDownload(t.db, f.client.session, f.exportId);
    for (const privateValue of [
      other.id,
      other.partyId,
      otherDecision.id,
      record.id,
      task.outcome.id,
    ])
      expect(downloaded.bytes.toString()).not.toContain(privateValue);
  });
});
