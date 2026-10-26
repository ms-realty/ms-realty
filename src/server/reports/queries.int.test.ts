// O22 / F25 / AT40: counts and samples cannot reveal a record or field beyond ordinary grants.
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, expect, it } from "vitest";
import { caseStageHistory, cases, grants, inquiries, tasks } from "@/db/schema";
import { createTestDatabase, type TestDatabase } from "@/db/test-utils";
import type { Capability } from "@/domain/capabilities";
import { staffFixture } from "../cases/testing";
import { createCase } from "../testing";
import { recordTaskEffort } from "../work/effort";
import { readReports, reportFilter } from "./queries";

let t: TestDatabase;
beforeEach(async () => {
  t = await createTestDatabase();
});
afterEach(async () => {
  await t?.drop();
});
const filter = { days: 30 as const, scope: "all" as const };
const count = (r: Awaited<ReturnType<typeof readReports>>, id: string) =>
  r.metrics.find((m) => m.id === id);
async function inquiry(values: Partial<typeof inquiries.$inferInsert> = {}) {
  const [row] = await t.db
    .insert(inquiries)
    .values({
      reference: `RQ-SYN-${randomUUID()}`,
      purpose: "question",
      source: "website",
      submissionKey: randomUUID(),
      payloadDigest: "synthetic",
      coverageQueue: "synthetic-coverage",
      ...values,
    })
    .returning();
  if (!row) throw new Error("Missing inquiry fixture");
  return row;
}
async function grant(id: string, capability: Capability, recordType?: string, recordId?: string) {
  await t.db
    .insert(grants)
    .values({ principalId: id, capability, recordType, recordId, reason: "Synthetic O22 proof" });
}

it("requires a live enrolled staff member and report authority", async () => {
  const staff = await staffFixture(t.db);
  await expect(readReports(t.db, staff.session, filter)).rejects.toMatchObject({
    code: "forbidden",
  });
  await grant(staff.id, "report.read");
  expect(count(await readReports(t.db, staff.session, filter), "unowned")?.count).toBe(0);
  await t.db.update(grants).set({ revokedAt: new Date() }).where(eq(grants.principalId, staff.id));
  await expect(readReports(t.db, staff.session, filter)).rejects.toMatchObject({
    code: "forbidden",
  });
});

it("intersects reporting and record scopes before both count and samples, and rechecks revocation", async () => {
  const staff = await staffFixture(t.db);
  const allowed = await inquiry(),
    hidden = await inquiry();
  await grant(staff.id, "report.read", "inquiry", allowed.id);
  const report = await readReports(t.db, staff.session, filter);
  expect(count(report, "unowned")?.count).toBe(1);
  expect(count(report, "unowned")?.rows.map((r) => r.id)).toEqual([allowed.id]);
  expect(JSON.stringify(report)).not.toContain(hidden.reference);
  await t.db.update(grants).set({ revokedAt: new Date() }).where(eq(grants.principalId, staff.id));
  await grant(staff.id, "report.read", "inquiry", allowed.id);
  await grant(staff.id, "inquiry.read", "inquiry", hidden.id);
  expect(count(await readReports(t.db, staff.session, filter), "unowned")?.count).toBe(0);
});

it("retains the authorized total beyond the bounded drill sample", async () => {
  const staff = await staffFixture(t.db);
  await grant(staff.id, "report.read");
  for (let n = 0; n < 25; n++) await inquiry();
  const result = count(await readReports(t.db, staff.session, filter), "unowned");
  expect(result?.count).toBe(25);
  expect(result?.rows).toHaveLength(20);
  expect(result?.hasMore).toBe(true);
});

it("does not expose internal Case field aggregates through a shared-summary read", async () => {
  const staff = await staffFixture(t.db);
  const id = await createCase(t.db, staff.id);
  await t.db
    .update(cases)
    .set({ nextActionDueAt: new Date(Date.now() - 60000) })
    .where(eq(cases.id, id));
  await t.db.update(grants).set({ revokedAt: new Date() }).where(eq(grants.principalId, staff.id));
  await grant(staff.id, "report.read", "case", id);
  await grant(staff.id, "case.read", "case", id);
  const denied = count(await readReports(t.db, staff.session, filter), "nextActions");
  expect(denied).toMatchObject({ state: "denied", count: null, rows: [] });
  await grant(staff.id, "case.read_internal", "case", id);
  expect(count(await readReports(t.db, staff.session, filter), "nextActions")?.count).toBe(1);
});

