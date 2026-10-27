import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cases, grants, inquiries, operations } from "@/db/schema";
import { createTestDatabase, type TestDatabase } from "@/db/test-utils";
import { createCaseFromInquiry } from "@/server/cases/commands";
import { linkInquiryToExistingCase, listInquiryCaseCandidates } from "@/server/cases/inquiry-link";
import { hashRequest } from "@/server/crypto";
import { issueSubmissionKey, newReceiptSession, submitInquiry } from "@/server/inquiries/intake";
import {
  readServiceScope,
  saveServiceScope,
  saveServiceScopeDecision,
  serviceCaseCoverage,
} from "@/server/service-intake/scope";
import { publishSyntheticScope, syntheticServiceFixture } from "@/server/service-intake/testing";
import { acceptInquiry } from "@/server/work/commands";
import { formFields } from "@/ui/form/contract";
import { initialFormState } from "@/ui/form/server";
import { submitServiceScope } from "../../../app/staff/[locale]/(workspace)/settings/service-scope/actions";

const probe = vi.hoisted(() => ({ db: null as unknown, session: null as unknown }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/server/auth/pages", () => ({
  currentStaffAccess: async () => ({ state: "ready", session: probe.session }),
}));
vi.mock("@/server/http/next", async () => {
  const { toErrorBody } = await import("@/server/errors");
  return {
    action: async (fn: (ctx: { db: unknown }) => Promise<unknown>) => {
      try {
        return { ok: true, data: await fn({ db: probe.db }) };
      } catch (error) {
        return { ok: false, error: toErrorBody(error, "independent-probe") };
      }
    },
  };
});
let t: TestDatabase;
beforeEach(async () => {
  t = await createTestDatabase();
  probe.db = t.db;
});
afterEach(async () => {
  vi.restoreAllMocks();
  await t?.drop();
});
const future = () => new Date(Date.now() + 3600000).toISOString();
const day = (offset: number) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
const context = () => ({ ip: "127.0.0.1", receiptSession: newReceiptSession() });
const contact = () => ({ kind: "email", value: `synthetic-${randomUUID()}@example.test` });
async function receiveAndAccept(
  f: Awaited<ReturnType<typeof syntheticServiceFixture>>,
  payload: Record<string, unknown>,
) {
  const submitted = await submitInquiry(t.db, payload, context());
  const [inquiry] = await t.db
    .select()
    .from(inquiries)
    .where(eq(inquiries.reference, submitted.receipt.reference));
  if (!inquiry) throw new Error("Synthetic inquiry missing");
  const accepted = await acceptInquiry(t.db, f.session, {
    id: inquiry.id,
    expectedVersion: inquiry.version,
    operationId: randomUUID(),
    nextAction: "Synthetic human clarification",
    dueAt: future(),
  });
  return { inquiry, accepted };
}
it("B11 / F27 P23 recovers an elapsed stay start on the same submission key", async () => {
  const f = await syntheticServiceFixture(t.db);
  const offered = f.document.decisions.find((row) => row.state === "offered");
  if (offered?.state !== "offered") throw new Error("Missing offering");
  const scope = await publishSyntheticScope(t.db, f.session, {
    kind: "bounded_service_scope_v1",
    decisions: [{ ...offered, topic: "short_stay_consultation" }],
  });
  const payload = {
    submissionKey: issueSubmissionKey(),
    locale: "bg",
    purpose: "service_consultation",
    contact: contact(),
    privacyNotice: true,
    contentReference: { kind: f.source.kind, slug: f.source.slug, versionId: f.source.versionId },
    serviceRequest: {
      ...f.request,
      topic: "short_stay_consultation",
      scopeVersionId: scope.outcome.id,
      relationship: undefined,
      requestedFrom: day(-1),
      requestedUntil: day(2),
    },
  };
  const ctx = context();
  await expect(submitInquiry(t.db, payload, ctx)).rejects.toMatchObject({
    code: "validation_failed",
    fieldErrors: { "serviceRequest.requestedFrom": ["future_required"] },
  });
  expect(
    await t.db
      .select()
      .from(operations)
      .where(eq(operations.idempotencyKey, payload.submissionKey)),
  ).toEqual([]);
  await expect(
    submitInquiry(
      t.db,
      {
        ...payload,
        serviceRequest: {
          ...payload.serviceRequest,
          requestedFrom: day(1),
          requestedUntil: day(3),
        },
      },
      ctx,
    ),
  ).resolves.toMatchObject({ receipt: { status: "accepted" } });
});
it("B11 / P23 rolls back a start day that elapses while the commit waits", async () => {
  const f = await syntheticServiceFixture(t.db);
  const offering = f.document.decisions.find((row) => row.state === "offered");
  if (offering?.state !== "offered") throw new Error("Synthetic offering missing");
  const scope = await publishSyntheticScope(t.db, f.session, {
    kind: "bounded_service_scope_v1",
    decisions: [{ ...offering, topic: "short_stay_consultation" }],
  });
  const payload = {
    submissionKey: issueSubmissionKey(),
    locale: "bg",
    purpose: "service_consultation",
    contact: contact(),
    privacyNotice: true,
    contentReference: { kind: f.source.kind, slug: f.source.slug, versionId: f.source.versionId },
    serviceRequest: {
      ...f.request,
      topic: "short_stay_consultation",
      scopeVersionId: scope.outcome.id,
      requestedFrom: day(1),
      requestedUntil: day(4),
    },
  };
  const ctx = context();
  const now = Date.now();
  const clock = vi.spyOn(Date, "now").mockReturnValue(now);
  const transaction = t.db.transaction.bind(t.db);
  vi.spyOn(t.db, "transaction").mockImplementationOnce((fn, config) =>
    transaction(async (tx) => {
      clock.mockReturnValue(now + 2 * 86400000);
      return fn(tx);
    }, config),
  );
  await expect(submitInquiry(t.db, payload, ctx)).rejects.toMatchObject({
    code: "validation_failed",
    fieldErrors: { "serviceRequest.requestedFrom": ["future_required"] },
  });
  vi.restoreAllMocks();
  expect(
    await t.db
      .select()
      .from(operations)
      .where(eq(operations.idempotencyKey, payload.submissionKey)),
  ).toEqual([]);
  const corrected = {
    ...payload,
    serviceRequest: { ...payload.serviceRequest, requestedFrom: day(3) },
  };
  const accepted = await submitInquiry(t.db, corrected, ctx);
  const replay = await submitInquiry(t.db, corrected, {
    ...ctx,
    now: new Date(now + 6 * 86400000),
  });
  expect(replay.replayed).toBe(true);
  expect(replay.receipt).toEqual(accepted.receipt);
});
it("B11 / F28 O30 excludes ordinary inquiries and links only matching current service requests", async () => {
  const f = await syntheticServiceFixture(t.db),
    route = contact();
  const a = await receiveAndAccept(f, {
    submissionKey: issueSubmissionKey(),
    locale: "bg",
    purpose: "service_consultation",
    contact: route,
    privacyNotice: true,
    contentReference: { kind: f.source.kind, slug: f.source.slug, versionId: f.source.versionId },
    serviceRequest: f.request,
  });
  const created = await createCaseFromInquiry(t.db, f.session, {
    id: a.inquiry.id,
    operationId: randomUUID(),
    expectedVersion: a.accepted.outcome.version,
    kind: "service_intake",
    serviceTopic: f.request.topic,
    title: "Synthetic service Case",
    nextAction: "Synthetic clarification",
    dueAt: future(),
    requirements: "Synthetic service need",
    preferences: "",
  });
  for (const purpose of ["question", "seller_consultation", "landlord_consultation"]) {
    const b = await receiveAndAccept(f, {
      submissionKey: issueSubmissionKey(),
      locale: "bg",
      purpose,
      contact: route,
      privacyNotice: true,
      message: "Synthetic ordinary brokerage request",
    });
    expect(await listInquiryCaseCandidates(t.db, f.session, b.inquiry.id)).toEqual([]);
    await expect(
      linkInquiryToExistingCase(t.db, f.session, {
        id: b.inquiry.id,
        operationId: randomUUID(),
        expectedVersion: b.accepted.outcome.version,
        caseId: created.outcome.id,
        expectedCaseVersion: created.outcome.version,
      }),
    ).rejects.toMatchObject({ code: "transition_denied" });
  }
  const matching = await receiveAndAccept(f, {
    submissionKey: issueSubmissionKey(),
    locale: "bg",
    purpose: "service_consultation",
    contact: route,
    privacyNotice: true,
    contentReference: { kind: f.source.kind, slug: f.source.slug, versionId: f.source.versionId },
    serviceRequest: f.request,
  });
  expect(await listInquiryCaseCandidates(t.db, f.session, matching.inquiry.id)).toMatchObject([
    { id: created.outcome.id, canLink: true },
  ]);
  const link = {
    id: matching.inquiry.id,
    operationId: randomUUID(),
    expectedVersion: matching.accepted.outcome.version,
    caseId: created.outcome.id,
    expectedCaseVersion: created.outcome.version,
  };
  const linked = await linkInquiryToExistingCase(t.db, f.session, link);
  expect((await linkInquiryToExistingCase(t.db, f.session, link)).outcome).toEqual(linked.outcome);
});

