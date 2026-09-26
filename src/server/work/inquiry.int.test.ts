import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  activityEvents,
  approvals,
  auditLog,
  cases,
  contactMethods,
  inquiries,
  messages,
  outboxMessages,
  partyRelationships,
  tasks,
} from "@/db/schema";
import { createTestDatabase, type TestDatabase } from "@/db/test-utils";
import { createCase, createStaff, grantService, relate } from "../testing";
import { getInquiryWorkspace } from "./inquiry";
import {
  assignInquiry,
  claimInquiry,
  createCaseFromInquiry,
  draftReply,
  linkToCase,
  markAwaitingClient,
  recordFirstResponse,
  resolveWithoutCase,
  sendReply,
} from "./inquiry-commands";
import { completeTask, setNextAction } from "./tasks";
import {
  createInboundMessage,
  createInquiry,
  createListing,
  createPerson,
  createSentMessage,
} from "./testing";

// O03 inquiry triage (§07.1, §07.5, F18, A41–A44, A66).
let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDatabase();
  await grantService(t.db, "hermes", { role: "ai_service" });
});
afterAll(async () => {
  await t?.drop();
});

let counter = 0;
const op = () => {
  counter += 1;
  return `op-${counter}`;
};
const hermes = { kind: "ai_service", id: "hermes" } as const;
const broker = () => createStaff(t.db, { roles: ["assigned_broker"] });
const inquiryRow = async (id: string) =>
  (await t.db.select().from(inquiries).where(eq(inquiries.id, id)))[0];

describe("getInquiryWorkspace", () => {
  it("shows the original request, conversation delivery states, matches and allowed steps", async () => {
    const staff = await broker();
    const listing = await createListing(t.db);
    const person = await createPerson(t.db, { name: "Ana Example" });
    // Another person record sharing the same email: a suggestion, never an automatic merge.
    const twin = await createPerson(t.db, {
      name: "A. Example",
      email: person.email.toUpperCase(),
      verification: "verified",
    });
    const twinCase = await createCase(t.db, staff.id);
    await relate(t.db, { personId: twin.personId, role: "buyer", caseId: twinCase });
    const inquiry = await createInquiry(t.db, {
      ownerStaffId: staff.id,
      personId: person.personId,
      contactMethodId: person.contactMethodId,
      listingId: listing.id,
    });
    const earlier = await createInquiry(t.db, {
      personId: person.personId,
      contactMethodId: person.contactMethodId,
    });
    await createInboundMessage(t.db, { inquiryId: inquiry.id, body: "Any news?" });
    const sent = await createSentMessage(t.db, {
      inquiryId: inquiry.id,
      authorStaffId: staff.id,
      deliveryState: "provider_accepted",
    });

    const view = await getInquiryWorkspace(t.db, staff.actor, { inquiryId: inquiry.id });
    expect(view).toMatchObject({
      inquiry: { id: inquiry.id, reference: inquiry.reference },
      state: "assigned",
      original: { purpose: "question", source: "website", language: "en" },
      contactRoute: { contactMethodId: person.contactMethodId, kind: "email" },
      person: { id: person.personId, name: "Ana Example" },
      owner: { staffId: staff.id, name: "Test Staff" },
      listing: { id: listing.id, reference: listing.reference, purpose: "sale" },
    });
    expect(view.original.submissionId).toMatch(/^submission-/);
    const outbound = view.conversation.find((m) => m.id === sent.messageId);
    // Provider acceptance is shown as such, never as delivered (A42).
    expect(outbound).toMatchObject({
      state: "queued",
      deliveryState: "provider_accepted",
      sentBy: { staffId: staff.id },
    });
    expect(view.conversation.map((m) => m.direction)).toEqual(["inbound", "outbound"]);
    expect(view.suggestions.persons).toEqual([
      { personId: twin.personId, name: "A. Example", matchedOn: "email", channelVerified: true },
    ]);
    expect(view.suggestions.cases.map((c) => c.case.id)).toEqual([twinCase]);
    expect(view.suggestions.duplicateInquiries.map((d) => d.inquiry.id)).toEqual([earlier.id]);
    expect(view.allowedTransitions).toEqual(
      expect.arrayContaining(["awaiting_client", "resolved_without_case", "case_linked"]),
    );
    expect(view.commands).toEqual(
      expect.arrayContaining(["send_reply", "resolve_without_case", "create_case"]),
    );
    expect(view.commands).not.toContain("claim");
  });

  it("limits a coordinator's commands and hides the inquiry from staff without access", async () => {
    const coordinator = await createStaff(t.db, { roles: ["coordinator"] });
    const editor = await createStaff(t.db, { roles: ["content_editor"] });
    const inquiry = await createInquiry(t.db);
    const view = await getInquiryWorkspace(t.db, coordinator.actor, { inquiryId: inquiry.id });
    expect(view.allowedTransitions).toEqual([]);
    expect(view.commands).toEqual(["draft_reply", "set_next_action"]);
    await expect(
      getInquiryWorkspace(t.db, editor.actor, { inquiryId: inquiry.id }),
    ).rejects.toMatchObject({ code: "not_found" });
    await expect(
      getInquiryWorkspace(t.db, coordinator.actor, { inquiryId: "not-a-uuid" }),
    ).rejects.toMatchObject({ code: "not_found" });
  });
});

