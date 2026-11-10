// ADR 0014 against a real database: each Deal event queues exactly one notice per recipient, in
// the recipient's language, once; ineligible recipients are skipped with a recorded reason; the
// send-time recheck cancels stale or revoked notices; and no restricted detail reaches a notice.
import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { serviceNotifications } from "@/config/tenant";
import {
  appointmentParticipants,
  appointments,
  auditEvents,
  caseParticipants,
  cases,
  contactMethods,
  externalActions,
  grants,
  parties,
  principals,
  subscriptions,
} from "@/db/schema";
import { createTestDatabase, type TestDatabase } from "@/db/test-utils";
import {
  arrangeAppointment,
  confirmAppointmentTime,
  readAppointment,
  respondToAppointment,
} from "../appointments/service";
import { consumeEmailLink, issueEmailLink } from "../auth/email-link";
import { issueClientInvitation, respondToClientInvitation } from "../auth/invitations";
import { postCaseMessage } from "../cases/commands";
import { getEnv } from "../config/env";
import { documentRequestFixture } from "../documents/request-testing";
import { dispatchMessage } from "../jobs/outbox";
import { type OutboundMessage, TestMessageProvider } from "../jobs/provider";
import { saveContactPreferences } from "../privacy/preferences";
import { recordProposalDecision, transitionProposal } from "../proposals/service";
import { proposalFixture, publishProposalForTest } from "../proposals/testing";
import { notifyViewingChange } from "./appointments";
import { dealNoticeSubject, dealNoticeTemplate } from "./events";
import { dispatchDealNotices } from "./guard";
import { notifyDealStepDone } from "./notify";
import { renderDealNotice } from "./template";
import { serviceEmailChoice, viewingFixture, viewingSlot } from "./testing";

let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => {
  await t?.drop();
});

const from = "MS Realty <service@example.test>";
const restricted = [
  "Private key collection instructions",
  "Synthetic private reason",
  "Synthetic message body",
  "12000000",
  "120000",
  "Professional due diligence",
  "Synthetic property information",
  "Review the supplied property information",
];

async function notices(caseId: string) {
  return t.db
    .select()
    .from(externalActions)
    .where(
      and(
        eq(externalActions.subjectType, dealNoticeSubject),
        eq(externalActions.subjectId, caseId),
      ),
    )
    .orderBy(externalActions.createdAt, externalActions.id);
}
function event(row: typeof externalActions.$inferSelect) {
  return (row.payload as { params: { event: string } }).params.event;
}
function params(row: typeof externalActions.$inferSelect) {
  return (row.payload as { params: Record<string, unknown> }).params as {
    event: string;
    locale: string;
    url: string;
    recipient: { kind: string };
    calendar?: { uid: string; sequence: number; cancelled: boolean };
  };
}
function rendered(row: typeof externalActions.$inferSelect) {
  const payload = row.payload as { recipient: string; params: Record<string, unknown> };
  const message: OutboundMessage = {
    outboxId: row.id,
    idempotencyKey: row.effectKey,
    channel: "email",
    recipient: payload.recipient,
    template: dealNoticeTemplate,
    params: payload.params,
    secretParams: null,
  };
  return renderDealNotice(message, { hosts: getEnv().hosts, from });
}
function expectNoRestrictedDetail(row: typeof externalActions.$inferSelect) {
  const text = JSON.stringify(row.payload) + JSON.stringify(rendered(row) ?? {});
  for (const value of restricted) expect(text).not.toContain(value);
}
const arrange = (id: string, expectedVersion: number, action: "propose" | "confirm", day = 15) => ({
  id,
  operationId: randomUUID(),
  expectedVersion,
  action,
  ...viewingSlot(day),
  bufferMinutes: 30,
  propertyAccessConfirmed: true,
  externalBusyChecked: true,
  accessNotes: "Private key collection instructions",
});

