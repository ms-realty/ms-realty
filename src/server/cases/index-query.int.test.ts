import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  briefRevisions,
  caseParticipants,
  cases,
  grants,
  parties,
  passkeys,
  sessions,
  staffMemberships,
  tasks,
} from "@/db/schema";
import { createTestDatabase, type TestDatabase } from "@/db/test-utils";
import { createSession } from "../auth/sessions";
import { createClient, createStaff, type GrantSpec } from "../testing";
import { type CaseIndexPage, queryCaseIndex } from "./queries";

let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => {
  await t?.drop();
});

const past = () => new Date(Date.now() - 60_000);
const future = () => new Date(Date.now() + 3_600_000);
async function reader(specs: GrantSpec[] = []) {
  const person = await createStaff(t.db, { grants: specs });
  await t.db.insert(passkeys).values(
    [0, 1].map(() => ({
      principalId: person.id,
      credentialId: randomUUID(),
      publicKey: Buffer.from([1]),
      deviceType: "singleDevice",
      backedUp: false,
    })),
  );
  return { ...person, ...(await createSession(t.db, { kind: "staff", id: person.id })) };
}
type Reader = Awaited<ReturnType<typeof reader>>;
async function addCase(
  staff: Reader,
  patch: Partial<typeof cases.$inferInsert> = {},
  access: "internal" | "read" | "none" = "internal",
) {
  const [row] = await t.db
    .insert(cases)
    .values({
      reference: `CS-SYN-${randomUUID()}`,
      kind: "buyer",
      stage: "needs_agreed",
      title: "Synthetic purchase purpose",
      ownerId: staff.id,
      nextAction: "Agree the next step",
      ...patch,
    })
    .returning();
  if (!row) throw new Error("Case fixture insert failed");
  if (access !== "none")
    await t.db.insert(grants).values(
      (access === "internal" ? ["case.read", "case.read_internal"] : ["case.read"]).map(
        (capability) => ({
          principalId: staff.id,
          capability: capability as "case.read" | "case.read_internal",
          recordType: "case",
          recordId: row.id,
          reason: "O04 synthetic fixture",
        }),
      ),
    );
  return row;
}
async function participant(
  caseId: string,
  name: string,
  relationship: Partial<typeof caseParticipants.$inferInsert> = {},
  party: Partial<typeof parties.$inferInsert> = {},
) {
  const [person] = await t.db
    .insert(parties)
    .values({ kind: "person", displayName: name, ...party })
    .returning();
  if (!person) throw new Error("Party fixture insert failed");
  await t.db.insert(caseParticipants).values({
    caseId,
    partyId: person.id,
    role: "buyer",
    ...relationship,
  });
  return person;
}
async function brief(caseId: string, staff: Reader, revision: number, items: unknown) {
  await t.db.insert(briefRevisions).values({
    caseId,
    revisionNumber: revision,
    items,
    authorKind: "staff",
    authorId: staff.id,
  });
}
const ids = (page: CaseIndexPage) => page.rows.map((row) => row.id);

