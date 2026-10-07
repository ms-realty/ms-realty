import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import * as schema from "@/db/schema";
import { createTestDatabase, type TestDatabase } from "@/db/test-utils";
import { staffFixture } from "../cases/testing";
import { translationWorkbench } from "../inventory/translations";
import { createCase, createProperty, type GrantSpec } from "../testing";
import { listInbox, readToday } from "./queries";

let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => {
  await t?.drop();
});

it("O01 reads bounded real queues with one authorization context", async () => {
  const staff = await staffFixture(t.db);
  let reads: string[] = [];
  const measured = drizzle(t.sql, {
    schema,
    logger: {
      logQuery(query) {
        reads.push(query);
      },
    },
  });
  await listInbox(measured, staff.session, "unassigned");
  const oneQueueReads = reads.length;
  reads = [];
  const today = await readToday(measured, staff.session);
  expect(reads.filter((query) => query.includes('from "grants"'))).toHaveLength(1);
  expect(reads.length).toBeLessThanOrEqual(oneQueueReads + 10);
  for (const queue of [
    today.unassigned,
    today.due,
    today.mine,
    today.handovers,
    today.viewings,
    today.caseContinue,
    today.draftContinue,
    today.listingReviews,
    today.translationReviews,
    today.deliveryExceptions,
    today.publicationExceptions,
  ]) {
    expect(queue.status).toBe("ready");
    expect(queue.total).toBeTypeOf("number");
    expect(queue.rows.length).toBeLessThanOrEqual(30);
  }
});

it("retains due and record-scope filters and refreshes grants on the next request", async () => {
  const staff = await staffFixture(t.db),
    now = new Date();
  const tasks = await t.db
    .insert(schema.tasks)
    .values([
      {
        title: "Synthetic due and granted",
        ownerId: staff.id,
        dueAt: new Date(now.getTime() - 1000),
      },
      {
        title: "Synthetic due but not granted",
        ownerId: staff.id,
        dueAt: new Date(now.getTime() - 1000),
      },
      {
        title: "Synthetic future task",
        ownerId: staff.id,
        dueAt: new Date(now.getTime() + 86400000),
      },
    ])
    .returning();
  const [allowed, excluded, future] = tasks;
  if (!allowed || !excluded || !future) throw new Error("Missing tasks");
  expect((await readToday(t.db, staff.session, now)).due.rows.map((r) => r.task.id).sort()).toEqual(
    [allowed.id, excluded.id].sort(),
  );
  await t.db
    .update(schema.grants)
    .set({ revokedAt: new Date() })
    .where(eq(schema.grants.principalId, staff.id));
  await t.db.insert(schema.grants).values(
    [allowed.id, future.id].map((id) => ({
      principalId: staff.id,
      capability: "task.manage" as const,
      recordType: "task",
      recordId: id,
      reason: "Synthetic scoped queue read",
    })),
  );
  const scoped = await readToday(t.db, staff.session, now);
  expect(scoped.due.rows.map((r) => r.task.id)).toEqual([allowed.id]);
  expect(scoped.handovers.rows).toEqual([]);
  expect(scoped.unassigned.rows).toEqual([]);
  expect(scoped.mine.rows).toEqual([]);
  await t.db
    .update(schema.grants)
    .set({ revokedAt: new Date() })
    .where(eq(schema.grants.principalId, staff.id));
  expect((await readToday(t.db, staff.session, now)).due.rows).toEqual([]);
});

async function narrow(staffId: string, values: GrantSpec[]) {
  await t.db
    .update(schema.grants)
    .set({ revokedAt: new Date() })
    .where(eq(schema.grants.principalId, staffId));
  if (values.length)
    await t.db.insert(schema.grants).values(
      values.map((grant) => ({
        ...grant,
        principalId: staffId,
        reason: "Synthetic O01 permission fixture",
      })),
    );
}

