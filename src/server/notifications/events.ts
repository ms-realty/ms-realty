// The deal notice family (ADR 0014): one versioned template, one ledger subject type, and the
// events it covers. Client events go to the Deal's client participants; staff events go to the
// Deal's accountable broker.
import "server-only";
import { type ServiceNotificationEvent, serviceNotificationEvents } from "@/config/tenant";

export const dealNoticeTemplate = "deal.notice.v1" as const;
export const dealNoticeSubject = "deal_notice" as const;

export const clientNoticeEvents = [
  "viewing.proposed",
  "viewing.confirmed",
  "viewing.moved",
  "viewing.cancelled",
  "proposal.ready",
  "proposal.withdrawn",
  "proposal.expired",
  "document.requested",
  "message.from_broker",
  "deal.step_done",
  "deal.completed",
] as const satisfies readonly ServiceNotificationEvent[];
export type ClientNoticeEvent = (typeof clientNoticeEvents)[number];

export const staffNoticeEvents = [
  "client.viewing_confirmed",
  "client.viewing_cancelled",
  "client.viewing_new_time",
  "client.proposal_accepted",
  "client.proposal_declined",
  "client.proposal_countered",
  "client.document_uploaded",
  "client.message",
] as const satisfies readonly ServiceNotificationEvent[];
export type StaffNoticeEvent = (typeof staffNoticeEvents)[number];

export type DealNoticeEvent = ServiceNotificationEvent;
export const dealNoticeEvents = serviceNotificationEvents;

export function isClientNoticeEvent(event: DealNoticeEvent): event is ClientNoticeEvent {
  return (clientNoticeEvents as readonly string[]).includes(event);
}

/** What each event is about; the link in the notice opens that record. */
export const noticeSubjectTypes = ["appointment", "proposal", "document_request", "case"] as const;
export type NoticeSubjectType = (typeof noticeSubjectTypes)[number];

export const eventSubject: Readonly<Record<DealNoticeEvent, NoticeSubjectType>> = {
  "viewing.proposed": "appointment",
  "viewing.confirmed": "appointment",
  "viewing.moved": "appointment",
  "viewing.cancelled": "appointment",
  "proposal.ready": "proposal",
  "proposal.withdrawn": "proposal",
  "proposal.expired": "proposal",
  "document.requested": "document_request",
  "message.from_broker": "case",
  "deal.step_done": "case",
  "deal.completed": "case",
  "client.viewing_confirmed": "appointment",
  "client.viewing_cancelled": "appointment",
  "client.viewing_new_time": "appointment",
  "client.proposal_accepted": "proposal",
  "client.proposal_declined": "proposal",
  "client.proposal_countered": "proposal",
  "client.document_uploaded": "document_request",
  "client.message": "case",
};

/** Events that carry the viewing's calendar entry (stable UID, increasing SEQUENCE). */
export const calendarEvents: readonly DealNoticeEvent[] = [
  "viewing.confirmed",
  "viewing.moved",
  "viewing.cancelled",
];
/** Events whose sentence names the viewing time. */
export const timedEvents: readonly DealNoticeEvent[] = [
  "viewing.proposed",
  "viewing.confirmed",
  "viewing.moved",
  "viewing.cancelled",
  "client.viewing_confirmed",
];
