import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, expect, it } from "vitest";
import {
  caseAccessRequests,
  caseParticipants,
  cases,
  grants,
  invitations,
  tasks,
} from "@/db/schema";
import { createTestDatabase, type TestDatabase } from "@/db/test-utils";
import { createSession } from "../auth/sessions";
import { createClient } from "../testing";
import { caseAccessWorkbench, decideCaseAccessRequest, requestCaseAccess } from "./access-requests";
import { caseFixture } from "./testing";

let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => {
  await t?.drop();
});
async function fixture() {
  const f = await caseFixture(t.db);
  await t.db.insert(grants).values({
    principalId: f.staff.id,
    capability: "access.grant",
    reason: "Synthetic access reviewer",
  });
  const input = {
    id: f.record.id,
    expectedVersion: 1,
    operationId: randomUUID(),
    kind: "invite" as const,
    targetParticipantId: null,
    targetName: "Synthetic adviser",
    targetEmail: `adviser-${randomUUID()}@example.test`,
    requestedRole: "specialist" as const,
    reason: "Please allow the named adviser to review this case",
  };
  return { ...f, input };
}
async function decide(
  f: Awaited<ReturnType<typeof fixture>>,
  requestId: string,
  decision: "approve" | "decline" = "approve",
  accessExpiresAt: string | null = new Date(Date.now() + 86400000).toISOString(),
) {
  return decideCaseAccessRequest(t.db, f.staff.session, {
    id: f.record.id,
    requestId,
    expectedVersion: 1,
    operationId: randomUUID(),
    decision,
    clientOutcome: "The agency reviewed the requested access",
    accessExpiresAt,
  });
}

it("records a client request and owned task without granting access; approved specialist invitation has bounded access", async () => {
  const f = await fixture();
  const requested = await requestCaseAccess(t.db, f.client.session, f.input);
  expect((await requestCaseAccess(t.db, f.client.session, f.input)).replayed).toBe(true);
  const [request] = await t.db
    .select()
    .from(caseAccessRequests)
    .where(eq(caseAccessRequests.id, requested.outcome.id));
  if (!request) throw new Error("Missing request fixture");
  const [task] = await t.db.select().from(tasks).where(eq(tasks.id, request.taskId));
  expect(task).toMatchObject({ ownerId: f.staff.id, state: "open" });
  expect(
    await t.db
      .select()
      .from(invitations)
      .where(sql`${invitations.scope}->>'caseId' = ${f.record.id}`),
  ).toHaveLength(0);
  const expires = new Date(Date.now() + 86400000).toISOString();
  await decide(f, request.id, "approve", expires);
  const [invitation] = await t.db
    .select()
    .from(invitations)
    .where(sql`${invitations.scope}->>'caseId' = ${f.record.id}`);
  expect((invitation?.scope as { accessExpiresAt?: string })?.accessExpiresAt).toBe(expires);
  expect(invitation?.acceptedAt).toBeNull();
  expect(
    await t.db.select().from(caseParticipants).where(eq(caseParticipants.caseId, f.record.id)),
  ).toHaveLength(1);
  const view = await caseAccessWorkbench(t.db, f.client.session, f.record.id);
  expect(view.requests[0]).toMatchObject({ state: "approved", invitationId: null });
  expect((await t.db.select().from(tasks).where(eq(tasks.id, request.taskId)))[0]?.state).toBe(
    "done",
  );
});

it("rejects unbounded specialist approval atomically and permits a new, bounded reviewed command", async () => {
  const f = await fixture();
  const requested = await requestCaseAccess(t.db, f.client.session, f.input);
  await expect(decide(f, requested.outcome.id, "approve", null)).rejects.toMatchObject({
    code: "validation_failed",
  });
  expect(
    (
      await t.db
        .select()
        .from(caseAccessRequests)
        .where(eq(caseAccessRequests.id, requested.outcome.id))
    )[0]?.state,
  ).toBe("pending");
  expect(
    await t.db
      .select()
      .from(invitations)
      .where(sql`${invitations.scope}->>'caseId' = ${f.record.id}`),
  ).toHaveLength(0);
  await decide(f, requested.outcome.id);
});

