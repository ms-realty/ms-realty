// B11/O26 · AT45: synthetic original service context and exact disclosure review.
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  caseParticipants,
  cases,
  grants,
  inquiries,
  serviceScopeDrafts,
  serviceScopeVersions,
} from "@/db/schema";
import { createTestDatabase, type TestDatabase } from "@/db/test-utils";
import { serviceScopeId } from "@/domain/service-scope";
import { hashRequest, sha256Hex } from "../crypto";
import { LocalFileStorage } from "../files/storage";
import { createClient } from "../testing";
import { collectExportInventory } from "./export-coverage";
import {
  coverageEnvelope,
  exportCoverageRow,
  issueCoverage,
  privacyExportCoverageFixture,
  resolveCoverage,
} from "./export-coverage-testing";
import {
  completePrivacyExport,
  privacyExportDownload,
  redactPrivacyExport,
  staffPrivacyExports,
} from "./exports";
import { syntheticServiceContext } from "./service-source-testing";
import { collectServiceSources } from "./service-sources";

let t: TestDatabase, root: string, storage: LocalFileStorage;
beforeAll(async () => {
  t = await createTestDatabase();
  root = await mkdtemp(join(tmpdir(), "msr-service-source-"));
  storage = new LocalFileStorage(root);
});
afterAll(async () => {
  await t?.drop();
  if (root) await rm(root, { recursive: true, force: true });
});
async function fixture(
  shortStay = false,
  setup?: (caseId: string, inquiryId: string) => Promise<void>,
) {
  let context!: ReturnType<typeof syntheticServiceContext>;
  const f = await privacyExportCoverageFixture(
    t.db,
    storage,
    "listed_categories",
    async (source) => {
      context = syntheticServiceContext(source.staff.id, shortStay);
      await t.db
        .update(cases)
        .set({
          kind: "service_intake",
          stage: "request_received",
          serviceTopic: context.request.topic,
          serviceContext: context,
        })
        .where(eq(cases.id, source.record.id));
      await t.db
        .update(inquiries)
        .set({
          purpose: "service_consultation",
          caseId: source.record.id,
          context: { service: context },
        })
        .where(eq(inquiries.id, source.inquiry.id));
      await setup?.(source.record.id, source.inquiry.id);
    },
  );
  return { ...f, context };
}
async function dossier(f: Awaited<ReturnType<typeof fixture>>) {
  const work = await staffPrivacyExports(t.db, f.staff.session, f.requestId, storage);
  return work.exports.find((row) => row.id === f.exportId);
}
async function completion(f: Awaited<ReturnType<typeof fixture>>) {
  const row = await exportCoverageRow(t.db, f.exportId);
  return { ...(await coverageEnvelope(f)), reviewDigest: row.reviewSha256, confirmed: true };
}