describe("viewing notices", () => {
  it("tells the client once, in their language, about a proposed then confirmed viewing with its calendar file; the client's confirmation tells the broker", async () => {
    const f = await viewingFixture(t.db, { locale: "he" });
    const proposed = await arrangeAppointment(
      t.db,
      f.staff.session,
      arrange(f.request.id, 1, "propose"),
    );
    let rows = await notices(f.record.id);
    expect(rows).toHaveLength(1);
    const [first] = rows;
    if (!first) throw new Error("No notice");
    expect(first).toMatchObject({ state: "queued", kind: "email_send", attempts: 0 });
    expect((first.payload as { recipient: string }).recipient).toBe(f.email?.address);
    expect(params(first)).toMatchObject({
      event: "viewing.proposed",
      locale: "he",
      recipient: { kind: "client" },
    });
    expect(params(first).url).toBe(`${getEnv().hosts.client}/he/appointments/${f.request.id}`);
    expect(rendered(first)?.html).toContain('dir="rtl"');
    expectNoRestrictedDetail(first);

    // Replaying the same event finds the same logical send.
    const [current] = await t.db
      .select()
      .from(appointments)
      .where(eq(appointments.id, f.request.id));
    if (!current) throw new Error("No appointment");
    const again = await notifyViewingChange(t.db, "proposed", current, current, f.staff.actor);
    expect(again).toEqual([
      expect.objectContaining({ actionId: first.id, state: "queued", created: false }),
    ]);
    expect(await notices(f.record.id)).toHaveLength(1);

    await arrangeAppointment(
      t.db,
      f.staff.session,
      arrange(f.request.id, proposed.outcome.version, "confirm"),
    );
    rows = await notices(f.record.id);
    expect(rows.map(event)).toEqual(["viewing.proposed", "viewing.confirmed"]);
    const confirmed = rows[1];
    if (!confirmed) throw new Error("No confirmation notice");
    expect(params(confirmed).calendar).toMatchObject({ sequence: 1, cancelled: false });
    expect(params(confirmed).calendar?.uid).toBe(current.icsUid);
    const ics = Buffer.from(
      rendered(confirmed)?.attachments?.[0]?.content ?? "",
      "base64",
    ).toString();
    expect(ics).toContain(`UID:${current.icsUid}`);
    expect(ics).toContain("SEQUENCE:1");
    expectNoRestrictedDetail(confirmed);

    // The worker delivers both; acceptance is recorded as acknowledged, not delivered.
    const provider = new TestMessageProvider();
    expect(await dispatchDealNotices(t.db, provider)).toBe(2);
    expect(provider.sent.map((m) => m.recipient)).toEqual([f.email?.address, f.email?.address]);
    expect((await notices(f.record.id)).map((row) => row.state)).toEqual([
      "acknowledged",
      "acknowledged",
    ]);

    const before = await readAppointment(t.db, f.client.session, f.request.id, "he");
    expect(before.canConfirmTime).toBe(true);
    await confirmAppointmentTime(t.db, f.client.session, {
      id: f.request.id,
      operationId: randomUUID(),
      expectedVersion: before.appointment.version,
    });
    const after = await readAppointment(t.db, f.client.session, f.request.id, "he");
    expect(after).toMatchObject({ canConfirmTime: false, timeConfirmedByClient: true });
    await expect(
      confirmAppointmentTime(t.db, f.client.session, {
        id: f.request.id,
        operationId: randomUUID(),
        expectedVersion: before.appointment.version,
      }),
    ).rejects.toMatchObject({ code: "transition_denied" });
    rows = await notices(f.record.id);
    const broker = rows[2];
    if (!broker) throw new Error("No broker notice");
    expect(rows).toHaveLength(3);
    expect(params(broker)).toMatchObject({
      event: "client.viewing_confirmed",
      locale: "bg",
      recipient: { kind: "staff" },
    });
    expect((broker.payload as { recipient: string }).recipient).toBe(f.staff.email);
    expect(params(broker).url).toBe(`${getEnv().hosts.staff}/bg/calendar/${f.request.id}`);
    expect(rendered(broker)?.text).toContain("Клиентът потвърди часа за оглед");
    expectNoRestrictedDetail(broker);
  });

  it("supersedes an unsent confirmation when the time moves, and cancels with the same UID", async () => {
    const f = await viewingFixture(t.db, { locale: "de" });
    const confirmed = await arrangeAppointment(
      t.db,
      f.staff.session,
      arrange(f.request.id, 1, "confirm"),
    );
    const requested = await respondToAppointment(t.db, f.client.session, {
      id: f.request.id,
      operationId: randomUUID(),
      expectedVersion: confirmed.outcome.version,
      state: "reschedule_requested",
      reason: "Synthetic private reason",
    });
    const moved = await arrangeAppointment(
      t.db,
      f.staff.session,
      arrange(f.request.id, requested.outcome.version, "confirm", 16),
    );
    await respondToAppointment(t.db, f.staff.session, {
      id: f.request.id,
      operationId: randomUUID(),
      expectedVersion: moved.outcome.version,
      state: "cancelled",
      reason: "Synthetic private reason",
    });
    const rows = await notices(f.record.id);
    expect(rows.map(event)).toEqual([
      "viewing.confirmed",
      "client.viewing_new_time",
      "viewing.moved",
      "viewing.cancelled",
    ]);
    expect(rows.map((row) => params(row).calendar?.sequence)).toEqual([1, undefined, 2, 3]);
    expect(new Set(rows.flatMap((row) => params(row).calendar?.uid ?? [])).size).toBe(1);
    expect(params(rows[3] as (typeof rows)[number]).calendar?.cancelled).toBe(true);
    for (const row of rows) expectNoRestrictedDetail(row);
    expect(rendered(rows[2] as (typeof rows)[number])?.subject).toContain("verschoben");

    const provider = new TestMessageProvider();
    await dispatchDealNotices(t.db, provider);
    const states = (await notices(f.record.id)).map((row) => [
      event(row),
      row.state,
      row.lastErrorCode,
    ]);
    expect(states).toEqual([
      ["viewing.confirmed", "cancelled", "deal_notice_superseded"],
      ["client.viewing_new_time", "acknowledged", null],
      ["viewing.moved", "cancelled", "deal_notice_superseded"],
      ["viewing.cancelled", "acknowledged", null],
    ]);
    const ics = Buffer.from(
      rendered(rows[3] as (typeof rows)[number])?.attachments?.[0]?.content ?? "",
      "base64",
    ).toString();
    expect(ics).toContain("METHOD:CANCEL");
    expect(ics).toContain("SEQUENCE:3");
  });

  it("records a skip with its reason instead of sending, and rechecks access at send time", async () => {
    const none = await viewingFixture(t.db, { subscribed: false });
    await arrangeAppointment(t.db, none.staff.session, arrange(none.request.id, 1, "propose"));
    const [noEmail] = await notices(none.record.id);
    expect(noEmail).toMatchObject({ state: "cancelled", lastErrorCode: "no_verified_email" });
    expect((noEmail?.payload as { recipient: unknown } | undefined)?.recipient).toBeNull();

    // A verified address that is not the client's sign-in address is not a basis on its own.
    const other = await viewingFixture(t.db, { subscribed: false });
    const value = `verified-${randomUUID()}@example.test`;
    await t.db.insert(contactMethods).values({
      partyId: other.client.partyId,
      kind: "email",
      value,
      normalizedValue: value,
      verification: "verified",
      verifiedAt: new Date(),
    });
    await arrangeAppointment(t.db, other.staff.session, arrange(other.request.id, 1, "propose"));
    expect((await notices(other.record.id))[0]).toMatchObject({
      state: "cancelled",
      lastErrorCode: "no_verified_email",
    });

    const revoked = await viewingFixture(t.db);
    await arrangeAppointment(
      t.db,
      revoked.staff.session,
      arrange(revoked.request.id, 1, "propose"),
    );
    const [queued] = await notices(revoked.record.id);
    expect(queued?.state).toBe("queued");
    await t.db
      .update(caseParticipants)
      .set({ revokedAt: new Date() })
      .where(eq(caseParticipants.caseId, revoked.record.id));
    const provider = new TestMessageProvider();
    expect(await dispatchMessage(t.db, provider, queued?.id ?? "")).toBe("cancelled");
    expect(provider.sent).toHaveLength(0);
    expect((await notices(revoked.record.id))[0]?.lastErrorCode).toBe("deal_notice_access_revoked");

    const withdrawn = await viewingFixture(t.db);
    await arrangeAppointment(
      t.db,
      withdrawn.staff.session,
      arrange(withdrawn.request.id, 1, "propose"),
    );
    await t.db
      .update(subscriptions)
      .set({ state: "withdrawn" })
      .where(eq(subscriptions.partyId, withdrawn.client.partyId));
    await dispatchDealNotices(t.db, provider);
    expect((await notices(withdrawn.record.id))[0]).toMatchObject({
      state: "cancelled",
      lastErrorCode: "deal_notice_notices_switched_off",
    });
    expect(provider.sent).toHaveLength(0);
  });

  it("records nothing for an event the tenant profile switched off, and the worker parks queued ones", async () => {
    const events = serviceNotifications.events as Record<string, boolean>;
    const f = await viewingFixture(t.db);
    events["viewing.proposed"] = false;
    try {
      await arrangeAppointment(t.db, f.staff.session, arrange(f.request.id, 1, "propose"));
      expect(await notices(f.record.id)).toHaveLength(0);
    } finally {
      events["viewing.proposed"] = true;
    }
    const g = await viewingFixture(t.db);
    await arrangeAppointment(t.db, g.staff.session, arrange(g.request.id, 1, "propose"));
    (serviceNotifications as { enabled: boolean }).enabled = false;
    const provider = new TestMessageProvider();
    try {
      await dispatchDealNotices(t.db, provider);
    } finally {
      (serviceNotifications as { enabled: boolean }).enabled = true;
    }
    expect(provider.sent).toHaveLength(0);
    expect((await notices(g.record.id))[0]?.lastErrorCode).toBe("deal_notice_disabled");
  });
});

