// Words an inquiry for the O02 queue and its search results. Callers pass one "now" per
// response, so a row's age is fixed on the server and never recomputed in the browser.
import { z } from "zod";
import type { InquiryPurpose, InquiryState } from "@/domain/inquiry";
import { workCopy } from "./copy";
import type { InquiryRowView } from "./inquiry-row";

/** Both reads fit: the queue returns whole rows, search only a few columns. */
export type InquiryRowSource = {
  inquiry: {
    id: string;
    reference: string;
    state: InquiryState;
    preferredName: string | null;
    createdAt: Date;
    purpose?: InquiryPurpose;
    preferredLocale?: string | null;
    context?: unknown;
  };
  ownerName: string | null;
  needsCoverage: boolean;
};

const listingContext = z.object({
  listing: z
    .object({ reference: z.string().min(1) })
    .nullable()
    .optional(),
});
const closedStates: readonly InquiryState[] = ["linked_to_case", "resolved_without_case"];

function age(from: Date, now: Date, locale: string) {
  const format = new Intl.RelativeTimeFormat(locale, { numeric: "always" });
  const minutes = Math.max(1, Math.floor((now.getTime() - from.getTime()) / 60000));
  if (minutes < 60) return format.format(-minutes, "minute");
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return format.format(-hours, "hour");
  return format.format(-Math.floor(hours / 24), "day");
}

export function inquiryRowView(
  { inquiry, ownerName, needsCoverage }: InquiryRowSource,
  locale: string,
  now: Date,
): InquiryRowView {
  const copy = workCopy(locale);
  const parsed = listingContext.safeParse(inquiry.context);
  const listing = parsed.success ? (parsed.data.listing?.reference ?? null) : null;
  return {
    id: inquiry.id,
    name: inquiry.preferredName?.trim() || null,
    reference: inquiry.reference,
    context: listing
      ? { kind: "listing", value: listing }
      : inquiry.purpose
        ? { kind: "purpose", value: copy.purposes[inquiry.purpose] }
        : null,
    state: inquiry.state === "received" ? null : copy.states[inquiry.state],
    received: {
      dateTime: inquiry.createdAt.toISOString(),
      label: copy.queue.receivedAgo.replace("{age}", age(inquiry.createdAt, now, locale)),
    },
    language: inquiry.preferredLocale
      ? (new Intl.DisplayNames([locale], { type: "language" }).of(inquiry.preferredLocale) ??
        inquiry.preferredLocale)
      : null,
    // A closed search result keeps its last owner; coverage concerns open work only.
    owner: {
      name: ownerName,
      needsCoverage: needsCoverage && !closedStates.includes(inquiry.state),
    },
  };
}
