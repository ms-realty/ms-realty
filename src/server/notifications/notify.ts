// notifyDealUpdate: the one entry point for service notices about a Deal (ADR 0014). Called in
// the business transaction, it resolves each recipient now, and either queues one email on the
// external-action ledger (the same outbox → worker → provider path every other email takes) or
// records a cancelled entry with the reason it was skipped. One logical send per event and
// recipient: a retry of the same event finds its entry and changes nothing.
import "server-only";
import { createHash } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import {
  type PublicLocale,
  publicLocales,
  type ServiceNotificationEvent,
  serviceNotificationEnabled,
  sourceLocale,
  staffLocales,
} from "@/config/tenant";
import {
  caseParticipants,
  cases,
  contactMethods,
  externalActions,
  parties,
  principals,
  staffMemberships,
  subscriptions,
} from "@/db/schema";
import { canonicalJson } from "@/domain/approval";
import type { Actor } from "@/domain/capabilities";
import { eligibleCaseRecipient } from "../cases/email";
import { liveParticipation } from "../cases/shared";
import { getEnv } from "../config/env";
import type { HostOrigins } from "../config/hosts";
import type { Executor } from "../db";
import { enqueueMessage } from "../jobs/outbox";
import {
  type ClientNoticeEvent,
  dealNoticeSubject,
  dealNoticeTemplate,
  eventSubject,
  isClientNoticeEvent,
  type NoticeSubjectType,
} from "./events";
import {
  type DealNoticeParams,
  dealNoticeParams,
  noticeCalendarUrl,
  noticePreferencesUrl,
  noticeUrl,
  validDealNoticeParams,
} from "./template";

/** Why a notice was not queued; stored as the ledger entry's `last_error_code`. */
export const noticeSkipReasons = [
  "no_verified_email",
  "no_service_email_choice",
  "access_revoked",
  "staff_inactive",
] as const;
export type NoticeSkipReason = (typeof noticeSkipReasons)[number];

export interface DealUpdate {
  readonly caseId: string;
  readonly event: ServiceNotificationEvent;
  /**
   * Stable identity of this business event (for example `appointment:<id>:v<version>`). A retry
   * of the same event must pass the same key; a new event needs a new key.
   */
  readonly eventKey: string;
  /** The record the notice is about; its page is the notice's only link. */
  readonly subject: {
    readonly type: NoticeSubjectType;
    readonly id: string;
    readonly reference: string;
  };
  /** Who made the change. Nobody is notified of their own step. */
  readonly actor: Actor;
  /** Client events: only these parties (viewing or proposal parties). Default: every live one. */
  readonly partyIds?: readonly string[];
  readonly time?: { readonly startsAt: Date; readonly endsAt: Date } | null;
  readonly calendar?: {
    readonly uid: string;
    readonly sequence: number;
    readonly updatedAt: Date;
    readonly cancelled: boolean;
  } | null;
  /** `deal.step_done` only: the step's client-visible label, at least in the source locale. */
  readonly step?: Readonly<Partial<Record<PublicLocale, string>>>;
}

export interface NoticeOutcome {
  readonly actionId: string;
  readonly recipient: { readonly kind: "client" | "staff"; readonly id: string };
  readonly state: "queued" | "skipped";
  readonly reason?: NoticeSkipReason;
  /** False when this event's notice to this recipient already existed (a retry). */
  readonly created: boolean;
}

export function dealNoticeKey(
  event: ServiceNotificationEvent,
  eventKey: string,
  recipientId: string,
) {
  return `${dealNoticeTemplate}:${event}:${eventKey}:${recipientId}`;
}

const digest = (value: unknown) => createHash("sha256").update(canonicalJson(value)).digest("hex");

async function existing(db: Executor, key: string) {
  const [row] = await db
    .select({ id: externalActions.id, code: externalActions.lastErrorCode })
    .from(externalActions)
    .where(eq(externalActions.effectKey, key));
  return row;
}

function retried(
  prior: { id: string; code: string | null },
  recipient: NoticeOutcome["recipient"],
): NoticeOutcome {
  const reason = noticeSkipReasons.find((code) => code === prior.code);
  return reason
    ? { actionId: prior.id, recipient, state: "skipped", reason, created: false }
    : { actionId: prior.id, recipient, state: "queued", created: false };
}

async function recordSkip(
  db: Executor,
  key: string,
  update: DealUpdate,
  recipient: NoticeOutcome["recipient"],
  reason: NoticeSkipReason,
): Promise<NoticeOutcome> {
  // No address and no rendered content: only what is needed to explain the skip.
  const payload = {
    channel: "email",
    recipient: null,
    template: dealNoticeTemplate,
    params: {
      schemaVersion: 1,
      event: update.event,
      eventKey: update.eventKey,
      caseId: update.caseId,
      subject: update.subject,
      recipient,
    },
  };
  const [row] = await db
    .insert(externalActions)
    .values({
      kind: "email_send",
      effectKey: key,
      subjectType: dealNoticeSubject,
      subjectId: update.caseId,
      payload,
      payloadDigest: digest(payload),
      state: "cancelled",
      lastErrorCode: reason,
    })
    .onConflictDoNothing({ target: externalActions.effectKey })
    .returning({ id: externalActions.id });
  if (row) return { actionId: row.id, recipient, state: "skipped", reason, created: true };
  const prior = await existing(db, key);
  if (!prior) throw new Error("Deal notice vanished after a key conflict.");
  return { actionId: prior.id, recipient, state: "skipped", reason, created: false };
}

