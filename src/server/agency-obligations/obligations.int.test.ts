import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  agencyCaseReviews,
  agencyPartnerTerms,
  caseParticipants,
  cases,
  documents,
  documentVersions,
  grants,
  inquiries,
  operations,
  parties,
  passkeys,
  privacyProcessingRestrictions,
} from "@/db/schema";
import { createTestDatabase, type TestDatabase } from "@/db/test-utils";
import { createSession } from "../auth/sessions";
import { caseFixture } from "../cases/testing";
import {
  createContent,
  decideContent,
  readContentWorkbench,
  saveContent,
} from "../content/commands";
import { readApprovedContent } from "../content/public";
import { hashRequest } from "../crypto";
import { appendPrivacySafetyDecision } from "../privacy/safety-ledger";
import { nextReference } from "../references";
import { createClient } from "../testing";
import { readAgencyOperation } from "./commands";
import {
  decidePartnerTerms,
  listPartnerTerms,
  readPartnerTerms,
  savePartnerTerms,
} from "./partner-terms";
import {
  decideReviewConsent,
  readCaseReview,
  reviewDisplayEligible,
  saveCaseReview,
  verifyCaseReview,
} from "./reviews";

let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => {
  await t?.drop();
});
const future = () => new Date(Date.now() + 86400000).toISOString();
async function fixture() {
  const f = await caseFixture(t.db);
  await t.db.insert(grants).values(
    ["compliance.review", "claim.approve", "document.review"].map((capability) => ({
      principalId: f.staff.id,
      capability: capability as "compliance.review",
      reason: "Synthetic individual qualification",
    })),
  );
  const keys = await t.db.select().from(passkeys).where(eq(passkeys.principalId, f.staff.id));
  if (keys[1])
    await t.db.update(passkeys).set({ revokedAt: new Date() }).where(eq(passkeys.id, keys[1].id));
  return f;
}
async function evidence(
  f: Awaited<ReturnType<typeof fixture>>,
  purpose = "review_consent",
  caseId: string | null = f.record.id,
) {
  const [doc] = await t.db
    .insert(documents)
    .values({
      reference: await nextReference(t.db, "document"),
      caseId,
      purpose,
      classification: "contract",
      currentVersionNumber: 1,
    })
    .returning();
  if (!doc) throw new Error("Missing synthetic document");
  const digest = hashRequest({ synthetic: randomUUID() });
  const [file] = await t.db
    .insert(documentVersions)
    .values({
      documentId: doc.id,
      versionNumber: 1,
      state: "reviewed",
      sealedKey: `synthetic/${randomUUID()}`,
      sha256: digest,
      fileName: "synthetic-test-only.pdf",
      contentType: "application/pdf",
      uploadedByKind: "staff",
      uploadedById: f.staff.id,
      scan: "clean",
      scannedAt: new Date(),
      scannerVersion: "fixture-only",
      scannedSha256: digest,
      reviewType: "accepted_for_purpose",
      reviewedById: f.staff.id,
      reviewedAt: new Date(),
    })
    .returning();
  if (!file) throw new Error("Missing synthetic version");
  return { doc, file };
}
function terms(f: Awaited<ReturnType<typeof fixture>>) {
  return {
    id: randomUUID(),
    operationId: randomUUID(),
    expectedVersion: 0,
    caseId: null,
    counterpartyPartyId: f.client.partyId,
    relationship: "referral",
    purpose: "Synthetic referral test only",
    sourceReference: "SYNTHETIC-TERMS",
    sourceVersion: "fixture-1",
    termsText: "Synthetic actual-input placeholder for a test. This supplies no real fee policy.",
    documentVersionId: null,
    acceptedReference: "Synthetic counterparty acceptance",
    acceptedAt: new Date(Date.now() - 1000).toISOString(),
    validUntil: future(),
    unknowns: "",
    reviewed: true as const,
  };
}
async function acceptedTerms() {
  const f = await fixture(),
    input = terms(f);
  const saved = await savePartnerTerms(t.db, f.staff.session, input);
  const approval = {
    id: input.id,
    operationId: randomUUID(),
    expectedVersion: 1,
    expectedHash: saved.outcome.termsHash,
    action: "accept",
    professionalName: "Synthetic qualified human",
    note: "Synthetic exact source and actual acceptance review",
    reviewed: true as const,
  };
  await decidePartnerTerms(t.db, f.staff.session, approval);
  return { f, input, approval };
}
async function cms(
  f: Awaited<ReturnType<typeof fixture>>,
  kind: "review" | "help",
  slug = `synthetic-${randomUUID()}`,
) {
  const { outcome } = await createContent(t.db, f.staff.session, {
    operationId: randomUUID(),
    kind,
    slug,
    title: "Отзив",
    text: "Синтетичен отзив за тест.\n\nСинтетично описание на извършената проверка.",
    jurisdiction: "Synthetic test only",
    reviewScope: "Synthetic qualified statement test",
  });
  await decideContent(t.db, f.staff.session, {
    id: outcome.id,
    operationId: randomUUID(),
    expectedVersion: 1,
    decision: "claims",
    note: "Synthetic qualified claims review",
    reviewed: true,
    expiresAt: future(),
  });
  const workbench = await readContentWorkbench(t.db, f.staff.session, outcome.id);
  return { id: outcome.id, version: workbench.current };
}
async function publication(f: Awaited<ReturnType<typeof fixture>>, id: string) {
  for (const decision of ["editorial", "publish"] as const) {
    const { page } = await readContentWorkbench(t.db, f.staff.session, id);
    await decideContent(t.db, f.staff.session, {
      id,
      operationId: randomUUID(),
      expectedVersion: page.version,
      decision,
      note: "Synthetic exact human publication decision",
      reviewed: true,
      expiresAt: future(),
    });
  }
}
async function reviewFixture() {
  const f = await fixture();
  await t.db.update(cases).set({ stage: "completed" }).where(eq(cases.id, f.record.id));
  const content = await cms(f, "review");
  const input = {
    id: randomUUID(),
    operationId: randomUUID(),
    expectedVersion: 0,
    caseId: f.record.id,
    authorPartyId: f.client.partyId,
    contentPageVersionId: content.version.id,
    displayChoice: "anonymous",
    reviewed: true as const,
  };
  const result = await saveCaseReview(t.db, f.staff.session, input);
  return { f, content, input, result };
}
async function consentAndVerify() {
  const fixture = await reviewFixture(),
    { f, input, result } = fixture;
  const { file } = await evidence(f);
  await decideReviewConsent(
    t.db,
    f.staff.session,
    {
      id: input.id,
      operationId: randomUUID(),
      expectedVersion: 1,
      expectedHash: result.outcome.bindingHash,
      decision: "granted",
      policyVersionId: null,
      documentVersionId: file.id,
      sourceReference: "Synthetic exact text and display consent",
      reviewed: true,
    },
    true,
  );
  const verification = {
    id: input.id,
    operationId: randomUUID(),
    expectedVersion: 2,
    expectedHash: result.outcome.bindingHash,
    note: "Synthetic completed Case, eligible author, exact consent and verification review",
    reviewed: true as const,
  };
  await verifyCaseReview(t.db, f.staff.session, verification);
  return { ...fixture, file, verification };
}

