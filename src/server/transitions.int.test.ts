import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { activityEvents, auditLog, inquiries } from "@/db/schema";
import { createTestDatabase, type TestDatabase } from "@/db/test-utils";
import { type InquiryState, inquiryTransitions } from "@/domain/inquiry";
import { hashRequest } from "./crypto";
import { runOperation } from "./operations";
import { createStaff } from "./testing";
import { executeTransition, tableStore } from "./transitions";

// Universal transition contract on the server (spec §07.7): capability, version, evidence,
// activity + audit in one transaction.
let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => {
  await t?.drop();
});

const store = tableStore<InquiryState>(inquiries, {
  id: inquiries.id,
  version: inquiries.version,
  state: inquiries.state,
  reference: inquiries.reference,
  caseId: inquiries.caseId,
});

let counter = 0;
async function inquiry(ownerStaffId: string) {
  counter += 1;
  const [row] = await t.db
    .insert(inquiries)
    .values({
      reference: `RQ-2026-${String(counter).padStart(6, "0")}`,
      purpose: "question",
      source: "website",
      submissionId: `submission-${counter}-${Date.now()}`,
      ownerStaffId,
    })
    .returning({ id: inquiries.id, version: inquiries.version });
  if (!row) throw new Error("inquiry insert failed");
  return row;
}

const history = async (recordId: string) => ({
  activity: await t.db.select().from(activityEvents).where(eq(activityEvents.recordId, recordId)),
  audit: await t.db.select().from(auditLog).where(eq(auditLog.recordId, recordId)),
});

describe("executeTransition", () => {
  it("applies with a version bump, an activity entry and an audit record", async () => {
    const broker = await createStaff(t.db, { roles: ["assigned_broker"] });
    const record = await inquiry(broker.id);
    const result = await executeTransition(t.db, inquiryTransitions, store, {
      actor: broker.actor,
      recordId: record.id,
      expectedVersion: record.version,
      to: "assigned",
      evidence: { ownerId: broker.id },
      operationId: "op-1",
      correlationId: "corr-12345678",
      audience: "participants",
    });
    expect(result).toMatchObject({ outcome: "applied", record: { state: "assigned", version: 2 } });
    const { activity, audit } = await history(record.id);
    expect(activity).toHaveLength(1);
    expect(activity[0]).toMatchObject({
      messageKey: "activity.inquiry.assigned",
      audience: "case_participants",
      operationId: "op-1",
    });
    expect(activity[0]?.summary).toMatch(/^Inquiry RQ-2026-\d+ moved from Received to Assigned\.$/);
    expect(audit[0]).toMatchObject({
      action: "inquiry.transition",
      capability: "inquiry.assign",
      correlationId: "corr-12345678",
      payload: { fromState: "received", toState: "assigned", expectedVersion: 1, newVersion: 2 },
    });
  });

  it("returns version_conflict with the current snapshot and writes nothing", async () => {
    const broker = await createStaff(t.db, { roles: ["assigned_broker"] });
    const record = await inquiry(broker.id);
    const command = {
      actor: broker.actor,
      recordId: record.id,
      to: "assigned" as const,
      evidence: { ownerId: broker.id },
      operationId: "op-2",
    };
    await executeTransition(t.db, inquiryTransitions, store, { ...command, expectedVersion: 1 });
    // A second tab still holding version 1 tries another step.
    const stale = await executeTransition(t.db, inquiryTransitions, store, {
      ...command,
      to: "resolved_without_case",
      evidence: { reason: "answered by phone" },
      expectedVersion: 1,
    });
    expect(stale).toEqual({
      outcome: "version_conflict",
      current: expect.objectContaining({ state: "assigned", version: 2 }),
    });
    const { activity } = await history(record.id);
    expect(activity).toHaveLength(1);
  });

  it("denies without the capability and leaves the record untouched", async () => {
    const owner = await createStaff(t.db, { roles: ["assigned_broker"] });
    const editor = await createStaff(t.db, { roles: ["content_editor"] });
    const record = await inquiry(owner.id);
    const result = await executeTransition(t.db, inquiryTransitions, store, {
      actor: editor.actor,
      recordId: record.id,
      expectedVersion: 1,
      to: "assigned",
      evidence: { ownerId: owner.id },
      operationId: "op-3",
    });
    expect(result).toEqual({ outcome: "denied", code: "missing_capability" });
    const [row] = await t.db.select().from(inquiries).where(eq(inquiries.id, record.id));
    expect(row).toMatchObject({ state: "received", version: 1 });
    expect((await history(record.id)).audit).toHaveLength(0);
  });

  it("denies the AI service even for a transition it could otherwise describe (A66)", async () => {
    const owner = await createStaff(t.db, { roles: ["assigned_broker"] });
    const record = await inquiry(owner.id);
    const result = await executeTransition(t.db, inquiryTransitions, store, {
      actor: { kind: "ai_service", id: "hermes" },
      recordId: record.id,
      expectedVersion: 1,
      to: "assigned",
      evidence: { ownerId: owner.id },
      operationId: "op-4",
    });
    expect(result.outcome).toBe("denied");
  });

  it("denies a transition whose evidence is missing", async () => {
    const broker = await createStaff(t.db, { roles: ["assigned_broker"] });
    const record = await inquiry(broker.id);
    const result = await executeTransition(t.db, inquiryTransitions, store, {
      actor: broker.actor,
      recordId: record.id,
      expectedVersion: 1,
      to: "assigned",
      evidence: {},
      operationId: "op-5",
    });
    expect(result).toEqual({ outcome: "denied", code: "owner_required" });
  });

  it("throws not_found for a missing record", async () => {
    const broker = await createStaff(t.db, { roles: ["assigned_broker"] });
    await expect(
      executeTransition(t.db, inquiryTransitions, store, {
        actor: broker.actor,
        recordId: crypto.randomUUID(),
        expectedVersion: 1,
        to: "assigned",
        evidence: { ownerId: broker.id },
        operationId: "op-6",
      }),
    ).rejects.toMatchObject({ code: "not_found" });
  });

  it("composes with runOperation: a retried command applies once", async () => {
    const broker = await createStaff(t.db, { roles: ["assigned_broker"] });
    const record = await inquiry(broker.id);
    const body = { recordId: record.id, to: "assigned", expectedVersion: 1 };
    const command = () =>
      runOperation(
        t.db,
        {
          actor: broker.actor,
          type: "inquiry.transition",
          idempotencyKey: "tab-1-click",
          requestHash: hashRequest(body),
          expectedVersion: 1,
        },
        ({ tx, operationId }) =>
          executeTransition(tx, inquiryTransitions, store, {
            actor: broker.actor,
            recordId: record.id,
            expectedVersion: 1,
            to: "assigned",
            evidence: { ownerId: broker.id },
            operationId,
          }),
      );
    const first = await command();
    const again = await command();
    expect(again).toEqual({ ...first, replayed: true });
    expect(first.outcome).toMatchObject({ outcome: "applied" });
    const { activity, audit } = await history(record.id);
    expect(activity).toHaveLength(1);
    expect(audit[0]?.operationId).toBe(first.operationId);
  });
});
