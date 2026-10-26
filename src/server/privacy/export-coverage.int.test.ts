// C18/O26 · AT43/AT45. Controlled completion with synthetic people and proof only.
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withRequestDatabase } from "@/db/request-scope";
import {
  auditEvents,
  cases,
  documents,
  documentVersions,
  grants,
  operations,
  passkeys,
  privacyRequests,
} from "@/db/schema";
import { createTestDatabase, type TestDatabase } from "@/db/test-utils";
import { sessionCookieName } from "../auth/cookies";
import { createSession } from "../auth/sessions";
import { hasPrivacyRetentionHold } from "../compliance/retention";
import { getEnv } from "../config/env";
import { LocalFileStorage } from "../files/storage";
import { createClient, createStaff } from "../testing";
import {
  captureCoverage,
  categoryDecision,
  coverageEnvelope,
  exportCoverageRow,
  issueCoverage,
  privacyExportCoverageFixture,
  resolveCoverage,
} from "./export-coverage-testing";
import { privacyExportGet } from "./export-route";
import {
  completePrivacyExport,
  privacyExportDownload,
  privacyExportReceipt,
  redactPrivacyExport,
  reviewPrivacyExportCategory,
  staffPrivacyExports,
} from "./exports";
import { reviewPrivacyRequest } from "./requests";

let t: TestDatabase, root: string, storage: LocalFileStorage;
beforeAll(async () => {
  t = await createTestDatabase();
  root = await mkdtemp(join(tmpdir(), "msr-export-coverage-"));
  storage = new LocalFileStorage(root);
});
afterAll(async () => {
  await t?.drop();
  if (root) await rm(root, { recursive: true, force: true });
});
const fixture = (scope: "listed_categories" | "additional_material" = "listed_categories") =>
  privacyExportCoverageFixture(t.db, storage, scope);