describe("service notices are on by default for a Deal participant", () => {
  async function signIn(address: string) {
    await issueEmailLink(t.db, { email: address, returnTo: null, locale: "en" });
    const [link] = await t.db
      .select()
      .from(externalActions)
      .where(
        and(
          eq(externalActions.state, "queued"),
          sql`${externalActions.payload}->>'template' = 'auth.email_link'`,
          sql`lower(${externalActions.payload}->>'recipient') = ${address.toLowerCase()}`,
        ),
      );
    const provider = new TestMessageProvider();
    await dispatchMessage(t.db, provider, link?.id ?? "");
    const url = new URL(String(provider.sent[0]?.secretParams?.url));
    return consumeEmailLink(t.db, url.searchParams.get("token") ?? "");
  }

  it("an invited client who signs in and accepts gets the viewing notice; switching notices off stops them with a recorded reason", async () => {
    const f = await viewingFixture(t.db, { subscribed: false });
    await t.db
      .insert(grants)
      .values({ principalId: f.staff.id, capability: "access.grant", reason: "Synthetic test" });
    const address = `invited-${randomUUID()}@example.test`;
    const invitation = await issueClientInvitation(t.db, {
      session: f.staff.session,
      email: address,
      displayName: "Invited co-buyer",
      caseId: f.record.id,
      role: "co_buyer",
    });
    const signedIn = await signIn(address);
    await respondToClientInvitation(t.db, invitation.invitationId, signedIn.session, "accept", {
      clientIp: randomUUID(),
    });
    const [invited] = await t.db.select().from(principals).where(eq(principals.email, address));
    if (!invited) throw new Error("No invited principal");
    // The basis is recorded as Deal participation; no consent or subscription is created.
    expect(
      await t.db.select().from(subscriptions).where(eq(subscriptions.partyId, invited.partyId)),
    ).toHaveLength(0);
    const basis = await t.db
      .select()
      .from(auditEvents)
      .where(
        and(
          eq(auditEvents.action, "deal_notices.basis_recorded"),
          eq(auditEvents.recordId, f.record.id),
        ),
      );
    expect(basis).toHaveLength(1);
    await t.db
      .insert(appointmentParticipants)
      .values({ appointmentId: f.request.id, partyId: invited.partyId, role: "co_buyer" });

    const proposed = await arrangeAppointment(
      t.db,
      f.staff.session,
      arrange(f.request.id, 1, "propose"),
    );
    const sent = (await notices(f.record.id)).filter(
      (row) => (row.payload as { recipient: string | null }).recipient === address,
    );
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ state: "queued" });
    expect(params(sent[0] as (typeof sent)[number])).toMatchObject({
      event: "viewing.proposed",
      recipient: { kind: "client", basis: "deal_participation" },
    });
    // The worker sends it: the recheck accepts the same basis at send time.
    const provider = new TestMessageProvider();
    await dispatchDealNotices(t.db, provider);
    expect(provider.sent.map((m) => m.recipient)).toContain(address);

    const [party] = await t.db.select().from(parties).where(eq(parties.id, invited.partyId));
    await saveContactPreferences(t.db, signedIn.session, {
      operationId: randomUUID(),
      expectedVersion: party?.version ?? 1,
      locale: "en",
      timezone: "Europe/Sofia",
      channel: "email",
      contactWindow: "",
      dealNotices: false,
    });
    expect(
      await t.db
        .select()
        .from(auditEvents)
        .where(
          and(
            eq(auditEvents.action, "preferences.deal_notices.off"),
            eq(auditEvents.recordId, invited.partyId),
          ),
        ),
    ).toHaveLength(1);
    await arrangeAppointment(
      t.db,
      f.staff.session,
      arrange(f.request.id, proposed.outcome.version, "confirm"),
    );
    const confirmed = (await notices(f.record.id)).filter(
      (row) => event(row) === "viewing.confirmed",
    );
    const mine = confirmed.find(
      (row) =>
        (params(row).recipient as { kind: string; id?: string }).kind === "client" &&
        (row.payload as { params: { recipient: { id?: string; partyId?: string } } }).params
          .recipient.id === invited.partyId,
    );
    expect(mine).toMatchObject({ state: "cancelled", lastErrorCode: "notices_switched_off" });
    expect((mine?.payload as { recipient: unknown } | undefined)?.recipient).toBeNull();
  });
});