it("B11 / O29 retains pending and unknown decision identities and rejects changed intent", async () => {
  const f = await syntheticServiceFixture(t.db);
  const input = {
    operationId: randomUUID(),
    expectedVersion: (await readServiceScope(t.db, f.session)).draft.version,
    decision: {
      state: "unknown" as const,
      topic: "short_stay_consultation" as const,
      regionId: f.region.id,
    },
  };
  const [operation] = await t.db
    .insert(operations)
    .values({
      actorKind: "staff",
      actorId: f.actor.id,
      operationType: "service_scope.save",
      idempotencyKey: input.operationId,
      requestHash: hashRequest(input),
      status: "in_progress",
    })
    .returning();
  if (!operation) throw new Error("Synthetic pending operation missing");
  await expect(saveServiceScopeDecision(t.db, f.session, input)).rejects.toMatchObject({
    code: "operation_pending",
  });
  await t.db
    .update(operations)
    .set({ status: "outcome_unknown" })
    .where(eq(operations.id, operation.id));
  await expect(saveServiceScopeDecision(t.db, f.session, input)).rejects.toMatchObject({
    code: "outcome_unknown",
  });
  await expect(
    saveServiceScopeDecision(t.db, f.session, {
      ...input,
      decision: { ...input.decision, topic: "management_consultation" },
    }),
  ).rejects.toMatchObject({ code: "idempotency_key_reused" });
  expect(
    await t.db.select().from(operations).where(eq(operations.idempotencyKey, input.operationId)),
  ).toMatchObject([{ id: operation.id, status: "outcome_unknown" }]);
  expect((await readServiceScope(t.db, f.session)).draft.version).toBe(input.expectedVersion);
});

