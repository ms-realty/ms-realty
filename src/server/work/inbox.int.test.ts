import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDatabase, type TestDatabase } from "@/db/test-utils";
import { createStaff } from "../testing";
import { listInbox } from "./inbox";
import {
  createInboundMessage,
  createInquiry,
  createPerson,
  createSentMessage,
  createTaskRow,
} from "./testing";

// O02 Inbox (F18 step 1, L08): distinct views, commitment-then-age order, snippets, problems.
let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => {
  await t?.drop();
});

const now = new Date("2026-09-26T09:00:00Z");
const at = (hours: number) => new Date(now.getTime() + hours * 3_600_000);

describe("listInbox", () => {
  it("separates unassigned, mine, awaiting client and problems, with counts", async () => {
    const broker = await createStaff(t.db, { roles: ["assigned_broker"] });
    const other = await createStaff(t.db, { roles: ["assigned_broker"] });
    const unassigned = await createInquiry(t.db, { createdAt: at(-5) });
    const mine = await createInquiry(t.db, { ownerStaffId: broker.id, createdAt: at(-4) });
    const theirs = await createInquiry(t.db, { ownerStaffId: other.id });
    const waiting = await createInquiry(t.db, {
      ownerStaffId: broker.id,
      state: "awaiting_client",
      firstResponseAt: at(-30),
      followUpAt: at(-1),
    });
    const failing = await createInquiry(t.db, {
      ownerStaffId: broker.id,
      state: "resolved_without_case",
      firstResponseAt: at(-3),
    });
    await createSentMessage(t.db, {
      inquiryId: failing.id,
      authorStaffId: broker.id,
      deliveryState: "failed",
    });
    const noRoute = await createInquiry(t.db, {
      personId: null,
      contactMethodId: null,
      createdAt: at(-1),
    });

    const ids = (rows: readonly { inquiry: { id: string } }[]) => rows.map((r) => r.inquiry.id);
    const unassignedView = await listInbox(t.db, broker.actor, { view: "unassigned", now });
    expect(ids(unassignedView.rows)).toEqual(expect.arrayContaining([unassigned.id, noRoute.id]));
    expect(unassignedView.rows.find((r) => r.inquiry.id === unassigned.id)).toMatchObject({
      owner: null,
      requiredAction: "assign",
      ageSeconds: 5 * 3600,
      snippet: "Is the apartment still available?",
      channel: { kind: "email", verification: "unverified" },
    });

    const mineView = await listInbox(t.db, broker.actor, { view: "mine", now });
    expect(ids(mineView.rows)).toEqual([mine.id]);
    expect(mineView.rows[0]).toMatchObject({
      owner: { staffId: broker.id },
      requiredAction: "first_response",
      deliveryProblem: false,
    });
    expect(ids(mineView.rows)).not.toContain(theirs.id);

    const awaiting = await listInbox(t.db, broker.actor, { view: "awaiting_client", now });
    expect(awaiting.rows).toEqual([
      expect.objectContaining({
        inquiry: expect.objectContaining({ id: waiting.id }),
        requiredAction: "follow_up",
        commitmentDue: { at: at(-1).toISOString(), overdue: true },
      }),
    ]);

    const problems = await listInbox(t.db, broker.actor, { view: "problems", now });
    expect(problems.rows.find((r) => r.inquiry.id === failing.id)).toMatchObject({
      deliveryProblem: true,
      requiredAction: "resolve_delivery",
      state: "resolved_without_case",
    });
    expect(problems.rows.find((r) => r.inquiry.id === noRoute.id)).toMatchObject({
      requiredAction: "fix_contact_route",
      channel: null,
    });
    expect(problems.counts).toEqual({
      unassigned: unassignedView.rows.length,
      mine: 1,
      awaiting_client: 1,
      problems: problems.rows.length,
    });
  });

  it("orders by the earliest commitment, then by age, and pages with a cursor", async () => {
    const broker = await createStaff(t.db, { roles: ["assigned_broker"] });
    const oldest = await createInquiry(t.db, { ownerStaffId: broker.id, createdAt: at(-50) });
    const newer = await createInquiry(t.db, { ownerStaffId: broker.id, createdAt: at(-10) });
    const promised = await createInquiry(t.db, { ownerStaffId: broker.id, createdAt: at(-2) });
    await createTaskRow(t.db, {
      ownerStaffId: broker.id,
      inquiryId: promised.id,
      commitment: "client_promise",
      dueAt: at(1),
    });
    await createInboundMessage(t.db, {
      inquiryId: newer.id,
      body: "  Could we   see it on Monday?\n",
    });

    const first = await listInbox(t.db, broker.actor, { view: "mine", now, limit: 2 });
    expect(first.rows.map((r) => r.inquiry.id)).toEqual([promised.id, oldest.id]);
    expect(first.rows[0]?.commitmentDue).toEqual({ at: at(1).toISOString(), overdue: false });
    expect(first.nextCursor).toEqual(expect.any(String));
    const second = await listInbox(t.db, broker.actor, {
      view: "mine",
      now,
      limit: 2,
      cursor: first.nextCursor,
    });
    expect(second.rows.map((r) => r.inquiry.id)).toEqual([newer.id]);
    expect(second.rows[0]?.snippet).toBe("Could we see it on Monday?");
    expect(second.nextCursor).toBeNull();
    await expect(
      listInbox(t.db, broker.actor, { view: "mine", now, cursor: "garbage" }),
    ).rejects.toMatchObject({ code: "validation_failed" });
  });

  it("uses the person's name and requires inquiry access", async () => {
    const broker = await createStaff(t.db, { roles: ["assigned_broker"] });
    const person = await createPerson(t.db, { name: "Ivo Example" });
    const inquiry = await createInquiry(t.db, {
      ownerStaffId: broker.id,
      personId: person.personId,
      contactMethodId: person.contactMethodId,
    });
    const view = await listInbox(t.db, broker.actor, { view: "mine", now });
    expect(view.rows.find((r) => r.inquiry.id === inquiry.id)?.person).toEqual({
      id: person.personId,
      name: "Ivo Example",
    });
    const editor = await createStaff(t.db, { roles: ["content_editor"] });
    await expect(listInbox(t.db, editor.actor, { view: "mine", now })).rejects.toMatchObject({
      code: "forbidden",
    });
  });
});
