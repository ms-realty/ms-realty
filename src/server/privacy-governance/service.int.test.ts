// O26/F30: synthetic authority/evidence only. Fixtures never establish actual policy acceptance.
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  auditEvents,
  grants,
  operations,
  outboxEvents,
  passkeys,
  privacyGovernanceRecords,
  privacyGovernanceRevisions,
  sessions,
  staffMemberships,
} from "@/db/schema";
import { createTestDatabase, type TestDatabase } from "@/db/test-utils";
import {
  emptyGovernanceDocument,
  type GovernanceDocument,
  governanceTimer,
} from "@/domain/privacy-governance";
import { settingsResources } from "@/domain/settings-resources";
import { grantStaffCapability, revokeStaffGrant } from "../auth/grants";
import { createSession, type Session } from "../auth/sessions";
import { can } from "../authz";
import { hashRequest } from "../crypto";
import { createStaff } from "../testing";
import {
  governanceResource,
  listGovernance,
  readGovernance,
  readGovernanceOperation,
  readGovernanceRevision,
  reviewGovernance,
  saveGovernance,
} from "./service";

let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDatabase();
}, 60000);
afterAll(async () => {
  await t?.drop();
});
async function member(manager = false) {
  const person = await createStaff(t.db, { roles: manager ? ["manager"] : [], grants: [] });
  await t.db.insert(passkeys).values({
    principalId: person.id,
    credentialId: randomUUID(),
    publicKey: Buffer.from([1]),
    deviceType: "singleDevice",
    backedUp: false,
  });
  return { ...person, ...(await createSession(t.db, { kind: "staff", id: person.id })) };
}
async function allocated(qualified = false) {
  const manager = await member(true),
    person = await member();
  const receipts = [];
  for (const capability of [
    "settings.manage",
    "privacy.manage",
    ...(qualified ? ["claim.approve"] : []),
  ])
    receipts.push(
      await grantStaffCapability(t.db, manager.session, {
        operationId: randomUUID(),
        principalId: person.id,
        capability,
        reason: "Synthetic reviewed assignment for a bounded privacy operating record",
        scope: {
          recordType: "settings",
          recordId: governanceResource.id,
          locales: null,
          expiresAt: null,
        },
      }),
    );
  const issued = await createSession(t.db, { kind: "staff", id: person.id });
  return { ...person, ...issued, manager, receipts };
}
function complete(
  kind: "processing" | "processor" | "incident",
  ownerId: string,
): GovernanceDocument {
  const base = emptyGovernanceDocument(kind),
    evidence = "Synthetic source reference, not real agency policy";
  const document = {
    ...base,
    title: `Synthetic ${kind} controlled record`,
    ownerId,
    evidenceReference: evidence,
    reviewPolicyReference: evidence,
    nextAction: "Review the synthetic evidence with the assigned owner",
    nextReviewAt: new Date(Date.now() + 3600000).toISOString(),
  };
  if (document.kind === "processing")
    return {
      ...document,
      purpose: evidence,
      dataSubjects: evidence,
      dataClasses: evidence,
      recipients: evidence,
      systems: evidence,
      lawfulBasisReference: evidence,
      retentionReference: evidence,
      securityReference: evidence,
    };
  if (document.kind === "processor")
    return {
      ...document,
      processorName: evidence,
      servicePurpose: evidence,
      dataClasses: evidence,
      territories: evidence,
      transferState: "no_transfer",
      transferAssessmentReference: evidence,
      agreementReference: evidence,
      retentionReference: evidence,
      securityReference: evidence,
    };
  return {
    ...document,
    observedAt: new Date(Date.now() - 7200000).toISOString(),
    awarenessAt: new Date(Date.now() - 3600000).toISOString(),
    affectedScope: evidence,
    impactAssessmentReference: evidence,
    responsePolicyReference: evidence,
    notificationDecision: "required",
    determinationById: ownerId,
    determinationReference: evidence,
    deadlineAt: new Date(Date.now() + 7200000).toISOString(),
    deadlineTimezone: "Europe/Sofia",
  };
}
async function save(
  session: Session,
  document: GovernanceDocument,
  id: string = randomUUID(),
  expectedVersion = 1,
) {
  return saveGovernance(t.db, session, {
    id,
    expectedVersion,
    operationId: randomUUID(),
    document,
  });
}
async function review(session: Session, id: string) {
  const row = await readGovernance(t.db, session, id);
  return reviewGovernance(t.db, session, {
    id,
    expectedVersion: row.version,
    expectedHash: row.contentHash,
    operationId: randomUUID(),
    reviewed: true,
    note: "Synthetic explicit human review of this exact saved revision",
  });
}
describe("O26/F30 controlled privacy governance", () => {
  it("persists owned unknown-policy work and holds review with clear missing evidence", async () => {
    const actor = await allocated(),
      document = emptyGovernanceDocument("processing");
    Object.assign(document, {
      title: "Synthetic awaiting policy",
      ownerId: actor.id,
      nextAction: "Obtain the real retention and processing evidence",
      nextReviewAt: new Date(Date.now() + 1000).toISOString(),
    });
    const saved = await save(actor.session, document),
      row = await readGovernance(t.db, actor.session, saved.outcome.id);
    expect(row.issues).toContain("retentionReference");
    expect(row.latestReview).toBeNull();
    expect(row.reviewed).toBe(false);
    await expect(review(actor.session, row.id)).rejects.toMatchObject({
      code: "validation_failed",
    });
    expect(row.history).toMatchObject([{ action: "saved", actorId: actor.id, recordVersion: 2 }]);
    const audit = await t.db
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.operationId, saved.operationId));
    expect(audit).toHaveLength(1);
    expect(JSON.stringify(audit)).not.toContain(document.nextAction);
    expect(
      await t.db.select().from(outboxEvents).where(eq(outboxEvents.operationId, saved.operationId)),
    ).toHaveLength(1);
  });
  it("requires both exact settings and privacy scopes, current passkey staff and fresh authentication on reads", async () => {
    const actor = await allocated(),
      stranger = await member(),
      manager = actor.manager;
    await grantStaffCapability(t.db, manager.session, {
      operationId: randomUUID(),
      principalId: stranger.id,
      capability: "settings.manage",
      reason: "Synthetic wrong-scope allocation for denial proof",
      scope: {
        recordType: "settings",
        recordId: settingsResources.operatingPolicy,
        locales: null,
        expiresAt: null,
      },
    });
    await grantStaffCapability(t.db, manager.session, {
      operationId: randomUUID(),
      principalId: stranger.id,
      capability: "privacy.manage",
      reason: "Synthetic privacy allocation without matching settings authority",
      scope: {
        recordType: "settings",
        recordId: governanceResource.id,
        locales: null,
        expiresAt: null,
      },
    });
    const fresh = await createSession(t.db, { kind: "staff", id: stranger.id });
    await expect(listGovernance(t.db, fresh.session)).rejects.toMatchObject({ code: "forbidden" });
    await t.db
      .update(sessions)
      .set({ reverifiedAt: new Date(0) })
      .where(eq(sessions.id, actor.session.id));
    await expect(listGovernance(t.db, actor.session)).rejects.toMatchObject({
      code: "step_up_required",
    });
  });
  it("serializes competing drafts, binds exact hash/revision and preserves immutable reviewed versions", async () => {
    const actor = await allocated(),
      id = randomUUID(),
      document = complete("processing", actor.id);
    const results = await Promise.allSettled(
      ["first", "second"].map((marker) =>
        save(actor.session, { ...document, title: `Synthetic ${marker}` }, id),
      ),
    );
    expect(results.filter((row) => row.status === "fulfilled")).toHaveLength(1);
    expect(
      results.filter((row) => row.status === "rejected").map((row) => row.reason),
    ).toMatchObject([{ code: "version_conflict" }]);
    const current = await readGovernance(t.db, actor.session, id);
    await expect(
      reviewGovernance(t.db, actor.session, {
        id,
        expectedVersion: current.version,
        expectedHash: "0".repeat(64),
        reviewed: true,
        note: "Synthetic intentionally stale exact review",
        operationId: randomUUID(),
      }),
    ).rejects.toMatchObject({ code: "approval_stale" });
    const approved = await review(actor.session, id),
      reviewed = await readGovernance(t.db, actor.session, id);
    expect(reviewed.reviewed).toBe(true);
    await save(
      actor.session,
      { ...document, title: "Synthetic changed source" },
      id,
      approved.outcome.version,
    );
    const changed = await readGovernance(t.db, actor.session, id);
    expect(changed.reviewed).toBe(false);
    expect(changed.latestReview?.document.title).toBe(current.document.title);
    const historic = await readGovernanceRevision(
      t.db,
      actor.session,
      id,
      approved.outcome.version,
    );
    expect(historic.document.title).toBe(current.document.title);
    await expect(
      t.db
        .update(privacyGovernanceRevisions)
        .set({ note: "Altered history" })
        .where(eq(privacyGovernanceRevisions.id, historic.id)),
    ).rejects.toThrow();
    await expect(
      t.db.delete(privacyGovernanceRevisions).where(eq(privacyGovernanceRevisions.id, historic.id)),
    ).rejects.toThrow();
    await expect(
      reviewGovernance(t.db, actor.session, {
        id,
        expectedVersion: current.version,
        expectedHash: current.contentHash,
        reviewed: true,
        note: "Synthetic older review form",
        operationId: randomUUID(),
      }),
    ).rejects.toMatchObject({ code: "version_conflict" });
  });
  it("requires an active owner and reviewed linked processing evidence for processor/transfer records", async () => {
    const actor = await allocated(),
      owner = await allocated(),
      processing = await save(actor.session, complete("processing", owner.id));
    const processor = complete("processor", actor.id);
    if (processor.kind !== "processor") throw new Error("Expected processor");
    processor.processingRecordId = processing.outcome.id;
    const saved = await save(actor.session, processor);
    await expect(review(actor.session, saved.outcome.id)).rejects.toMatchObject({
      code: "validation_failed",
    });
    await review(actor.session, processing.outcome.id);
    await review(actor.session, saved.outcome.id);
    await t.db
      .update(staffMemberships)
      .set({ state: "ended" })
      .where(eq(staffMemberships.principalId, owner.id));
    expect((await readGovernance(t.db, actor.session, processing.outcome.id)).issues).toContain(
      "ownerId",
    );
    expect((await readGovernance(t.db, actor.session, saved.outcome.id)).issues).toContain(
      "processingRecordId",
    );
    const latest = await readGovernance(t.db, actor.session, saved.outcome.id);
    await save(actor.session, processor, latest.id, latest.version);
    await expect(review(actor.session, saved.outcome.id)).rejects.toMatchObject({
      code: "validation_failed",
    });
  });
  it("keeps basic incident drafting available while explicit legal/process review requires allocated qualification", async () => {
    const actor = await allocated(),
      incident = complete("incident", actor.id);
    const saved = await save(actor.session, incident);
    expect(await can(t.db, actor.actor, "claim.approve", governanceResource)).toBe(false);
    await expect(review(actor.session, saved.outcome.id)).rejects.toMatchObject({
      code: "forbidden",
    });
    await grantStaffCapability(t.db, actor.manager.session, {
      operationId: randomUUID(),
      principalId: actor.id,
      capability: "claim.approve",
      reason: "Synthetic explicit qualified-review allocation, not actual professional approval",
      scope: {
        recordType: "settings",
        recordId: governanceResource.id,
        locales: null,
        expiresAt: null,
      },
    });
    const issued = await createSession(t.db, { kind: "staff", id: actor.id });
    const reviewed = await review(issued.session, saved.outcome.id),
      row = await readGovernance(t.db, issued.session, saved.outcome.id);
    expect(row.latestReview?.recordVersion).toBe(reviewed.outcome.version);
    expect(governanceTimer(row.document, row.reviewed, new Date())).toMatchObject({
      kind: "notification",
      state: "counting",
      timezone: "Europe/Sofia",
      source: incident.kind === "incident" ? incident.determinationReference : "",
    });
    if (incident.kind !== "incident") throw new Error("Expected incident");
    const closed = { ...incident, responseState: "closed" as const };
    await save(issued.session, closed, row.id, row.version);
    await expect(review(issued.session, row.id)).rejects.toMatchObject({
      code: "validation_failed",
    });
    const pending = await readGovernance(t.db, issued.session, row.id);
    await save(
      issued.session,
      {
        ...closed,
        responseEvidenceReference: "Synthetic human response receipt and closure assessment",
      },
      row.id,
      pending.version,
    );
    await review(issued.session, row.id);
    const done = await readGovernance(t.db, issued.session, row.id);
    expect(governanceTimer(done.document, done.reviewed, new Date())).toEqual({
      state: "response_recorded",
    });
  });
  it("reconciles only the actor's exact record/command/key and fences unknown effects and revoked replay", async () => {
    const actor = await allocated(),
      document = complete("processing", actor.id),
      id = randomUUID(),
      operationId = randomUUID();
    const input = { id, operationId, expectedVersion: 1, document };
    const first = await saveGovernance(t.db, actor.session, input);
    expect((await saveGovernance(t.db, actor.session, input)).replayed).toBe(true);
    await expect(
      saveGovernance(t.db, actor.session, {
        ...input,
        document: { ...document, title: "Synthetic different intent" },
      }),
    ).rejects.toMatchObject({ code: "idempotency_key_reused" });
    expect(
      await readGovernanceOperation(t.db, actor.session, id, "save", operationId),
    ).toMatchObject({ operationId: first.operationId, status: "succeeded" });
    expect(
      await readGovernanceOperation(t.db, actor.session, randomUUID(), "save", operationId),
    ).toBeNull();
    const other = await allocated();
    expect(await readGovernanceOperation(t.db, other.session, id, "save", operationId)).toBeNull();
    const unknown = { ...input, id: randomUUID(), operationId: randomUUID() };
    await t.db.insert(operations).values({
      actorKind: "staff",
      actorId: actor.id,
      operationType: "privacy_governance.save",
      idempotencyKey: unknown.operationId,
      requestHash: hashRequest(unknown),
      status: "outcome_unknown",
      resultType: "privacy_governance",
      resultId: unknown.id,
    });
    expect(
      await readGovernanceOperation(t.db, actor.session, unknown.id, "save", unknown.operationId),
    ).toMatchObject({ status: "outcome_unknown" });
    await expect(saveGovernance(t.db, actor.session, unknown)).rejects.toMatchObject({
      code: "outcome_unknown",
    });
    expect(
      await t.db
        .select()
        .from(privacyGovernanceRecords)
        .where(eq(privacyGovernanceRecords.id, unknown.id)),
    ).toHaveLength(0);
    for (const status of ["accepted", "in_progress"] as const) {
      const pending = { ...input, id: randomUUID(), operationId: randomUUID() };
      await t.db.insert(operations).values({
        actorKind: "staff",
        actorId: actor.id,
        operationType: "privacy_governance.save",
        idempotencyKey: pending.operationId,
        requestHash: hashRequest(pending),
        status,
        resultType: "privacy_governance",
        resultId: pending.id,
      });
      expect(
        await readGovernanceOperation(t.db, actor.session, pending.id, "save", pending.operationId),
      ).toMatchObject({ status });
      await expect(saveGovernance(t.db, actor.session, pending)).rejects.toMatchObject({
        code: "operation_pending",
      });
      expect(
        await t.db
          .select()
          .from(privacyGovernanceRecords)
          .where(eq(privacyGovernanceRecords.id, pending.id)),
      ).toHaveLength(0);
    }
    const privacyGrant = actor.receipts[1]?.outcome.grantId;
    if (!privacyGrant) throw new Error("Missing privacy allocation");
    await revokeStaffGrant(t.db, actor.manager.session, {
      operationId: randomUUID(),
      grantId: privacyGrant,
      expectedRevision: 1,
      reason: "Synthetic current privacy allocation revoked",
    });
    await expect(saveGovernance(t.db, actor.session, input)).rejects.toHaveProperty("code");
    const fresh = await createSession(t.db, { kind: "staff", id: actor.id });
    await expect(
      readGovernanceOperation(t.db, fresh.session, id, "save", operationId),
    ).rejects.toMatchObject({ code: "forbidden" });
    expect(
      await t.db
        .select()
        .from(grants)
        .where(and(eq(grants.id, privacyGrant), eq(grants.version, 2))),
    ).toHaveLength(1);
  });
});