async function listing(
  ownerId: string,
  editorialState: "draft" | "needs_facts" | "changes_requested" | "in_review" = "draft",
) {
  const propertyId = await createProperty(t.db);
  const [row] = await t.db
    .insert(schema.listings)
    .values({
      reference: `MS-O01-${randomUUID()}`.toUpperCase(),
      propertyId,
      purpose: "sale",
      commercialState: "withdrawn",
      responsibleBrokerId: ownerId,
      editorialState,
      draft: { title: "Synthetic unpublished copy must stay out of Today" },
    })
    .returning();
  if (!row) throw new Error("Missing listing");
  return row;
}

async function revision(row: typeof schema.listings.$inferSelect, number: number) {
  const [facts] = await t.db
    .insert(schema.propertyFactRevisions)
    .values({
      propertyId: row.propertyId,
      revisionNumber: number,
      contentDigest: randomUUID(),
      materialChange: "initial",
      createdByKind: "system",
      createdById: "synthetic-fixture",
    })
    .returning();
  if (!facts) throw new Error("Missing fact revision");
  const [source] = await t.db
    .insert(schema.listingRevisions)
    .values({
      listingId: row.id,
      revisionNumber: number,
      factRevisionId: facts.id,
      contentDigest: randomUUID(),
      sourceCopy: { private: "Synthetic unpublished facts" },
      disclosure: {},
      terms: {},
      createdByKind: "system",
      createdById: "synthetic-fixture",
    })
    .returning();
  if (!source) throw new Error("Missing source revision");
  return source;
}

it("O01 counts every visible due commitment before the cap and retains the original promise", async () => {
  const staff = await staffFixture(t.db);
  const other = await staffFixture(t.db);
  const now = new Date();
  const dueAt = new Date(now.getTime() - 3600000);
  const followUpAt = new Date(now.getTime() + 3600000);
  const tasks = await t.db
    .insert(schema.tasks)
    .values(
      Array.from({ length: 36 }, (_, index) => ({
        title: `Synthetic due commitment ${index}`,
        ownerId: staff.id,
        dueAt: new Date(dueAt.getTime() + index * 1000),
        followUpAt,
      })),
    )
    .returning();
  const [handover] = await t.db
    .insert(schema.tasks)
    .values({
      title: "Synthetic receiving broker offer",
      ownerId: other.id,
      pendingOwnerId: staff.id,
      dueAt,
    })
    .returning();
  if (!handover) throw new Error("Missing handover");
  await narrow(staff.id, [
    ...tasks.slice(0, 35).map((task) => ({
      capability: "task.manage" as const,
      recordType: "task",
      recordId: task.id,
    })),
    { capability: "task.manage", recordType: "task", recordId: handover.id },
  ]);
  const today = await readToday(t.db, staff.session, now);
  expect(today.due).toMatchObject({ status: "ready", total: 35, hasMore: true });
  expect(today.due.rows).toHaveLength(30);
  expect(today.due.rows[0]?.task).toMatchObject({ dueAt, followUpAt });
  expect(today.due.rows.map((row) => row.task.id)).toEqual(tasks.slice(0, 30).map((row) => row.id));
  expect(today.handovers.rows.map((row) => row.task.id)).toEqual([handover.id]);
  const [preserved] = await t.db
    .select()
    .from(schema.tasks)
    .where(eq(schema.tasks.id, handover.id));
  expect(preserved).toMatchObject({ ownerId: other.id, pendingOwnerId: staff.id, dueAt });
});

it("O01 keeps a newly received overdue follow-up ahead of more than thirty older inquiries", async () => {
  const staff = await staffFixture(t.db);
  const now = new Date();
  const rows = await t.db
    .insert(schema.inquiries)
    .values(
      Array.from({ length: 36 }, (_, index) => ({
        reference: `RQ-O01-${randomUUID()}`,
        purpose: "question" as const,
        source: "website" as const,
        state: "assigned" as const,
        submissionKey: randomUUID(),
        payloadDigest: "synthetic",
        ownerId: staff.id,
        createdAt: new Date(now.getTime() - (36 - index) * 60000),
        followUpAt: index === 35 ? new Date(now.getTime() - 1000) : null,
      })),
    )
    .returning();
  await narrow(
    staff.id,
    rows.map((row) => ({ capability: "inquiry.read", recordType: "inquiry", recordId: row.id })),
  );
  const today = await readToday(t.db, staff.session, now);
  expect(today.mine).toMatchObject({ status: "ready", total: 36, hasMore: true });
  expect(today.mine.rows).toHaveLength(30);
  expect(today.mine.rows[0]?.inquiry.id).toBe(rows[35]?.id);
  expect((await listInbox(t.db, staff.session, "mine")).rows[0]?.inquiry.id).toBe(rows[35]?.id);
});

