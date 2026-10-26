import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  approvals,
  caseParticipants,
  cases,
  grants,
  inquiries,
  interests,
  operations,
  passkeys,
  serviceScopeVersions,
  sessions,
  staffMemberships,
  tasks,
} from "@/db/schema";
import { createTestDatabase, type TestDatabase } from "@/db/test-utils";
import { operatingPolicyId } from "@/domain/operating-policy";
import { emptyServiceScope, type ServiceScope, serviceScopeId } from "@/domain/service-scope";
import { createSession } from "../auth/sessions";
import { createCaseFromInquiry, postCaseMessage } from "../cases/commands";
import { linkInquiryToExistingCase, listInquiryCaseCandidates } from "../cases/inquiry-link";
import { transitionCaseStage } from "../cases/lifecycle";
import { readCase } from "../cases/queries";
import { hashRequest } from "../crypto";
import {
  issueSubmissionKey,
  newReceiptSession,
  readInquiryReceipt,
  submitInquiry,
} from "../inquiries/intake";
import { createStaff } from "../testing";
import { acceptInquiry } from "../work/commands";
import { serviceQueue } from "./queries";
import {
  approveServiceScope,
  bindServiceRequest,
  publicServiceOfferings,
  readServiceScope,
  readServiceScopeOperation,
  saveServiceScope,
} from "./scope";
import { publishSyntheticScope, syntheticServiceFixture } from "./testing";

let t: TestDatabase;
beforeEach(async () => {
  t = await createTestDatabase();
});
afterEach(async () => {
  await t?.drop();
});
const future = () => new Date(Date.now() + 3600000).toISOString();
async function accepted(f: Awaited<ReturnType<typeof syntheticServiceFixture>>) {
  const payload = {
    submissionKey: issueSubmissionKey(),
    locale: "bg",
    purpose: "service_consultation",
    contact: { kind: "email", value: `synthetic-${randomUUID()}@example.test` },
    privacyNotice: true,
    contentReference: { kind: "service", slug: f.source.slug, versionId: f.source.versionId },
    serviceRequest: f.request,
  };
  const context = { ip: "127.0.0.1", receiptSession: newReceiptSession() };
  const submitted = await submitInquiry(t.db, payload, context);
  const [inquiry] = await t.db
    .select()
    .from(inquiries)
    .where(eq(inquiries.reference, submitted.receipt.reference));
  if (!inquiry) throw new Error("Synthetic inquiry missing");
  const owner = await acceptInquiry(t.db, f.session, {
    id: inquiry.id,
    expectedVersion: inquiry.version,
    operationId: randomUUID(),
    nextAction: "Clarify the self-declared service request",
    dueAt: future(),
  });
  const input = {
    id: inquiry.id,
    expectedVersion: owner.outcome.version,
    operationId: randomUUID(),
    kind: "service_intake" as const,
    serviceTopic: f.request.topic,
    title: "Synthetic bounded consultation",
    requirements: f.request.needs,
    preferences: "",
    nextAction: "Human clarification only",
    dueAt: future(),
  };
  return { payload, context, submitted, inquiry, input };
}