async function completion(f: Awaited<ReturnType<typeof fixture>>) {
  const row = await exportCoverageRow(t.db, f.exportId);
  return { ...(await coverageEnvelope(f)), reviewDigest: row.reviewSha256, confirmed: true };
}
async function download(
  f: Awaited<ReturnType<typeof fixture>>,
  token = f.client.token,
  range?: string,
) {
  const env = getEnv(),
    host = new URL(env.hosts.client).host;
  return withRequestDatabase(t.db, () =>
    privacyExportGet(
      new Request(`${env.hosts.client}/he/privacy/exports/${f.exportId}`, {
        headers: {
          host,
          cookie: `${sessionCookieName(env, "client")}=${token}`,
          ...(range ? { range } : {}),
        },
      }),
      { params: Promise.resolve({ locale: "he", id: f.exportId }) },
    ),
  );
}
describe("AT45 category/source-bound controlled completion", () => {
  it("fences restricted revisions even while the opaque hold stays true and exposes no restricted identities or counts", async () => {
    const f = await fixture();
    await resolveCoverage(f);
    const [restricted] = await t.db
      .select({ documentId: documents.id, versionId: documentVersions.id })
      .from(documents)
      .innerJoin(documentVersions, eq(documentVersions.documentId, documents.id))
      .where(and(eq(documents.caseId, f.record.id), eq(documents.purpose, "process_policy")));
    if (!restricted) throw new Error("Missing synthetic restricted source");
    const work = await staffPrivacyExports(t.db, f.staff.session, f.requestId, storage);
    expect(JSON.stringify(work.exports)).not.toContain(restricted.documentId);
    expect(JSON.stringify(work.exports)).not.toContain(restricted.versionId);
    const boundary = work.exports[0]?.review?.inventory.categories.find(
      (row) => row.category === "restricted_material_and_security_credentials",
    );
    expect(boundary?.sources).toHaveLength(1);
    expect(boundary?.sources[0]).not.toHaveProperty("id");
    await issueCoverage(f);
    expect(await hasPrivacyRetentionHold(t.db, f.client.partyId as string)).toBe(true);
    await t.db
      .update(documentVersions)
      .set({ version: sql`${documentVersions.version} + 1` })
      .where(eq(documentVersions.id, restricted.versionId));
    expect(await hasPrivacyRetentionHold(t.db, f.client.partyId as string)).toBe(true);
    await expect(
      completePrivacyExport(t.db, f.staff.session, await completion(f), storage),
    ).rejects.toMatchObject({ code: "version_conflict" });
    const denied = await download(f, f.client.token, "bytes=0-0");
    expect(denied.status).toBe(404);
    const text = await denied.text();
    expect(text).not.toContain(restricted.documentId);
    expect(text).not.toContain(restricted.versionId);
  });
  it("completes only the exact issued and reviewed set, replays once and keeps exact private bytes/range access after the atomic request revision", async () => {
    const f = await fixture();
    await resolveCoverage(f);
    const work = await staffPrivacyExports(t.db, f.staff.session, f.requestId, storage);
    const reviewed = work.exports[0];
    expect(reviewed?.dossier?.fulfilment).toBe("reviewed_scope");
    expect(reviewed?.review?.decisions).toHaveLength(5);
    await issueCoverage(f);
    const before = await privacyExportDownload(t.db, f.client.session, f.exportId);
    const command = await completion(f);
    await expect(
      completePrivacyExport(
        t.db,
        f.staff.session,
        { ...command, operationId: randomUUID(), digest: "0".repeat(64) },
        storage,
      ),
    ).rejects.toMatchObject({ code: "version_conflict" });
    const result = await completePrivacyExport(t.db, f.staff.session, command, storage);
    expect((await completePrivacyExport(t.db, f.staff.session, command, storage)).replayed).toBe(
      true,
    );
    const [request] = await t.db
      .select()
      .from(privacyRequests)
      .where(eq(privacyRequests.id, f.requestId));
    expect(request?.state).toBe("completed");
    expect(request?.version).toBe(4);
    const row = await exportCoverageRow(t.db, f.exportId);
    expect(row.requestVersion).toBe(4);
    expect(row.completedOperationId).toBe(result.operationId);
    expect(await privacyExportReceipt(t.db, f.staff.session, f.requestId, result.operationId)).toBe(
      result.operationId,
    );
    expect(
      await privacyExportReceipt(t.db, f.staff.session, randomUUID(), result.operationId),
    ).toBeNull();
    expect((await privacyExportDownload(t.db, f.client.session, f.exportId)).bytes).toEqual(
      before.bytes,
    );
    expect((await download(f, f.client.token, "bytes=0-12")).status).toBe(206);
    const other = await createClient(t.db),
      otherSession = await createSession(t.db, { kind: "client", id: other.id });
    const denied = await download(f, otherSession.token, "bytes=0-0");
    expect(denied.status).toBe(404);
    expect(denied.headers.has("content-range")).toBe(false);
    const dossier = JSON.parse(before.bytes.toString());
    expect(dossier.coverage).toHaveLength(5);
    expect(JSON.stringify(dossier)).not.toContain("reviewedById");
    expect(JSON.stringify(dossier)).not.toContain("evidenceReference");
    expect(JSON.stringify(dossier)).not.toContain(f.record.id);
    const [receipt] = await t.db
      .select()
      .from(operations)
      .where(
        and(
          eq(operations.idempotencyKey, command.operationId),
          eq(operations.operationType, "privacy.export.complete"),
        ),
      );
    expect(receipt?.status).toBe("succeeded");
    const audits = await t.db
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.operationId, result.operationId));
    expect(JSON.stringify(audits)).not.toContain(f.file.id);
    expect(JSON.stringify(audits)).not.toContain("Synthetic exact source review evidence");
  });

  it("requires every category and actual evidence, refuses fake empty/nonexistent proofs and keeps additional material unresolved", async () => {
    const f = await fixture();
    await captureCoverage(f);
    const direct = await categoryDecision(f, "personal_activity");
    await expect(
      reviewPrivacyExportCategory(t.db, f.staff.session, { ...direct, disposition: "none" }),
    ).rejects.toMatchObject({ code: "transition_denied" });
    const joint = await categoryDecision(f, "joint_records_and_received_communications");
    await expect(
      reviewPrivacyExportCategory(t.db, f.staff.session, {
        ...joint,
        operationId: randomUUID(),
        evidence: [],
      }),
    ).rejects.toMatchObject({ code: "validation_failed" });
    await expect(
      reviewPrivacyExportCategory(t.db, f.staff.session, {
        ...joint,
        operationId: randomUUID(),
        sourceKeys: [],
      }),
    ).rejects.toMatchObject({ code: "version_conflict" });
    await expect(
      reviewPrivacyExportCategory(t.db, f.staff.session, {
        ...joint,
        operationId: randomUUID(),
        evidence: joint.evidence.map((row) => ({ ...row, documentVersionId: randomUUID() })),
      }),
    ).rejects.toMatchObject({ code: "validation_failed" });
    await issueCoverage(f);
    await expect(
      completePrivacyExport(t.db, f.staff.session, await completion(f), storage),
    ).rejects.toMatchObject({ code: "transition_denied" });
    const additional = await fixture("additional_material");
    await resolveCoverage(additional);
    const work = await staffPrivacyExports(
      t.db,
      additional.staff.session,
      additional.requestId,
      storage,
    );
    expect(work.exports[0]?.dossier?.fulfilment).toBe("partial");
    const extra = await categoryDecision(additional, "additional_requested_material");
    await expect(
      reviewPrivacyExportCategory(t.db, additional.staff.session, {
        ...extra,
        disposition: "none",
      }),
    ).rejects.toMatchObject({ code: "transition_denied" });
    await issueCoverage(additional);
    await expect(
      completePrivacyExport(t.db, additional.staff.session, await completion(additional), storage),
    ).rejects.toMatchObject({ code: "transition_denied" });
  });

  it("binds decisions to source revisions and hides previous source identities/counts when an ordinary grant is absent", async () => {
    const f = await fixture();
    await captureCoverage(f);
    const decision = await categoryDecision(f, "personal_activity");
    const saved = await reviewPrivacyExportCategory(t.db, f.staff.session, decision);
    expect((await reviewPrivacyExportCategory(t.db, f.staff.session, decision)).replayed).toBe(
      true,
    );
    expect(saved.outcome.reviewSha256).not.toBe(decision.reviewDigest);
    await t.db
      .update(cases)
      .set({ version: sql`${cases.version} + 1` })
      .where(eq(cases.id, f.record.id));
    await expect(issueCoverage(f)).rejects.toMatchObject({ code: "version_conflict" });
    const hidden = await staffPrivacyExports(t.db, f.staff.session, f.requestId, storage);
    expect(hidden.exports[0]?.review).toBeNull();
    const noRights = await createStaff(t.db, { grants: [{ capability: "privacy.manage" }] });
    // Reuse no credential or forged session: current real synthetic staff authentication.
    const noRightsSession = await createSession(t.db, { kind: "staff", id: noRights.id });
    await t.db.insert(passkeys).values({
      principalId: noRights.id,
      credentialId: randomUUID(),
      publicKey: Buffer.from([1]),
      deviceType: "singleDevice",
      backedUp: false,
    });
    const denied = await staffPrivacyExports(t.db, noRightsSession.session, f.requestId, storage);
    expect(denied.exports[0]?.dossier).toBeNull();
    expect(denied.exports[0]?.review).toBeNull();
    expect(JSON.stringify(denied.exports)).not.toContain(f.file.id);
    expect(JSON.stringify(denied.exports)).not.toContain(f.record.id);
  });

  it("denies stale issue/completion and every later full/range read after source or grant changes; generic status cannot bypass the command", async () => {
    const f = await fixture();
    await resolveCoverage(f);
    await issueCoverage(f);
    const stale = await completion(f);
    await t.db.update(documents).set({ version: 2 }).where(eq(documents.id, f.request.documentId));
    await expect(
      completePrivacyExport(t.db, f.staff.session, stale, storage),
    ).rejects.toMatchObject({ code: "version_conflict" });
    expect((await download(f, f.client.token, "bytes=0-0")).status).toBeGreaterThanOrEqual(400);
    const ready = await fixture();
    await resolveCoverage(ready);
    await issueCoverage(ready);
    await expect(
      reviewPrivacyRequest(t.db, ready.staff.session, {
        operationId: randomUUID(),
        id: ready.requestId,
        expectedVersion: 3,
        to: "completed",
        responsibleId: ready.staff.id,
        policyReference: ready.policyReference,
        dueAt: null,
        identityReviewed: true,
        legalHoldReason: "",
        legalHoldDisposition: "Synthetic exact review only",
        holdResolved: false,
        completionEvidence: "Arbitrary completion text must be refused",
        rejectionReason: "",
        confirmed: true,
      }),
    ).rejects.toMatchObject({ code: "transition_denied" });
    await completePrivacyExport(t.db, ready.staff.session, await completion(ready), storage);
    await t.db
      .update(grants)
      .set({ revokedAt: new Date() })
      .where(
        and(eq(grants.principalId, ready.client.id), eq(grants.recordId, ready.request.documentId)),
      );
    const denied = await download(ready, ready.client.token, "bytes=0-0");
    expect(denied.status).toBe(404);
    expect(denied.headers.has("content-range")).toBe(false);
    expect((await download(ready)).status).toBe(404);
  });

  it("invalidates all category decisions after a redaction revision and follows the source reviewer's ordinary grant revocation after completion", async () => {
    const f = await fixture();
    await resolveCoverage(f);
    await redactPrivacyExport(t.db, f.staff.session, {
      ...(await coverageEnvelope(f)),
      omitTexts: [{ section: "inquiries", id: f.inquiry.id }],
    });
    const revised = await staffPrivacyExports(t.db, f.staff.session, f.requestId, storage);
    expect(revised.exports[0]?.review?.decisions).toEqual([]);
    expect(revised.exports[0]?.dossier?.fulfilment).toBe("partial");
    await issueCoverage(f);
    await expect(
      completePrivacyExport(t.db, f.staff.session, await completion(f), storage),
    ).rejects.toMatchObject({ code: "transition_denied" });
    const ready = await fixture();
    await resolveCoverage(ready);
    await issueCoverage(ready);
    await completePrivacyExport(t.db, ready.staff.session, await completion(ready), storage);
    await t.db
      .update(grants)
      .set({ revokedAt: new Date() })
      .where(and(eq(grants.principalId, ready.staff.id), eq(grants.role, "assigned_broker")));
    const denied = await download(ready, ready.client.token, "bytes=0-0");
    expect(denied.status).toBe(404);
    expect(denied.headers.has("content-range")).toBe(false);
    expect((await download(ready)).status).toBe(404);
  });
});
