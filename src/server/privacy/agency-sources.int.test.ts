// B10/O26 · AT45. Disposable records prove source boundaries, never real policy acceptance.
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  agencyCaseReviews,
  agencyPartnerTerms,
  cases,
  documents,
  documentVersions,
  grants,
  passkeys,
} from "@/db/schema";
import { createTestDatabase, type TestDatabase } from "@/db/test-utils";
import { can } from "../authz";
import { LocalFileStorage } from "../files/storage";
import { createClient, createStaff } from "../testing";
import { syntheticAgencyHistory, syntheticAgencySources } from "./agency-source-testing";
import { collectAgencySources } from "./agency-sources";
import { collectErasureInventory } from "./erasure-inventory";
import { syntheticErasureFixture } from "./erasure-testing";
import { collectExportInventory } from "./export-coverage";
import {
  categoryDecision,
  coverageEnvelope,
  exportCoverageRow,
  issueCoverage,
  privacyExportCoverageFixture,
  resolveCoverage,
} from "./export-coverage-testing";
import {
  completePrivacyExport,
  privacyExportDownload,
  reviewPrivacyExportCategory,
  staffPrivacyExports,
} from "./exports";

let t: TestDatabase, root: string, storage: LocalFileStorage;
beforeAll(async () => {
  t = await createTestDatabase();
  root = await mkdtemp(join(tmpdir(), "msr-agency-source-"));
  storage = new LocalFileStorage(root);
});
afterAll(async () => {
  await t?.drop();
  if (root) await rm(root, { recursive: true, force: true });
});
async function fixture() {
  let agency!: Awaited<ReturnType<typeof syntheticAgencySources>>;
  const f = await privacyExportCoverageFixture(
    t.db,
    storage,
    "listed_categories",
    async (source) => {
      agency = await syntheticAgencySources(t.db, {
        actorId: source.staff.id,
        partyId: source.client.partyId as string,
        clientId: source.client.id,
        caseId: source.record.id,
      });
    },
  );
  return { ...f, agency };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
const collected = (f: Fixture, actor = f.staff.actor) =>
  collectAgencySources(t.db, actor, [f.client.partyId as string], [f.record.id]);
async function completion(f: Fixture) {
  const row = await exportCoverageRow(t.db, f.exportId);
  return { ...(await coverageEnvelope(f)), reviewDigest: row.reviewSha256, confirmed: true };
}
async function work(f: Fixture) {
  return (await staffPrivacyExports(t.db, f.staff.session, f.requestId, storage)).exports.find(
    (row) => row.id === f.exportId,
  );
}
async function inventory(f: Fixture) {
  return collectExportInventory(
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
}

describe("B10/AT45 exact agency source classification", () => {
  it("accounts for every terms/review source with a concrete redacted supplement and never auto-exports private wording or history", async () => {
    const f = await fixture(),
      source = await collected(f);
    expect(source.blocked).toBe(false);
    expect(source.sources).toHaveLength(2);
    expect(source.sources.map((row) => row.kind).sort()).toEqual(["case_review", "partner_terms"]);
    const bucket = (await inventory(f)).categories.find(
      (row) => row.category === "joint_records_and_received_communications",
    );
    expect(bucket?.blocked).toBe(false);
    expect(bucket?.sources.filter((row) => row.kind === "agency_record")).toHaveLength(2);
    await resolveCoverage(f);
    const decision = await categoryDecision(f, "joint_records_and_received_communications");
    await expect(
      reviewPrivacyExportCategory(t.db, f.staff.session, {
        ...decision,
        disposition: "none",
        basis: "no_sources",
        evidence: [],
      }),
    ).rejects.toMatchObject({ code: "transition_denied" });
    await expect(
      reviewPrivacyExportCategory(t.db, f.staff.session, {
        ...decision,
        operationId: randomUUID(),
        evidence: decision.evidence.slice(1),
      }),
    ).rejects.toMatchObject({ code: "validation_failed" });
    await issueCoverage(f);
    await completePrivacyExport(t.db, f.staff.session, await completion(f), storage);
    const delivered = await privacyExportDownload(t.db, f.client.session, f.exportId);
    const copies = [
      JSON.stringify(source),
      JSON.stringify((await work(f))?.dossier),
      delivered.bytes.toString(),
    ];
    for (const copy of copies)
      for (const value of [
        "SYNTHETIC_PRIVATE_PARTNER_TERMS",
        "SYNTHETIC_REVIEW_WORDING",
        "SYNTHETIC_PRIVATE_VERIFICATION_STATEMENT",
        f.agency.termsHistory.id,
        f.agency.reviewHistory.id,
        f.agency.policy.id,
        f.agency.wording.id,
      ])
        expect(copy).not.toContain(value);
  });

  it.each(
    (["terms", "wording", "consent", "history"] as const).flatMap((change) => [
      { change, state: "before issue", issued: false },
      { change, state: "after issue", issued: true },
    ]),
  )(
    "fences an unversioned $change change $state in exact category review and issued delivery",
    async ({ change, issued }) => {
      const f = await fixture();
      await resolveCoverage(f);
      if (issued) await issueCoverage(f);
      if (change === "terms")
        await t.db
          .update(agencyPartnerTerms)
          .set({ termsText: "SYNTHETIC_CHANGED_TERMS", updatedAt: f.agency.terms.updatedAt })
          .where(eq(agencyPartnerTerms.id, f.agency.terms.id));
      if (change === "wording")
        await t.db
          .update(agencyCaseReviews)
          .set({ reviewText: "SYNTHETIC_CHANGED_WORDING", updatedAt: f.agency.review.updatedAt })
          .where(eq(agencyCaseReviews.id, f.agency.review.id));
      if (change === "consent")
        await t.db
          .update(agencyCaseReviews)
          .set({ consentState: "withdrawn", updatedAt: f.agency.review.updatedAt })
          .where(eq(agencyCaseReviews.id, f.agency.review.id));
      if (change === "history")
        await syntheticAgencyHistory(t.db, f.staff.id, "case_review", f.agency.review.id, {
          ...f.agency.review,
          consentState: "withdrawn",
        });
      expect(
        (
          await t.db
            .select()
            .from(agencyPartnerTerms)
            .where(eq(agencyPartnerTerms.id, f.agency.terms.id))
        )[0]?.version,
      ).toBe(f.agency.terms.version);
      expect(
        (
          await t.db
            .select()
            .from(agencyCaseReviews)
            .where(eq(agencyCaseReviews.id, f.agency.review.id))
        )[0]?.version,
      ).toBe(f.agency.review.version);
      expect((await work(f))?.review).toBeNull();
      if (!issued)
        await expect(issueCoverage(f)).rejects.toMatchObject({ code: "version_conflict" });
      else {
        await expect(
          completePrivacyExport(t.db, f.staff.session, await completion(f), storage),
        ).rejects.toMatchObject({ code: "version_conflict" });
        await expect(
          privacyExportDownload(t.db, f.client.session, f.exportId),
        ).rejects.toMatchObject({ code: "not_found" });
      }
    },
  );

  it.each(["unknown_field", "invalid_scope", "orphan", "scalar", "oversized"] as const)(
    "holds unknown retained history for %s without exposing identities or a partial source list",
    async (change) => {
      const f = await fixture();
      await syntheticAgencyHistory(
        t.db,
        f.staff.id,
        "partner_terms",
        change === "orphan" ? randomUUID() : f.agency.terms.id,
        change === "scalar"
          ? "SYNTHETIC_UNKNOWN_HISTORY_SHAPE"
          : {
              ...f.agency.terms,
              ...(change === "unknown_field" ? { undeclaredPartyId: randomUUID() } : {}),
              ...(change === "invalid_scope" ? { caseId: "unknown-scope" } : {}),
              ...(change === "oversized" ? { termsText: "s".repeat(65537) } : {}),
            },
      );
      const source = await collected(f);
      expect(source.blocked).toBe(true);
      expect(source.sources).toEqual([]);
      for (const value of [
        f.agency.terms.id,
        f.agency.review.id,
        f.agency.termsHistory.id,
        f.agency.reviewHistory.id,
      ])
        expect(JSON.stringify(source)).not.toContain(value);
      const bucket = (await inventory(f)).categories.find(
        (row) => row.category === "joint_records_and_received_communications",
      );
      expect(bucket).toMatchObject({ blocked: true, sources: [] });
    },
  );

  it("checks every historical Case and contact scope, preserves original author/terms Parties, and grants no canonical authority", async () => {
    const f = await fixture(),
      other = await createClient(t.db);
    const [otherCase] = await t.db
      .insert(cases)
      .values({
        reference: `CASE-OTHER-${randomUUID()}`,
        kind: "buyer",
        stage: "needs_agreed",
        title: "Synthetic other Case",
        ownerId: f.staff.id,
        nextAction: "Review the exact original source",
      })
      .returning();
    if (!otherCase) throw new Error("Missing synthetic original Case");
    const reviewer = await createStaff(t.db, {
      grants: [
        { capability: "compliance.review", recordType: "case", recordId: f.record.id },
        { capability: "case.read", recordType: "case", recordId: f.record.id },
        { capability: "inquiry.read", recordType: "inquiry", recordId: f.inquiry.id },
      ],
    });
    await t.db.insert(passkeys).values({
      principalId: reviewer.id,
      credentialId: randomUUID(),
      publicKey: Buffer.from([1]),
      deviceType: "singleDevice",
      backedUp: false,
    });
    expect((await collected(f, reviewer.actor)).blocked).toBe(false);
    await syntheticAgencyHistory(t.db, f.staff.id, "partner_terms", f.agency.terms.id, {
      ...f.agency.terms,
      caseId: otherCase.id,
      counterpartyPartyId: other.partyId,
    });
    const held = await collected(f, reviewer.actor);
    expect(held.blocked).toBe(true);
    expect(held.sources).toEqual([]);
    for (const value of [other.partyId, otherCase.id, f.agency.terms.id])
      expect(JSON.stringify(held)).not.toContain(value);
    expect(
      (
        await t.db
          .select()
          .from(agencyCaseReviews)
          .where(eq(agencyCaseReviews.id, f.agency.review.id))
      )[0]?.authorPartyId,
    ).toBe(f.client.partyId);
    expect(
      (
        await t.db
          .select()
          .from(agencyPartnerTerms)
          .where(eq(agencyPartnerTerms.id, f.agency.terms.id))
      )[0]?.counterpartyPartyId,
    ).toBe(f.client.partyId);
  });

  it("requires an exact document grant for a retained historical consent/terms source", async () => {
    const f = await fixture(),
      reviewer = await createStaff(t.db, {
        grants: [
          { capability: "compliance.review", recordType: "case", recordId: f.record.id },
          { capability: "case.read", recordType: "case", recordId: f.record.id },
          { capability: "inquiry.read", recordType: "inquiry", recordId: f.inquiry.id },
        ],
      });
    await t.db.insert(passkeys).values({
      principalId: reviewer.id,
      credentialId: randomUUID(),
      publicKey: Buffer.from([1]),
      deviceType: "singleDevice",
      backedUp: false,
    });
    expect((await collected(f, reviewer.actor)).blocked).toBe(false);
    const [document] = await t.db
      .insert(documents)
      .values({
        reference: `DOC-SOURCE-${randomUUID()}`,
        caseId: f.record.id,
        purpose: "review_consent",
        classification: "contract",
        audience: "internal",
        currentVersionNumber: 1,
      })
      .returning();
    if (!document) throw new Error("Missing synthetic historical consent document");
    const [file] = await t.db
      .insert(documentVersions)
      .values({
        documentId: document.id,
        versionNumber: 1,
        state: "reviewed",
        sha256: "c".repeat(64),
        sealedKey: `synthetic/${randomUUID()}`,
        byteSize: 10,
        fileName: "synthetic-private-consent.pdf",
        contentType: "application/pdf",
        uploadedByKind: "staff",
        uploadedById: f.staff.id,
        scan: "clean",
        scannedAt: new Date(),
        scannerVersion: "synthetic-only",
        scannedSha256: "c".repeat(64),
        reviewType: "accepted_for_purpose",
        reviewedAt: new Date(),
        reviewedById: f.staff.id,
      })
      .returning();
    if (!file) throw new Error("Missing synthetic historical consent version");
    await syntheticAgencyHistory(t.db, f.staff.id, "partner_terms", f.agency.terms.id, {
      ...f.agency.terms,
      documentVersionId: file.id,
      documentDigest: file.sha256,
    });
    expect((await collected(f, reviewer.actor)).sources).toEqual([]);
    await t.db.insert(grants).values({
      principalId: reviewer.id,
      capability: "document.read_restricted",
      recordType: "case",
      recordId: f.record.id,
      reason: "Synthetic invalid inherited file grant",
    });
    expect((await collected(f, reviewer.actor)).blocked).toBe(true);
    await t.db.insert(grants).values({
      principalId: reviewer.id,
      capability: "document.read_restricted",
      recordType: "document",
      recordId: document.id,
      reason: "Synthetic exact historical file scope",
    });
    const original = await collected(f, reviewer.actor);
    expect(original.blocked).toBe(false);
    await t.db.update(documentVersions).set({ version: 2 }).where(eq(documentVersions.id, file.id));
    expect((await collected(f, reviewer.actor)).revision).not.toBe(original.revision);
    expect(JSON.stringify(original)).not.toContain(file.id);
    expect(JSON.stringify(original)).not.toContain(document.id);
  });

  it("rechecks live qualified scope before frozen delivery", async () => {
    const f = await fixture();
    await resolveCoverage(f);
    await issueCoverage(f);
    await t.db
      .update(grants)
      .set({ revokedAt: new Date() })
      .where(and(eq(grants.principalId, f.staff.id), eq(grants.capability, "compliance.review")));
    const source = await collected(f);
    expect(source.blocked).toBe(true);
    expect(source.sources).toEqual([]);
    await expect(privacyExportDownload(t.db, f.client.session, f.exportId)).rejects.toMatchObject({
      code: "not_found",
    });
  });

  it("requires current passkey assurance independently of retained agency source grants", async () => {
    const f = await fixture();
    const scope = { type: "case", id: f.record.id, audience: "internal" as const };
    expect((await collected(f)).blocked).toBe(false);
    await t.db
      .update(passkeys)
      .set({ revokedAt: new Date() })
      .where(eq(passkeys.principalId, f.staff.id));
    expect(await can(t.db, f.staff.actor, "compliance.review", scope)).toBe(true);
    const source = await collected(f);
    expect(source.blocked).toBe(true);
    expect(source.sources).toEqual([]);
  });

  it("keeps unrelated agency records outside the subject's revision boundary", async () => {
    const f = await fixture();
    await resolveCoverage(f);
    await issueCoverage(f);
    const original = await collected(f);
    await fixture();
    expect(await collected(f)).toEqual(original);
    await completePrivacyExport(t.db, f.staff.session, await completion(f), storage);
  });

  it("retains business and unsupported purpose holds for erasure instead of treating terms as an optional customer copy", async () => {
    const f = await syntheticErasureFixture(t.db);
    await t.db.insert(agencyPartnerTerms).values({
      counterpartyPartyId: f.client.partyId,
      ownerId: f.staff.id,
      relationship: "referral",
      purpose: "Synthetic retained purpose",
      sourceReference: "Synthetic original terms",
      sourceVersion: "synthetic-1",
      termsText: "Synthetic retained standing terms",
      termsHash: "a".repeat(64),
    });
    const view = await collectErasureInventory(t.db, f.staffSession.session, f.request.id);
    expect(view.businessDependencies).toBe(true);
    expect(
      view.sources
        .filter((row) =>
          [
            "contact_preferences",
            "matching_aliases",
            "optional_contacts",
            "client_profile_copies",
          ].includes(row.category),
        )
        .every((row) => !row.eligible),
    ).toBe(true);
    expect(
      view.sources
        .filter((row) => row.category === "optional_processing")
        .map((row) => row.key)
        .sort(),
    ).toEqual(["purpose:marketing", "purpose:search_alerts"]);
  });
});