function localeOf(...candidates: (string | null | undefined)[]): PublicLocale {
  for (const value of candidates)
    if (value && (publicLocales as readonly string[]).includes(value)) return value as PublicLocale;
  return sourceLocale;
}

function stepFor(update: DealUpdate, locale: PublicLocale) {
  return update.step?.[locale]?.trim() || update.step?.[sourceLocale]?.trim() || undefined;
}

function baseParams(
  update: DealUpdate,
  hosts: HostOrigins,
  locale: string,
  audience: "client" | "staff",
): Omit<DealNoticeParams, "recipient"> {
  const client = audience === "client";
  const calendar = update.calendar && update.time ? update.calendar : null;
  return {
    schemaVersion: 1,
    event: update.event,
    eventKey: update.eventKey,
    caseId: update.caseId,
    subject: update.subject,
    locale: locale as PublicLocale,
    url: noticeUrl(hosts, audience, locale, update.subject, update.caseId, update.event),
    ...(client ? { preferencesUrl: noticePreferencesUrl(hosts, locale) } : {}),
    ...(update.time
      ? {
          time: {
            startsAt: update.time.startsAt.toISOString(),
            endsAt: update.time.endsAt.toISOString(),
          },
        }
      : {}),
    ...(client && calendar
      ? {
          calendar: {
            uid: calendar.uid,
            sequence: calendar.sequence,
            updatedAt: calendar.updatedAt.toISOString(),
            cancelled: calendar.cancelled,
          },
          calendarUrl: noticeCalendarUrl(hosts, locale, update.subject.id),
        }
      : {}),
  };
}

async function queue(
  db: Executor,
  key: string,
  address: string,
  params: DealNoticeParams,
  hosts: HostOrigins,
  recipient: NoticeOutcome["recipient"],
): Promise<NoticeOutcome> {
  const checked = dealNoticeParams.parse(params);
  if (!validDealNoticeParams(checked, hosts)) throw new Error("Invalid deal notice parameters.");
  const action = await enqueueMessage(db, {
    idempotencyKey: key,
    channel: "email",
    recipient: address,
    template: dealNoticeTemplate,
    params: checked,
    subject: { type: dealNoticeSubject, id: params.caseId },
  });
  return { actionId: action.id, recipient, state: "queued", created: action.created };
}

/** The verified service-email recipient for a client party, or why there is none. */
export async function resolveClientRecipient(
  db: Executor,
  caseId: string,
  partyId: string,
  lock = true,
) {
  const [principal] = await db
    .select()
    .from(principals)
    .where(and(eq(principals.partyId, partyId), eq(principals.kind, "client")))
    .orderBy(asc(principals.createdAt));
  const live = await db
    .select({ id: caseParticipants.id })
    .from(caseParticipants)
    .where(
      and(
        eq(caseParticipants.caseId, caseId),
        eq(caseParticipants.partyId, partyId),
        liveParticipation(),
      ),
    );
  if (principal?.status !== "active" || !live.length) return { reason: "access_revoked" as const };
  const choices = await db
    .select({ id: subscriptions.id })
    .from(subscriptions)
    .where(and(eq(subscriptions.partyId, partyId), eq(subscriptions.purpose, "service_updates")))
    .orderBy(asc(subscriptions.createdAt), asc(subscriptions.id));
  for (const choice of choices) {
    const eligible = await eligibleCaseRecipient(db, caseId, choice.id, lock);
    if (eligible) {
      const [party] = await db
        .select({ locale: parties.preferredLocale })
        .from(parties)
        .where(eq(parties.id, partyId));
      return {
        principal,
        eligible,
        locale: localeOf(
          party?.locale,
          principal.preferredLocale,
          eligible.policyVersion.split(":").at(-1),
        ),
      };
    }
  }
  const verified = await db
    .select({ id: contactMethods.id })
    .from(contactMethods)
    .where(
      and(
        eq(contactMethods.partyId, partyId),
        eq(contactMethods.kind, "email"),
        eq(contactMethods.verification, "verified"),
      ),
    );
  return {
    reason: verified.length ? ("no_service_email_choice" as const) : ("no_verified_email" as const),
  };
}

/** The accountable broker as a notice recipient, or why they cannot receive one. */
export async function resolveStaffRecipient(db: Executor, principalId: string) {
  const [row] = await db
    .select({ principal: principals, membership: staffMemberships })
    .from(principals)
    .leftJoin(staffMemberships, eq(staffMemberships.principalId, principals.id))
    .where(eq(principals.id, principalId));
  if (
    row?.principal.kind !== "staff" ||
    row.principal.status !== "active" ||
    row.membership?.state !== "active" ||
    !row.principal.email.includes("@")
  )
    return { reason: "staff_inactive" as const };
  const locale = (staffLocales as readonly string[]).includes(row.membership.staffLocale)
    ? row.membership.staffLocale
    : staffLocales[0];
  return { principal: row.principal, locale };
}