it("isolates request details and decisions from other clients, including a participant in the same case", async () => {
  const f = await fixture(),
    other = await createClient(t.db);
  const signed = await createSession(t.db, { kind: "client", id: other.id });
  await t.db
    .insert(caseParticipants)
    .values({ caseId: f.record.id, partyId: other.partyId, role: "collaborator" });
  const requested = await requestCaseAccess(t.db, f.client.session, f.input);
  expect((await caseAccessWorkbench(t.db, signed.session, f.record.id)).requests).toEqual([]);
  for (const decision of ["withdraw", "approve"] as const) {
    await expect(
      decideCaseAccessRequest(t.db, signed.session, {
        id: f.record.id,
        requestId: requested.outcome.id,
        expectedVersion: 1,
        operationId: randomUUID(),
        decision,
        clientOutcome: "Unauthorized decision must never be saved",
        accessExpiresAt: null,
      }),
    ).rejects.toBeDefined();
  }
  await expect(
    requestCaseAccess(t.db, signed.session, {
      ...f.input,
      expectedVersion: 2,
      operationId: randomUUID(),
    }),
  ).rejects.toBeDefined();
});

it("supports withdrawal and decline without creating an invitation and blocks subsequent approval", async () => {
  for (const decision of ["withdraw", "decline"] as const) {
    const f = await fixture(),
      requested = await requestCaseAccess(t.db, f.client.session, f.input);
    await decideCaseAccessRequest(
      t.db,
      decision === "withdraw" ? f.client.session : f.staff.session,
      {
        id: f.record.id,
        requestId: requested.outcome.id,
        expectedVersion: 1,
        operationId: randomUUID(),
        decision,
        clientOutcome: "This request is no longer needed",
        accessExpiresAt: null,
      },
    );
    await expect(decide(f, requested.outcome.id)).rejects.toBeDefined();
    expect(
      await t.db
        .select()
        .from(invitations)
        .where(sql`${invitations.scope}->>'caseId' = ${f.record.id}`),
    ).toHaveLength(0);
  }
});

it("approves removal through scoped revocation, then denies replay to the removed participant", async () => {
  const f = await fixture();
  const [participant] = await t.db
    .select()
    .from(caseParticipants)
    .where(eq(caseParticipants.caseId, f.record.id));
  if (!participant) throw new Error("Missing participant fixture");
  const input = {
    ...f.input,
    kind: "remove" as const,
    targetParticipantId: participant.id,
    targetName: null,
    targetEmail: null,
    requestedRole: null,
  };
  const requested = await requestCaseAccess(t.db, f.client.session, input);
  await decide(f, requested.outcome.id);
  expect(
    (await t.db.select().from(caseParticipants).where(eq(caseParticipants.id, participant.id)))[0]
      ?.revokedAt,
  ).not.toBeNull();
  await expect(requestCaseAccess(t.db, f.client.session, input)).rejects.toBeDefined();
  await expect(caseAccessWorkbench(t.db, f.client.session, f.record.id)).rejects.toBeDefined();
});

it("refuses pending grants when the case is closed and keeps the request pending", async () => {
  const f = await fixture(),
    requested = await requestCaseAccess(t.db, f.client.session, f.input);
  await t.db
    .update(cases)
    .set({ disposition: "closed", closureOutcome: "client_withdrew", commitmentDispositions: [] })
    .where(eq(cases.id, f.record.id));
  await expect(decide(f, requested.outcome.id)).rejects.toMatchObject({
    code: "transition_denied",
  });
  expect(
    (
      await t.db
        .select()
        .from(caseAccessRequests)
        .where(eq(caseAccessRequests.id, requested.outcome.id))
    )[0]?.state,
  ).toBe("pending");
});
