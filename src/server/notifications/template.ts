// `deal.notice.v1`: the stored payload contract and its fixed rendering. The payload holds
// identifiers, the recipient's locale, canonical links and, for viewings, the time and calendar
// identity; never price, terms, address, access detail, free text or a document. Rendering
// rechecks every link against the configured origins, so a stored payload cannot point anywhere
// else.
import "server-only";
import { z } from "zod";
import {
  agencyTimeZone,
  displayLocales,
  type PublicLocale,
  publicLocales,
  type StaffLocale,
  staffLocales,
} from "@/config/tenant";
import { formatDateTimeRange } from "@/i18n/format";
import { senderAddress } from "../appointments/calendar-contract";
import { calendarFile } from "../appointments/time";
import type { HostOrigins } from "../config/hosts";
import type { OutboundMessage } from "../jobs/provider";
import { clientNoticeCopy, type NoticeCopy, staffNoticeCopy } from "./copy";
import {
  calendarEvents,
  dealNoticeEvents,
  dealNoticeTemplate,
  eventSubject,
  isClientNoticeEvent,
  type NoticeSubjectType,
  noticeSubjectTypes,
  type StaffNoticeEvent,
  timedEvents,
} from "./events";
import { type NoticeLayout, noticeHtml, noticeText } from "./layout";

const reference = z.string().regex(/^[A-Za-z0-9-]{1,80}$/);
const singleLine = z
  .string()
  .trim()
  .min(1)
  .max(120)
  // biome-ignore lint/suspicious/noControlCharactersInRegex: a step label is one plain line, without control or bidi characters.
  .regex(/^[^\u0000-\u001f\u007f‪-‮⁦-⁩<>]+$/);

export const clientNoticeRecipient = z
  .object({
    kind: z.literal("client"),
    partyId: z.uuid(),
    principalId: z.uuid(),
    /** service_choice: an explicit, current e-mail choice; deal_participation: the default. */
    basis: z.enum(["service_choice", "deal_participation"]),
    contactId: z.uuid(),
    contactVersion: z.int().positive(),
    subscriptionId: z.uuid().optional(),
    subscriptionVersion: z.int().positive().optional(),
    policyVersion: z.string().min(1).max(300).optional(),
  })
  .strict()
  .refine(
    (r) =>
      (r.basis === "service_choice") ===
      Boolean(r.subscriptionId && r.subscriptionVersion && r.policyVersion),
  );
export const staffNoticeRecipient = z
  .object({ kind: z.literal("staff"), principalId: z.uuid() })
  .strict();

export const noticeCalendar = z
  .object({
    uid: z
      .string()
      .min(1)
      .max(200)
      .regex(/^[a-zA-Z0-9._@-]+$/),
    sequence: z.int().nonnegative(),
    updatedAt: z.iso.datetime(),
    cancelled: z.boolean(),
  })
  .strict();

export const dealNoticeParams = z
  .object({
    schemaVersion: z.literal(1),
    event: z.enum(dealNoticeEvents),
    eventKey: z.string().min(1).max(160),
    caseId: z.uuid(),
    subject: z.object({ type: z.enum(noticeSubjectTypes), id: z.uuid(), reference }).strict(),
    locale: z.enum(publicLocales),
    recipient: z.discriminatedUnion("kind", [clientNoticeRecipient, staffNoticeRecipient]),
    url: z.url(),
    preferencesUrl: z.url().optional(),
    calendarUrl: z.url().optional(),
    time: z.object({ startsAt: z.iso.datetime(), endsAt: z.iso.datetime() }).strict().optional(),
    calendar: noticeCalendar.optional(),
    step: singleLine.optional(),
  })
  .strict();
export type DealNoticeParams = z.infer<typeof dealNoticeParams>;

export const dealNoticePayload = z
  .object({
    channel: z.literal("email"),
    recipient: z.email(),
    template: z.literal(dealNoticeTemplate),
    params: dealNoticeParams,
  })
  .strict();