it("B11 / O29 replays an offered decision after its implicitly captured operating policy changes", async () => {
  const { readOperatingPolicy, saveOperatingPolicy, approveOperatingPolicy } = await import(
    "@/server/operating-policy/service"
  );
  const f = await syntheticServiceFixture(t.db);
  const offering = f.document.decisions.find((row) => row.state === "offered");
  if (offering?.state !== "offered") throw new Error("Synthetic offering missing");
  const { operatingPolicy, ...decision } = offering;
  const input = {
    operationId: randomUUID(),
    expectedVersion: (await readServiceScope(t.db, f.session)).draft.version,
    decision,
  };
  const saved = await saveServiceScopeDecision(t.db, f.session, input);
  const policy = await readOperatingPolicy(t.db, f.session);
  const updated = await saveOperatingPolicy(t.db, f.session, {
    operationId: randomUUID(),
    expectedVersion: policy.draft.version,
    document: { ...policy.draft.document, coverage: "Synthetic revised operating coverage" },
  });
  await approveOperatingPolicy(t.db, f.session, {
    operationId: randomUUID(),
    expectedVersion: updated.outcome.version,
    expectedHash: updated.outcome.contentHash,
    reviewed: true,
    note: "Synthetic revised operating policy decision",
  });
  const replay = await saveServiceScopeDecision(t.db, f.session, input);
  expect(replay.replayed).toBe(true);
  expect(replay.outcome).toEqual(saved.outcome);
  expect((await readServiceScope(t.db, f.session)).draft.document.decisions).toContainEqual({
    ...decision,
    operatingPolicy,
  });
});