describe("B10 partner/referral current supplied terms", () => {
  it("keeps original Case-scoped history after a merge while holding positive use and preserving revocation", async () => {
    const f = await fixture(),
      input = { ...terms(f), caseId: f.record.id };
    const saved = await savePartnerTerms(t.db, f.staff.session, input);
    const approval = {
      id: input.id,
      operationId: randomUUID(),
      expectedVersion: 1,
      expectedHash: saved.outcome.termsHash,
      action: "accept",
      professionalName: "Synthetic qualified reviewer",
      note: "Synthetic original counterparty exact acceptance",
      reviewed: true,
    };
    await decidePartnerTerms(t.db, f.staff.session, approval);
    const canonical = await createClient(t.db);
    await t.db
      .update(parties)
      .set({ mergedIntoPartyId: canonical.partyId })
      .where(eq(parties.id, f.client.partyId));
    await t.db
      .update(inquiries)
      .set({ partyId: canonical.partyId })
      .where(eq(inquiries.partyId, f.client.partyId));
    await t.db
      .update(caseParticipants)
      .set({ partyId: canonical.partyId })
      .where(eq(caseParticipants.partyId, f.client.partyId));
    const retained = await readPartnerTerms(t.db, f.staff.session, input.id);
    expect(retained.party.id).toBe(f.client.partyId);
    expect(retained.current).toBe(false);
    expect(retained.history).toHaveLength(2);
    await expect(decidePartnerTerms(t.db, f.staff.session, approval)).rejects.toMatchObject({
      code: "not_found",
    });
    await expect(
      savePartnerTerms(t.db, f.staff.session, {
        ...input,
        counterpartyPartyId: canonical.partyId,
        operationId: randomUUID(),
        expectedVersion: 2,
      }),
    ).rejects.toMatchObject({ code: "not_found" });
    await decidePartnerTerms(t.db, f.staff.session, {
      ...approval,
      operationId: randomUUID(),
      expectedVersion: 2,
      action: "revoke",
      note: "Synthetic identity changed; original promises remain retained",
    });
    expect((await readPartnerTerms(t.db, f.staff.session, input.id)).row.state).toBe("revoked");
  });
  it("retains known failed receipts across the authorization transaction and binds status to actor, type and record", async () => {
    const f = await fixture(),
      input = { ...terms(f), validUntil: null };
    const saved = await savePartnerTerms(t.db, f.staff.session, input);
    const approval = {
      id: input.id,
      operationId: randomUUID(),
      expectedVersion: 1,
      expectedHash: saved.outcome.termsHash,
      action: "accept",
      professionalName: "Synthetic reviewer",
      note: "Actual expiry is unknown; acceptance must remain held",
      reviewed: true,
    };
    await expect(decidePartnerTerms(t.db, f.staff.session, approval)).rejects.toMatchObject({
      code: "transition_denied",
    });
    expect(
      await readAgencyOperation(
        t.db,
        f.staff.session,
        "partnerDecision",
        input.id,
        approval.operationId,
      ),
    ).toMatchObject({ status: "failed", recordId: input.id });
    const [receipt] = await t.db
      .select()
      .from(operations)
      .where(eq(operations.idempotencyKey, approval.operationId));
    expect(receipt?.outcome).toMatchObject({ code: "transition_denied" });
    await expect(decidePartnerTerms(t.db, f.staff.session, approval)).rejects.toMatchObject({
      code: "transition_denied",
    });
    await expect(
      savePartnerTerms(t.db, f.staff.session, { ...input, operationId: randomUUID() }),
    ).rejects.toMatchObject({ code: "version_conflict" });
    const wrongKey = randomUUID();
    await t.db.insert(operations).values({
      actorKind: "staff",
      actorId: f.staff.id,
      operationType: "agency.partner.decide",
      idempotencyKey: wrongKey,
      requestHash: "synthetic wrong record type",
      status: "succeeded",
      resultType: "case_review",
      resultId: input.id,
      outcome: { id: input.id },
    });
    expect(
      await readAgencyOperation(t.db, f.staff.session, "partnerDecision", input.id, wrongKey),
    ).toBeNull();
  });
  it("accepts a standing relationship without a consumer Case, with one qualified owner and one passkey", async () => {
    const { f, input, approval } = await acceptedTerms();
    expect((await readPartnerTerms(t.db, f.staff.session, input.id)).current).toBe(true);
    expect((await readPartnerTerms(t.db, f.staff.session, input.id)).row.caseId).toBeNull();
    expect((await decidePartnerTerms(t.db, f.staff.session, approval)).replayed).toBe(true);
    expect(
      await t.db.select().from(agencyPartnerTerms).where(eq(agencyPartnerTerms.id, input.id)),
    ).toHaveLength(1);
    await expect(
      decidePartnerTerms(t.db, f.staff.session, { ...approval, note: "Changed intent" }),
    ).rejects.toMatchObject({ code: "idempotency_key_reused" });
  });
  it("holds unknown acceptance/expiry and rejects a foreign counterparty without inquiry or Case visibility", async () => {
    const f = await fixture(),
      input = {
        ...terms(f),
        acceptedAt: null,
        acceptedReference: null,
        validUntil: null,
        unknowns: "Actual fee trigger is unknown",
      };
    const saved = await savePartnerTerms(t.db, f.staff.session, input);
    await expect(
      decidePartnerTerms(t.db, f.staff.session, {
        id: input.id,
        operationId: randomUUID(),
        expectedVersion: 1,
        expectedHash: saved.outcome.termsHash,
        action: "accept",
        professionalName: "Synthetic reviewer",
        note: "Cannot invent missing terms",
        reviewed: true,
      }),
    ).rejects.toMatchObject({ code: "transition_denied" });
    const foreign = await createClient(t.db);
    await expect(
      savePartnerTerms(t.db, f.staff.session, {
        ...terms(f),
        counterpartyPartyId: foreign.partyId,
      }),
    ).rejects.toMatchObject({ code: "not_found" });
  });
  it("new terms preserve old promises and immediately invalidate approval", async () => {
    const { f, input } = await acceptedTerms();
    await savePartnerTerms(t.db, f.staff.session, {
      ...input,
      operationId: randomUUID(),
      expectedVersion: 2,
      sourceVersion: "fixture-2",
      termsText: "Changed synthetic supplied terms preserve the original acceptance in history.",
    });
    const current = await readPartnerTerms(t.db, f.staff.session, input.id);
    expect(current.current).toBe(false);
    expect(
      current.history.some(
        (h) => (h.snapshot as { sourceVersion?: string }).sourceVersion === "fixture-1",
      ),
    ).toBe(true);
  });
  it("source replacement and grant revocation prevent acceptance replay and guarded readback", async () => {
    const f = await fixture(),
      { doc, file } = await evidence(f, "other", null),
      input = { ...terms(f), documentVersionId: file.id };
    const saved = await savePartnerTerms(t.db, f.staff.session, input);
    const approval = {
      id: input.id,
      operationId: randomUUID(),
      expectedVersion: 1,
      expectedHash: saved.outcome.termsHash,
      action: "accept",
      professionalName: "Synthetic qualified reviewer",
      note: "Synthetic document exactness review",
      reviewed: true,
    };
    await decidePartnerTerms(t.db, f.staff.session, approval);
    await t.db.update(documents).set({ currentVersionNumber: 2 }).where(eq(documents.id, doc.id));
    expect((await readPartnerTerms(t.db, f.staff.session, input.id)).current).toBe(false);
    await expect(decidePartnerTerms(t.db, f.staff.session, approval)).rejects.toMatchObject({
      code: "transition_denied",
    });
    await t.db
      .update(grants)
      .set({ revokedAt: new Date() })
      .where(and(eq(grants.principalId, f.staff.id), eq(grants.capability, "compliance.review")));
    await expect(readPartnerTerms(t.db, f.staff.session, input.id)).rejects.toMatchObject({
      code: "not_found",
    });
    expect(await listPartnerTerms(t.db, f.staff.session)).toEqual([]);
  });
  it("a different operation key cannot bypass an unresolved record command", async () => {
    const f = await fixture(),
      input = terms(f);
    await t.db.insert(operations).values({
      actorKind: "staff",
      actorId: f.staff.id,
      operationType: "agency.partner.save",
      idempotencyKey: randomUUID(),
      requestHash: "synthetic",
      status: "outcome_unknown",
      resultType: "partner_terms",
      resultId: input.id,
    });
    await expect(savePartnerTerms(t.db, f.staff.session, input)).rejects.toMatchObject({
      code: "outcome_unknown",
    });
    expect(
      await t.db.select().from(agencyPartnerTerms).where(eq(agencyPartnerTerms.id, input.id)),
    ).toHaveLength(0);
  });
});