describe("ownership", () => {
  it("claims once per operation, with activity and audit, and conflicts on a stale version", async () => {
    const staff = await broker();
    const inquiry = await createInquiry(t.db);
    const input = { inquiryId: inquiry.id, expectedVersion: 1, operationId: op() };
    const first = await claimInquiry(t.db, staff.actor, input);
    expect(first.outcome).toEqual({ inquiryId: inquiry.id, version: 2, state: "assigned" });
    expect(await claimInquiry(t.db, staff.actor, input)).toEqual({ ...first, replayed: true });
    expect(await inquiryRow(inquiry.id)).toMatchObject({ ownerStaffId: staff.id, version: 2 });
    const audit = await t.db.select().from(auditLog).where(eq(auditLog.recordId, inquiry.id));
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      action: "inquiry.transition",
      operationId: first.operationId,
    });

    const rival = await broker();
    await expect(
      claimInquiry(t.db, rival.actor, { ...input, operationId: op() }),
    ).rejects.toMatchObject({
      code: "version_conflict",
      current: { state: "assigned", version: 2 },
    });
    await expect(
      claimInquiry(t.db, rival.actor, { ...input, expectedVersion: 2, operationId: op() }),
    ).rejects.toMatchObject({
      code: "transition_denied",
      fieldErrors: { transition: ["no_change"] },
    });
    expect(await inquiryRow(inquiry.id)).toMatchObject({ ownerStaffId: staff.id });
  });

  it("assigns only to staff who can respond, and reassigns owned work", async () => {
    const manager = await createStaff(t.db, { roles: ["manager"] });
    const editor = await createStaff(t.db, { roles: ["content_editor"] });
    const first = await broker();
    const second = await broker();
    const inquiry = await createInquiry(t.db);
    await expect(
      assignInquiry(t.db, manager.actor, {
        inquiryId: inquiry.id,
        expectedVersion: 1,
        operationId: op(),
        toStaffId: editor.id,
      }),
    ).rejects.toMatchObject({
      code: "validation_failed",
      fieldErrors: { toStaffId: ["assignee_cannot_respond"] },
    });
    const assigned = await assignInquiry(t.db, manager.actor, {
      inquiryId: inquiry.id,
      expectedVersion: 1,
      operationId: op(),
      toStaffId: first.id,
    });
    expect(assigned.outcome).toMatchObject({ state: "assigned", version: 2 });
    const reassigned = await assignInquiry(t.db, manager.actor, {
      inquiryId: inquiry.id,
      expectedVersion: 2,
      operationId: op(),
      toStaffId: second.id,
    });
    expect(reassigned.outcome).toMatchObject({ state: "assigned", version: 3 });
    expect(await inquiryRow(inquiry.id)).toMatchObject({ ownerStaffId: second.id });
    const [event] = await t.db
      .select()
      .from(activityEvents)
      .where(
        and(
          eq(activityEvents.recordId, inquiry.id),
          eq(activityEvents.messageKey, "activity.inquiry.reassign"),
        ),
      );
    expect(event?.params).toEqual({ from: first.id, to: second.id });
  });
});