it("B11 / O30 keeps legacy unbound locale context readable and holds new progression", async () => {
  const f = await syntheticServiceFixture(t.db);
  const a = await receiveAndAccept(f, {
    submissionKey: issueSubmissionKey(),
    locale: "bg",
    purpose: "service_consultation",
    contact: contact(),
    privacyNotice: true,
    contentReference: { kind: f.source.kind, slug: f.source.slug, versionId: f.source.versionId },
    serviceRequest: f.request,
  });
  const original = a.inquiry.context as { service: { binding: Record<string, unknown> } };
  const legacy = structuredClone(original);
  delete legacy.service.binding.observedSource;
  const coverage = await serviceCaseCoverage(t.db, legacy.service);
  expect(coverage.current).toBe(false);
  expect(coverage.context?.request).toEqual(f.request);
  await t.db.update(inquiries).set({ context: legacy }).where(eq(inquiries.id, a.inquiry.id));
  await expect(
    createCaseFromInquiry(t.db, f.session, {
      id: a.inquiry.id,
      operationId: randomUUID(),
      expectedVersion: a.accepted.outcome.version,
      kind: "service_intake",
      serviceTopic: f.request.topic,
      title: "Synthetic legacy service context",
      nextAction: "Synthetic manual clarification",
      dueAt: future(),
      requirements: "Synthetic historical need",
      preferences: "",
    }),
  ).rejects.toMatchObject({ code: "approval_stale" });
  expect(await t.db.select().from(cases)).toEqual([]);
});
it("B11 / O29 replays the exact form intent across unrelated edits under current authority", async () => {
  const f = await syntheticServiceFixture(t.db);
  probe.session = f.session;
  const state = initialFormState(
    "service_scope.save",
    {
      topic: "short_stay_consultation",
      region: JSON.stringify({ id: f.region.id, version: f.region.version }),
      state: "unknown",
    },
    (await readServiceScope(t.db, f.session)).draft.version,
  );
  const data = new FormData();
  data.set(formFields.intent, "submit");
  data.set(formFields.operationId, state.operationId);
  data.set(formFields.expectedRevision, String(state.expectedRevision));
  for (const [key, value] of Object.entries(state.values)) data.set(key, value);
  const first = await submitServiceScope("bg", "save", state, data);
  expect(first.outcome.kind).toBe("confirmed");
  const draft = (await readServiceScope(t.db, f.session)).draft;
  const changed = structuredClone(draft.document);
  const offering = changed.decisions.find((row) => row.state === "offered");
  if (offering?.state !== "offered") throw new Error("Missing offering");
  offering.mode = "consultation";
  await saveServiceScope(t.db, f.session, {
    operationId: randomUUID(),
    expectedVersion: draft.version,
    document: changed,
  });
  const replay = await submitServiceScope("bg", "save", state, data);
  expect(replay.outcome).toEqual(first.outcome);
  const altered = new FormData();
  for (const [name, value] of data.entries()) altered.set(name, value);
  altered.set("state", "not_offered");
  altered.set("reason", "Synthetic changed intended decision");
  expect((await submitServiceScope("bg", "save", state, altered)).outcome).toMatchObject({
    kind: "conflict",
    code: "IDEMPOTENCY_KEY_REUSED",
  });
  await t.db
    .update(grants)
    .set({ revokedAt: new Date() })
    .where(eq(grants.principalId, f.actor.id));
  expect((await submitServiceScope("bg", "save", state, data)).outcome).toMatchObject({
    kind: "rejected",
    code: "NOT_AUTHORIZED",
  });
});