it("O01 viewings require both Case and appointment grants and retain the confirmed slot for the receiver", async () => {
  const staff = await staffFixture(t.db);
  const host = await staffFixture(t.db);
  const readableCase = await createCase(t.db, host.id);
  const hiddenCase = await createCase(t.db, host.id);
  const now = new Date();
  const confirmedStartsAt = new Date(now.getTime() + 3600000);
  const confirmedEndsAt = new Date(now.getTime() + 5400000);
  const rows = await t.db
    .insert(schema.appointments)
    .values(
      [readableCase, readableCase, hiddenCase].map((caseId, index) => ({
        caseId,
        reference: `AP-O01-${randomUUID()}`,
        state: "reschedule_requested" as const,
        format: "in_person" as const,
        timezone: "Europe/Sofia",
        icsUid: randomUUID(),
        hostId: host.id,
        confirmedStartsAt,
        confirmedEndsAt,
        proposedStartsAt: new Date(now.getTime() + 7200000),
        proposedEndsAt: new Date(now.getTime() + 9000000),
        ...(index === 0
          ? {
              pendingHostId: staff.id,
              pendingHostVersion: 1,
              pendingHostNote: "Synthetic receiver must accept",
              pendingHostOfferedAt: now,
            }
          : {}),
      })),
    )
    .returning();
  await narrow(staff.id, [
    { capability: "case.read", recordType: "case", recordId: readableCase },
    ...[rows[0], rows[2]].flatMap((row) =>
      row
        ? [
            {
              capability: "appointment.manage" as const,
              recordType: "appointment",
              recordId: row.id,
            },
          ]
        : [],
    ),
  ]);
  const today = await readToday(t.db, staff.session, now);
  expect(today.viewings).toMatchObject({ status: "ready", total: 1, hasMore: false });
  expect(today.viewings.rows[0]).toMatchObject({
    id: rows[0]?.id,
    hostId: host.id,
    awaitingAcceptance: true,
    startsAt: confirmedStartsAt,
    endsAt: confirmedEndsAt,
    reason: "upcoming_viewing",
  });
  expect(today.viewings.rows[0]).not.toHaveProperty("accessNotes");
  await narrow(staff.id, [{ capability: "case.read", recordType: "case", recordId: readableCase }]);
  expect((await readToday(t.db, staff.session, now)).viewings.total).toBe(0);
});

it("O01 Continue includes owned Case work and editable listing drafts only within live read grants", async () => {
  const staff = await staffFixture(t.db);
  const other = await staffFixture(t.db);
  const caseId = await createCase(t.db, staff.id);
  const otherCase = await createCase(t.db, other.id);
  const allowed = await listing(staff.id);
  const hidden = await listing(staff.id);
  const theirs = await listing(other.id);
  await narrow(staff.id, [
    { capability: "case.read", recordType: "case", recordId: caseId },
    { capability: "case.read", recordType: "case", recordId: otherCase },
    { capability: "listing.read", recordType: "property", recordId: allowed.propertyId },
    { capability: "listing.edit", recordType: "property", recordId: allowed.propertyId },
    { capability: "listing.read", recordType: "listing", recordId: hidden.id },
    { capability: "listing.read", recordType: "listing", recordId: theirs.id },
    { capability: "listing.edit", recordType: "listing", recordId: theirs.id },
  ]);
  const today = await readToday(t.db, staff.session);
  expect(today.caseContinue.rows.map((row) => row.id)).toEqual([caseId]);
  expect(today.draftContinue.rows.map((row) => row.id)).toEqual([allowed.id]);
  expect(today.draftContinue.rows[0]).not.toHaveProperty("draft");
  await narrow(staff.id, []);
  const revoked = await readToday(t.db, staff.session);
  expect(revoked.caseContinue.total).toBe(0);
  expect(revoked.draftContinue.total).toBe(0);
});