describe("replies", () => {
  it("needs an owner before a first response (A43)", async () => {
    const staff = await broker();
    const inquiry = await createInquiry(t.db);
    const row = await inquiryRow(inquiry.id);
    await expect(
      sendReply(t.db, staff.actor, {
        inquiryId: inquiry.id,
        expectedVersion: 1,
        operationId: op(),
        channel: "email",
        recipientContactMethodId: row?.contactMethodId as string,
        body: "Hello",
      }),
    ).rejects.toMatchObject({
      code: "transition_denied",
      fieldErrors: { transition: ["owner_required"] },
    });
  });

  it("queues an approved reply in the outbox with explicit channel and recipient", async () => {
    const staff = await broker();
    const inquiry = await createInquiry(t.db, { ownerStaffId: staff.id });
    const row = await inquiryRow(inquiry.id);
    const [route] = await t.db
      .select()
      .from(contactMethods)
      .where(eq(contactMethods.id, row?.contactMethodId as string));
    const now = new Date("2026-09-26T10:00:00Z");
    const result = await sendReply(
      t.db,
      staff.actor,
      {
        inquiryId: inquiry.id,
        expectedVersion: 1,
        operationId: op(),
        channel: "email",
        recipientContactMethodId: route?.id as string,
        subject: "Your question",
        body: "  Yes, it is still available.  ",
      },
      { now },
    );
    expect(result.outcome).toMatchObject({
      version: 2,
      draftId: null,
      deliveryState: "queued",
      sentBy: staff.id,
      firstResponse: true,
    });
    const [message] = await t.db
      .select()
      .from(messages)
      .where(eq(messages.id, result.outcome.messageId));
    expect(message).toMatchObject({
      state: "queued",
      body: "Yes, it is still available.",
      authorId: staff.id,
      draftedByAi: false,
      recipients: [{ contactMethodId: route?.id, channel: "email", address: route?.value }],
    });
    expect(message?.approvedContentHash).toBe(message?.contentHash);
    const [approval] = await t.db
      .select()
      .from(approvals)
      .where(eq(approvals.id, message?.approvalId as string));
    expect(approval).toMatchObject({ kind: "message_send", decidedById: staff.id });
    const [outbox] = await t.db
      .select()
      .from(outboxMessages)
      .where(eq(outboxMessages.messageId, result.outcome.messageId));
    // Queued, never dispatched from the command itself.
    expect(outbox).toMatchObject({
      state: "queued",
      channel: "email",
      recipient: route?.value,
      attempts: 0,
    });
    expect(await inquiryRow(inquiry.id)).toMatchObject({ firstResponseAt: now, version: 2 });
  });

  it("rejects a recipient or channel that does not belong to the inquiry", async () => {
    const staff = await broker();
    const inquiry = await createInquiry(t.db, { ownerStaffId: staff.id });
    const stranger = await createPerson(t.db);
    const row = await inquiryRow(inquiry.id);
    const base = {
      inquiryId: inquiry.id,
      expectedVersion: 1,
      channel: "email" as const,
      body: "Hello",
    };
    await expect(
      sendReply(t.db, staff.actor, {
        ...base,
        operationId: op(),
        recipientContactMethodId: stranger.contactMethodId,
      }),
    ).rejects.toMatchObject({
      fieldErrors: { recipientContactMethodId: ["not_a_contact_of_this_inquiry"] },
    });
    await expect(
      sendReply(t.db, staff.actor, {
        ...base,
        operationId: op(),
        channel: "sms",
        recipientContactMethodId: row?.contactMethodId as string,
      }),
    ).rejects.toMatchObject({
      fieldErrors: { channel: ["channel_not_supported_by_contact_method"] },
    });
  });

  it("lets Hermes only draft; the human sender and the draft id are recorded (A65, A66)", async () => {
    const staff = await broker();
    const inquiry = await createInquiry(t.db, { ownerStaffId: staff.id });
    const row = await inquiryRow(inquiry.id);
    const recipientContactMethodId = row?.contactMethodId as string;
    const draft = await draftReply(t.db, hermes, {
      inquiryId: inquiry.id,
      operationId: op(),
      channel: "email",
      recipientContactMethodId,
      body: "Draft: the apartment is available.",
    });
    const [saved] = await t.db
      .select()
      .from(messages)
      .where(eq(messages.id, draft.outcome.messageId));
    expect(saved).toMatchObject({ state: "draft", draftedByAi: true, authorKind: "ai_service" });
    await expect(
      sendReply(t.db, hermes, {
        inquiryId: inquiry.id,
        expectedVersion: 1,
        operationId: op(),
        channel: "email",
        recipientContactMethodId,
        body: "Draft",
        draftId: draft.outcome.messageId,
        draftVersion: 1,
      }),
    ).rejects.toMatchObject({ code: "forbidden" });

    const reply = {
      inquiryId: inquiry.id,
      expectedVersion: 1,
      channel: "email" as const,
      recipientContactMethodId,
      body: "Yes, the apartment is available. Viewings are possible on weekdays.",
      draftId: draft.outcome.messageId,
    };
    await expect(
      sendReply(t.db, staff.actor, { ...reply, operationId: op(), draftVersion: 7 }),
    ).rejects.toMatchObject({ code: "version_conflict" });
    const sent = await sendReply(t.db, staff.actor, {
      ...reply,
      operationId: op(),
      draftVersion: 1,
    });
    expect(sent.outcome).toMatchObject({
      messageId: draft.outcome.messageId,
      draftId: draft.outcome.messageId,
      sentBy: staff.id,
    });
    const [message] = await t.db
      .select()
      .from(messages)
      .where(eq(messages.id, draft.outcome.messageId));
    expect(message).toMatchObject({ state: "queued", draftedByAi: true, body: reply.body });
    const [audit] = await t.db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.recordId, inquiry.id), eq(auditLog.action, "inquiry.send_reply")));
    expect(audit?.payload).toMatchObject({ draftId: draft.outcome.messageId, sentBy: staff.id });
    const view = await getInquiryWorkspace(t.db, staff.actor, { inquiryId: inquiry.id });
    expect(view.conversation.at(-1)).toMatchObject({
      author: { kind: "ai_service", id: "hermes" },
      sentBy: { staffId: staff.id },
      draftedByAi: true,
      deliveryState: "queued",
    });
  });

  it("records a missed call as an attempt, not a first response (F19)", async () => {
    const staff = await broker();
    const inquiry = await createInquiry(t.db, { ownerStaffId: staff.id });
    const attempt = await recordFirstResponse(t.db, staff.actor, {
      inquiryId: inquiry.id,
      expectedVersion: 1,
      operationId: op(),
      channel: "phone",
      outcome: "attempted",
      note: "No answer",
    });
    expect(attempt.outcome).toMatchObject({ version: 2, firstResponseAt: null });
    const reached = await recordFirstResponse(t.db, staff.actor, {
      inquiryId: inquiry.id,
      expectedVersion: 2,
      operationId: op(),
      channel: "phone",
      outcome: "reached",
      note: "Answered the price question",
    });
    expect(reached.outcome.firstResponseAt).not.toBeNull();
    expect((await inquiryRow(inquiry.id))?.firstResponseAt).not.toBeNull();
  });
});