it("counts only the recorded useful-human response and keeps missing policy/data unknown", async () => {
  const staff = await staffFixture(t.db);
  await grant(staff.id, "report.read");
  const now = new Date(),
    createdAt = new Date(now.getTime() - 3600000);
  await inquiry({ createdAt, firstResponseAt: new Date(createdAt.getTime() + 600000) });
  await inquiry({ createdAt, acknowledgedAt: new Date(createdAt.getTime() + 1000) });
  const report = await readReports(t.db, staff.session, filter, now);
  expect(report.response).toMatchObject({
    received: 2,
    responded: 1,
    missing: 1,
    invalid: 0,
    medianMinutes: 10,
    smallSample: true,
  });
  expect(report.staffedResponse.state).toBe("unknown");
  expect(report.correctionEffort.state).toBe("unobserved");
  const empty = await readReports(t.db, staff.session, { days: 7, scope: "mine" }, now);
  expect(empty.response).toMatchObject({ received: 0, responded: 0, medianMinutes: null });
});

it("O22 reports attributable effort only within intersected report/task scope and excludes corrected entries", async () => {
  const staff = await staffFixture(t.db);
  const [visible, hidden, otherOwner] = await t.db
    .insert(tasks)
    .values([
      { title: "Synthetic permitted correction", ownerId: staff.id },
      { title: "Synthetic hidden correction", ownerId: staff.id },
      { title: "Synthetic other-owner correction", ownerId: null },
    ])
    .returning();
  if (!visible || !hidden || !otherOwner) throw new Error("Missing effort fixtures");
  const record = (id: string, category: "correction" | "reentry", minutes: number) =>
    recordTaskEffort(t.db, staff.session, {
      id,
      expectedVersion: 1,
      operationId: randomUUID(),
      action: "record",
      category,
      minutes,
      reason: "facts",
    });
  const mistaken = await record(visible.id, "correction", 9);
  await recordTaskEffort(t.db, staff.session, {
    id: visible.id,
    expectedVersion: 1,
    operationId: randomUUID(),
    action: "void",
    entryId: mistaken.outcome.id,
    reason: "entry_mistake",
  });
  await record(visible.id, "correction", 12);
  await record(visible.id, "reentry", 4);
  await record(hidden.id, "correction", 80);
  await record(otherOwner.id, "reentry", 40);
  await t.db.update(grants).set({ revokedAt: new Date() }).where(eq(grants.principalId, staff.id));
  await grant(staff.id, "report.read", "task", visible.id);
  await grant(staff.id, "task.manage");
  const observed = await readReports(t.db, staff.session, filter);
  expect(observed.correctionEffort).toMatchObject({
    state: "observed",
    observations: 2,
    correctionMinutes: 12,
    reentryMinutes: 4,
    rows: [{ id: visible.id, reference: visible.title }],
  });
  expect(JSON.stringify(observed)).not.toContain(hidden.title);
  await grant(staff.id, "report.read", "task", otherOwner.id);
  expect(
    (await readReports(t.db, staff.session, { ...filter, scope: "mine" })).correctionEffort
      .observations,
  ).toBe(2);
  expect((await readReports(t.db, staff.session, filter)).correctionEffort.reentryMinutes).toBe(44);
  await t.db.update(grants).set({ revokedAt: new Date() }).where(eq(grants.principalId, staff.id));
  await grant(staff.id, "report.read");
  expect((await readReports(t.db, staff.session, filter)).correctionEffort).toMatchObject({
    state: "denied",
    observations: null,
    rows: [],
  });
});

it("uses actual transition events and open client promises, never guesses from current Case stage", async () => {
  const staff = await staffFixture(t.db);
  await grant(staff.id, "report.read");
  const caseId = await createCase(t.db, staff.id),
    now = new Date();
  await t.db.insert(caseStageHistory).values([
    {
      caseId,
      fromStage: null,
      toStage: "needs_agreed",
      actorKind: "staff",
      actorId: staff.id,
      operationId: randomUUID(),
      occurredAt: new Date(now.getTime() - 4000),
    },
    {
      caseId,
      fromStage: "new",
      toStage: "needs_agreed",
      actorKind: "staff",
      actorId: staff.id,
      operationId: randomUUID(),
      occurredAt: new Date(now.getTime() - 3000),
    },
  ]);
  await t.db.insert(tasks).values([
    {
      title: "Synthetic overdue promise",
      caseId,
      ownerId: staff.id,
      dueAt: new Date(now.getTime() - 1000),
      promisedToClient: true,
    },
    {
      title: "Synthetic internal work",
      caseId,
      ownerId: staff.id,
      dueAt: new Date(now.getTime() - 1000),
    },
  ]);
  const report = await readReports(t.db, staff.session, filter, now);
  expect(count(report, "progressions")?.count).toBe(1);
  expect(count(report, "promises")?.count).toBe(1);
  expect(count(report, "promises")?.rows[0]?.reference).toBe("Synthetic overdue promise");
});

it("rejects unbounded or unsupported native filter values", () => {
  expect(reportFilter({ days: ["7", "90"], scope: "mine" })).toEqual({ days: 7, scope: "mine" });
  expect(() => reportFilter({ days: "9999" })).toThrow();
  expect(() => reportFilter({ scope: "someone-else" })).toThrow();
});