describe("B10 completed-Case review consent and live public gate", () => {
  it("a verified author can consent natively without a scanned document only under the current exact policy", async () => {
    const { f, input, result, content } = await reviewFixture();
    const command = {
      id: input.id,
      operationId: randomUUID(),
      expectedVersion: 1,
      expectedHash: result.outcome.bindingHash,
      decision: "granted",
      policyVersionId: null,
      reviewed: true,
    };
    await expect(decideReviewConsent(t.db, f.client.session, command)).rejects.toMatchObject({
      code: "approval_stale",
    });
    const policy = await cms(f, "help", "review-publication-consent");
    await publication(f, policy.id);
    await decideReviewConsent(t.db, f.client.session, {
      ...command,
      operationId: randomUUID(),
      policyVersionId: policy.version.id,
    });
    await verifyCaseReview(t.db, f.staff.session, {
      id: input.id,
      operationId: randomUUID(),
      expectedVersion: 2,
      expectedHash: result.outcome.bindingHash,
      note: "Synthetic verified native author assent to exact wording",
      reviewed: true,
    });
    expect(await reviewDisplayEligible(t.db, content.version.id)).toBe(true);
    const stored = await t.db
      .select()
      .from(agencyCaseReviews)
      .where(eq(agencyCaseReviews.id, input.id));
    expect(stored[0]?.consentDocumentVersionId).toBeNull();
    expect(stored[0]?.consentSource).toBe("client");
  });
  it("generic CMS approval cannot publish an unbound review; incomplete/wrong-author Cases cannot prepare one", async () => {
    const { f, content, input } = await reviewFixture();
    await expect(publication(f, content.id)).rejects.toMatchObject({
      code: "publication_ineligible",
    });
    await t.db.update(cases).set({ stage: "evaluating" }).where(eq(cases.id, f.record.id));
    await expect(
      saveCaseReview(t.db, f.staff.session, {
        ...input,
        id: randomUUID(),
        operationId: randomUUID(),
      }),
    ).rejects.toMatchObject({ code: "transition_denied" });
  });
  it("external exact consent + qualified verification + CMS publication displays only the approved wording", async () => {
    const { f, content, verification } = await consentAndVerify();
    expect(await reviewDisplayEligible(t.db, content.version.id)).toBe(true);
    await publication(f, content.id);
    expect(
      (
        await readApprovedContent(
          t.db,
          "review",
          content.version.contentPageId
            ? (
                await readContentWorkbench(t.db, f.staff.session, content.id)
              ).page.slug
            : "missing",
          "bg",
        )
      )?.paragraphs,
    ).toEqual(["Синтетичен отзив за тест.", "Синтетично описание на извършената проверка."]);
    expect((await verifyCaseReview(t.db, f.staff.session, verification)).replayed).toBe(true);
    expect(await reviewDisplayEligible(t.db, content.version.id, "en")).toBe(false);
  });
  it("author refusal and withdrawal remain usable after Case access ends and with no policy", async () => {
    const { f, input, result, content } = await consentAndVerify();
    await t.db
      .update(caseParticipants)
      .set({ revokedAt: new Date() })
      .where(eq(caseParticipants.caseId, f.record.id));
    const command = {
      id: input.id,
      operationId: randomUUID(),
      expectedVersion: 3,
      expectedHash: result.outcome.bindingHash,
      decision: "withdrawn",
      policyVersionId: null,
      reviewed: true,
    };
    const outcome = await decideReviewConsent(t.db, f.client.session, command);
    expect(outcome.outcome.consentState).toBe("withdrawn");
    expect((await decideReviewConsent(t.db, f.client.session, command)).replayed).toBe(true);
    expect(await reviewDisplayEligible(t.db, content.version.id)).toBe(false);
    const own = await readCaseReview(t.db, f.client.session, input.id);
    expect(own.row).not.toHaveProperty("caseId");
    expect(own.row).not.toHaveProperty("consentDocumentVersionId");
  });
  it("a different client cannot read or change the author's review", async () => {
    const { input, result } = await reviewFixture(),
      other = await createClient(t.db),
      { session } = await createSession(t.db, { kind: "client", id: other.id });
    await expect(readCaseReview(t.db, session, input.id)).rejects.toMatchObject({
      code: "not_found",
    });
    await expect(
      decideReviewConsent(t.db, session, {
        id: input.id,
        operationId: randomUUID(),
        expectedVersion: 1,
        expectedHash: result.outcome.bindingHash,
        decision: "refused",
        policyVersionId: null,
        reviewed: true,
      }),
    ).rejects.toMatchObject({ code: "not_found" });
  });
  it("replaced wording and consent document changes stop display and prevent verification replay", async () => {
    const { f, content, verification, file } = await consentAndVerify();
    await t.db
      .update(documents)
      .set({ currentVersionNumber: 2 })
      .where(eq(documents.id, file.documentId));
    expect(await reviewDisplayEligible(t.db, content.version.id)).toBe(false);
    await expect(verifyCaseReview(t.db, f.staff.session, verification)).rejects.toMatchObject({
      code: "transition_denied",
    });
    const { page } = await readContentWorkbench(t.db, f.staff.session, content.id);
    await saveContent(t.db, f.staff.session, {
      id: content.id,
      expectedVersion: page.version,
      operationId: randomUUID(),
      title: "Отзив",
      text: "Променен синтетичен отзив.\n\nПроменена проверка.",
      jurisdiction: "Synthetic test",
      reviewScope: "Synthetic changed statement",
    });
    expect(await reviewDisplayEligible(t.db, content.version.id)).toBe(false);
  });
  it("the original author's durable privacy restriction suppresses display without moving consent to a merged person", async () => {
    const { f, content } = await consentAndVerify();
    const requestId = randomUUID();
    const event = await t.db.transaction((tx) =>
      appendPrivacySafetyDecision(tx, {
        operationId: randomUUID(),
        partyId: f.client.partyId,
        requestId,
        requestHash: hashRequest({ synthetic: true }),
        review: { synthetic: true },
        effect: {
          kind: "privacy_restriction_v1",
          partyId: f.client.partyId,
          requestId,
          purposes: ["marketing"],
          clientIds: [f.client.id],
          erasePreferences: false,
          eraseAliases: false,
          contactIds: [],
          clientProfileIds: [],
          searchSubscriptionIds: [],
          inventoryDigest: hashRequest({ synthetic: true }),
        },
      }),
    );
    await t.db.insert(privacyProcessingRestrictions).values({
      partyId: f.client.partyId,
      purpose: "client_access",
      decisionSequence: event.sequence,
    });
    expect(await reviewDisplayEligible(t.db, content.version.id)).toBe(false);
  });
});