describe("messages, proposals, document requests and deal steps", () => {
  it("tells the client a broker message is waiting and the broker a client wrote, without the text", async () => {
    const f = await viewingFixture(t.db, { locale: "nl" });
    const read = async () =>
      (
        await t.db.select({ version: cases.version }).from(cases).where(eq(cases.id, f.record.id))
      )[0]?.version ?? 0;
    await postCaseMessage(t.db, f.staff.session, {
      id: f.record.id,
      operationId: randomUUID(),
      expectedVersion: await read(),
      body: "Synthetic message body",
      audience: "case_participants",
      reviewed: true,
    });
    await postCaseMessage(t.db, f.client.session, {
      id: f.record.id,
      operationId: randomUUID(),
      expectedVersion: await read(),
      body: "Synthetic message body",
      audience: "case_participants",
      reviewed: false,
    });
    await postCaseMessage(t.db, f.staff.session, {
      id: f.record.id,
      operationId: randomUUID(),
      expectedVersion: await read(),
      body: "Synthetic message body",
      audience: "internal",
      reviewed: false,
    });
    const rows = await notices(f.record.id);
    expect(rows.map((row) => [event(row), params(row).locale, row.state])).toEqual([
      ["message.from_broker", "nl", "queued"],
      ["client.message", "bg", "queued"],
    ]);
    expect(params(rows[0] as (typeof rows)[number]).url).toBe(
      `${getEnv().hosts.client}/nl/messages/${f.record.id}`,
    );
    for (const row of rows) expectNoRestrictedDetail(row);
  });

  it("tells the client a proposal is ready or withdrawn, and the broker about the answer, never the terms", async () => {
    const f = await proposalFixture(t.db);
    await serviceEmailChoice(t.db, f.client.partyId);
    await t.db
      .update(parties)
      .set({ preferredLocale: "el" })
      .where(eq(parties.id, f.client.partyId));
    await publishProposalForTest(t.db, f);
    await recordProposalDecision(t.db, f.client.session, {
      id: f.proposal.id,
      revisionId: f.revision.id,
      operationId: randomUUID(),
      expectedVersion: 3,
      state: "declined",
      reason: "Synthetic private reason",
    });
    let rows = await notices(f.record.id);
    expect(rows.map((row) => [event(row), params(row).locale])).toEqual([
      ["proposal.ready", "el"],
      ["client.proposal_declined", "bg"],
    ]);
    for (const row of rows) expectNoRestrictedDetail(row);

    const g = await proposalFixture(t.db);
    await serviceEmailChoice(t.db, g.client.partyId);
    await publishProposalForTest(t.db, g);
    await transitionProposal(t.db, g.staff.session, {
      id: g.proposal.id,
      revisionId: g.revision.id,
      operationId: randomUUID(),
      expectedVersion: 3,
      action: "withdraw",
      reviewed: true,
      reason: "Synthetic private reason",
    });
    rows = await notices(g.record.id);
    expect(rows.map(event)).toEqual(["proposal.ready", "proposal.withdrawn"]);
    expect(params(rows[1] as (typeof rows)[number]).url).toBe(
      `${getEnv().hosts.client}/bg/proposals/${g.proposal.id}`,
    );
    for (const row of rows) expectNoRestrictedDetail(row);
  });

  it("tells the client a document was requested without naming it", async () => {
    const f = await documentRequestFixture(t.db);
    // The fixture requested before any choice existed: that notice is a recorded skip.
    const [skipped] = await notices(f.record.id);
    expect(skipped).toMatchObject({ state: "cancelled", lastErrorCode: "no_verified_email" });
    expect(params(skipped as NonNullable<typeof skipped>).event).toBe("document.requested");
    expectNoRestrictedDetail(skipped as NonNullable<typeof skipped>);
  });

  it("notifies a deal step once with the label in the client's language or the source label", async () => {
    const f = await viewingFixture(t.db, { locale: "ru" });
    const step = {
      caseId: f.record.id,
      stepKey: `${f.record.id}:notary`,
      caseReference: f.record.reference,
      label: { bg: "Нотариусът е насрочен", ru: "Нотариус назначен" },
      actor: f.staff.actor,
    };
    const first = await notifyDealStepDone(t.db, step);
    const second = await notifyDealStepDone(t.db, step);
    expect(first).toHaveLength(1);
    expect(second).toEqual([
      expect.objectContaining({ actionId: first[0]?.actionId, created: false }),
    ]);
    const [row] = await notices(f.record.id);
    expect(rendered(row as NonNullable<typeof row>)?.text).toContain(
      "Этап вашей сделки выполнен: Нотариус назначен.",
    );
    await expect(
      notifyDealStepDone(t.db, { ...step, stepKey: "other", label: { en: "Only English" } }),
    ).rejects.toThrow();
  });
});