it("O01 counts one listing action once: corrections are review work, a draft keeps its own check", async () => {
  const staff = await staffFixture(t.db);
  const changes = await listing(staff.id, "changes_requested");
  const facts = await listing(staff.id, "needs_facts");
  const draft = await listing(staff.id);
  // A new draft's availability is unconfirmed: confirming it is a task apart from editing it.
  const unconfirmed = await listing(staff.id);
  await t.db
    .update(schema.listings)
    .set({ commercialState: "confirmation_required" })
    .where(eq(schema.listings.id, unconfirmed.id));
  await narrow(
    staff.id,
    [changes, facts, draft, unconfirmed].flatMap((row) =>
      (["listing.read", "listing.edit"] as const).map((capability) => ({
        capability,
        recordType: "listing",
        recordId: row.id,
      })),
    ),
  );
  const today = await readToday(t.db, staff.session);
  expect(today.listingReviews).toMatchObject({ status: "ready", total: 3 });
  expect(today.listingReviews.rows.map((row) => row.id).sort()).toEqual(
    [changes.id, facts.id, unconfirmed.id].sort(),
  );
  expect(today.draftContinue).toMatchObject({ status: "ready", total: 2 });
  expect(today.draftContinue.rows.map((row) => row.id).sort()).toEqual(
    [draft.id, unconfirmed.id].sort(),
  );
});

it("O01 Continue protects private Case actions and deadline ordering under mixed internal grants", async () => {
  const staff = await staffFixture(t.db);
  const internal = await createCase(t.db, staff.id);
  const ordinary = await createCase(t.db, staff.id);
  const summarized = await createCase(t.db, staff.id);
  const paused = await createCase(t.db, staff.id);
  const now = new Date();
  const dueAt = new Date(now.getTime() - 1000);
  const reviewAt = new Date(now.getTime() + 1000);
  const publicDueAt = new Date(now.getTime() + 60000);
  for (const [index, id] of [internal, ordinary, summarized, paused].entries()) {
    await t.db
      .update(schema.cases)
      .set({
        nextAction: `Synthetic private next action ${index}`,
        nextActionDueAt: dueAt,
        waitingOn: `Synthetic private waiting dependency ${index}`,
        reviewAt,
        updatedAt: new Date(now.getTime() + index),
      })
      .where(eq(schema.cases.id, id));
  }
  await t.db
    .update(schema.cases)
    .set({
      clientSummary: "Synthetic shared next step",
      nextActionDueAt: publicDueAt,
      updatedAt: new Date(now.getTime() + 2),
    })
    .where(eq(schema.cases.id, summarized));
  await t.db
    .update(schema.cases)
    .set({
      disposition: "paused",
      dispositionReason: "Synthetic private pause reason",
      updatedAt: new Date(now.getTime() + 3),
    })
    .where(eq(schema.cases.id, paused));
  await narrow(staff.id, [
    { capability: "case.read" },
    { capability: "case.read_internal", recordType: "case", recordId: internal },
  ]);
  const before = (await readToday(t.db, staff.session, now)).caseContinue;
  expect(before).toMatchObject({ status: "ready", total: 4 });
  expect(before.rows.find((row) => row.id === internal)).toMatchObject({
    nextAction: "Synthetic private next action 0",
    nextActionDueAt: dueAt,
    waitingOn: "Synthetic private waiting dependency 0",
    reviewAt,
    dueAt,
  });
  for (const id of [ordinary, paused]) {
    expect(before.rows.find((row) => row.id === id)).toMatchObject({
      nextAction: null,
      nextActionDueAt: null,
      waitingOn: null,
      reviewAt: null,
      dueAt: null,
    });
  }
  expect(before.rows.find((row) => row.id === summarized)).toMatchObject({
    nextAction: "Synthetic shared next step",
    nextActionDueAt: publicDueAt,
    waitingOn: null,
    reviewAt: null,
    dueAt: publicDueAt,
  });
  // Private deadlines must not select, count or rank a read-only Case in the Today page.
  await t.db
    .update(schema.cases)
    .set({
      nextActionDueAt: new Date(now.getTime() - 3600000),
      reviewAt: new Date(now.getTime() - 7200000),
    })
    .where(eq(schema.cases.id, ordinary));
  const after = (await readToday(t.db, staff.session, now)).caseContinue;
  expect(after.total).toBe(before.total);
  expect(after.rows.map((row) => row.id)).toEqual(before.rows.map((row) => row.id));
  expect(after.rows.find((row) => row.id === ordinary)).toEqual(
    before.rows.find((row) => row.id === ordinary),
  );
});

