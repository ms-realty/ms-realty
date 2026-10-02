import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  activityEvents,
  auditEvents,
  grants,
  inquiries,
  outboxEvents,
  passkeys,
  sessions,
  tasks,
} from "@/db/schema";
import { createTestDatabase, type TestDatabase } from "@/db/test-utils";
import { createSession } from "../auth/sessions";
import { issueSubmissionKey, newReceiptSession, submitInquiry } from "../inquiries/intake";
import { createStaff } from "../testing";
import { acceptInquiry, changeTask, readWorkOperation, triageInquiry } from "./commands";
import { listContacts, listInbox, listTasks, readContact, readInquiry, readToday } from "./queries";

let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => {
  await t?.drop();
});
const future = () => new Date(Date.now() + 86400000).toISOString();

async function staff(options: Parameters<typeof createStaff>[1] = { roles: ["assigned_broker"] }) {
  const person = await createStaff(t.db, options);
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

async function received(locale: "bg" | "en" = "en") {
  const submissionKey = issueSubmissionKey();
  await submitInquiry(
    t.db,
    {
      submissionKey,
      purpose: "question",
      locale,
      name: "Synthetic visitor",
      contact: { kind: "email", value: `${randomUUID()}@example.test` },
      message: "Please explain the next steps.",
      privacyNotice: true,
    },
    {
      ip: `2001:db8::${Math.floor(Math.random() * 65535).toString(16)}`,
      receiptSession: newReceiptSession(),
    },
  );
  const [row] = await t.db
    .select()
    .from(inquiries)
    .where(eq(inquiries.submissionKey, submissionKey));
  if (!row) throw new Error("Intake did not persist inquiry.");
  return row;
}

describe("staff work against durable inquiry intake", () => {
  it("public intake enters the authorized queue; acceptance atomically owns it and records exactly one follow-up on replay", async () => {
    const broker = await staff();
    const row = await received();
    expect((await listInbox(t.db, broker.session)).rows.some((r) => r.inquiry.id === row.id)).toBe(
      true,
    );
    const input = {
      id: row.id,
      expectedVersion: row.version,
      operationId: randomUUID(),
      nextAction: "Review the inquiry and prepare a useful response",
      dueAt: future(),
    };
    const accepted = await acceptInquiry(t.db, broker.session, input);
    expect((await acceptInquiry(t.db, broker.session, input)).outcome).toEqual(accepted.outcome);
    expect((await readInquiry(t.db, broker.session, row.id)).inquiry).toMatchObject({
      state: "assigned",
      ownerId: broker.id,
      version: row.version + 1,
      coverageQueue: null,
      firstResponseAt: null,
    });
    expect(await t.db.select().from(tasks).where(eq(tasks.inquiryId, row.id))).toHaveLength(1);
    for (const table of [activityEvents, auditEvents, outboxEvents]) {
      expect(
        await t.db.select().from(table).where(eq(table.operationId, accepted.operationId)),
      ).toHaveLength(2);
    }
    expect(
      await readWorkOperation(
        t.db,
        broker.session,
        "work.inquiry.accept",
        row.id,
        input.operationId,
      ),
    ).toEqual({ status: "succeeded" });
    expect(
      (await readToday(t.db, broker.session)).mine.rows.some((r) => r.inquiry.id === row.id),
    ).toBe(true);
  });

  it("concurrent different keys cannot overwrite an owner; rejected work leaves no task or activity", async () => {
    const a = await staff();
    const b = await staff();
    const row = await received();
    const input = {
      id: row.id,
      expectedVersion: 1,
      nextAction: "Call to clarify the request",
      dueAt: future(),
    };
    const attempts = await Promise.allSettled([
      acceptInquiry(t.db, a.session, { ...input, operationId: randomUUID() }),
      acceptInquiry(t.db, b.session, { ...input, operationId: randomUUID() }),
    ]);
    expect(attempts.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    const failure = attempts.find((x) => x.status === "rejected");
    expect(failure).toMatchObject({
      reason: { code: "version_conflict", current: { version: 2 } },
    });
    expect(await t.db.select().from(tasks).where(eq(tasks.inquiryId, row.id))).toHaveLength(1);
    expect(
      await t.db.select().from(activityEvents).where(eq(activityEvents.recordId, row.id)),
    ).toHaveLength(2); // intake + acceptance
  });

  it("revoked grants and revoked sessions deny reads and even successful-operation replay", async () => {
    const broker = await staff();
    const row = await received();
    const input = {
      id: row.id,
      expectedVersion: 1,
      operationId: randomUUID(),
      nextAction: "Review request",
      dueAt: future(),
    };
    await acceptInquiry(t.db, broker.session, input);
    await t.db
      .update(grants)
      .set({ revokedAt: new Date() })
      .where(eq(grants.principalId, broker.id));
    await expect(acceptInquiry(t.db, broker.session, input)).rejects.toMatchObject({
      code: "not_found",
    });
    expect((await listInbox(t.db, broker.session)).rows).toEqual([]);
    await t.db
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(eq(sessions.id, broker.session.id));
    await expect(listInbox(t.db, broker.session)).rejects.toMatchObject({
      code: "unauthenticated",
    });
  });

  it("record and locale grants are applied before pagination, contact projection, and task access", async () => {
    const visible = await received("bg");
    const hidden = await received("en");
    const scoped = await staff({
      grants: [
        {
          capability: "inquiry.read",
          recordType: "inquiry",
          recordId: visible.id,
          locales: ["bg"],
        },
      ],
    });
    expect((await listInbox(t.db, scoped.session)).rows.map((r) => r.inquiry.id)).toEqual([
      visible.id,
    ]);
    await expect(readInquiry(t.db, scoped.session, hidden.id)).rejects.toMatchObject({
      code: "not_found",
    });
    expect((await listContacts(t.db, scoped.session)).rows.map((r) => r.id)).toEqual([
      visible.partyId,
    ]);
    expect(
      (await readContact(t.db, scoped.session, visible.partyId as string)).inquiries,
    ).toHaveLength(1);
    await expect(readContact(t.db, scoped.session, hidden.partyId as string)).rejects.toMatchObject(
      { code: "not_found" },
    );
    expect((await listTasks(t.db, scoped.session)).rows).toEqual([]);
  });

  it("a coordinator cannot accept; unenrolled staff cannot use command services", async () => {
    const coordinator = await staff({ roles: ["coordinator"] });
    const row = await received();
    const input = {
      id: row.id,
      expectedVersion: 1,
      operationId: randomUUID(),
      nextAction: "Review request",
      dueAt: future(),
    };
    await expect(acceptInquiry(t.db, coordinator.session, input)).rejects.toMatchObject({
      code: "forbidden",
    });
    const broker = await staff();
    await t.db
      .update(passkeys)
      .set({ revokedAt: new Date() })
      .where(eq(passkeys.principalId, broker.id));
    await expect(acceptInquiry(t.db, broker.session, input)).rejects.toMatchObject({
      code: "forbidden",
    });
  });

  it("open commitments prevent resolution; explicit task outcome then reason resolve the inquiry", async () => {
    const broker = await staff();
    const row = await received();
    const accepted = await acceptInquiry(t.db, broker.session, {
      id: row.id,
      expectedVersion: 1,
      operationId: randomUUID(),
      nextAction: "Review the submitted question",
      dueAt: future(),
    });
    const resolve = {
      id: row.id,
      expectedVersion: 2,
      operationId: randomUUID(),
      state: "resolved_without_case" as const,
      reason: "Visitor confirmed this was a test request",
    };
    await expect(triageInquiry(t.db, broker.session, resolve)).rejects.toMatchObject({
      code: "transition_denied",
      fieldErrors: { form: ["open_commitments"] },
    });
    await expect(
      changeTask(t.db, broker.session, {
        id: accepted.outcome.taskId,
        expectedVersion: 1,
        operationId: randomUUID(),
        state: "done",
        note: "",
      }),
    ).rejects.toMatchObject({ code: "transition_denied" });
    await changeTask(t.db, broker.session, {
      id: accepted.outcome.taskId,
      expectedVersion: 1,
      operationId: randomUUID(),
      state: "done",
      note: "Reviewed and confirmed the request was a test",
    });
    const resolved = await triageInquiry(t.db, broker.session, {
      ...resolve,
      operationId: randomUUID(),
    });
    expect(resolved.outcome.state).toBe("resolved_without_case");
    expect((await listInbox(t.db, broker.session)).rows.some((r) => r.inquiry.id === row.id)).toBe(
      false,
    );
    expect((await readInquiry(t.db, broker.session, row.id)).inquiry.message).toBe(row.message);
  });

  it("review dispositions require reasons and accessible distinct duplicate targets", async () => {
    const row = await received();
    const target = await received();
    const scoped = await staff({
      grants: [{ role: "assigned_broker", recordType: "inquiry", recordId: row.id }],
    });
    await expect(
      triageInquiry(t.db, scoped.session, {
        id: row.id,
        expectedVersion: 1,
        operationId: randomUUID(),
        state: "duplicate_candidate",
        reason: "Looks similar",
        duplicateOfInquiryId: target.id,
      }),
    ).rejects.toMatchObject({ code: "not_found" });
    const broker = await staff();
    await expect(
      triageInquiry(t.db, broker.session, {
        id: row.id,
        expectedVersion: 1,
        operationId: randomUUID(),
        state: "suspected_spam",
        reason: "",
      }),
    ).rejects.toMatchObject({ code: "validation_failed" });
    expect(
      (
        await triageInquiry(t.db, broker.session, {
          id: row.id,
          expectedVersion: 1,
          operationId: randomUUID(),
          state: "suspected_spam",
          reason: "Repeated unrelated promotion",
        })
      ).outcome.state,
    ).toBe("suspected_spam");
  });

  it("waiting needs a future dependency review; generic completion cannot claim publishing evidence", async () => {
    const broker = await staff();
    const [task] = await t.db
      .insert(tasks)
      .values({ title: "Verify a fact", ownerId: broker.id })
      .returning();
    const input = {
      id: task?.id as string,
      expectedVersion: 1,
      operationId: randomUUID(),
      state: "waiting" as const,
      note: "Awaiting measured dimensions",
    };
    await expect(changeTask(t.db, broker.session, input)).rejects.toMatchObject({
      code: "transition_denied",
    });
    expect(
      (
        await changeTask(t.db, broker.session, {
          ...input,
          operationId: randomUUID(),
          followUpAt: future(),
        })
      ).outcome.state,
    ).toBe("waiting");
    const [publication] = await t.db
      .insert(tasks)
      .values({ title: "Release a listing", type: "publishing", ownerId: broker.id })
      .returning();
    await expect(
      changeTask(t.db, broker.session, {
        id: publication?.id as string,
        expectedVersion: 1,
        operationId: randomUUID(),
        state: "done",
        note: "Pretend published",
      }),
    ).rejects.toMatchObject({ code: "transition_denied" });
  });
});