describe("O04 authorized Case index", () => {
  it("returns truthful first-use and filtered empty collections; requires a live staff context", async () => {
    const staff = await reader();
    for (const collection of ["all", "mine", "needs"] as const)
      expect(await queryCaseIndex(t.db, staff.session, { collection })).toEqual({
        rows: [],
        total: 0,
        nextCursor: null,
      });
    const record = await addCase(staff);
    expect(await queryCaseIndex(t.db, staff.session, { purpose: "No such purpose" })).toEqual({
      rows: [],
      total: 0,
      nextCursor: null,
    });
    expect(ids(await queryCaseIndex(t.db, staff.session))).toEqual([record.id]);
    const client = await createClient(t.db);
    const issued = await createSession(t.db, { kind: "client", id: client.id });
    await expect(queryCaseIndex(t.db, issued.session)).rejects.toMatchObject({ code: "not_found" });
    await t.db
      .update(passkeys)
      .set({ revokedAt: new Date() })
      .where(eq(passkeys.principalId, staff.id));
    await expect(queryCaseIndex(t.db, staff.session)).rejects.toMatchObject({ code: "forbidden" });
  });

  it("projects and searches only live, unmerged Party relationships of visible Cases", async () => {
    const staff = await reader();
    const record = await addCase(staff, { nextActionDueAt: future() });
    const alpha = await participant(
      record.id,
      "Synthetic Alpha",
      {},
      { matchingAliases: ["Hidden alias"] },
    );
    await participant(record.id, "Synthetic Zulu");
    // Duplicate roles do not duplicate a Party label.
    await t.db
      .insert(caseParticipants)
      .values({ caseId: record.id, partyId: alpha.id, role: "co_buyer" });
    const revoked = await participant(record.id, "Revoked label", { revokedAt: past() });
    const expired = await participant(record.id, "Expired label", { expiresAt: past() });
    const futureParty = await participant(record.id, "Future label", { validFrom: future() });
    const merged = await participant(
      record.id,
      "Merged label",
      {},
      { mergedIntoPartyId: alpha.id },
    );
    const hidden = await addCase(staff, {}, "none");
    const hiddenParty = await participant(hidden.id, "Inaccessible label");
    const page = await queryCaseIndex(t.db, staff.session);
    expect(page.total).toBe(1);
    expect(page.rows[0]).toMatchObject({
      id: record.id,
      partyLabel: "Synthetic Alpha, Synthetic Zulu",
      ownerId: staff.id,
      ownerName: "Test Staff",
      needsCoverage: false,
      nextAction: record.nextAction,
      dueAt: record.nextActionDueAt,
      nextActionState: "scheduled",
      waitingOn: null,
      reviewAt: null,
    });
    expect(ids(await queryCaseIndex(t.db, staff.session, { search: "Synthetic Alpha" }))).toEqual([
      record.id,
    ]);
    expect(ids(await queryCaseIndex(t.db, staff.session, { partyId: alpha.id }))).toEqual([
      record.id,
    ]);
    for (const person of [revoked, expired, futureParty, merged, hiddenParty]) {
      expect((await queryCaseIndex(t.db, staff.session, { partyId: person.id })).total).toBe(0);
      expect(
        (await queryCaseIndex(t.db, staff.session, { search: person.displayName })).total,
      ).toBe(0);
    }
    expect((await queryCaseIndex(t.db, staff.session, { search: "Hidden alias" })).total).toBe(0);
    expect(JSON.stringify(page)).not.toContain("partyId");
  });

  it("applies purpose, Party, type, stage, disposition, confirmed owner and safe next-action filters", async () => {
    const staff = await reader();
    const other = await createStaff(t.db);
    const purchase = await addCase(staff, {
      title: "Buy %_\\ refuge",
      nextAction: "Review budget",
      nextActionDueAt: future(),
    });
    const alpha = await participant(purchase.id, "Synthetic Alpha");
    const letting = await addCase(staff, {
      title: "Rent loft",
      kind: "tenant",
      stage: "evaluating",
      ownerId: other.id,
      pendingOwnerId: staff.id,
      nextAction: "Arrange viewing",
    });
    await participant(letting.id, "Synthetic Beta");
    const paused = await addCase(staff, {
      title: "Sell villa",
      kind: "seller",
      stage: "assessment",
      disposition: "paused",
      ownerId: null,
      dispositionReason: "Awaiting authority",
      waitingOn: "Synthetic authority check",
      reviewAt: future(),
    });
    const service = await addCase(staff, {
      kind: "service_intake",
      serviceTopic: "management_consultation",
      stage: "consultation",
      title: "Management consultation",
      nextActionDueAt: future(),
    });
    const queries = [
      [{ purpose: "%_\\" }, purchase.id],
      [{ party: " alpha " }, purchase.id],
      [{ partyId: alpha.id }, purchase.id],
      [{ kind: "tenant" }, letting.id],
      [{ stage: "evaluating" }, letting.id],
      [{ disposition: "paused" }, paused.id],
      [{ ownerId: other.id }, letting.id],
      [{ ownerId: "unassigned" }, paused.id],
      [{ nextAction: "arrange" }, letting.id],
      [{ nextActionState: "unscheduled" }, letting.id],
      [{ nextActionState: "waiting" }, paused.id],
      [{ kind: "service_intake", stage: "consultation" }, service.id],
      [{ search: purchase.reference }, purchase.id],
    ] as const;
    for (const [query, id] of queries) {
      const page = await queryCaseIndex(t.db, staff.session, query);
      expect({ ids: ids(page), total: page.total }, JSON.stringify(query)).toEqual({
        ids: [id],
        total: 1,
      });
    }
    expect(
      ids(
        await queryCaseIndex(t.db, staff.session, {
          purpose: "refuge",
          party: "alpha",
          kind: "buyer",
          stage: "needs_agreed",
          disposition: "active",
          ownerId: staff.id,
          nextAction: "budget",
          nextActionState: "scheduled",
        }),
      ),
    ).toEqual([purchase.id]);
    expect(new Set(ids(await queryCaseIndex(t.db, staff.session, { collection: "mine" })))).toEqual(
      new Set([purchase.id, service.id]),
    );
    expect(
      (await queryCaseIndex(t.db, staff.session, { collection: "mine", ownerId: other.id })).total,
    ).toBe(0);
    expect((await queryCaseIndex(t.db, staff.session, { purpose: "Buy X refuge" })).total).toBe(0);
    expect(
      (
        await queryCaseIndex(t.db, staff.session, { nextAction: paused.nextAction ?? "" })
      ).rows.some((row) => row.id === paused.id),
    ).toBe(false);
  });

  it("counts visibility before ordering and limit, and pages precise timestamp/UUID ties deterministically", async () => {
    const staff = await reader();
    const records = await Promise.all(Array.from({ length: 5 }, () => addCase(staff)));
    const [clock] =
      await t.sql`select to_char(date_trunc('milliseconds', statement_timestamp()) at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as tick`;
    const tick = String(clock?.tick);
    for (const [index, record] of records.entries())
      await t.db
        .update(cases)
        .set({
          updatedAt: sql`${tick}::timestamptz + ${index < 3 ? 999 : 1001 - index} * interval '1 microsecond'`,
        })
        .where(eq(cases.id, record.id));
    await t.db.insert(cases).values(
      Array.from({ length: 80 }, () => ({
        reference: `CS-HIDDEN-${randomUUID()}`,
        kind: "buyer" as const,
        stage: "needs_agreed",
        title: "Hidden newer Case",
        ownerId: staff.id,
        nextAction: "Private action",
        updatedAt: future(),
      })),
    );
    const expected = [
      ...records
        .slice(0, 3)
        .map((r) => r.id)
        .sort(),
      records[3]?.id,
      records[4]?.id,
    ];
    const first = await queryCaseIndex(t.db, staff.session, { pageSize: 2 });
    expect(first.total).toBe(5);
    expect(ids(first)).toEqual(expected.slice(0, 2));
    expect(first.nextCursor).toBeTruthy();
    const decoded = JSON.parse(Buffer.from(first.nextCursor ?? "", "base64url").toString());
    expect(decoded.sortAt).toMatch(/\.\d{6}Z$/u);
    const second = await queryCaseIndex(t.db, staff.session, {
      pageSize: 2,
      cursor: first.nextCursor ?? undefined,
    });
    expect(second.total).toBe(5);
    expect(ids(second)).toEqual(expected.slice(2, 4));
    const third = await queryCaseIndex(t.db, staff.session, {
      pageSize: 2,
      cursor: second.nextCursor ?? undefined,
    });
    expect(third.total).toBe(5);
    expect(ids(third)).toEqual(expected.slice(4));
    expect(third.nextCursor).toBeNull();
    expect(new Set([...ids(first), ...ids(second), ...ids(third)]).size).toBe(5);
    expect(ids(await queryCaseIndex(t.db, staff.session, { pageSize: 2 }))).toEqual(ids(first));
    const needs = await queryCaseIndex(t.db, staff.session, { collection: "needs", pageSize: 2 });
    expect(needs.total).toBe(5);
    expect(ids(needs)).toEqual(ids(first));
  });

  it("uses only explicit latest Brief unknowns and own due or unscheduled work for Needs", async () => {
    const staff = await reader();
    const scheduled = await addCase(staff, { nextActionDueAt: future() });
    const unscheduled = await addCase(staff);
    const due = await addCase(staff, { nextActionDueAt: past() });
    const waiting = await addCase(staff, {
      nextAction: null,
      waitingOn: "Awaiting response",
      reviewAt: past(),
    });
    const waitingFuture = await addCase(staff, {
      nextAction: null,
      waitingOn: "Awaiting response",
      reviewAt: future(),
    });
    const actionAndWaiting = await addCase(staff, {
      nextActionDueAt: future(),
      waitingOn: "A review is also due",
      reviewAt: past(),
    });
    const paused = await addCase(staff, {
      disposition: "paused",
      dispositionReason: "Pause reason",
      waitingOn: "Review dependency",
      reviewAt: past(),
    });
    const pausedFuture = await addCase(staff, {
      disposition: "paused",
      dispositionReason: "Pause reason",
      waitingOn: "Review dependency",
      reviewAt: future(),
    });
    const closed = await addCase(staff, {
      disposition: "closed",
      closureOutcome: "Completed",
      commitmentDispositions: {},
      nextActionDueAt: past(),
      waitingOn: "Historic wait",
      reviewAt: past(),
    });
    const unknown = await addCase(staff, { nextActionDueAt: future() });
    const resolved = await addCase(staff, { nextActionDueAt: future() });
    const malformed = await addCase(staff, { nextActionDueAt: future() });
    const unknownItem = [
      { kind: "unknown", origin: "client_stated", text: "Synthetic unresolved requirement" },
    ];
    await brief(unknown.id, staff, 1, [{ kind: "preference", text: "Known preference" }]);
    await brief(unknown.id, staff, 2, unknownItem);
    await t.db
      .update(briefRevisions)
      .set({ clientAcknowledgedAt: past(), brokerAcknowledgedAt: past() })
      .where(eq(briefRevisions.caseId, unknown.id));
    await brief(resolved.id, staff, 1, unknownItem);
    await brief(resolved.id, staff, 2, [{ kind: "hard_constraint", text: "Known requirement" }]);
    await brief(malformed.id, staff, 1, { kind: "unknown" });
    await brief(pausedFuture.id, staff, 1, unknownItem);
    await brief(closed.id, staff, 1, unknownItem);
    await t.db.insert(tasks).values({
      caseId: scheduled.id,
      title: "Inaccessible overdue task",
      ownerId: staff.id,
      dueAt: past(),
      state: "open",
    });
    // Availability is not an invented urgency predicate.
    await t.db
      .update(staffMemberships)
      .set({ absenceFrom: past(), absenceReviewAt: future() })
      .where(eq(staffMemberships.principalId, staff.id));
    const page = await queryCaseIndex(t.db, staff.session, { collection: "needs" });
    expect(page.total).toBe(6);
    expect(new Set(ids(page))).toEqual(
      new Set([unscheduled.id, due.id, waiting.id, actionAndWaiting.id, paused.id, unknown.id]),
    );
    expect(page.rows.find((row) => row.id === unscheduled.id)?.needsReasons).toEqual([
      "next_action_unscheduled",
    ]);
    expect(page.rows.find((row) => row.id === due.id)?.needsReasons).toEqual(["next_action_due"]);
    expect(page.rows.find((row) => row.id === waiting.id)?.needsReasons).toEqual([
      "waiting_review_due",
    ]);
    expect(page.rows.find((row) => row.id === actionAndWaiting.id)?.needsReasons).toEqual([
      "waiting_review_due",
    ]);
    expect(page.rows.find((row) => row.id === paused.id)?.needsReasons).toEqual([
      "paused_review_due",
    ]);
    expect(page.rows.find((row) => row.id === unknown.id)?.needsReasons).toEqual([
      "requirements_unknown",
    ]);
    for (const record of [scheduled, waitingFuture, pausedFuture, closed, resolved, malformed])
      expect(ids(page)).not.toContain(record.id);
    expect(JSON.stringify(page)).not.toContain("Inaccessible overdue task");
    expect(
      (await queryCaseIndex(t.db, staff.session, { collection: "needs", disposition: "closed" }))
        .total,
    ).toBe(0);
    const closedView = await queryCaseIndex(t.db, staff.session, { disposition: "closed" });
    expect(closedView.rows[0]).toMatchObject({
      nextAction: null,
      dueAt: null,
      waitingOn: null,
      reviewAt: null,
      nextActionState: "none",
    });
    const utc = await t.db.transaction(async (tx) => {
      await tx.execute(sql`set local time zone '+09:00'`);
      return queryCaseIndex(tx, staff.session, { collection: "needs" });
    });
    expect(new Set(ids(utc))).toEqual(new Set(ids(page)));
  });

  it("keeps mixed-grant ordering and cursors stable across private edits to basic-read Cases", async () => {
    const staff = await reader();
    const instant = Date.now();
    const internal = await addCase(staff, {
      createdAt: new Date(instant - 6_000),
      updatedAt: new Date(instant - 1_000),
    });
    const basicAnchor = await addCase(
      staff,
      {
        createdAt: new Date(instant - 2_000),
        updatedAt: new Date(instant - 10_000),
      },
      "read",
    );
    const basicTail = await addCase(
      staff,
      {
        createdAt: new Date(instant - 3_000),
        updatedAt: new Date(instant + 10_000),
      },
      "read",
    );
    const first = await queryCaseIndex(t.db, staff.session, { pageSize: 1 });
    expect(ids(first)).toEqual([internal.id]);
    expect(first.rows[0]).toMatchObject({
      createdAt: internal.createdAt,
      updatedAt: internal.updatedAt,
    });
    const second = await queryCaseIndex(t.db, staff.session, {
      pageSize: 1,
      cursor: first.nextCursor ?? undefined,
    });
    expect(ids(second)).toEqual([basicAnchor.id]);
    expect(second.rows[0]?.createdAt).toEqual(basicAnchor.createdAt);
    expect(second.rows[0]).not.toHaveProperty("updatedAt");
    const basicCursor = JSON.parse(Buffer.from(second.nextCursor ?? "", "base64url").toString());
    expect(new Date(basicCursor.sortAt)).toEqual(basicAnchor.createdAt);
    expect(basicCursor).not.toHaveProperty("updatedAt");
    for (const record of [basicAnchor, basicTail])
      await t.db
        .update(cases)
        .set({
          nextAction: "Changed private action",
          waitingOn: "Changed private dependency",
          reviewAt: future(),
          updatedAt: new Date(instant + 3_600_000),
        })
        .where(eq(cases.id, record.id));
    const afterFirst = await queryCaseIndex(t.db, staff.session, { pageSize: 1 });
    expect(ids(afterFirst)).toEqual(ids(first));
    expect(afterFirst.nextCursor).toBe(first.nextCursor);
    const afterSecond = await queryCaseIndex(t.db, staff.session, {
      pageSize: 1,
      cursor: first.nextCursor ?? undefined,
    });
    expect(ids(afterSecond)).toEqual(ids(second));
    expect(afterSecond.nextCursor).toBe(second.nextCursor);
    const tail = await queryCaseIndex(t.db, staff.session, {
      pageSize: 1,
      cursor: second.nextCursor ?? undefined,
    });
    expect(ids(tail)).toEqual([basicTail.id]);
    expect(tail.total).toBe(3);
    expect(tail.nextCursor).toBeNull();
    expect(tail.rows[0]).not.toHaveProperty("updatedAt");
    expect(JSON.stringify([...afterSecond.rows, ...tail.rows])).not.toContain("Changed private");
    // Internal readers still see and sort by edits on the Case their grant reaches.
    await t.db
      .update(cases)
      .set({ updatedAt: new Date(instant - 4_000) })
      .where(eq(cases.id, internal.id));
    const reordered = await queryCaseIndex(t.db, staff.session);
    expect(ids(reordered)).toEqual([basicAnchor.id, basicTail.id, internal.id]);
    expect(reordered.rows[2]?.updatedAt).toEqual(new Date(instant - 4_000));
    await t.db
      .update(grants)
      .set({ revokedAt: new Date() })
      .where(and(eq(grants.principalId, staff.id), eq(grants.capability, "case.read_internal")));
    expect(
      (await queryCaseIndex(t.db, staff.session)).rows.every((row) => !("updatedAt" in row)),
    ).toBe(true);
  });

  it("uses precise immutable creation keys for basic readers across ties and private anchor edits", async () => {
    const staff = await reader();
    const records = await Promise.all(Array.from({ length: 5 }, () => addCase(staff, {}, "read")));
    const [clock] =
      await t.sql`select to_char(date_trunc('milliseconds', statement_timestamp()) at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as tick`;
    const tick = String(clock?.tick);
    for (const [index, record] of records.entries())
      await t.db
        .update(cases)
        .set({
          createdAt: sql`${tick}::timestamptz + ${index < 3 ? 999 : 1001 - index} * interval '1 microsecond'`,
          updatedAt: sql`${tick}::timestamptz + ${index} * interval '1 day'`,
        })
        .where(eq(cases.id, record.id));
    const expected = [
      ...records
        .slice(0, 3)
        .map((row) => row.id)
        .sort(),
      records[3]?.id,
      records[4]?.id,
    ];
    const first = await queryCaseIndex(t.db, staff.session, { pageSize: 2 });
    expect(ids(first)).toEqual(expected.slice(0, 2));
    const decoded = JSON.parse(Buffer.from(first.nextCursor ?? "", "base64url").toString());
    expect(decoded.sortAt).toMatch(/\.\d{3}999Z$/u);
    const second = await queryCaseIndex(t.db, staff.session, {
      pageSize: 2,
      cursor: first.nextCursor ?? undefined,
    });
    expect(ids(second)).toEqual(expected.slice(2, 4));
    await t.db
      .update(cases)
      .set({ updatedAt: future(), nextAction: "Private anchor edit" })
      .where(eq(cases.id, expected[3] ?? ""));
    const third = await queryCaseIndex(t.db, staff.session, {
      pageSize: 2,
      cursor: second.nextCursor ?? undefined,
    });
    expect(ids(third)).toEqual(expected.slice(4));
    expect(third.nextCursor).toBeNull();
    const combined = [...first.rows, ...second.rows, ...third.rows];
    expect(new Set(combined.map((row) => row.id)).size).toBe(5);
    expect(combined.every((row) => !("updatedAt" in row))).toBe(true);
    expect([first.total, second.total, third.total]).toEqual([5, 5, 5]);
    const afterEdit = await queryCaseIndex(t.db, staff.session, { pageSize: 2 });
    expect(ids(afterEdit)).toEqual(ids(first));
    expect(afterEdit.nextCursor).toBe(first.nextCursor);
  });

  it("omits restricted work and applies the same authorization to filters and Needs membership", async () => {
    const staff = await reader();
    const visible = await addCase(staff, {
      nextAction: "Private visible step",
      nextActionDueAt: past(),
    });
    const privateAction = await addCase(
      staff,
      { nextAction: "Secret action needle", nextActionDueAt: past() },
      "read",
    );
    const privateWaiting = await addCase(
      staff,
      { nextAction: null, waitingOn: "Secret waiting needle", reviewAt: past() },
      "read",
    );
    const privatePause = await addCase(
      staff,
      {
        disposition: "paused",
        dispositionReason: "Secret reason",
        waitingOn: "Secret pause needle",
        reviewAt: past(),
      },
      "read",
    );
    const summary = await addCase(
      staff,
      {
        nextAction: "Secret summary source",
        nextActionDueAt: past(),
        clientSummary: "Approved next step",
      },
      "read",
    );
    const unknown = await addCase(
      staff,
      { nextAction: "Secret unknown source", nextActionDueAt: future() },
      "read",
    );
    await brief(unknown.id, staff, 1, [
      { kind: "unknown", text: "A readable unresolved requirement" },
    ]);
    const page = await queryCaseIndex(t.db, staff.session);
    expect(page.total).toBe(6);
    for (const record of [privateAction, privateWaiting, privatePause, unknown]) {
      const row = page.rows.find((candidate) => candidate.id === record.id);
      expect(row?.nextActionState).toBe("restricted");
      for (const field of ["nextAction", "dueAt", "waitingOn", "reviewAt", "updatedAt", "version"])
        expect(row).not.toHaveProperty(field);
    }
    expect(page.rows.find((row) => row.id === summary.id)).toMatchObject({
      nextAction: "Approved next step",
      dueAt: summary.nextActionDueAt,
      nextActionState: "due",
      needsReasons: [],
    });
    expect(page.rows.find((row) => row.id === summary.id)).not.toHaveProperty("reviewAt");
    expect(JSON.stringify(page)).not.toContain("Secret");
    expect((await queryCaseIndex(t.db, staff.session, { nextAction: "Secret" })).total).toBe(0);
    expect(
      (await queryCaseIndex(t.db, staff.session, { nextActionState: "review_due" })).total,
    ).toBe(0);
    expect((await queryCaseIndex(t.db, staff.session, { nextAction: "Approved" })).total).toBe(1);
    const needs = await queryCaseIndex(t.db, staff.session, { collection: "needs" });
    expect(new Set(ids(needs))).toEqual(new Set([visible.id, unknown.id]));
    await t.db
      .update(grants)
      .set({ revokedAt: new Date() })
      .where(and(eq(grants.principalId, staff.id), eq(grants.capability, "case.read_internal")));
    const afterRevocation = await queryCaseIndex(t.db, staff.session, { collection: "needs" });
    expect(ids(afterRevocation)).toEqual([unknown.id]);
    expect(afterRevocation.total).toBe(1);
  });

  it("rechecks revoked and expired Case grants, invalid scopes and revoked sessions on every page", async () => {
    const staff = await reader();
    const first = await addCase(staff);
    const second = await addCase(staff);
    const hidden = await addCase(staff, {}, "none");
    await t.db.insert(grants).values([
      {
        principalId: staff.id,
        capability: "case.read",
        recordType: "case",
        recordId: hidden.id,
        expiresAt: past(),
        reason: "Expired",
      },
      {
        principalId: staff.id,
        capability: "case.read",
        recordType: "case",
        locales: ["bg"],
        reason: "Locale cannot scope a Case",
      },
      {
        principalId: staff.id,
        capability: "case.read",
        recordType: "property",
        recordId: hidden.id,
        reason: "Property is not a Case scope",
      },
    ]);
    const page = await queryCaseIndex(t.db, staff.session, { pageSize: 1 });
    expect(page.total).toBe(2);
    expect(page.nextCursor).toBeTruthy();
    await t.db
      .update(grants)
      .set({ revokedAt: new Date() })
      .where(and(eq(grants.principalId, staff.id), eq(grants.capability, "case.read")));
    expect(
      await queryCaseIndex(t.db, staff.session, {
        pageSize: 1,
        cursor: page.nextCursor ?? undefined,
      }),
    ).toEqual({ rows: [], total: 0, nextCursor: null });
    expect(new Set([first.id, second.id])).toContain(page.rows[0]?.id);
    await t.db
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(eq(sessions.id, staff.session.id));
    await expect(queryCaseIndex(t.db, staff.session)).rejects.toMatchObject({
      code: "unauthenticated",
    });
  });

  it("bounds untrusted queries, keeps control searches empty and binds cursors to reader and filters", async () => {
    const staff = await reader();
    await addCase(staff);
    await addCase(staff);
    for (const text of ["\u0000", "\t", "\n", "\u007f", "\u0085"])
      expect(await queryCaseIndex(t.db, staff.session, { search: text })).toEqual({
        rows: [],
        total: 0,
        nextCursor: null,
      });
    await expect(
      queryCaseIndex(t.db, staff.session, { search: "x".repeat(121) }),
    ).rejects.toMatchObject({ code: "validation_failed" });
    for (const text of ["\u0000", "\t", "\n", "\u007f", "\u0085", `ok${"x".repeat(121)}`])
      for (const field of ["purpose", "party", "nextAction"])
        await expect(queryCaseIndex(t.db, staff.session, { [field]: text })).rejects.toMatchObject({
          code: "validation_failed",
        });
    for (const input of [
      { pageSize: 0 },
      { pageSize: 51 },
      { pageSize: 1.5 },
      { ownerId: "invalid" },
      { stage: "fictional" },
      { cursor: "bad" },
      { cursor: "x".repeat(1025) },
    ])
      await expect(queryCaseIndex(t.db, staff.session, input as never)).rejects.toMatchObject({
        code: "validation_failed",
      });
    const first = await queryCaseIndex(t.db, staff.session, { pageSize: 1 });
    const cursor = first.nextCursor ?? "";
    await expect(
      queryCaseIndex(t.db, staff.session, { collection: "mine", cursor }),
    ).rejects.toMatchObject({ code: "validation_failed" });
    await expect(
      queryCaseIndex(t.db, staff.session, { search: "changed", cursor }),
    ).rejects.toMatchObject({ code: "validation_failed" });
    const other = await reader();
    await expect(queryCaseIndex(t.db, other.session, { cursor })).rejects.toMatchObject({
      code: "validation_failed",
    });
    expect((await queryCaseIndex(t.db, staff.session, { pageSize: 50, cursor })).total).toBe(2);
  });
});