describe("B11/AT45 service source disclosure classification", () => {
  it("keeps legacy historical context reviewable without inventing an observed public edition", async () => {
    const f = await fixture(false, async (caseId, inquiryId) => {
      const [record] = await t.db.select().from(cases).where(eq(cases.id, caseId));
      if (!record) throw new Error("Missing synthetic legacy Case");
      const value = record.serviceContext as ReturnType<typeof syntheticServiceContext>;
      const { observedSource: _observed, ...binding } = value.binding;
      const legacy = { ...value, binding };
      await t.db.update(cases).set({ serviceContext: legacy }).where(eq(cases.id, caseId));
      await t.db
        .update(inquiries)
        .set({ context: { service: legacy } })
        .where(eq(inquiries.id, inquiryId));
    });
    const source = await collectServiceSources(t.db, f.staff.actor, f.client.partyId as string);
    expect(source.ownBlocked).toBe(false);
    expect(source.jointBlocked).toBe(false);
    expect(source.rows).toHaveLength(2);
    for (const row of source.rows) {
      expect(row.context?.source).not.toHaveProperty("observedSource");
      expect(row.context?.request).toEqual(f.context.request);
    }
  });

  it("holds an invalid own service request instead of dropping an undeclared field into a complete disclosure", async () => {
    const f = await fixture(false, async (_caseId, inquiryId) => {
      const [record] = await t.db.select().from(inquiries).where(eq(inquiries.id, inquiryId));
      if (!record) throw new Error("Missing synthetic malformed inquiry");
      const value = (record.context as { service: ReturnType<typeof syntheticServiceContext> })
        .service;
      await t.db
        .update(inquiries)
        .set({
          context: {
            service: {
              ...value,
              request: { ...value.request, undeclared: "SYNTHETIC_UNDECLARED_CUSTOMER_FIELD" },
            },
          },
        })
        .where(eq(inquiries.id, inquiryId));
    });
    const source = await collectServiceSources(t.db, f.staff.actor, f.client.partyId as string);
    expect(source.rows).toEqual([]);
    expect(source.ownBlocked).toBe(true);
    expect(source.jointBlocked).toBe(true);
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
    expect(inventory.categories.find((row) => row.category === "personal_activity")?.blocked).toBe(
      true,
    );
    expect(JSON.stringify((await dossier(f))?.dossier)).not.toContain(
      "SYNTHETIC_UNDECLARED_CUSTOMER_FIELD",
    );
  });

  it.each([false, true])(
    "discloses only the original own request and receipt source, including historical short-stay=%s",
    async (shortStay) => {
      const f = await fixture(shortStay),
        work = await dossier(f),
        rows = work?.dossier?.data.serviceContexts;
      expect(rows?.map((row) => row.source)).toEqual(["inquiry", "case"]);
      for (const row of rows ?? []) {
        expect(row.context).toEqual({
          basis: "self_declared_request",
          request: f.context.request,
          source: {
            scopeVersionId: f.context.binding.scopeVersionId,
            scopeVersion: f.context.binding.scopeVersion,
            sourceUrl: f.context.binding.sourceUrl,
            observedSource: f.context.binding.observedSource,
          },
        });
      }
      const serialized = JSON.stringify(work?.dossier);
      for (const internal of [
        f.staff.id,
        f.context.binding.scopeHash,
        f.context.binding.offering.operatingPolicy.id,
        "synthetic-internal-fallback",
        "responsibleId",
        "offering",
        "operatingPolicy",
        "fallback",
        "ownerId",
      ])
        expect(serialized).not.toContain(internal);
      await resolveCoverage(f);
      await issueCoverage(f);
      await completePrivacyExport(t.db, f.staff.session, await completion(f), storage);
      const delivered = await privacyExportDownload(t.db, f.client.session, f.exportId);
      expect(JSON.parse(delivered.bytes.toString()).data.serviceContexts).toEqual(rows);
    },
  );

  it("redacts every personal request field and source copy before binding final exact bytes", async () => {
    const f = await fixture(true),
      before = await dossier(f);
    const selected = before?.dossier?.data.serviceContexts ?? [];
    expect(selected).toHaveLength(2);
    await redactPrivacyExport(t.db, f.staff.session, {
      ...(await coverageEnvelope(f)),
      omitTexts: selected.map((row) => ({ section: "serviceContexts", id: row.id })),
    });
    const redacted = await dossier(f);
    expect(redacted?.sha256).not.toBe(before?.sha256);
    expect(redacted?.dossier?.data.serviceContexts.every((row) => row.context === null)).toBe(true);
    const text = JSON.stringify(redacted?.dossier);
    for (const value of [
      f.context.request.location,
      f.context.request.needs,
      f.context.request.requestedFrom,
      f.context.request.requestedUntil,
      f.context.binding.sourceUrl,
      f.context.request.scopeVersionId,
    ])
      expect(text).not.toContain(value);
    expect(text).not.toContain('"relationship":"owner"');
    await resolveCoverage(f);
    await issueCoverage(f);
    const delivered = await privacyExportDownload(t.db, f.client.session, f.exportId);
    expect(JSON.parse(delivered.bytes.toString()).data.serviceContexts).toEqual(
      redacted?.dossier?.data.serviceContexts,
    );
    expect(sha256Hex(delivered.bytes.toString())).toBe(
      (await exportCoverageRow(t.db, f.exportId)).sha256,
    );
  });

  it("fences retained service changes on an issued partial export without a category manifest", async () => {
    const f = await fixture();
    await issueCoverage(f);
    const issued = await exportCoverageRow(t.db, f.exportId);
    expect(issued.encryptedReview).toBeNull();
    await t.db
      .update(inquiries)
      .set({
        context: {
          service: {
            ...f.context,
            binding: {
              ...f.context.binding,
              observedSource: {
                ...f.context.binding.observedSource,
                contentHash: "d".repeat(64),
              },
            },
          },
        },
      })
      .where(eq(inquiries.id, f.inquiry.id));
    await expect(privacyExportDownload(t.db, f.client.session, f.exportId)).rejects.toMatchObject({
      code: "not_found",
    });
  });

  it.each(["mixed_participant", "foreign_inquiry", "different_copy", "missing_origin"] as const)(
    "keeps an ambiguous Case copy held for %s while preserving the subject's own inquiry",
    async (change) => {
      const other = await createClient(t.db);
      const f = await fixture(false, async (caseId, inquiryId) => {
        if (change === "mixed_participant")
          await t.db
            .insert(caseParticipants)
            .values({ caseId, partyId: other.partyId, role: "collaborator" });
        if (change === "foreign_inquiry")
          await t.db.insert(inquiries).values({
            reference: `RQ-OTHER-${randomUUID()}`,
            purpose: "question",
            source: "website",
            submissionKey: randomUUID(),
            payloadDigest: "synthetic",
            coverageQueue: "synthetic",
            partyId: other.partyId,
            caseId,
            message: "SYNTHETIC_OTHER_PARTY_CONTEXT",
          });
        if (change === "different_copy") {
          const [record] = await t.db.select().from(cases).where(eq(cases.id, caseId));
          const value = record?.serviceContext as ReturnType<typeof syntheticServiceContext>;
          await t.db
            .update(cases)
            .set({
              serviceContext: {
                ...value,
                request: { ...value.request, needs: "SYNTHETIC_DIFFERENT_CASE_NEEDS" },
              },
            })
            .where(eq(cases.id, caseId));
        }
        if (change === "missing_origin")
          await t.db
            .update(inquiries)
            .set({ caseId: null, state: "assigned" })
            .where(eq(inquiries.id, inquiryId));
      });
      const source = await collectServiceSources(t.db, f.staff.actor, f.client.partyId as string);
      expect(source.ownBlocked).toBe(false);
      expect(source.jointBlocked).toBe(true);
      expect(source.rows.map((row) => row.source)).toEqual(["inquiry"]);
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
      expect(
        inventory.categories.find(
          (row) => row.category === "joint_records_and_received_communications",
        )?.blocked,
      ).toBe(true);
      const serialized = JSON.stringify((await dossier(f))?.dossier);
      expect(serialized).not.toContain(other.partyId);
      expect(serialized).not.toContain("SYNTHETIC_OTHER_PARTY_CONTEXT");
      expect(serialized).not.toContain("SYNTHETIC_DIFFERENT_CASE_NEEDS");
    },
  );

  it.each(["inquiry_request", "inquiry_binding", "case_request", "case_binding"] as const)(
    "fences direct %s edits without a row revision in category review and frozen delivery",
    async (change) => {
      const f = await fixture(),
        before = structuredClone(f.context);
      await resolveCoverage(f);
      const mutate = async (suffix: string) => {
        const value = structuredClone(before);
        if (change.endsWith("request")) value.request.needs = `SYNTHETIC_CHANGED_NEEDS_${suffix}`;
        else value.binding.responsibleId = randomUUID();
        if (change.startsWith("inquiry")) {
          const [row] = await t.db.select().from(inquiries).where(eq(inquiries.id, f.inquiry.id));
          if (!row) throw new Error("Missing synthetic inquiry");
          await t.db
            .update(inquiries)
            .set({ context: { service: value }, updatedAt: row.updatedAt })
            .where(eq(inquiries.id, row.id));
          expect(
            (await t.db.select().from(inquiries).where(eq(inquiries.id, row.id)))[0]?.version,
          ).toBe(row.version);
        } else {
          const [row] = await t.db.select().from(cases).where(eq(cases.id, f.record.id));
          if (!row) throw new Error("Missing synthetic Case");
          await t.db
            .update(cases)
            .set({ serviceContext: value, updatedAt: row.updatedAt })
            .where(eq(cases.id, row.id));
          expect((await t.db.select().from(cases).where(eq(cases.id, row.id)))[0]?.version).toBe(
            row.version,
          );
        }
      };
      await mutate("first");
      await expect(issueCoverage(f)).rejects.toMatchObject({ code: "version_conflict" });
      expect((await dossier(f))?.review).toBeNull();
      // Restore the original preimage to independently test an already-issued artifact.
      await t.db
        .update(inquiries)
        .set({ context: { service: before } })
        .where(eq(inquiries.id, f.inquiry.id));
      await t.db.update(cases).set({ serviceContext: before }).where(eq(cases.id, f.record.id));
      await issueCoverage(f);
      await mutate("second");
      await expect(
        completePrivacyExport(t.db, f.staff.session, await completion(f), storage),
      ).rejects.toMatchObject({ code: "version_conflict" });
      await expect(privacyExportDownload(t.db, f.client.session, f.exportId)).rejects.toMatchObject(
        { code: "not_found" },
      );
    },
  );

  it("rechecks ordinary inquiry and Case access before showing a prepared context or serving frozen bytes", async () => {
    const f = await fixture();
    await resolveCoverage(f);
    await issueCoverage(f);
    await t.db
      .update(grants)
      .set({ revokedAt: new Date() })
      .where(and(eq(grants.principalId, f.staff.id), eq(grants.role, "assigned_broker")));
    const source = await collectServiceSources(t.db, f.staff.actor, f.client.partyId as string);
    expect(source.rows).toEqual([]);
    expect(source.ownBlocked).toBe(true);
    expect(source.jointBlocked).toBe(true);
    expect((await dossier(f))?.dossier).toBeNull();
    await expect(privacyExportDownload(t.db, f.client.session, f.exportId)).rejects.toMatchObject({
      code: "not_found",
    });
  });

  it("classifies scope drafts and immutable editions as staff policy, without disclosing them or holding unrelated customer exports", async () => {
    const f = await fixture();
    await resolveCoverage(f);
    await issueCoverage(f);
    const document = {
      kind: "bounded_service_scope_v1",
      decisions: [{ state: "unknown", topic: "management_consultation", regionId: randomUUID() }],
    };
    const contentHash = hashRequest(document);
    await t.db
      .insert(serviceScopeDrafts)
      .values({ id: serviceScopeId, document, contentHash, updatedById: f.staff.id });
    const [edition] = await t.db
      .insert(serviceScopeVersions)
      .values({
        document,
        contentHash,
        scopeVersion: 1,
        draftRevision: 1,
        approvedById: f.staff.id,
        approvalNote: "SYNTHETIC_INTERNAL_POLICY_NOTE",
        operationId: randomUUID(),
      })
      .returning();
    await t.db
      .update(serviceScopeDrafts)
      .set({ document: { ...document, decisions: [] } })
      .where(eq(serviceScopeDrafts.id, serviceScopeId));
    await completePrivacyExport(t.db, f.staff.session, await completion(f), storage);
    const delivered = await privacyExportDownload(t.db, f.client.session, f.exportId);
    for (const value of [
      serviceScopeId,
      edition?.id,
      "SYNTHETIC_INTERNAL_POLICY_NOTE",
      "bounded_service_scope_v1",
    ])
      expect(delivered.bytes.toString()).not.toContain(value);
  });
});
