import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { auditEvents, grants, operations, passkeys, privacyRequests, sessions } from "@/db/schema";
import { createTestDatabase, type TestDatabase } from "@/db/test-utils";
import { recordAudit } from "../audit";
import { createSession, type IssuedSession, revokeSession, rotateSession } from "../auth/sessions";
import { createStaff } from "../testing";
import { privacyReviewSessionKeys, reconcilePrivacyReview } from "./native";
import { reviewPrivacyRequest } from "./requests";

let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => {
  await t?.drop();
});
async function operator() {
  const person = await createStaff(t.db, { grants: [{ capability: "privacy.manage" }] });
  await t.db.insert(passkeys).values(
    [0, 1].map(() => ({
      principalId: person.id,
      credentialId: randomUUID(),
      publicKey: Buffer.from([1]),
      deviceType: "singleDevice" as const,
      backedUp: false,
    })),
  );
  const issued = await createSession(t.db, { kind: "staff", id: person.id });
  const [request] = await t.db
    .insert(privacyRequests)
    .values({
      reference: `PR-RECOVERY-${randomUUID()}`,
      kind: "correction",
      responsibleId: person.id,
    })
    .returning();
  if (!request) throw new Error("Missing synthetic request");
  return { ...person, ...issued, request };
}
async function receipt(
  person: Awaited<ReturnType<typeof operator>>,
  changes: Partial<typeof operations.$inferInsert> = {},
) {
  const key = randomUUID();
  await t.db.insert(operations).values({
    actorKind: "staff",
    actorId: person.id,
    operationType: "privacy.review",
    idempotencyKey: key,
    requestHash: "synthetic",
    expectedRevision: 1,
    resultType: "privacy_request",
    resultId: person.request.id,
    status: "succeeded",
    outcome: { id: person.request.id },
    ...changes,
  });
  return { id: person.request.id, operationId: key, version: 1 };
}
async function stepUp(old: IssuedSession, patch: Record<string, unknown> = {}) {
  const now = new Date();
  const next = await rotateSession(t.db, old.token, { now, reverified: true });
  if (!next) throw new Error("Missing synthetic successor");
  await recordAudit(t.db, {
    action: "session.reauthenticate",
    actor: next.session.actor,
    recordType: "principal",
    recordId: next.session.account.id,
    at: now,
    payload: {
      method: "passkey",
      passkeyId: randomUUID(),
      sessionId: next.session.id,
      previousSessionId: old.session.id,
      ...patch,
    },
  });
  return next;
}