it("O01 review counts honor reviewer records and locales and exclude superseded source translations", async () => {
  const staff = await staffFixture(t.db);
  const review = await listing(staff.id, "in_review");
  const correction = await listing(staff.id, "changes_requested");
  const hidden = await listing(staff.id, "in_review");
  const old = await revision(review, 1);
  const current = await revision(review, 2);
  await t.db
    .update(schema.listings)
    .set({ approvedRevisionId: current.id })
    .where(eq(schema.listings.id, review.id));
  const translations = await t.db
    .insert(schema.localizedRevisions)
    .values([
      { listingId: review.id, sourceRevisionId: old.id, locale: "ru", state: "reviewing" },
      { listingId: review.id, sourceRevisionId: current.id, locale: "ru", state: "reviewing" },
      { listingId: review.id, sourceRevisionId: current.id, locale: "en", state: "reviewing" },
    ])
    .returning();
  await narrow(staff.id, [
    { capability: "listing.read", recordType: "listing", recordId: review.id },
    { capability: "listing.review_facts", recordType: "listing", recordId: review.id },
    { capability: "listing.read", recordType: "listing", recordId: correction.id },
    { capability: "listing.edit", recordType: "listing", recordId: correction.id },
    { capability: "listing.review_facts", recordType: "listing", recordId: hidden.id },
    {
      capability: "translation.review",
      recordType: "property",
      recordId: review.propertyId,
      locales: ["ru"],
    },
  ]);
  const today = await readToday(t.db, staff.session);
  expect(today.listingReviews.total).toBe(2);
  expect(today.listingReviews.rows.map((row) => row.id).sort()).toEqual(
    [review.id, correction.id].sort(),
  );
  expect(today.translationReviews.total).toBe(1);
  expect(today.translationReviews.rows[0]).toMatchObject({
    id: translations[1]?.id,
    locale: "ru",
    sourceRevisionId: current.id,
  });
  expect(JSON.stringify([today.listingReviews, today.translationReviews])).not.toContain(
    "Synthetic unpublished",
  );
});

it("O01 translation reviews match the workbench when both read and review grants are locale scoped", async () => {
  const staff = await staffFixture(t.db);
  const candidate = await listing(staff.id, "in_review");
  const source = await revision(candidate, 1);
  await t.db
    .update(schema.listings)
    .set({ approvedRevisionId: source.id })
    .where(eq(schema.listings.id, candidate.id));
  const translations = await t.db
    .insert(schema.localizedRevisions)
    .values([
      { listingId: candidate.id, sourceRevisionId: source.id, locale: "ru", state: "reviewing" },
      { listingId: candidate.id, sourceRevisionId: source.id, locale: "en", state: "reviewing" },
    ])
    .returning();
  await narrow(staff.id, [
    { capability: "listing.read", recordType: "listing", recordId: candidate.id, locales: ["ru"] },
    {
      capability: "translation.review",
      recordType: "property",
      recordId: candidate.propertyId,
      locales: ["ru", "en"],
    },
  ]);
  expect(
    (await translationWorkbench(t.db, staff.actor, candidate.reference, "ru")).translation?.id,
  ).toBe(translations[0]?.id);
  await expect(
    translationWorkbench(t.db, staff.actor, candidate.reference, "en"),
  ).rejects.toMatchObject({ code: "forbidden" });
  const today = await readToday(t.db, staff.session);
  expect(today.translationReviews).toMatchObject({ status: "ready", total: 1, hasMore: false });
  expect(today.translationReviews.rows.map((row) => row.id)).toEqual([translations[0]?.id]);
  expect(today.listingReviews.total).toBe(0);
});

