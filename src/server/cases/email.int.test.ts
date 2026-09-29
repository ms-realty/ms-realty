import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import {
  approvals,
  caseParticipants,
  contactMethods,
  externalActions,
  messageAttempts,
  messages,
  principals,
  subscriptions,
} from "@/db/schema";
import { createTestDatabase, type TestDatabase } from "@/db/test-utils";
import {
  dispatchMessage,
  dispatchQueued,
  enqueueMessage,
  reconcileMessage,
  recordDeliveryReport,
} from "../jobs/outbox";
import type { MessageProvider } from "../jobs/provider";
import { consentPolicyKey } from "../privacy/preferences";
import { syntheticServiceEmailTerms } from "../privacy/testing";
import { approveCaseEmail, caseEmailWorkbench, draftCaseEmail } from "./email";
import { dispatchCaseEmail } from "./email-dispatch";
import { caseFixture } from "./testing";

let t: TestDatabase;
const config = { from: "MS Realty <service@example.test>", replyDomain: "reply.example.test" };
beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => {
  await t?.drop();
});
async function fixture() {
  const terms = await syntheticServiceEmailTerms(t.db);
  const f = await caseFixture(t.db);
  const address = `synthetic-${randomUUID()}@example.test`;
  const [contact] = await t.db
    .insert(contactMethods)
    .values({
      partyId: f.client.partyId,
      kind: "email",
      value: address,
      normalizedValue: address,
      verification: "verified",
      verifiedAt: new Date(),
    })
    .returning();
  if (!contact) throw new Error("Missing contact");
  const [subscription] = await t.db
    .insert(subscriptions)
    .values({
      partyId: f.client.partyId,
      contactMethodId: contact.id,
      purpose: "service_updates",
      state: "active",
      verifiedAt: new Date(),
      timezone: "Europe/Sofia",
      policyVersion: consentPolicyKey(terms),
      unsubscribeTokenHash: randomUUID(),
    })
    .returning();
  if (!subscription) throw new Error("Missing subscription");
  const input = {
    id: f.record.id,
    operationId: randomUUID(),
    expectedVersion: f.record.version,
    subscriptionId: subscription.id,
    subject: "Synthetic appointment question",
    body: "Please confirm your preferred time. Synthetic test only.",
  };
  const drafted = await draftCaseEmail(t.db, f.staff.session, input);
  const view = await caseEmailWorkbench(t.db, f.staff.session, f.record.id, config);
  const item = view.items[0];
  if (!item?.reviewHash) throw new Error("No review");
  const approve = {
    id: f.record.id,
    operationId: randomUUID(),
    expectedVersion: drafted.outcome.version,
    messageId: drafted.outcome.messageId,
    messageVersion: item.message.version,
    reviewHash: item.reviewHash,
    reviewed: true,
  };
  return { ...f, contact, subscription, input, drafted, approve, item };
}
async function queued() {
  const f = await fixture();
  const a = await approveCaseEmail(t.db, f.staff.session, f.approve, config);
  return { ...f, actionId: a.outcome.actionId };
}
const provider = () => ({
  name: "resend",
  send: vi
    .fn<MessageProvider["send"]>()
    .mockResolvedValue({ status: "accepted", providerMessageId: randomUUID() }),
});
async function state(id: string) {
  return (await t.db.select().from(messages).where(eq(messages.id, id)))[0]?.state;
}
it("draft does not enqueue; approval binds exact content and duplicate operation has one effect", async () => {
  const f = await fixture();
  expect(
    await t.db
      .select()
      .from(externalActions)
      .where(eq(externalActions.subjectId, f.approve.messageId)),
  ).toHaveLength(0);
  expect((await draftCaseEmail(t.db, f.staff.session, f.input)).outcome).toEqual(f.drafted.outcome);
  const a = await approveCaseEmail(t.db, f.staff.session, f.approve, config);
  expect((await approveCaseEmail(t.db, f.staff.session, f.approve, config)).outcome).toEqual(
    a.outcome,
  );
  expect(
    await t.db
      .select()
      .from(externalActions)
      .where(eq(externalActions.subjectId, f.approve.messageId)),
  ).toHaveLength(1);
  const view = await caseEmailWorkbench(t.db, f.staff.session, f.record.id, {
    ...config,
    from: "Changed <different@example.test>",
  });
  expect(view.items[0]?.content?.from).toBe(config.from);
  expect(view.items[0]?.reviewHash).toBeNull();
});
it("requires a reviewed digest, current contact revision and staff authority", async () => {
  const f = await fixture();
  await expect(
    approveCaseEmail(
      t.db,
      f.staff.session,
      { ...f.approve, operationId: randomUUID(), reviewHash: "0".repeat(64) },
      config,
    ),
  ).rejects.toMatchObject({ code: "version_conflict" });
  await expect(approveCaseEmail(t.db, f.client.session, f.approve, config)).rejects.toMatchObject({
    code: "not_found",
  });
  await t.db
    .update(contactMethods)
    .set({ version: f.contact.version + 1, value: "changed@example.test" })
    .where(eq(contactMethods.id, f.contact.id));
  await expect(approveCaseEmail(t.db, f.staff.session, f.approve, config)).rejects.toMatchObject({
    code: "version_conflict",
  });
});
it.each(["participant", "subscription", "contact", "approver", "approval", "payload"])(
  "rechecks %s before dispatch",
  async (kind) => {
    const f = await queued(),
      p = provider();
    if (kind === "participant")
      await t.db
        .update(caseParticipants)
        .set({ revokedAt: new Date() })
        .where(
          and(
            eq(caseParticipants.caseId, f.record.id),
            eq(caseParticipants.partyId, f.client.partyId),
          ),
        );
    if (kind === "subscription")
      await t.db
        .update(subscriptions)
        .set({ state: "paused" })
        .where(eq(subscriptions.id, f.subscription.id));
    if (kind === "contact")
      await t.db
        .update(contactMethods)
        .set({ lastFailureAt: new Date() })
        .where(eq(contactMethods.id, f.contact.id));
    if (kind === "approver")
      await t.db
        .update(principals)
        .set({ status: "suspended" })
        .where(eq(principals.id, f.staff.id));
    if (kind === "approval")
      await t.db
        .update(approvals)
        .set({
          state: "invalidated",
          invalidatedAt: new Date(),
          invalidationReason: "Synthetic review withdrawn",
        })
        .where(eq(approvals.subjectId, f.approve.messageId));
    if (kind === "payload")
      await t.db
        .update(messages)
        .set({ body: "Changed after review" })
        .where(eq(messages.id, f.approve.messageId));
    expect(await dispatchCaseEmail(t.db, p, f.actionId, { config })).toBe("cancelled");
    expect(p.send).not.toHaveBeenCalled();
  },
);
it("parallel workers send once; acceptance is not delivery and late bounce dominates", async () => {
  const f = await queued(),
    p = provider();
  await Promise.all([
    dispatchCaseEmail(t.db, p, f.actionId, { config }),
    dispatchCaseEmail(t.db, p, f.actionId, { config }),
  ]);
  expect(p.send).toHaveBeenCalledTimes(1);
  expect(await state(f.approve.messageId)).toBe("provider_accepted");
  const result = await p.send.mock.results[0]?.value;
  if (result?.status !== "accepted") throw new Error("Missing result");
  const report = {
    provider: "resend",
    providerMessageId: result.providerMessageId,
    status: "delivered" as const,
  };
  expect(await recordDeliveryReport(t.db, report)).toBe(true);
  expect(await state(f.approve.messageId)).toBe("delivered");
  expect(
    await recordDeliveryReport(t.db, { ...report, status: "failed", code: "email.bounced" }),
  ).toBe(true);
  expect(await recordDeliveryReport(t.db, report)).toBe(false);
  expect(await state(f.approve.messageId)).toBe("bounced");
  expect(
    (
      await t.db
        .select()
        .from(messageAttempts)
        .where(eq(messageAttempts.messageId, f.approve.messageId))
    )[0]?.state,
  ).toBe("bounced");
});
it("an ambiguous outcome is never resent and reconciliation updates the message", async () => {
  const f = await queued(),
    p = provider();
  p.send.mockRejectedValue(new Error("Connection lost after accept"));
  expect(await dispatchCaseEmail(t.db, p, f.actionId, { config })).toBe("outcome_unknown");
  expect(await dispatchCaseEmail(t.db, p, f.actionId, { config })).toBe("outcome_unknown");
  expect(p.send).toHaveBeenCalledTimes(1);
  await reconcileMessage(t.db, f.actionId, { state: "verified", providerMessageId: randomUUID() });
  expect(await state(f.approve.messageId)).toBe("delivered");
});
it("definite rejection keeps one key and stops beyond the provider window", async () => {
  const f = await queued(),
    p = provider();
  p.send.mockResolvedValue({ status: "rejected", code: "rate_limit", retryable: true });
  const now = new Date();
  expect(await dispatchCaseEmail(t.db, p, f.actionId, { config, now })).toBe("queued");
  expect(
    (
      await t.db
        .select()
        .from(messageAttempts)
        .where(eq(messageAttempts.messageId, f.approve.messageId))
    )[0]?.state,
  ).toBe("failed");
  expect(
    await dispatchCaseEmail(t.db, p, f.actionId, {
      config,
      now: new Date(now.getTime() + 86400001),
    }),
  ).toBe("cancelled");
  expect(p.send).toHaveBeenCalledTimes(1);
});
it("disabled provider configuration leaves a queued review untouched", async () => {
  const f = await queued(),
    p = provider();
  expect(await dispatchCaseEmail(t.db, p, f.actionId, { config: null })).toBe("queued");
  expect(p.send).not.toHaveBeenCalled();
});