describe("C-11 exact review reconciliation", () => {
  it("finds an older exact success beyond any recent-success window, including historical receipts", async () => {
    const person = await operator();
    const saved = await receipt(person, { createdAt: new Date(Date.now() - 10000) });
    for (let i = 0; i < 55; i++) await receipt(person);
    expect(await reconcilePrivacyReview(t.db, person.session, saved)).toBe("succeeded");
    const legacy = await receipt(person, {
      resultType: null,
      resultId: null,
      expectedRevision: null,
    });
    expect(
      await reconcilePrivacyReview(t.db, person.session, { ...legacy, version: undefined }),
    ).toBe("succeeded");
  });
  it.each([
    ["accepted", "pending"],
    ["in_progress", "pending"],
    ["outcome_unknown", "unknown"],
    ["failed", "failed"],
    ["succeeded", "succeeded"],
  ] as const)("reports the saved key's %s without rebasing it", async (status, expected) => {
    const person = await operator();
    const input = await receipt(person, { status });
    expect(await reconcilePrivacyReview(t.db, person.session, input)).toBe(expected);
  });
  it("fences a key still held by an uncommitted writer instead of treating the invisible receipt as absent", async () => {
    const person = await operator(),
      operationId = randomUUID();
    await t.db.transaction(async (tx) => {
      const key = JSON.stringify(["staff", person.id, "privacy.review", operationId]);
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${key}, 0))`);
      expect(
        await reconcilePrivacyReview(t.db, person.session, {
          id: person.request.id,
          operationId,
          version: 1,
        }),
      ).toBe("pending");
    });
    expect(
      await reconcilePrivacyReview(t.db, person.session, {
        id: person.request.id,
        operationId,
        version: 1,
      }),
    ).toBe("absent");
  });
  it("binds the request and reviewed version, and never borrows another actor, type, or key", async () => {
    const person = await operator(),
      other = await operator();
    const input = await receipt(person);
    expect(
      await reconcilePrivacyReview(t.db, person.session, { ...input, id: other.request.id }),
    ).toBe("unknown");
    expect(await reconcilePrivacyReview(t.db, person.session, { ...input, version: 2 })).toBe(
      "unknown",
    );
    expect(
      await reconcilePrivacyReview(t.db, person.session, { ...input, operationId: randomUUID() }),
    ).toBe("absent");
    expect(await reconcilePrivacyReview(t.db, other.session, input)).toBe("absent");
    const wrongType = await receipt(person, { operationType: "preferences.contact" });
    expect(await reconcilePrivacyReview(t.db, person.session, wrongType)).toBe("absent");
    const unbound = await receipt(person, {
      resultType: null,
      resultId: null,
      expectedRevision: null,
      status: "failed",
    });
    expect(await reconcilePrivacyReview(t.db, person.session, unbound)).toBe("unknown");
  });
  it("records request/version binding on actual successful and failed reviews", async () => {
    const person = await operator();
    const input = {
      id: person.request.id,
      expectedVersion: 1,
      operationId: randomUUID(),
      to: "verifying",
      responsibleId: person.id,
      policyReference: "",
      dueAt: null,
      identityReviewed: false,
      legalHoldReason: "",
      legalHoldDisposition: "",
      holdResolved: false,
      completionEvidence: "",
      rejectionReason: "",
      confirmed: true,
    };
    const success = await reviewPrivacyRequest(t.db, person.session, input);
    const failedKey = randomUUID();
    await expect(
      reviewPrivacyRequest(t.db, person.session, { ...input, operationId: failedKey }),
    ).rejects.toMatchObject({ code: "version_conflict" });
    for (const key of [input.operationId, failedKey]) {
      const [row] = await t.db.select().from(operations).where(eq(operations.idempotencyKey, key));
      expect(row).toMatchObject({
        resultType: "privacy_request",
        resultId: person.request.id,
        expectedRevision: 1,
      });
    }
    expect(success.replayed).toBe(false);
  });
  it("rechecks current authority and live sessions before exposing even a matching success", async () => {
    const person = await operator(),
      saved = await receipt(person);
    await t.db.delete(grants).where(eq(grants.principalId, person.id));
    await expect(reconcilePrivacyReview(t.db, person.session, saved)).rejects.toMatchObject({
      code: "forbidden",
    });
    const revoked = await operator(),
      key = await receipt(revoked);
    await revokeSession(t.db, revoked.token);
    await expect(reconcilePrivacyReview(t.db, revoked.session, key)).rejects.toMatchObject({
      code: "unauthenticated",
    });
  });
});

describe("C-11 authenticated successor-session namespaces", () => {
  it("follows repeated verified rotation while ordinary sign-ins inherit nothing", async () => {
    const person = await operator();
    const second = await stepUp(person),
      third = await stepUp(second);
    expect(await privacyReviewSessionKeys(t.db, third.session)).toEqual([
      third.session.id,
      second.session.id,
      person.session.id,
    ]);
    const separate = await createSession(t.db, { kind: "staff", id: person.id });
    expect(await privacyReviewSessionKeys(t.db, separate.session)).toEqual([separate.session.id]);
    await expect(privacyReviewSessionKeys(t.db, person.session)).rejects.toMatchObject({
      code: "unauthenticated",
    });
    await revokeSession(t.db, third.token);
    await expect(privacyReviewSessionKeys(t.db, third.session)).rejects.toMatchObject({
      code: "unauthenticated",
    });
  });
  it("fails closed on a different principal, an invalid rotation link, or ambiguous audit edges", async () => {
    const person = await operator(),
      other = await operator();
    const wrongPrincipal = await stepUp(person, { previousSessionId: other.session.id });
    expect(await privacyReviewSessionKeys(t.db, wrongPrincipal.session)).toEqual([
      wrongPrincipal.session.id,
    ]);
    const valid = await stepUp(other);
    await t.db
      .update(sessions)
      .set({ revokedAt: new Date(0) })
      .where(eq(sessions.id, other.session.id));
    expect(await privacyReviewSessionKeys(t.db, valid.session)).toEqual([valid.session.id]);
    const clean = await operator(),
      next = await stepUp(clean);
    const [event] = await t.db.select().from(auditEvents).where(eq(auditEvents.recordId, clean.id));
    if (!event) throw new Error("Missing synthetic audit");
    await t.db.insert(auditEvents).values({ ...event, id: randomUUID() });
    expect(await privacyReviewSessionKeys(t.db, next.session)).toEqual([next.session.id]);
  });
});
