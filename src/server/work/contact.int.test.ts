import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  activityEvents,
  contactMethods,
  grants,
  inquiries,
  operations,
  passkeys,
  sessions,
  staffMemberships,
  tasks,
} from "@/db/schema";
import { createTestDatabase, type TestDatabase } from "@/db/test-utils";
import { createSession } from "../auth/sessions";
import { issueSubmissionKey, newReceiptSession, submitInquiry } from "../inquiries/intake";
import { createStaff } from "../testing";
import { acceptInquiry, readWorkOperation } from "./commands";
import { recordInquiryContact } from "./contact";
import { readInquiry } from "./queries";

let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => {
  await t?.drop();
});

async function fixture() {
  const person = await createStaff(t.db, { roles: ["assigned_broker"] });
  await t.db.insert(passkeys).values(
    [0, 1].map(() => ({
      principalId: person.id,
      credentialId: randomUUID(),
      publicKey: Buffer.from([1]),
      deviceType: "singleDevice",
      backedUp: false,
    })),
  );
  const { session } = await createSession(t.db, { kind: "staff", id: person.id });
  const submissionKey = issueSubmissionKey();
  await submitInquiry(
    t.db,
    {
      submissionKey,
      purpose: "question",
      locale: "bg",
      name: "Synthetic contact visitor",
      contact: { kind: "email", value: `${randomUUID()}@example.test` },
      message: "Please explain the next steps for this inquiry.",
      privacyNotice: true,
    },
    {
      ip: `2001:db8::${Math.floor(Math.random() * 65535).toString(16)}`,
      receiptSession: newReceiptSession(),
    },
  );
  const [received] = await t.db
    .select()
    .from(inquiries)
    .where(eq(inquiries.submissionKey, submissionKey));
  if (!received?.contactMethodId) throw new Error("Inquiry fixture missing");
  // A contact already happened; its actual observation time must follow original receipt.
  await t.db
    .update(inquiries)
    .set({ createdAt: new Date(Date.now() - 300000) })
    .where(eq(inquiries.id, received.id));
  const accepted = await acceptInquiry(t.db, session, {
    id: received.id,
    expectedVersion: 1,
    operationId: randomUUID(),
    nextAction: "Original internal follow-up",
    dueAt: new Date(Date.now() + 3600000).toISOString(),
  });
  const [method] = await t.db
    .select()
    .from(contactMethods)
    .where(eq(contactMethods.id, received.contactMethodId));
  if (!method) throw new Error("Contact fixture missing");
  const input = {
    id: received.id,
    expectedVersion: accepted.outcome.version,
    operationId: randomUUID(),
    contactMethodId: method.id,
    expectedContactVersion: method.version,
    result: "unanswered" as const,
    contactedAt: new Date(Date.now() - 60000).toISOString(),
    note: "Attempted contact; the client did not receive a substantive response.",
    nextAction: "Follow up on the original question",
    dueAt: new Date(Date.now() + 7200000).toISOString(),
    promisedToClient: false,
    reviewed: true,
  };
  return { person, session, received, accepted, method, input };
}

async function inquiryTasks(id: string) {
  return t.db.select().from(tasks).where(eq(tasks.inquiryId, id));
}