it("current participation is fenced until the provider handoff completes", async () => {
  const f = await queued(),
    p = provider();
  let start!: () => void, finish!: () => void;
  const entered = new Promise<void>((resolve) => {
    start = resolve;
  });
  const released = new Promise<void>((resolve) => {
    finish = resolve;
  });
  p.send.mockImplementation(async () => {
    expect(
      (await t.db.select().from(externalActions).where(eq(externalActions.id, f.actionId)))[0]
        ?.state,
    ).toBe("attempting");
    expect(
      await t.db
        .select()
        .from(messageAttempts)
        .where(eq(messageAttempts.externalActionId, f.actionId)),
    ).toHaveLength(1);
    start();
    await released;
    return { status: "accepted", providerMessageId: randomUUID() };
  });
  const dispatch = dispatchCaseEmail(t.db, p, f.actionId, { config });
  await entered;
  // Another transaction may not revoke a recipient halfway through a handoff.
  let revoked = false;
  const revoke = t.db
    .update(caseParticipants)
    .set({ revokedAt: new Date() })
    .where(
      and(eq(caseParticipants.caseId, f.record.id), eq(caseParticipants.partyId, f.client.partyId)),
    )
    .then(() => {
      revoked = true;
    });
  try {
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(revoked).toBe(false);
  } finally {
    finish();
    await dispatch;
    await revoke;
  }
  expect(p.send).toHaveBeenCalledTimes(1);
  expect(revoked).toBe(true);
});