it("O01 delivery exceptions require the Case email read contract and exclude recipients and raw errors", async () => {
  const staff = await staffFixture(t.db);
  const readable = await createCase(t.db, staff.id);
  const hidden = await createCase(t.db, staff.id);
  const messages = await t.db
    .insert(schema.messages)
    .values(
      [readable, readable, hidden].map((caseId, index) => ({
        caseId,
        kind: "service_message" as const,
        direction: "outbound" as const,
        channel: "email" as const,
        audience: "case_participants" as const,
        state: index === 1 ? ("outcome_unknown" as const) : ("failed" as const),
        authorKind: "staff" as const,
        authorId: staff.id,
        body: "Synthetic private message body",
        subject: "Synthetic private subject",
        recipients: [{ address: "synthetic-private@example.test" }],
        payloadDigest: "synthetic",
        approvedDigest: "synthetic",
        logicalSendId: randomUUID(),
      })),
    )
    .returning();
  await narrow(staff.id, [
    { capability: "case.read", recordType: "case", recordId: readable },
    { capability: "message.draft", recordType: "case", recordId: readable },
    { capability: "message.draft", recordType: "case", recordId: hidden },
  ]);
  const today = await readToday(t.db, staff.session);
  expect(today.deliveryExceptions.total).toBe(2);
  expect(today.deliveryExceptions.rows.map((row) => row.id).sort()).toEqual(
    messages
      .slice(0, 2)
      .map((row) => row.id)
      .sort(),
  );
  expect(JSON.stringify(today.deliveryExceptions)).not.toContain("private");
  expect(today.operatorDeliveryExceptions).toBeNull();
  await narrow(staff.id, [{ capability: "case.read", recordType: "case", recordId: readable }]);
  expect((await readToday(t.db, staff.session)).deliveryExceptions.total).toBe(0);
});

it("O01 publication exceptions require readable listing and release scope, including unresolved older generations", async () => {
  const staff = await staffFixture(t.db);
  const allowed = await listing(staff.id);
  const source = await revision(allowed, 1);
  const [manifest] = await t.db
    .insert(schema.publicationManifests)
    .values({
      listingId: allowed.id,
      locale: "bg",
      destination: "website",
      generation: 0,
      listingRevisionId: source.id,
      factRevisionId: source.factRevisionId,
      media: [],
      disclosure: {},
      availabilityBasis: {},
      policyRevision: "synthetic",
      decisions: {},
      contentDigest: "synthetic",
      createdById: staff.id,
    })
    .returning();
  if (!manifest) throw new Error("Missing manifest");
  const [delivery] = await t.db
    .insert(schema.destinationDeliveries)
    .values({
      manifestId: manifest.id,
      listingId: allowed.id,
      locale: "bg",
      destination: "website",
      kind: "publish",
      generation: 0,
      state: "failed",
      errorCode: "Synthetic raw provider error must stay private",
    })
    .returning();
  await t.db
    .update(schema.listings)
    .set({ publicationGeneration: 1 })
    .where(eq(schema.listings.id, allowed.id));
  await narrow(staff.id, [
    { capability: "publication.release", recordType: "listing", recordId: allowed.id },
  ]);
  expect((await readToday(t.db, staff.session)).publicationExceptions.total).toBe(0);
  await narrow(staff.id, [
    { capability: "publication.release", recordType: "listing", recordId: allowed.id },
    { capability: "listing.read", recordType: "property", recordId: allowed.propertyId },
  ]);
  const today = await readToday(t.db, staff.session);
  expect(today.publicationExceptions).toMatchObject({ status: "ready", total: 1 });
  expect(today.publicationExceptions.rows[0]).toMatchObject({
    id: delivery?.id,
    generation: 0,
    currentGeneration: 1,
  });
  expect(today.publicationExceptions.rows[0]).not.toHaveProperty("errorCode");
});