function gate() {
  let release = () => {};
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

describe("O03 / AT14 human-attested contact and owned follow-up", () => {
  it("unanswered contact keeps acknowledgment and first response distinct and never completes earlier work", async () => {
    const f = await fixture();
    const [before] = await t.db.select().from(inquiries).where(eq(inquiries.id, f.input.id));
    const saved = await recordInquiryContact(t.db, f.session, f.input);
    expect(saved.outcome.firstResponseAt).toBeNull();
    const view = await readInquiry(t.db, f.session, f.input.id);
    expect(view.inquiry.acknowledgedAt).toEqual(before?.acknowledgedAt);
    expect(view.inquiry.firstResponseAt).toBeNull();
    expect((await inquiryTasks(f.input.id)).map((task) => task.state)).toEqual(["open", "open"]);
    expect(view.activity.find((entry) => entry.contact)?.contact).toMatchObject({
      result: "unanswered",
      contactedAt: f.input.contactedAt,
      note: f.input.note,
      contact: { id: f.method.id, partyId: f.method.partyId, kind: "email", value: f.method.value },
      taskId: saved.outcome.taskId,
      promisedToClient: false,
    });
    expect(
      await readWorkOperation(
        t.db,
        f.session,
        "work.inquiry.contact",
        f.input.id,
        f.input.operationId,
      ),
    ).toEqual({ status: "succeeded" });
  });

  it("a useful response and explicit client promise are atomic, replay once, and preserve original promises", async () => {
    const f = await fixture();
    await t.db
      .update(tasks)
      .set({ promisedToClient: true })
      .where(eq(tasks.id, f.accepted.outcome.taskId));
    const input = {
      ...f.input,
      result: "useful_response",
      promisedToClient: true,
      note: "Explained the requested service and agreed the next contact step.",
    };
    const first = await recordInquiryContact(t.db, f.session, input);
    expect(first.outcome.firstResponseAt).toBe(input.contactedAt);
    expect(await recordInquiryContact(t.db, f.session, input)).toMatchObject({
      replayed: true,
      outcome: first.outcome,
    });
    const pending = await inquiryTasks(input.id);
    expect(pending).toHaveLength(2);
    expect(pending.every((task) => task.promisedToClient && task.state === "open")).toBe(true);
    expect(pending.find((task) => task.id === first.outcome.taskId)).toMatchObject({
      ownerId: f.person.id,
      title: input.nextAction,
      dueAt: new Date(input.dueAt),
    });
    await expect(
      recordInquiryContact(t.db, f.session, {
        ...input,
        note: "Different contact using the original operation identity",
      }),
    ).rejects.toMatchObject({ code: "idempotency_key_reused" });
    expect(await inquiryTasks(input.id)).toHaveLength(2);
  });

  it("later responses cannot overwrite the earliest useful contact; a late-entered earlier observation retains both histories", async () => {
    const f = await fixture();
    const first = await recordInquiryContact(t.db, f.session, {
      ...f.input,
      result: "useful_response",
    });
    const later = await recordInquiryContact(t.db, f.session, {
      ...f.input,
      expectedVersion: first.outcome.version,
      operationId: randomUUID(),
      result: "useful_response",
      contactedAt: new Date(Date.now() - 30000).toISOString(),
    });
    expect(later.outcome.firstResponseAt).toBe(f.input.contactedAt);
    const earlierAt = new Date(Date.now() - 120000).toISOString();
    const earlier = await recordInquiryContact(t.db, f.session, {
      ...f.input,
      expectedVersion: later.outcome.version,
      operationId: randomUUID(),
      result: "useful_response",
      contactedAt: earlierAt,
    });
    expect(earlier.outcome.firstResponseAt).toBe(earlierAt);
    expect(
      (await readInquiry(t.db, f.session, f.input.id)).activity.filter((entry) => entry.contact),
    ).toHaveLength(3);
  });

  it.each([
    {
      name: "future contact",
      change: { contactedAt: new Date(Date.now() + 86400000).toISOString() },
    },
    {
      name: "contact before inquiry receipt",
      change: { contactedAt: new Date(Date.now() - 86400000).toISOString() },
    },
    { name: "past next action", change: { dueAt: new Date(Date.now() - 86400000).toISOString() } },
    { name: "promise inferred from an unanswered attempt", change: { promisedToClient: true } },
    { name: "unreviewed observation", change: { reviewed: false } },
  ])("rejects $name without a contact or new task", async ({ change }) => {
    const f = await fixture();
    await expect(
      recordInquiryContact(t.db, f.session, { ...f.input, ...change }),
    ).rejects.toMatchObject({ code: "validation_failed" });
    expect(await inquiryTasks(f.input.id)).toHaveLength(1);
    expect(
      (await readInquiry(t.db, f.session, f.input.id)).activity.filter((entry) => entry.contact),
    ).toEqual([]);
  });

  it("a changed contact snapshot refuses stale submission and keeps the known failed receipt", async () => {
    const f = await fixture();
    await t.db
      .update(contactMethods)
      .set({ value: "corrected@example.test", version: f.method.version + 1 })
      .where(eq(contactMethods.id, f.method.id));
    await expect(recordInquiryContact(t.db, f.session, f.input)).rejects.toMatchObject({
      code: "version_conflict",
    });
    const [receipt] = await t.db
      .select()
      .from(operations)
      .where(
        and(
          eq(operations.operationType, "work.inquiry.contact"),
          eq(operations.idempotencyKey, f.input.operationId),
        ),
      );
    expect(receipt?.status).toBe("failed");
    expect(
      await readWorkOperation(
        t.db,
        f.session,
        "work.inquiry.contact",
        f.input.id,
        f.input.operationId,
      ),
    ).toEqual({ status: "failed" });
    await expect(recordInquiryContact(t.db, f.session, f.input)).rejects.toMatchObject({
      code: "version_conflict",
    });
    expect(await inquiryTasks(f.input.id)).toHaveLength(1);
    const fresh = await recordInquiryContact(t.db, f.session, {
      ...f.input,
      operationId: randomUUID(),
      expectedContactVersion: f.method.version + 1,
    });
    expect(fresh.outcome.version).toBe(f.input.expectedVersion + 1);
    expect(
      (await readInquiry(t.db, f.session, f.input.id)).activity.find((entry) => entry.contact)
        ?.contact?.contact.value,
    ).toBe("corrected@example.test");
  });

  it("foreign contact and another broker's responsibility cannot be substituted", async () => {
    const f = await fixture();
    const other = await fixture();
    await expect(
      recordInquiryContact(t.db, f.session, { ...f.input, contactMethodId: other.method.id }),
    ).rejects.toMatchObject({ code: "validation_failed" });
    await expect(recordInquiryContact(t.db, other.session, f.input)).rejects.toMatchObject({
      code: "transition_denied",
    });
    expect(await inquiryTasks(f.input.id)).toHaveLength(1);
    await expect(
      readWorkOperation(
        t.db,
        f.session,
        "work.inquiry.contact",
        other.input.id,
        f.input.operationId,
      ),
    ).rejects.toMatchObject({ code: "not_found" });
  });

  it.each(["grants", "session", "passkey", "absence"] as const)(
    "rechecks %s before successful contact replay",
    async (change) => {
      const f = await fixture();
      await recordInquiryContact(t.db, f.session, f.input);
      if (change === "grants")
        await t.db
          .update(grants)
          .set({ revokedAt: new Date() })
          .where(eq(grants.principalId, f.person.id));
      if (change === "session")
        await t.db
          .update(sessions)
          .set({ revokedAt: new Date() })
          .where(eq(sessions.id, f.session.id));
      if (change === "passkey") {
        const [key] = await t.db
          .select()
          .from(passkeys)
          .where(eq(passkeys.principalId, f.person.id))
          .limit(1);
        if (!key) throw new Error("Key fixture missing");
        await t.db.update(passkeys).set({ revokedAt: new Date() }).where(eq(passkeys.id, key.id));
      }
      if (change === "absence")
        await t.db
          .update(staffMemberships)
          .set({
            absenceFrom: new Date(Date.now() - 1000),
            absenceReviewAt: new Date(Date.now() + 3600000),
          })
          .where(eq(staffMemberships.principalId, f.person.id));
      await expect(recordInquiryContact(t.db, f.session, f.input)).rejects.toMatchObject({
        code:
          change === "grants"
            ? "not_found"
            : change === "session"
              ? "unauthenticated"
              : change === "passkey"
                ? "forbidden"
                : "transition_denied",
      });
      expect(await inquiryTasks(f.input.id)).toHaveLength(2);
    },
  );

  it("two different observations on one revision cannot both create a commitment", async () => {
    const f = await fixture();
    const attempts = await Promise.allSettled([
      recordInquiryContact(t.db, f.session, f.input),
      recordInquiryContact(t.db, f.session, {
        ...f.input,
        operationId: randomUUID(),
        result: "useful_response",
      }),
    ]);
    expect(attempts.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(attempts.find((result) => result.status === "rejected")).toMatchObject({
      reason: { code: "version_conflict" },
    });
    expect(await inquiryTasks(f.input.id)).toHaveLength(2);
    const contacts = await t.db
      .select()
      .from(activityEvents)
      .where(
        and(
          eq(activityEvents.recordId, f.input.id),
          eq(activityEvents.messageKey, "work.inquiry.contact_recorded"),
        ),
      );
    expect(contacts).toHaveLength(1);
  });

  it.each(["inquiry", "contact"] as const)(
    "refreshes authorization after waiting for the %s row",
    async (target) => {
      const f = await fixture();
      const ready = gate();
      const release = gate();
      let pid = 0;
      const blocker = t.db.transaction(async (tx) => {
        const result = await tx.execute<{ pid: number }>(sql`select pg_backend_pid() as pid`);
        pid = result[0]?.pid ?? 0;
        if (target === "inquiry")
          await tx.select().from(inquiries).where(eq(inquiries.id, f.input.id)).for("update");
        else
          await tx
            .select()
            .from(contactMethods)
            .where(eq(contactMethods.id, f.method.id))
            .for("update");
        ready.release();
        await release.promise;
      });
      await ready.promise;
      const attempt = recordInquiryContact(t.db, f.session, f.input).then(
        (value) => ({ value }),
        (error: unknown) => ({ error }),
      );
      try {
        await expect
          .poll(
            async () => {
              const [row] = await t.sql<
                { count: number }[]
              >`select count(*)::int as count from pg_stat_activity where datname=current_database() and ${pid} = any(pg_blocking_pids(pid))`;
              return row?.count ?? 0;
            },
            { timeout: 3000, interval: 10 },
          )
          .toBeGreaterThan(0);
        await t.db
          .update(grants)
          .set({ revokedAt: new Date() })
          .where(eq(grants.principalId, f.person.id));
      } finally {
        release.release();
        await blocker;
      }
      expect(await attempt).toMatchObject({ error: { code: "not_found" } });
      expect(await inquiryTasks(f.input.id)).toHaveLength(1);
      expect(
        await t.db
          .select()
          .from(activityEvents)
          .where(
            and(
              eq(activityEvents.recordId, f.input.id),
              eq(activityEvents.messageKey, "work.inquiry.contact_recorded"),
            ),
          ),
      ).toEqual([]);
    },
  );
});