describe("B11 / F27 F28 P23 C14 O29 O30 bounded service intake (synthetic only)", () => {
  it("keeps absent, unknown and explicitly not offered decisions distinct and never infers coverage from approved CMS", async () => {
    const actor = await createStaff(t.db, {
      grants: [{ capability: "settings.manage", recordType: "settings", recordId: serviceScopeId }],
    });
    await t.db.insert(passkeys).values({
      principalId: actor.id,
      credentialId: randomUUID(),
      publicKey: Buffer.from([1]),
      deviceType: "singleDevice",
      backedUp: false,
    });
    const { session } = await createSession(t.db, { kind: "staff", id: actor.id });
    expect(await publicServiceOfferings(t.db)).toEqual([]);
    expect((await readServiceScope(t.db, session)).draft.document).toEqual(emptyServiceScope);
    const document: ServiceScope = {
      kind: "bounded_service_scope_v1",
      decisions: [
        { state: "unknown", topic: "management_consultation", regionId: randomUUID() },
        {
          state: "not_offered",
          topic: "short_stay_consultation",
          regionId: randomUUID(),
          reason: "Synthetic explicit business refusal",
        },
      ],
    };
    await publishSyntheticScope(t.db, session, document);
    expect((await readServiceScope(t.db, session)).current?.document).toEqual(document);
    expect(await publicServiceOfferings(t.db)).toEqual([]);
  });
  it("requires the exact issuable settings scope, fresh human review and qualified claims authority", async () => {
    const f = await syntheticServiceFixture(t.db);
    const wrong = await createStaff(t.db, {
      grants: [
        { capability: "settings.manage", recordType: "settings", recordId: operatingPolicyId },
      ],
    });
    await t.db.insert(passkeys).values({
      principalId: wrong.id,
      credentialId: randomUUID(),
      publicKey: Buffer.from([1]),
      deviceType: "singleDevice",
      backedUp: false,
    });
    const { session } = await createSession(t.db, { kind: "staff", id: wrong.id });
    await expect(
      saveServiceScope(t.db, session, {
        operationId: randomUUID(),
        expectedVersion: 2,
        document: f.document,
      }),
    ).rejects.toMatchObject({ code: "forbidden" });
    const saved = await saveServiceScope(t.db, f.session, {
      operationId: randomUUID(),
      expectedVersion: 2,
      document: f.document,
    });
    await t.db
      .update(sessions)
      .set({ reverifiedAt: new Date(0) })
      .where(eq(sessions.id, f.session.id));
    await expect(
      approveServiceScope(t.db, f.session, {
        operationId: randomUUID(),
        expectedVersion: saved.outcome.version,
        expectedHash: saved.outcome.contentHash,
        reviewed: true,
        note: "Synthetic fresh review is required",
      }),
    ).rejects.toMatchObject({ code: "step_up_required" });
    await t.db
      .update(sessions)
      .set({ reverifiedAt: new Date() })
      .where(eq(sessions.id, f.session.id));
    await t.db
      .update(grants)
      .set({ revokedAt: new Date() })
      .where(and(eq(grants.principalId, f.actor.id), eq(grants.capability, "claim.approve")));
    await expect(
      approveServiceScope(t.db, f.session, {
        operationId: randomUUID(),
        expectedVersion: saved.outcome.version,
        expectedHash: saved.outcome.contentHash,
        reviewed: true,
        note: "Synthetic unqualified review must be denied",
      }),
    ).rejects.toMatchObject({ code: "forbidden" });
  });
  it("creates one real topic-bound owned service Case and first task without brokerage facts or automatic client authority", async () => {
    const f = await syntheticServiceFixture(t.db),
      a = await accepted(f);
    expect(await publicServiceOfferings(t.db, f.source.slug, "bg")).toHaveLength(1);
    expect(await publicServiceOfferings(t.db, f.source.slug, "en")).toEqual([]);
    const replay = await submitInquiry(t.db, a.payload, a.context);
    expect(replay.replayed).toBe(true);
    expect(replay.receipt).toEqual(a.submitted.receipt);
    expect(JSON.stringify(replay.receipt)).not.toContain(f.request.needs);
    await expect(
      submitInquiry(
        t.db,
        { ...a.payload, serviceRequest: { ...f.request, needs: "Changed synthetic request" } },
        a.context,
      ),
    ).rejects.toMatchObject({ code: "idempotency_key_reused" });
    const [buyer] = await t.db
      .insert(cases)
      .values({
        kind: "buyer",
        stage: "needs_agreed",
        reference: `CS-SYNTHETIC-${randomUUID()}`,
        title: "Synthetic unrelated brokerage Case",
        ownerId: f.actor.id,
        nextAction: "Synthetic brokerage follow-up",
        nextActionDueAt: new Date(future()),
      })
      .returning();
    if (!buyer || !a.inquiry.partyId) throw new Error("Synthetic buyer fixture missing");
    await t.db.insert(caseParticipants).values({
      caseId: buyer.id,
      partyId: a.inquiry.partyId,
      role: "buyer",
      authority: "not_claimed",
    });
    expect(await listInquiryCaseCandidates(t.db, f.session, a.inquiry.id)).toEqual([]);
    await expect(
      linkInquiryToExistingCase(t.db, f.session, {
        id: a.inquiry.id,
        expectedVersion: a.input.expectedVersion,
        operationId: randomUUID(),
        caseId: buyer.id,
        expectedCaseVersion: buyer.version,
      }),
    ).rejects.toMatchObject({ code: "transition_denied" });
    await expect(
      createCaseFromInquiry(t.db, f.session, {
        ...a.input,
        kind: "buyer",
        operationId: randomUUID(),
        serviceTopic: undefined,
      }),
    ).rejects.toMatchObject({ code: "transition_denied" });
    const created = await createCaseFromInquiry(t.db, f.session, a.input);
    expect((await createCaseFromInquiry(t.db, f.session, a.input)).replayed).toBe(true);
    await expect(
      createCaseFromInquiry(t.db, f.session, { ...a.input, title: "Changed synthetic title" }),
    ).rejects.toMatchObject({ code: "idempotency_key_reused" });
    const [record] = await t.db.select().from(cases).where(eq(cases.id, created.outcome.id));
    expect(record).toMatchObject({
      kind: "service_intake",
      serviceTopic: f.request.topic,
      propertyId: null,
      stage: "request_received",
      ownerId: f.actor.id,
      serviceContext: { request: f.request },
    });
    expect(
      await t.db.select().from(interests).where(eq(interests.caseId, created.outcome.id)),
    ).toEqual([]);
    expect(await t.db.select().from(tasks).where(eq(tasks.inquiryId, a.inquiry.id))).toMatchObject([
      { caseId: created.outcome.id, ownerId: f.actor.id, state: "open" },
    ]);
    expect(
      await t.db
        .select()
        .from(caseParticipants)
        .where(eq(caseParticipants.caseId, created.outcome.id)),
    ).toMatchObject([{ role: "collaborator", authority: "not_claimed", scope: {} }]);
    expect((await readCase(t.db, f.session, created.outcome.id)).record.service?.current).toBe(
      true,
    );
    await transitionCaseStage(t.db, f.session, {
      id: created.outcome.id,
      operationId: randomUUID(),
      expectedVersion: 1,
      completionEvidenceId: "",
      retention: "",
      aftercare: "",
      handover: "",
      stage: "consultation",
      reason: "Synthetic human clarification",
      outcome: "",
    });
    await postCaseMessage(t.db, f.session, {
      id: created.outcome.id,
      operationId: randomUUID(),
      expectedVersion: 2,
      body: "Synthetic human follow-up. Source and quote expiry must be reviewed before any offer.",
      audience: "case_participants",
      reviewed: true,
    });
  });
  it("blocks stale/revoked editions, withdrawn service, expired review and unusable owners while retaining receipt and refusal paths", async () => {
    const f = await syntheticServiceFixture(t.db),
      a = await accepted(f);
    await t.db
      .update(passkeys)
      .set({ revokedAt: new Date() })
      .where(eq(passkeys.principalId, f.actor.id));
    expect(await publicServiceOfferings(t.db, f.source.slug)).toEqual([]);
    await t.db
      .update(passkeys)
      .set({ revokedAt: null })
      .where(eq(passkeys.principalId, f.actor.id));
    await t.db
      .update(staffMemberships)
      .set({
        absenceFrom: new Date(Date.now() - 1000),
        absenceReviewAt: new Date(Date.now() + 3600000),
      })
      .where(eq(staffMemberships.principalId, f.actor.id));
    expect(await publicServiceOfferings(t.db, f.source.slug)).toEqual([]);
    await t.db
      .update(staffMemberships)
      .set({ absenceFrom: null, absenceReviewAt: null })
      .where(eq(staffMemberships.principalId, f.actor.id));
    await t.db
      .update(approvals)
      .set({
        state: "invalidated",
        invalidatedAt: new Date(),
        invalidationReason: "Synthetic terms revocation",
      })
      .where(
        and(eq(approvals.subjectId, f.source.versionId), eq(approvals.kind, "legal_process_claim")),
      );
    expect(await publicServiceOfferings(t.db, f.source.slug)).toEqual([]);
    await expect(createCaseFromInquiry(t.db, f.session, a.input)).rejects.toMatchObject({
      code: "version_conflict",
    });
    expect(
      (
        await readInquiryReceipt(t.db, {
          submissionKey: a.payload.submissionKey,
          receiptSession: a.context.receiptSession,
        })
      ).service?.scopeVersionId,
    ).toBe(f.approved.outcome.id);
    await expect(
      readInquiryReceipt(t.db, {
        submissionKey: a.payload.submissionKey,
        receiptSession: newReceiptSession(),
      }),
    ).rejects.toMatchObject({ code: "not_found" });
  });
  it("withdrawal preserves historical Case follow-up and permits truthful human conclusion while holding new consultation", async () => {
    const f = await syntheticServiceFixture(t.db),
      a = await accepted(f);
    const created = await createCaseFromInquiry(t.db, f.session, a.input);
    await publishSyntheticScope(t.db, f.session, {
      kind: "bounded_service_scope_v1",
      decisions: [
        {
          topic: f.request.topic,
          regionId: f.region.id,
          state: "not_offered",
          reason: "Synthetic explicit withdrawal; manual follow-up remains owned",
        },
      ],
    });
    expect((await readCase(t.db, f.session, created.outcome.id)).record.service?.current).toBe(
      false,
    );
    await expect(
      transitionCaseStage(t.db, f.session, {
        id: created.outcome.id,
        operationId: randomUUID(),
        expectedVersion: 1,
        completionEvidenceId: "",
        retention: "",
        aftercare: "",
        handover: "",
        stage: "consultation",
        reason: "Should remain held",
        outcome: "",
      }),
    ).rejects.toMatchObject({ code: "approval_stale" });
    await transitionCaseStage(t.db, f.session, {
      id: created.outcome.id,
      operationId: randomUUID(),
      expectedVersion: 1,
      completionEvidenceId: "",
      retention: "",
      aftercare: "",
      handover: "",
      stage: "concluded",
      reason: "Synthetic refusal after withdrawal",
      outcome: "Actual service unsupported; human explained refusal and manual next step",
    });
    expect((await readCase(t.db, f.session, created.outcome.id)).record.stage).toBe("concluded");
  });
  it("filters queue rows and counts before aggregation and rechecks current replay authority", async () => {
    const f = await syntheticServiceFixture(t.db),
      a = await accepted(f);
    await accepted(f);
    const viewer = await createStaff(t.db, {
      grants: [{ capability: "inquiry.read", recordType: "inquiry", recordId: a.inquiry.id }],
    });
    await t.db.insert(passkeys).values({
      principalId: viewer.id,
      credentialId: randomUUID(),
      publicKey: Buffer.from([1]),
      deviceType: "singleDevice",
      backedUp: false,
    });
    const { session } = await createSession(t.db, { kind: "staff", id: viewer.id });
    const view = await serviceQueue(t.db, session);
    expect(view.requestCount).toBe(1);
    expect(view.caseCount).toBe(0);
    expect(view.requests.map((row) => row.id)).toEqual([a.inquiry.id]);
    expect(view.cases).toEqual([]);
    await t.db
      .update(grants)
      .set({ revokedAt: new Date() })
      .where(eq(grants.principalId, viewer.id));
    expect((await serviceQueue(t.db, session)).requests).toEqual([]);
    const operationId = randomUUID(),
      draft = (await readServiceScope(t.db, f.session)).draft;
    const input = { operationId, expectedVersion: draft.version, document: f.document };
    const saved = await saveServiceScope(t.db, f.session, input);
    expect((await saveServiceScope(t.db, f.session, input)).outcome).toEqual(saved.outcome);
    expect((await readServiceScopeOperation(t.db, f.session, "save", operationId))?.status).toBe(
      "succeeded",
    );
    await expect(
      saveServiceScope(t.db, f.session, { ...input, document: emptyServiceScope }),
    ).rejects.toMatchObject({ code: "idempotency_key_reused" });
    const pending = randomUUID();
    await t.db.insert(operations).values({
      actorKind: "staff",
      actorId: f.actor.id,
      operationType: "service_scope.save",
      idempotencyKey: pending,
      requestHash: hashRequest({ ...input, operationId: pending }),
      status: "in_progress",
    });
    await expect(
      saveServiceScope(t.db, f.session, { ...input, operationId: pending }),
    ).rejects.toMatchObject({ code: "operation_pending" });
    await t.db
      .update(grants)
      .set({ revokedAt: new Date() })
      .where(and(eq(grants.principalId, f.actor.id), eq(grants.recordId, serviceScopeId)));
    await expect(
      readServiceScopeOperation(t.db, f.session, "save", operationId),
    ).rejects.toMatchObject({ code: "forbidden" });
  });
  it("fails closed when an immutable reviewed scope expires or the bound hash changes", async () => {
    const f = await syntheticServiceFixture(t.db);
    const changed = structuredClone(f.document);
    const offered = changed.decisions[0];
    if (offered?.state !== "offered") throw new Error("Synthetic offering missing");
    offered.reviewExpiresAt = new Date(Date.now() - 1000).toISOString();
    const saved = await saveServiceScope(t.db, f.session, {
      operationId: randomUUID(),
      expectedVersion: 2,
      document: changed,
    });
    await expect(
      approveServiceScope(t.db, f.session, {
        operationId: randomUUID(),
        expectedVersion: saved.outcome.version,
        expectedHash: saved.outcome.contentHash,
        reviewed: true,
        note: "Synthetic expired scope must not pass",
      }),
    ).rejects.toMatchObject({ code: "approval_stale" });
    await t.db
      .update(serviceScopeVersions)
      .set({ document: changed })
      .where(eq(serviceScopeVersions.id, f.approved.outcome.id));
    expect(await publicServiceOfferings(t.db)).toEqual([]);
    await expect(bindServiceRequest(t.db, f.request, f.source, "bg")).rejects.toMatchObject({
      code: "version_conflict",
    });
  });
});