it("O01 exposes operations exceptions and stale worker proof only to a global report reader", async () => {
  const staff = await staffFixture(t.db);
  await t.db.insert(schema.externalActions).values({
    kind: "email_send",
    effectKey: randomUUID(),
    payload: { recipient: "synthetic-private@example.test", private: "private payload" },
    payloadDigest: "synthetic",
    state: "outcome_unknown",
    attempts: 1,
    lastErrorCode: "raw private provider error",
  });
  const build = process.env.BUILD_SHA;
  process.env.BUILD_SHA = "synthetic-o01-build";
  try {
    await t.db.insert(schema.workerProgress).values({
      key: "queue-worker",
      buildSha: "synthetic-o01-build",
      completedAt: new Date(Date.now() - 3600000),
    });
    await narrow(staff.id, [
      { capability: "report.read", recordType: "case", recordId: randomUUID() },
    ]);
    const limited = await readToday(t.db, staff.session);
    expect(limited.operatorDeliveryExceptions).toBeNull();
    expect(limited.worker).toBeNull();
    await narrow(staff.id, [{ capability: "report.read" }]);
    const today = await readToday(t.db, staff.session);
    expect(today.operatorDeliveryExceptions).toMatchObject({ status: "ready", total: 1 });
    expect(JSON.stringify(today.operatorDeliveryExceptions)).not.toContain("private");
    expect(today.worker).toMatchObject({ state: "stale", reason: "progress_expired" });
    expect(today.scope.state).toBe("unknown");
    expect(today.staffedSla.state).toBe("unknown");
  } finally {
    if (build === undefined) delete process.env.BUILD_SHA;
    else process.env.BUILD_SHA = build;
  }
});

it("O01 keeps unaffected queues usable on real PostgreSQL group failures with unknown totals", async () => {
  const staff = await staffFixture(t.db);
  const [task] = await t.db
    .insert(schema.tasks)
    .values({
      title: "Synthetic commitment survives another queue outage",
      ownerId: staff.id,
      dueAt: new Date(Date.now() - 1000),
    })
    .returning();
  if (!task) throw new Error("Missing task");
  await narrow(staff.id, [
    { capability: "task.manage", recordType: "task", recordId: task.id },
    { capability: "report.read" },
  ]);
  await t.sql.unsafe("alter table appointments rename to unavailable_o01_appointments");
  await t.sql.unsafe("alter table external_actions rename to unavailable_o01_external_actions");
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    const today = await readToday(t.db, staff.session);
    expect(today.viewings).toMatchObject({ status: "unavailable", total: null });
    expect(today.operatorDeliveryExceptions).toMatchObject({ status: "unavailable", total: null });
    expect(today.due).toMatchObject({ status: "ready", total: 1 });
    expect(today.due.rows[0]?.task.id).toBe(task.id);
    expect(today.caseContinue).toMatchObject({ status: "ready", total: 0 });
    expect(JSON.stringify(today)).not.toContain("unavailable_o01");
    const logged = log.mock.calls.map(([message]) => String(message)).join("\n");
    expect(logged).toContain("[today] viewings unavailable (internal_error)");
    expect(logged).toContain("[today] operatorDeliveryExceptions unavailable (internal_error)");
    expect(logged).not.toContain("unavailable_o01");
  } finally {
    log.mockRestore();
    await t.sql.unsafe("alter table unavailable_o01_appointments rename to appointments");
    await t.sql.unsafe("alter table unavailable_o01_external_actions rename to external_actions");
  }
});