describe("outcomes", () => {
  it("waits on the client only after a question was actually sent", async () => {
    const staff = await broker();
    const inquiry = await createInquiry(t.db, { ownerStaffId: staff.id });
    const now = new Date("2026-09-26T10:00:00Z");
    const followUpAt = "2026-09-29T09:00:00.000Z";
    const draft = await draftReply(t.db, staff.actor, {
      inquiryId: inquiry.id,
      operationId: op(),
      channel: "email",
      recipientContactMethodId: (await inquiryRow(inquiry.id))?.contactMethodId as string,
      body: "Which dates suit you?",
    });
    await expect(
      markAwaitingClient(
        t.db,
        staff.actor,
        {
          inquiryId: inquiry.id,
          expectedVersion: 1,
          operationId: op(),
          questionMessageId: draft.outcome.messageId,
          followUpAt,
        },
        { now },
      ),
    ).rejects.toMatchObject({ fieldErrors: { questionMessageId: ["question_not_sent"] } });
    const sent = await createSentMessage(t.db, {
      inquiryId: inquiry.id,
      authorStaffId: staff.id,
      deliveryState: "queued",
    });
    const result = await markAwaitingClient(
      t.db,
      staff.actor,
      {
        inquiryId: inquiry.id,
        expectedVersion: 1,
        operationId: op(),
        questionMessageId: sent.messageId,
        followUpAt,
      },
      { now },
    );
    expect(result.outcome).toMatchObject({ state: "awaiting_client", version: 2 });
    expect((await inquiryRow(inquiry.id))?.followUpAt?.toISOString()).toBe(followUpAt);
  });

  it("resolves without a case only when no commitment is left open (A44)", async () => {
    const staff = await broker();
    const inquiry = await createInquiry(t.db, { ownerStaffId: staff.id });
    const next = await setNextAction(t.db, staff.actor, {
      inquiryId: inquiry.id,
      expectedVersion: 1,
      operationId: op(),
      title: "Send the price list",
      dueAt: "2026-10-01T09:00:00.000Z",
      commitment: "client_promise",
    });
    expect(next.outcome).toMatchObject({ targetVersion: 2 });
    const [task] = await t.db.select().from(tasks).where(eq(tasks.id, next.outcome.taskId));
    expect(task).toMatchObject({ ownerStaffId: staff.id, inquiryId: inquiry.id, state: "open" });

    await expect(
      resolveWithoutCase(t.db, staff.actor, {
        inquiryId: inquiry.id,
        expectedVersion: 2,
        operationId: op(),
        reason: "",
      }),
    ).rejects.toMatchObject({ fieldErrors: { transition: ["reason_required"] } });
    await expect(
      resolveWithoutCase(t.db, staff.actor, {
        inquiryId: inquiry.id,
        expectedVersion: 2,
        operationId: op(),
        reason: "Question answered",
      }),
    ).rejects.toMatchObject({
      code: "transition_denied",
      fieldErrors: { transition: ["open_commitments"] },
    });
    await completeTask(t.db, staff.actor, {
      taskId: next.outcome.taskId,
      expectedVersion: 1,
      operationId: op(),
      evidence: { outcome: "completed", note: "Price list sent by email" },
    });
    const resolved = await resolveWithoutCase(t.db, staff.actor, {
      inquiryId: inquiry.id,
      expectedVersion: 2,
      operationId: op(),
      reason: "Question answered",
    });
    expect(resolved.outcome).toMatchObject({ state: "resolved_without_case", version: 3 });
    // No fake active case was needed.
    expect(await inquiryRow(inquiry.id)).toMatchObject({
      dispositionReason: "Question answered",
      caseId: null,
    });
  });

  it("links an existing case without creating another person", async () => {
    const staff = await broker();
    const inquiry = await createInquiry(t.db, { ownerStaffId: staff.id });
    const caseId = await createCase(t.db, staff.id);
    const linked = await linkToCase(t.db, staff.actor, {
      inquiryId: inquiry.id,
      expectedVersion: 1,
      operationId: op(),
      caseId,
    });
    expect(linked.outcome).toMatchObject({ state: "case_linked", caseId, version: 2 });
    expect(await inquiryRow(inquiry.id)).toMatchObject({ caseId });
  });

  it("creates a buyer case in its initial stage with the inquiry linked and a next action", async () => {
    const staff = await broker();
    const inquiry = await createInquiry(t.db, { ownerStaffId: staff.id });
    const row = await inquiryRow(inquiry.id);
    const now = new Date("2026-09-26T10:00:00Z");
    const result = await createCaseFromInquiry(
      t.db,
      staff.actor,
      {
        inquiryId: inquiry.id,
        expectedVersion: 1,
        operationId: op(),
        title: "Two-bedroom apartment in Sandanski",
        nextAction: { title: "Agree the requirement brief", dueAt: "2026-09-28T09:00:00.000Z" },
      },
      { now },
    );
    expect(result.outcome).toMatchObject({
      state: "case_linked",
      caseStage: "needs_agreed",
      caseReference: expect.stringMatching(/^CS-2026-\d{6}$/),
    });
    const [created] = await t.db.select().from(cases).where(eq(cases.id, result.outcome.caseId));
    expect(created).toMatchObject({
      kind: "buyer",
      stage: "needs_agreed",
      ownerStaffId: staff.id,
      nextActionSummary: "Agree the requirement brief",
    });
    const [relationship] = await t.db
      .select()
      .from(partyRelationships)
      .where(eq(partyRelationships.caseId, result.outcome.caseId));
    expect(relationship).toMatchObject({ personId: row?.personId, role: "buyer" });
    const [task] = await t.db.select().from(tasks).where(eq(tasks.id, result.outcome.taskId));
    expect(task).toMatchObject({ caseId: result.outcome.caseId, state: "open" });
    expect(await inquiryRow(inquiry.id)).toMatchObject({ caseId: result.outcome.caseId });
  });

  it("rolls back the new case when the inquiry cannot be linked", async () => {
    const staff = await broker();
    const inquiry = await createInquiry(t.db);
    await expect(
      createCaseFromInquiry(t.db, staff.actor, {
        inquiryId: inquiry.id,
        expectedVersion: 1,
        operationId: op(),
        title: "Rolled back case",
        nextAction: { title: "Call", dueAt: "2026-09-28T09:00:00.000Z" },
      }),
    ).rejects.toMatchObject({
      code: "transition_denied",
      fieldErrors: { transition: ["transition_not_allowed"] },
    });
    expect(await t.db.select().from(cases).where(eq(cases.title, "Rolled back case"))).toHaveLength(
      0,
    );
  });
});