it("the worker routes reviewed mail through its guard and rejects a mistagged template", async () => {
  const f = await queued(),
    p = provider();
  vi.stubEnv("CASE_EMAIL_ENABLED", "1");
  vi.stubEnv("EMAIL_FROM", config.from);
  vi.stubEnv("CASE_REPLY_DOMAIN", config.replyDomain);
  try {
    expect(await dispatchMessage(t.db, p, f.actionId)).toBe("acknowledged");
    const mistagged = await enqueueMessage(t.db, {
      idempotencyKey: randomUUID(),
      channel: "email",
      recipient: f.contact.value,
      template: "case.reviewed-email.v1",
      params: f.item.content ?? {},
    });
    expect(await dispatchMessage(t.db, p, mistagged.id)).toBe("cancelled");
    expect(p.send).toHaveBeenCalledTimes(1);
  } finally {
    vi.unstubAllEnvs();
  }
});
it("disabled Case email cannot starve access emails in a bounded queue sweep", async () => {
  await queued();
  const p = provider();
  vi.stubEnv("CASE_EMAIL_ENABLED", "");
  try {
    const access = await enqueueMessage(t.db, {
      idempotencyKey: randomUUID(),
      channel: "email",
      recipient: "access@example.test",
      template: "auth.email_link",
    });
    expect(await dispatchQueued(t.db, p, 1)).toBe(1);
    expect(p.send).toHaveBeenCalledTimes(1);
    expect(p.send.mock.calls[0]?.[0].outboxId).toBe(access.id);
  } finally {
    vi.unstubAllEnvs();
  }
});

