import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  approvals,
  briefRevisions,
  caseParticipants,
  externalActions,
  grants,
  inquiries,
  tasks,
} from "@/db/schema";
import { createTestDatabase, type TestDatabase } from "@/db/test-utils";
import { createSession } from "../auth/sessions";
import { createClient } from "../testing";
import { postCaseMessage, reviseBrief, updateNextAction } from "./commands";
import { listCases, readCase, readCaseMessages } from "./queries";
import { caseFixture } from "./testing";

let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => {
  await t?.drop();
});

describe("Case continuity", () => {
  it("qualifies a durable owned inquiry with explicit party, revisioned Brief and next action", async () => {
    const f = await caseFixture(t.db);
    const [source] = await t.db.select().from(inquiries).where(eq(inquiries.id, f.inquiry.id));
    expect(source).toMatchObject({
      state: "linked_to_case",
      caseId: f.record.id,
      ownerId: f.staff.id,
    });
    const commitments = await t.db.select().from(tasks).where(eq(tasks.inquiryId, f.inquiry.id));
    expect(commitments).toHaveLength(1);
    expect(commitments[0]).toMatchObject({
      title: "Existing intake follow-up",
      caseId: f.record.id,
      ownerId: f.staff.id,
      state: "open",
      version: 2,
    });
    const view = await readCase(t.db, f.client.session, f.record.id);
    expect(view.record.ownerName).toBeTruthy();
    expect(view.brief).toHaveLength(1);
    expect(view.brief[0]?.clientAcknowledgedAt).toBeNull();
    expect(view.record.nextAction).toBeNull(); // internal work is not silently a client promise
    expect(view.participants).toEqual([]);
    expect((await listCases(t.db, f.client.session)).map((r) => r.id)).toEqual([f.record.id]);
  });

  it("append-only Brief proposals preserve earlier wording and reject stale edits", async () => {
    const f = await caseFixture(t.db);
    await reviseBrief(t.db, f.staff.session, {
      id: f.record.id,
      operationId: randomUUID(),
      expectedVersion: 1,
      requirements: "Step-free access is essential",
      preferences: "A quiet road",
    });
    const rows = await t.db
      .select()
      .from(briefRevisions)
      .where(eq(briefRevisions.caseId, f.record.id));
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.revisionNumber === 1)?.items).toEqual(
      expect.arrayContaining([expect.objectContaining({ text: "A lift is essential" })]),
    );
    await expect(
      reviseBrief(t.db, f.staff.session, {
        id: f.record.id,
        operationId: randomUUID(),
        expectedVersion: 1,
        requirements: "Stale change",
        preferences: "",
      }),
    ).rejects.toMatchObject({ code: "version_conflict" });
    await expect(
      reviseBrief(t.db, f.client.session, {
        id: f.record.id,
        operationId: randomUUID(),
        expectedVersion: 2,
        requirements: "Read access is not write access",
        preferences: "",
      }),
    ).rejects.toMatchObject({ code: "forbidden" });
  });

  it("in-app messages are human authored, audience bound, idempotent and never external sends", async () => {
    const f = await caseFixture(t.db);
    await postCaseMessage(t.db, f.staff.session, {
      id: f.record.id,
      operationId: randomUUID(),
      expectedVersion: 1,
      body: "Internal negotiation note",
      audience: "internal",
      reviewed: false,
    });
    const input = {
      id: f.record.id,
      operationId: randomUUID(),
      expectedVersion: 2,
      body: "Please review these requirements",
      audience: "case_participants" as const,
      reviewed: true,
    };
    const posted = await postCaseMessage(t.db, f.staff.session, input);
    expect((await postCaseMessage(t.db, f.staff.session, input)).outcome).toEqual(posted.outcome);
    await postCaseMessage(t.db, f.client.session, {
      id: f.record.id,
      operationId: randomUUID(),
      expectedVersion: 3,
      body: "Please add a preference for a lift",
      audience: "case_participants",
      reviewed: false,
    });
    const client = await readCaseMessages(t.db, f.client.session, f.record.id);
    expect(client.map((r) => r.body)).toEqual([input.body, "Please add a preference for a lift"]);
    expect(await readCaseMessages(t.db, f.staff.session, f.record.id)).toHaveLength(3);
    expect(
      await t.db.select().from(approvals).where(eq(approvals.kind, "message_send")),
    ).toHaveLength(1);
    expect(await t.db.select().from(externalActions)).toHaveLength(0);
  });

  it("new participants cannot read earlier audience snapshots; revoked participants lose replay and reads", async () => {
    const f = await caseFixture(t.db);
    const input = {
      id: f.record.id,
      operationId: randomUUID(),
      expectedVersion: 1,
      body: "Private client question",
      audience: "case_participants" as const,
      reviewed: false,
    };
    await postCaseMessage(t.db, f.client.session, input);
    const other = await createClient(t.db);
    const issued = await createSession(t.db, { kind: "client", id: other.id });
    await expect(readCase(t.db, issued.session, f.record.id)).rejects.toMatchObject({
      code: "not_found",
    });
    await t.db
      .insert(caseParticipants)
      .values({ caseId: f.record.id, partyId: other.partyId, role: "co_buyer" });
    expect(await readCaseMessages(t.db, issued.session, f.record.id)).toEqual([]);
    await t.db
      .update(caseParticipants)
      .set({ revokedAt: new Date() })
      .where(eq(caseParticipants.partyId, f.client.partyId));
    await expect(postCaseMessage(t.db, f.client.session, input)).rejects.toMatchObject({
      code: "not_found",
    });
    await expect(readCaseMessages(t.db, f.client.session, f.record.id)).rejects.toMatchObject({
      code: "not_found",
    });
  });

  it("a client-visible summary is explicit; client cannot write staff-only notes", async () => {
    const f = await caseFixture(t.db);
    await updateNextAction(t.db, f.staff.session, {
      id: f.record.id,
      operationId: randomUUID(),
      expectedVersion: 1,
      nextAction: "Check a private negotiation constraint",
      dueAt: new Date(Date.now() + 86400000).toISOString(),
      clientSummary: "Your broker will prepare suitable options",
    });
    expect((await readCase(t.db, f.client.session, f.record.id)).record.nextAction).toBe(
      "Your broker will prepare suitable options",
    );
    await expect(
      postCaseMessage(t.db, f.client.session, {
        id: f.record.id,
        operationId: randomUUID(),
        expectedVersion: 2,
        body: "Try internal",
        audience: "internal",
        reviewed: true,
      }),
    ).rejects.toMatchObject({ code: "forbidden" });
  });

  it("a staff case transition grant does not expose or overwrite internal work fields", async () => {
    const f = await caseFixture(t.db);
    await t.db
      .update(grants)
      .set({ revokedAt: new Date() })
      .where(eq(grants.principalId, f.staff.id));
    await t.db.insert(grants).values(
      (["case.read", "case.transition"] as const).map((capability) => ({
        principalId: f.staff.id,
        capability,
        recordType: "case",
        recordId: f.record.id,
        reason: "Restricted synthetic case collaboration",
      })),
    );
    const view = await readCase(t.db, f.staff.session, f.record.id);
    expect(view.record.nextAction).toBeNull();
    expect(view.canManage).toBe(true);
    expect(view.canManageNext).toBe(false);
    expect(view.canManageContinuity).toBe(false);
    await expect(
      updateNextAction(t.db, f.staff.session, {
        id: f.record.id,
        operationId: randomUUID(),
        expectedVersion: 1,
        nextAction: "Overwriting an unread internal action",
        dueAt: new Date(Date.now() + 86400000).toISOString(),
        clientSummary: "",
      }),
    ).rejects.toMatchObject({ code: "forbidden" });
  });
});
