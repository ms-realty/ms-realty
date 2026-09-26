import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDatabase, type TestDatabase } from "@/db/test-utils";
import { createCase, createClient, createStaff } from "../testing";
import {
  createAppointment,
  createInquiry,
  createPendingApproval,
  createSentMessage,
  createServicePolicy,
  createTaskRow,
} from "./testing";
import { getToday } from "./today";
import { type TodayRow, todaySections } from "./types";

// O01 Today (F19, L07, A45): F19 order, reasons, owners, due points, direct actions.
let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => {
  await t?.drop();
});

const now = new Date("2026-09-26T09:00:00Z"); // Saturday 12:00 in Sofia.
const timeZone = "Europe/Sofia";
const hour = 3_600_000;
const at = (offsetHours: number) => new Date(now.getTime() + offsetHours * hour);

const rowsOf = (view: Awaited<ReturnType<typeof getToday>>) => view.groups.flatMap((g) => g.rows);
const byId = (rows: readonly TodayRow[], id: string) => rows.find((r) => r.id === id);

describe("getToday", () => {
  it("returns the empty state with the next dated item and no invented office hours", async () => {
    const broker = await createStaff(t.db, { roles: ["assigned_broker"] });
    await createTaskRow(t.db, { ownerStaffId: broker.id, dueAt: at(30) });
    const view = await getToday(t.db, broker.actor, { now, timeZone });
    expect(view.groups).toEqual([]);
    expect(Object.values(view.counts).every((c) => c === 0)).toBe(true);
    expect(view.empty).toEqual({ nextDueAt: at(30).toISOString() });
    expect(view.office).toBeNull();
  });

  it("orders work exactly as F19 and explains every row", async () => {
    const broker = await createStaff(t.db, { roles: ["assigned_broker"] });
    const other = await createStaff(t.db, { roles: ["assigned_broker"] });

    const owned = await createInquiry(t.db, {
      ownerStaffId: broker.id,
      firstResponseAt: at(-20),
      createdAt: at(-24),
    });
    const failed = await createSentMessage(t.db, {
      inquiryId: owned.id,
      authorStaffId: broker.id,
      deliveryState: "failed",
      lastErrorCode: "mailbox_unavailable",
    });
    // A missed promise stays visible even when snoozed (A45).
    const promise = await createTaskRow(t.db, {
      title: "Send the floor plan",
      ownerStaffId: broker.id,
      commitment: "client_promise",
      dueAt: at(-23),
      followUpAt: at(24),
      inquiryId: owned.id,
    });
    const viewing = await createAppointment(t.db, {
      hostStaffId: broker.id,
      state: "confirmed",
      startsAt: at(3),
    });
    const unowned = await createInquiry(t.db, { createdAt: at(-2) });
    const approval = await createPendingApproval(t.db, {
      kind: "message_send",
      requestedBy: other.id,
    });
    const planned = await createTaskRow(t.db, {
      title: "Prepare viewing notes",
      ownerStaffId: broker.id,
      dueAt: at(6),
    });
    const snoozed = await createTaskRow(t.db, {
      ownerStaffId: broker.id,
      dueAt: at(-1),
      followUpAt: at(24),
    });
    const notMine = await createTaskRow(t.db, { ownerStaffId: other.id, dueAt: at(2) });

    const view = await getToday(t.db, broker.actor, { now, timeZone });
    const rows = rowsOf(view);
    const ids = [
      `delivery:${failed.outboxId}`,
      `task:${promise.id}`,
      `appointment:${viewing.id}`,
      `inquiry:${unowned.id}`,
      `approval:${approval}`,
      `task:${planned.id}`,
    ];
    expect(rows.filter((r) => ids.includes(r.id)).map((r) => r.id)).toEqual(ids);
    expect(byId(rows, `task:${snoozed.id}`)).toBeUndefined();
    expect(byId(rows, `task:${notMine.id}`)).toBeUndefined();
    expect(view.groups.map((g) => g.key)).toEqual(todaySections.filter((s) => view.counts[s] > 0));

    expect(byId(rows, `delivery:${failed.outboxId}`)).toMatchObject({
      kind: "delivery_problem",
      section: "consequential_failures",
      severity: "consequential",
      reasonCode: "delivery_failed",
      owner: { staffId: broker.id },
      action: { kind: "reconcile_delivery", target: { type: "message", id: failed.messageId } },
      records: expect.arrayContaining([
        { type: "inquiry", id: owned.id, reference: owned.reference },
      ]),
    });
    expect(byId(rows, `task:${promise.id}`)).toMatchObject({
      kind: "client_commitment",
      section: "overdue_commitments",
      title: "Send the floor plan",
      severity: "consequential",
      due: { at: at(-23).toISOString(), overdue: true },
      action: { kind: "complete_task" },
    });
    expect(byId(rows, `appointment:${viewing.id}`)).toMatchObject({
      section: "appointments_today",
      title: `Attend ${viewing.reference}`,
      reasonCode: "access_unconfirmed",
      due: { overdue: false },
    });
    // Unowned work is always there for the duty role.
    expect(byId(rows, `inquiry:${unowned.id}`)).toMatchObject({
      kind: "first_response",
      title: `Claim ${unowned.reference}`,
      owner: null,
      reasonCode: "unowned_request",
      due: null,
      action: { kind: "claim_inquiry", target: { type: "inquiry", id: unowned.id } },
    });
    expect(byId(rows, `approval:${approval}`)).toMatchObject({
      section: "blocking_approvals",
      action: { kind: "review_approval" },
    });
    expect(byId(rows, `task:${planned.id}`)).toMatchObject({
      section: "planned_tasks",
      severity: "planned",
      due: { at: at(6).toISOString(), overdue: false },
    });
    expect(view.counts.overdue_commitments).toBeGreaterThanOrEqual(1);
    expect(view.unownedCount).toBeGreaterThanOrEqual(2);
    expect(view.empty).toBeNull();
  });

  it("shows unknown deliveries only once they are parked for reconciliation", async () => {
    const broker = await createStaff(t.db, { roles: ["assigned_broker"] });
    const inquiry = await createInquiry(t.db, {
      ownerStaffId: broker.id,
      firstResponseAt: at(-1),
    });
    const inFlight = await createSentMessage(t.db, {
      inquiryId: inquiry.id,
      authorStaffId: broker.id,
      deliveryState: "outcome_unknown",
      dispatchStartedAt: new Date(now.getTime() - 30_000),
    });
    const parked = await createSentMessage(t.db, {
      inquiryId: inquiry.id,
      authorStaffId: broker.id,
      deliveryState: "outcome_unknown",
      dispatchStartedAt: at(-1),
    });
    const rows = rowsOf(await getToday(t.db, broker.actor, { now, timeZone }));
    expect(byId(rows, `delivery:${inFlight.outboxId}`)).toBeUndefined();
    expect(byId(rows, `delivery:${parked.outboxId}`)).toMatchObject({
      reasonCode: "delivery_outcome_unknown",
      title: `Check delivery to ${inquiry.reference}`,
    });
  });

  it("puts agreed client follow-ups under commitments once they are missed", async () => {
    const broker = await createStaff(t.db, { roles: ["assigned_broker"] });
    const late = await createInquiry(t.db, {
      ownerStaffId: broker.id,
      state: "awaiting_client",
      firstResponseAt: at(-48),
      followUpAt: at(-2),
    });
    const later = await createInquiry(t.db, {
      ownerStaffId: broker.id,
      state: "awaiting_client",
      firstResponseAt: at(-48),
      followUpAt: at(4),
    });
    const rows = rowsOf(await getToday(t.db, broker.actor, { now, timeZone }));
    expect(byId(rows, `follow-up:${late.id}`)).toMatchObject({
      section: "overdue_commitments",
      reasonCode: "follow_up_overdue",
      action: { kind: "follow_up" },
    });
    expect(byId(rows, `follow-up:${later.id}`)).toMatchObject({ section: "planned_tasks" });
  });

  it("leaves unowned work to the duty role", async () => {
    const coordinator = await createStaff(t.db, { roles: ["coordinator"] });
    const unowned = await createInquiry(t.db, { createdAt: at(-1) });
    const visit = await createAppointment(t.db, {
      hostStaffId: coordinator.id,
      state: "proposed",
      startsAt: at(2),
    });
    const rows = rowsOf(await getToday(t.db, coordinator.actor, { now, timeZone }));
    expect(byId(rows, `inquiry:${unowned.id}`)).toBeUndefined();
    expect(byId(rows, `appointment:${visit.id}`)).toMatchObject({
      title: `Confirm ${visit.reference}`,
      reasonCode: "proposed_not_confirmed",
      action: { kind: "confirm_appointment" },
    });
  });

  it("groups by case and by type", async () => {
    const broker = await createStaff(t.db, { roles: ["assigned_broker"] });
    const caseId = await createCase(t.db, broker.id);
    const first = await createTaskRow(t.db, { ownerStaffId: broker.id, dueAt: at(1), caseId });
    const second = await createTaskRow(t.db, { ownerStaffId: broker.id, dueAt: at(2), caseId });
    const byCase = await getToday(t.db, broker.actor, { now, timeZone, groupBy: "case" });
    const group = byCase.groups.find((g) => g.key === `case:${caseId}`);
    expect(group?.rows.map((r) => r.id)).toEqual([`task:${first.id}`, `task:${second.id}`]);
    const byType = await getToday(t.db, broker.actor, { now, timeZone, groupBy: "type" });
    expect(byType.groups.find((g) => g.key === "task")?.rows.length).toBeGreaterThanOrEqual(2);
  });

  it("is staff only and validates the timezone", async () => {
    const client = await createClient(t.db);
    await expect(getToday(t.db, client.actor, { now, timeZone })).rejects.toMatchObject({
      code: "forbidden",
    });
    await expect(
      getToday(t.db, { kind: "ai_service", id: "hermes" }, { now, timeZone }),
    ).rejects.toMatchObject({ code: "forbidden" });
    const broker = await createStaff(t.db, { roles: ["assigned_broker"] });
    await expect(
      getToday(t.db, broker.actor, { now, timeZone: "Mars/Base" }),
    ).rejects.toMatchObject({ code: "validation_failed" });
  });

  // Runs last: a service policy applies to every request received after it takes effect.
  it("flags a passed first-response promise and reads office hours from the policy", async () => {
    await createServicePolicy(t.db, {
      effectiveFrom: at(-6),
      serviceHours: { sat: ["10:00", "14:00"] },
      responsePolicy: { firstResponseHours: 1 },
    });
    const broker = await createStaff(t.db, { roles: ["assigned_broker"] });
    const overdue = await createInquiry(t.db, { ownerStaffId: broker.id, createdAt: at(-2) });
    const fresh = await createInquiry(t.db, { ownerStaffId: broker.id, createdAt: at(-0.5) });
    const view = await getToday(t.db, broker.actor, { now, timeZone });
    const rows = rowsOf(view);
    expect(view.office).toEqual({ open: true, timezone: "Europe/Sofia" });
    expect(byId(rows, `inquiry:${overdue.id}`)).toMatchObject({
      kind: "first_response_overdue",
      section: "consequential_failures",
      title: `Reply to ${overdue.reference}`,
      due: { at: at(-1).toISOString(), overdue: true },
      action: { kind: "reply" },
    });
    expect(byId(rows, `inquiry:${fresh.id}`)).toMatchObject({
      kind: "first_response",
      section: "awaiting_first_response",
      due: { at: at(0.5).toISOString(), overdue: false },
    });
  });
});