it("withdrawn human policy approval invalidates already queued Case email", async () => {
  const f = await queued(),
    p = provider();
  const policyId = f.subscription.policyVersion.split(":")[0];
  const condition = and(
    eq(approvals.subjectId, policyId ?? ""),
    eq(approvals.kind, "legal_process_claim"),
  );
  const previous = await t.db.select().from(approvals).where(condition);
  try {
    await t.db
      .update(approvals)
      .set({
        state: "invalidated",
        invalidatedAt: new Date(),
        invalidationReason: "Synthetic policy withdrawal",
      })
      .where(
        and(eq(approvals.subjectId, policyId ?? ""), eq(approvals.kind, "legal_process_claim")),
      );
    expect(await dispatchCaseEmail(t.db, p, f.actionId, { config })).toBe("cancelled");
    expect(p.send).not.toHaveBeenCalled();
  } finally {
    for (const row of previous)
      await t.db
        .update(approvals)
        .set({
          state: row.state,
          invalidatedAt: row.invalidatedAt,
          invalidationReason: row.invalidationReason,
        })
        .where(eq(approvals.id, row.id));
  }
});
it("an exact approved reply token suggests a Case but never assigns an incoming sender", async () => {
  const { inboundEmails, inboxEvents } = await import("@/db/schema");
  const { retrieveInboundEmail } = await import("../inbound/service");
  const f = await queued();
  if (!f.item.content) throw new Error("Missing approved snapshot");
  const id = randomUUID();
  const [event] = await t.db
    .insert(inboxEvents)
    .values({
      provider: "resend",
      eventId: randomUUID(),
      eventType: "email.received",
      signatureVerified: true,
      payload: { emailId: id },
      state: "received",
    })
    .returning();
  if (!event) throw new Error("Missing receipt");
  const reply = f.item.content.replyTo;
  await retrieveInboundEmail(
    t.db,
    {
      name: "resend",
      retrieve: async () => ({
        id,
        from: "spoofed@example.test",
        senderAddress: "spoofed@example.test",
        recipients: [reply],
        subject: "Synthetic reply",
        text: "Untrusted reply",
        receivedAt: new Date().toISOString(),
        htmlOmitted: false,
        authentication: { dmarc: "fail" },
        attachments: [],
      }),
    },
    event.id,
    config.replyDomain,
  );
  const [incoming] = await t.db
    .select()
    .from(inboundEmails)
    .where(eq(inboundEmails.providerEmailId, id));
  expect(incoming).toMatchObject({
    state: "triage",
    originatingMessageId: f.approve.messageId,
    suggestedCaseId: f.record.id,
    caseId: null,
    senderPartyId: null,
    messageId: null,
  });
});
async function calendarFixture() {
  const { appointments, appointmentParticipants } = await import("@/db/schema");
  const f = await fixture();
  const [appointment] = await t.db
    .insert(appointments)
    .values({
      reference: `AP-${randomUUID()}`,
      state: "confirmed",
      format: "in_person",
      caseId: f.record.id,
      hostId: f.staff.id,
      timezone: "Europe/Sofia",
      propertyAccess: "confirmed",
      externalBusyCheckedAt: new Date(),
      confirmedStartsAt: new Date("2027-01-15T08:00:00Z"),
      confirmedEndsAt: new Date("2027-01-15T09:00:00Z"),
      icsUid: `${randomUUID()}@appointments.example.test`,
      icsSequence: 1,
      accessNotes: "Private keys and private address",
    })
    .returning();
  if (!appointment) throw new Error("No appointment");
  await t.db
    .insert(appointmentParticipants)
    .values({ appointmentId: appointment.id, partyId: f.client.partyId, role: "buyer" });
  return { ...f, appointment };
}
async function calendarQueued(
  f: Awaited<ReturnType<typeof calendarFixture>>,
  beforeApproval?: () => Promise<unknown>,
) {
  const { cases } = await import("@/db/schema");
  const [record] = await t.db.select().from(cases).where(eq(cases.id, f.record.id));
  const drafted = await draftCaseEmail(
    t.db,
    f.staff.session,
    {
      ...f.input,
      operationId: randomUUID(),
      expectedVersion: record?.version,
      appointmentId: f.appointment.id,
    },
    "service@example.test",
  );
  const view = await caseEmailWorkbench(t.db, f.staff.session, f.record.id, config),
    item = view.items.find((item) => item.message.id === drafted.outcome.messageId);
  if (!item?.reviewHash || !item.content?.calendar) throw new Error("No calendar review");
  await beforeApproval?.();
  const approved = await approveCaseEmail(
    t.db,
    f.staff.session,
    {
      operationId: randomUUID(),
      id: f.record.id,
      expectedVersion: drafted.outcome.version,
      messageId: item.message.id,
      messageVersion: item.message.version,
      reviewHash: item.reviewHash,
      reviewed: true,
    },
    config,
  );
  return { item, approved };
}
it("reviews and sends only the committed calendar snapshot for an appointment participant", async () => {
  const { renderCaseEmail } = await import("./email-contract");
  const f = await calendarFixture(),
    { item, approved } = await calendarQueued(f),
    p = provider();
  expect(await dispatchCaseEmail(t.db, p, approved.outcome.actionId, { config })).toBe(
    "acknowledged",
  );
  const sent = p.send.mock.calls[0]?.[0];
  if (!sent) throw new Error("Missing provider call");
  const rendered = renderCaseEmail(sent, config),
    attachment = rendered?.attachments?.[0];
  expect(attachment?.content_type).toBe("text/calendar; charset=utf-8; method=REQUEST");
  const decoded = Buffer.from(attachment?.content ?? "", "base64").toString("utf8");
  expect(decoded).toContain(`UID:${f.appointment.icsUid}`);
  expect(decoded).toContain("SEQUENCE:1");
  expect(decoded).toContain("DTSTART:20270115T080000Z");
  expect(decoded).not.toContain("Private keys");
  expect(item.content?.calendar?.appointmentVersion).toBe(f.appointment.version);
});
it.each(["version", "participant"])(
  "cancels queued calendar mail after %s changes",
  async (kind) => {
    const { appointments, appointmentParticipants } = await import("@/db/schema");
    const f = await calendarFixture(),
      { approved } = await calendarQueued(f),
      p = provider();
    if (kind === "version")
      await t.db
        .update(appointments)
        .set({ version: f.appointment.version + 1 })
        .where(eq(appointments.id, f.appointment.id));
    else
      await t.db
        .delete(appointmentParticipants)
        .where(eq(appointmentParticipants.appointmentId, f.appointment.id));
    expect(await dispatchCaseEmail(t.db, p, approved.outcome.actionId, { config })).toBe(
      "cancelled",
    );
    expect(p.send).not.toHaveBeenCalled();
  },
);
it("cancellation creates a newly reviewed CANCEL with stable UID and next sequence", async () => {
  const { respondToAppointment } = await import("../appointments/service");
  const f = await calendarFixture(),
    first = await calendarQueued(f);
  await respondToAppointment(t.db, f.staff.session, {
    id: f.appointment.id,
    operationId: randomUUID(),
    expectedVersion: f.appointment.version,
    state: "cancelled",
    reason: "Synthetic cancellation reviewed by the broker",
  });
  const cancellation = await calendarQueued(f),
    p = provider();
  expect(cancellation.item.content?.calendar).toMatchObject({
    uid: first.item.content?.calendar?.uid,
    cancelled: true,
    sequence: 2,
  });
  expect(await dispatchCaseEmail(t.db, p, first.approved.outcome.actionId, { config })).toBe(
    "cancelled",
  );
  expect(p.send).not.toHaveBeenCalled();
  expect(await dispatchCaseEmail(t.db, p, cancellation.approved.outcome.actionId, { config })).toBe(
    "acknowledged",
  );
});
it("cannot silently change an established calendar organizer or address a non-participant", async () => {
  const { cases, appointmentParticipants } = await import("@/db/schema");
  const f = await calendarFixture();
  await calendarQueued(f);
  const [record] = await t.db.select().from(cases).where(eq(cases.id, f.record.id));
  const input = {
    ...f.input,
    operationId: randomUUID(),
    expectedVersion: record?.version,
    appointmentId: f.appointment.id,
  };
  await expect(
    draftCaseEmail(t.db, f.staff.session, input, "changed@example.test"),
  ).rejects.toMatchObject({ code: "transition_denied" });
  await t.db
    .delete(appointmentParticipants)
    .where(eq(appointmentParticipants.appointmentId, f.appointment.id));
  await expect(
    draftCaseEmail(
      t.db,
      f.staff.session,
      { ...input, operationId: randomUUID() },
      "service@example.test",
    ),
  ).rejects.toMatchObject({ code: "transition_denied" });
});

it("refuses approval after the calendar preview becomes stale", async () => {
  const { appointments } = await import("@/db/schema");
  const f = await calendarFixture();
  await expect(
    calendarQueued(f, async () =>
      t.db
        .update(appointments)
        .set({ version: f.appointment.version + 1 })
        .where(eq(appointments.id, f.appointment.id)),
    ),
  ).rejects.toMatchObject({ code: "version_conflict" });
  const drafts = await t.db.select().from(messages).where(eq(messages.caseId, f.record.id));
  expect(drafts.every((m) => m.state === "draft" && m.approvalId === null)).toBe(true);
});