/** The canonical private-area page a notice links to; the only link besides preferences. */
export function noticeUrl(
  hosts: Pick<HostOrigins, "client" | "staff">,
  audience: "client" | "staff",
  locale: string,
  subject: { type: NoticeSubjectType; id: string },
  caseId: string,
  event?: string,
): string {
  // A broker message opens the client's conversation page, not the Deal overview.
  const path =
    audience === "client" && event === "message.from_broker"
      ? `/messages/${caseId}`
      : audience === "client"
        ? {
            appointment: `/appointments/${subject.id}`,
            proposal: `/proposals/${subject.id}`,
            document_request: `/documents/requests/${subject.id}`,
            case: `/overview/${caseId}`,
          }[subject.type]
        : {
            appointment: `/calendar/${subject.id}`,
            proposal: `/proposals/${subject.id}`,
            document_request: `/cases/${caseId}/document-requests`,
            case: `/cases/${caseId}`,
          }[subject.type];
  return new URL(`/${locale}${path}`, audience === "client" ? hosts.client : hosts.staff).href;
}
export function noticePreferencesUrl(hosts: Pick<HostOrigins, "client">, locale: string) {
  return new URL(`/${locale}/preferences`, hosts.client).href;
}
export function noticeCalendarUrl(hosts: Pick<HostOrigins, "client">, locale: string, id: string) {
  return new URL(`/${locale}/appointments/${id}/calendar`, hosts.client).href;
}

/** Structural checks that need no database: audience, links and event shape agree. */
export function validDealNoticeParams(
  params: DealNoticeParams,
  hosts: Pick<HostOrigins, "client" | "staff">,
): boolean {
  const client = isClientNoticeEvent(params.event);
  if (client !== (params.recipient.kind === "client")) return false;
  if (!client && !(staffLocales as readonly string[]).includes(params.locale)) return false;
  if (eventSubject[params.event] !== params.subject.type) return false;
  const audience = client ? "client" : "staff";
  if (
    params.url !==
    noticeUrl(hosts, audience, params.locale, params.subject, params.caseId, params.event)
  )
    return false;
  if (client !== (params.preferencesUrl === noticePreferencesUrl(hosts, params.locale)))
    return false;
  const calendar = Boolean(params.calendar);
  if (calendar && !calendarEvents.includes(params.event)) return false;
  if ((params.event === "viewing.confirmed" || params.event === "viewing.moved") && !calendar)
    return false;
  if (
    calendar !== (params.calendarUrl !== undefined) ||
    (params.calendarUrl !== undefined &&
      params.calendarUrl !== noticeCalendarUrl(hosts, params.locale, params.subject.id))
  )
    return false;
  if (params.calendar && params.calendar.cancelled !== (params.event === "viewing.cancelled"))
    return false;
  if (!timedEvents.includes(params.event) && params.time) return false;
  if (params.event !== "viewing.cancelled" && timedEvents.includes(params.event) && !params.time)
    return false;
  if (params.calendar && !params.time) return false;
  if (params.time && new Date(params.time.endsAt) <= new Date(params.time.startsAt)) return false;
  if ((params.event === "deal.step_done") !== Boolean(params.step)) return false;
  return true;
}

function copyFor(params: DealNoticeParams): NoticeCopy {
  if (isClientNoticeEvent(params.event))
    return clientNoticeCopy[params.locale as PublicLocale][params.event];
  return staffNoticeCopy[params.locale as StaffLocale][params.event as StaffNoticeEvent];
}

/** Weekday and date of a viewing for subjects and headlines, in the agency's zone. */
export function noticeDay(locale: PublicLocale, instant: string, now = new Date()) {
  const date = new Date(instant);
  const year = (value: Date) =>
    new Intl.DateTimeFormat("en", { timeZone: agencyTimeZone, year: "numeric" }).format(value);
  return new Intl.DateTimeFormat(displayLocales[locale], {
    timeZone: agencyTimeZone,
    weekday: "long",
    day: "numeric",
    month: "long",
    ...(year(date) !== year(now) ? { year: "numeric" } : {}),
  }).format(date);
}