it("B11 / C14 O30 holds the exact withdrawn observed locale and preserves manual conclusion", async () => {
  const { readContentLocaleWorkbench, saveContentLocale, decideContentLocale } = await import(
    "@/server/content/locale-commands"
  );
  const { readApprovedContent } = await import("@/server/content/public");
  const { readCase } = await import("@/server/cases/queries");
  const { transitionCaseStage } = await import("@/server/cases/lifecycle");
  const f = await syntheticServiceFixture(t.db);
  await t.db.insert(grants).values({
    principalId: f.actor.id,
    capability: "translation.review",
    reason: "Synthetic locale probe",
  });
  const bound = async () => {
    const view = await readContentLocaleWorkbench(t.db, f.session, f.contentId, "en");
    if (!view.source) throw new Error("Missing approved synthetic source");
    return {
      id: f.contentId,
      locale: "en" as const,
      operationId: randomUUID(),
      expectedVersion: view.edition?.version ?? 1,
      sourceExpectedVersion: view.page.version,
      sourceVersionId: view.source.version.id,
      sourceVersionHash: view.source.version.contentHash,
    };
  };
  await saveContentLocale(t.db, f.session, {
    ...(await bound()),
    title: "Synthetic EN service",
    text: "Synthetic EN consultation terms only",
  });
  for (const decision of ["request_review", "claims", "language", "editorial", "publish"] as const)
    await decideContentLocale(t.db, f.session, {
      ...(await bound()),
      decision,
      reviewed: true,
      note: "Synthetic exact locale decision",
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
    });
  const localized = await readApprovedContent(t.db, "service", f.source.slug, "en");
  if (!localized) throw new Error("Synthetic locale approval missing");
  const a = await receiveAndAccept(f, {
    submissionKey: issueSubmissionKey(),
    locale: "en",
    purpose: "service_consultation",
    contact: contact(),
    privacyNotice: true,
    contentReference: { kind: "service", slug: f.source.slug, versionId: localized.version.id },
    serviceRequest: f.request,
  });
  expect(a.inquiry.context).toMatchObject({
    service: {
      binding: {
        observedSource: {
          kind: "service",
          slug: f.source.slug,
          versionId: localized.version.id,
          contentHash: localized.version.contentHash,
          locale: "en",
        },
      },
    },
  });
  const created = await createCaseFromInquiry(t.db, f.session, {
    id: a.inquiry.id,
    operationId: randomUUID(),
    expectedVersion: a.accepted.outcome.version,
    kind: "service_intake",
    serviceTopic: f.request.topic,
    title: "Synthetic EN consultation",
    nextAction: "Synthetic clarification",
    dueAt: future(),
    requirements: "Synthetic service need",
    preferences: "",
  });
  await decideContentLocale(t.db, f.session, {
    ...(await bound()),
    decision: "withdraw",
    reviewed: true,
    note: "Synthetic human locale withdrawal",
  });
  expect(await readApprovedContent(t.db, "service", f.source.slug, "en")).toBeNull();
  const view = await readCase(t.db, f.session, created.outcome.id);
  await expect(
    transitionCaseStage(t.db, f.session, {
      id: created.outcome.id,
      expectedVersion: created.outcome.version,
      operationId: randomUUID(),
      stage: "consultation",
      reason: "Synthetic new consultation after locale withdrawal",
      outcome: "",
      completionEvidenceId: "",
      retention: "",
      aftercare: "",
      handover: "",
    }),
  ).rejects.toMatchObject({ code: "approval_stale" });
  await transitionCaseStage(t.db, f.session, {
    id: created.outcome.id,
    expectedVersion: created.outcome.version,
    operationId: randomUUID(),
    stage: "concluded",
    reason: "Synthetic manual refusal remains available",
    outcome: "Human explained the source withdrawal and manual next step",
    completionEvidenceId: "",
    retention: "",
    aftercare: "",
    handover: "",
  });
  expect(view.record.service?.current).toBe(false);
});