/**
 * Queues the notices one business event owes, in the caller's transaction. Returns one outcome
 * per recipient: queued (dispatched by the worker) or skipped with its reason. An event the
 * tenant profile switched off records nothing.
 */
export async function notifyDealUpdate(
  db: Executor,
  update: DealUpdate,
  hosts: HostOrigins = getEnv().hosts,
): Promise<NoticeOutcome[]> {
  if (!serviceNotificationEnabled(update.event)) return [];
  if (eventSubject[update.event] !== update.subject.type)
    throw new Error("Deal notice subject does not match its event.");
  if ((update.event === "deal.step_done") !== Boolean(update.step?.[sourceLocale]))
    throw new Error("A deal step notice needs its source-locale label.");
  const [record] = await db
    .select({ id: cases.id, ownerId: cases.ownerId })
    .from(cases)
    .where(eq(cases.id, update.caseId));
  if (!record) throw new Error("Deal notice for a missing Deal.");
  const outcomes: NoticeOutcome[] = [];

  if (!isClientNoticeEvent(update.event)) {
    if (!record.ownerId || (update.actor.kind === "staff" && update.actor.id === record.ownerId))
      return outcomes;
    const recipient = { kind: "staff" as const, id: record.ownerId };
    const key = dealNoticeKey(update.event, update.eventKey, record.ownerId);
    const prior = await existing(db, key);
    if (prior) return [retried(prior, recipient)];
    const staff = await resolveStaffRecipient(db, record.ownerId);
    if (staff.reason) return [await recordSkip(db, key, update, recipient, staff.reason)];
    outcomes.push(
      await queue(
        db,
        key,
        staff.principal.email,
        {
          ...baseParams(update, hosts, staff.locale, "staff"),
          recipient: { kind: "staff", principalId: staff.principal.id },
        },
        hosts,
        recipient,
      ),
    );
    return outcomes;
  }

  const actorParty =
    update.actor.kind === "client"
      ? (
          await db
            .select({ partyId: principals.partyId })
            .from(principals)
            .where(eq(principals.id, update.actor.id))
        )[0]?.partyId
      : undefined;
  // A named party is considered only if it ever took part in this Deal: a counterparty from
  // another Deal is never addressed here, and a revoked participant is skipped with its reason.
  const participantRows = await db
    .select({ partyId: caseParticipants.partyId })
    .from(caseParticipants)
    .innerJoin(
      principals,
      and(eq(principals.partyId, caseParticipants.partyId), eq(principals.kind, "client")),
    )
    .where(
      and(
        eq(caseParticipants.caseId, update.caseId),
        update.partyIds ? undefined : liveParticipation(),
      ),
    )
    .orderBy(asc(caseParticipants.createdAt));
  const known = new Set(participantRows.map((row) => row.partyId));
  const candidates = update.partyIds
    ? [...new Set(update.partyIds)].filter((partyId) => known.has(partyId))
    : [...known];
  for (const partyId of candidates.sort()) {
    if (partyId === actorParty) continue;
    const recipient = { kind: "client" as const, id: partyId };
    const key = dealNoticeKey(update.event, update.eventKey, partyId);
    const prior = await existing(db, key);
    if (prior) {
      outcomes.push(retried(prior, recipient));
      continue;
    }
    const found = await resolveClientRecipient(db, update.caseId, partyId);
    if (found.reason) {
      outcomes.push(await recordSkip(db, key, update, recipient, found.reason));
      continue;
    }
    const step = stepFor(update, found.locale);
    outcomes.push(
      await queue(
        db,
        key,
        found.eligible.address,
        {
          ...baseParams(update, hosts, found.locale, "client"),
          ...(step ? { step } : {}),
          recipient: {
            kind: "client",
            partyId,
            principalId: found.principal.id,
            subscriptionId: found.eligible.subscriptionId,
            subscriptionVersion: found.eligible.subscriptionVersion,
            contactId: found.eligible.contactId,
            contactVersion: found.eligible.contactVersion,
            policyVersion: found.eligible.policyVersion,
          },
        },
        hosts,
        recipient,
      ),
    );
  }
  return outcomes;
}

/** Typed input for the deal path: a step the client can see is done. */
export interface DealStepDone {
  readonly caseId: string;
  /** Stable id of the step in the deal path; each step notifies once. */
  readonly stepKey: string;
  readonly caseReference: string;
  /** The step's client-visible label, at least in the source locale. */
  readonly label: Readonly<Partial<Record<PublicLocale, string>>>;
  readonly actor: Actor;
}

export function notifyDealStepDone(db: Executor, step: DealStepDone, hosts?: HostOrigins) {
  return notifyDealUpdate(
    db,
    {
      caseId: step.caseId,
      event: "deal.step_done" satisfies ClientNoticeEvent,
      eventKey: `deal-step:${step.stepKey}`,
      subject: { type: "case", id: step.caseId, reference: step.caseReference },
      actor: step.actor,
      step: step.label,
    },
    hosts,
  );
}