export interface RenderedDealNotice {
  readonly subject: string;
  readonly text: string;
  readonly html?: string;
  readonly attachments?: readonly { filename: string; content: string; content_type: string }[];
}

/**
 * Fixed rendering. `attachments: false` is for transports that carry plain text only: the
 * calendar then travels as a link to the client area's calendar file instead of an attachment.
 */
export function renderDealNotice(
  message: OutboundMessage,
  config: { hosts: HostOrigins; from?: string; attachments?: boolean; html?: boolean },
  now = new Date(),
): RenderedDealNotice | null {
  const parsed = dealNoticePayload.safeParse({
    channel: message.channel,
    recipient: message.recipient,
    template: message.template,
    params: message.params,
  });
  if (!parsed.success || message.secretParams || message.files?.length) return null;
  const p = parsed.data.params;
  if (!validDealNoticeParams(p, config.hosts)) return null;
  const copy = copyFor(p);
  const client = p.recipient.kind === "client";
  const time = p.time
    ? formatDateTimeRange(p.locale, p.time.startsAt, p.time.endsAt, { zoneLabel: true, now })
    : null;
  const day = p.time ? noticeDay(p.locale, p.time.startsAt, now) : null;
  const fill = (value: string) =>
    value
      .replace("{time}", time ?? "")
      .replace("{day}", day ?? "")
      .replace("{step}", p.step ?? "");
  const lead = fill(time ? copy.lead : (copy.leadNoTime ?? copy.lead));
  const headline = fill(day ? copy.subject : (copy.subjectNoTime ?? copy.subject));
  const frame = client ? clientNoticeCopy[p.locale].frame : null;
  const staffFrame = client ? null : staffNoticeCopy[p.locale as StaffLocale].frame;
  const attach = config.attachments !== false && Boolean(p.calendar && p.time);
  const organizer = config.from ? senderAddress(config.from) : null;
  const calendarLine = !p.calendar
    ? null
    : attach
      ? p.calendar.cancelled
        ? (frame?.calendarCancelAttached ?? null)
        : (frame?.calendarAttached ?? null)
      : null;
  const calendarLink = p.calendar && !attach && p.calendarUrl ? p.calendarUrl : null;
  const layout: NoticeLayout = {
    locale: p.locale,
    // The subject is the change itself; the reference stays for search and threading.
    subject: `${headline} (${p.subject.reference})`,
    headline,
    paragraphs: [lead, ...(calendarLine ? [calendarLine] : [])],
    ...(calendarLink
      ? { link: { label: (frame?.calendarLink ?? "").replace(/:$/, ""), url: calendarLink } }
      : {}),
    action: { label: copy.action, url: p.url },
    reference: {
      label: frame?.reference ?? staffFrame?.reference ?? "",
      value: p.subject.reference,
    },
    footer: frame?.footer ?? staffFrame?.footer ?? "",
    ...(client && frame && p.preferencesUrl
      ? { footerLink: { label: frame.preferences, url: p.preferencesUrl } }
      : {}),
  };
  const subject = layout.subject;
  const text = noticeText(layout);
  const html = config.html === false ? undefined : noticeHtml(layout);
  const attachments =
    attach && p.calendar && p.time
      ? [
          {
            filename: "viewing.ics",
            content: Buffer.from(
              calendarFile({
                uid: p.calendar.uid,
                sequence: p.calendar.sequence,
                reference: p.subject.reference,
                purpose: "viewing",
                start: new Date(p.time.startsAt),
                end: new Date(p.time.endsAt),
                updatedAt: new Date(p.calendar.updatedAt),
                cancelled: p.calendar.cancelled,
                ...(organizer
                  ? { invitation: { organizer, attendee: parsed.data.recipient } }
                  : {}),
              }),
            ).toString("base64"),
            content_type: `text/calendar; charset=utf-8; method=${p.calendar.cancelled ? "CANCEL" : organizer ? "REQUEST" : "PUBLISH"}`,
          },
        ]
      : undefined;
  return { subject, text, ...(html ? { html } : {}), ...(attachments ? { attachments } : {}) };
}
