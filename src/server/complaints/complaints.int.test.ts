import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, expect, it } from "vitest";
import { complaintReviews, complaints, grants, passkeys } from "@/db/schema";
import { createTestDatabase, type TestDatabase } from "@/db/test-utils";
import { createSession } from "../auth/sessions";
import { staffFixture } from "../cases/testing";
import { createClient } from "../testing";
import { createComplaint, listComplaints, readComplaint, reviewComplaint } from "./service";
import { complaintFixture } from "./testing";

let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => {
  await t?.drop();
});
async function fixture() {
  const staff = await complaintFixture(t.db);
  const input = {
    operationId: randomUUID(),
    channel: "email",
    sourceReference: "Synthetic correspondence reference",
    description: "Synthetic complaint concerning appointment follow-up.",
    receivedAt: new Date(Date.now() - 3600000).toISOString(),
    dueAt: new Date(Date.now() + 86400000).toISOString(),
    ownerId: staff.id,
    reviewed: true,
  };
  const created = await createComplaint(t.db, staff.session, input);
  const review = {
    operationId: randomUUID(),
    id: created.outcome.id,
    expectedVersion: 1,
    ownerId: staff.id,
    dueAt: input.dueAt,
    state: "resolved",
    note: "Reviewed the original correspondence and the follow-up.",
    outcome: "Synthetic external response recorded with reference DEMO-1.",
    reviewed: true,
  };
  return { staff, input, created, review };
}
it("creates exactly one private record and receipt for an identical retried submission", async () => {
  const f = await fixture();
  const replay = await createComplaint(t.db, f.staff.session, f.input);
  expect(replay).toMatchObject({ replayed: true, outcome: f.created.outcome });
  const read = await readComplaint(t.db, f.staff.session, f.created.outcome.id);
  expect(read.row.reference).toMatch(/^CM-\d{4}-\d{6}$/);
  expect(read.reviews).toHaveLength(1);
  await expect(
    t.db
      .update(complaints)
      .set({ description: "Changed original source" })
      .where(eq(complaints.id, read.row.id)),
  ).rejects.toThrow();
  await expect(
    createComplaint(t.db, f.staff.session, {
      ...f.input,
      description: "Different complaint under the same identity",
    }),
  ).rejects.toMatchObject({ code: "idempotency_key_reused" });
});
it("requires explicit outcome and preserves immutable resolution and reopening history", async () => {
  const f = await fixture();
  await expect(
    reviewComplaint(t.db, f.staff.session, { ...f.review, outcome: "" }),
  ).rejects.toMatchObject({ code: "validation_failed" });
  await reviewComplaint(t.db, f.staff.session, { ...f.review, operationId: randomUUID() });
  await expect(
    reviewComplaint(t.db, f.staff.session, { ...f.review, operationId: randomUUID() }),
  ).rejects.toMatchObject({ code: "version_conflict" });
  await reviewComplaint(t.db, f.staff.session, {
    ...f.review,
    operationId: randomUUID(),
    expectedVersion: 2,
    state: "open",
    note: "Reopened after additional correspondence was reviewed.",
    outcome: "",
  });
  const view = await readComplaint(t.db, f.staff.session, f.created.outcome.id);
  expect(view.row).toMatchObject({
    state: "open",
    resolvedAt: null,
    description: f.input.description,
    version: 3,
  });
  expect(view.reviews.map((r) => r.state)).toEqual(["open", "resolved", "open"]);
  expect(view.reviews[1]?.outcome).toBe(f.review.outcome);
  await expect(
    t.db
      .update(complaintReviews)
      .set({ note: "tampered" })
      .where(eq(complaintReviews.id, view.reviews[0]?.id ?? "")),
  ).rejects.toThrow();
  expect(
    (await readComplaint(t.db, f.staff.session, f.created.outcome.id, "3")).reviews.map(
      (r) => r.version,
    ),
  ).toEqual([2, 1]);
});
it("denies clients and brokers, revoked staff authority and missing passkeys", async () => {
  const f = await fixture(),
    broker = await staffFixture(t.db),
    client = await createClient(t.db),
    session = await createSession(t.db, { kind: "client", id: client.id });
  for (const unauthorized of [broker.session, session.session]) {
    await expect(listComplaints(t.db, unauthorized)).rejects.toMatchObject({ code: "not_found" });
    await expect(readComplaint(t.db, unauthorized, f.created.outcome.id)).rejects.toMatchObject({
      code: "not_found",
    });
  }
  await t.db
    .update(grants)
    .set({ revokedAt: new Date() })
    .where(eq(grants.principalId, f.staff.id));
  await expect(reviewComplaint(t.db, f.staff.session, f.review)).rejects.toMatchObject({
    code: "not_found",
  });
  const second = await complaintFixture(t.db);
  await t.db
    .update(passkeys)
    .set({ revokedAt: new Date() })
    .where(eq(passkeys.principalId, second.id));
  await expect(listComplaints(t.db, second.session)).rejects.toMatchObject({ code: "forbidden" });
});
it("rejects ineligible owners, unreviewed input and invalid received/due dates", async () => {
  const f = await fixture(),
    broker = await staffFixture(t.db);
  for (const change of [
    { ownerId: broker.id },
    { reviewed: false },
    { dueAt: new Date(Date.now() - 86400000).toISOString() },
    { receivedAt: new Date(Date.now() + 86400000).toISOString() },
  ]) {
    await expect(
      createComplaint(t.db, f.staff.session, { ...f.input, operationId: randomUUID(), ...change }),
    ).rejects.toMatchObject({ code: "validation_failed" });
  }
});
it("pages a private queue without exposing entries to a record-scoped grant", async () => {
  const f = await fixture();
  const rows = await listComplaints(t.db, f.staff.session, "open");
  expect(rows.rows.every((r) => r.state === "open")).toBe(true);
  const after = rows.rows[0]?.id;
  expect(
    (await listComplaints(t.db, f.staff.session, "open", after)).rows.every((r) => r.id !== after),
  ).toBe(true);
  const limited = await staffFixture(t.db);
  await t.db.insert(grants).values({
    principalId: limited.id,
    capability: "complaint.manage",
    recordType: "complaint",
    recordId: f.created.outcome.id,
    reason: "Synthetic scoped grant",
  });
  await expect(listComplaints(t.db, limited.session)).rejects.toMatchObject({ code: "not_found" });
});
