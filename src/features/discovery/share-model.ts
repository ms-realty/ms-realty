// P08/P09 view logic for public-facts shares. Pure and free of I/O: the server page and the
// actions feed it, the client components render its output, and the unit tests pin it.
import type { PublicLocale } from "@/i18n/config";
import { formatDateTime } from "@/i18n/format";
import type { listCreatorShares, readPublicShare } from "@/server/shares/public";

/** One link holds at most this many Listings (`createSchema` in server/shares/public.ts). */
export const shareReferenceLimit = 12;
/** A link is shown as "expiring" for its last day. Presentation only: the server has no such state. */
export const shareExpiringWindowMs = 24 * 60 * 60 * 1000;

export type CreatorShare = Awaited<ReturnType<typeof listCreatorShares>>["items"][number];
export type RecipientRead = Awaited<ReturnType<typeof readPublicShare>>;
export type RecipientReady = Extract<RecipientRead, { status: "ready" }>;
export type RecipientItem = RecipientReady["items"][number];

/** An instant already worded for its reader, so client components never format dates. */
export type Moment = { dateTime: string; label: string };

export function moment(locale: PublicLocale, instant: string): Moment {
  return { dateTime: instant, label: formatDateTime(locale, instant) };
}

export type SharedLinkState = "active" | "expiring" | "expired" | "revoked";

export type SharedLinkView = {
  id: string;
  /** Absolute public link. It carries the viewing token, so it exists only under creator authority. */
  url: string;
  references: readonly string[];
  state: SharedLinkState;
  created: Moment;
  expires: Moment | null;
  revoked: Moment | null;
  /** Idempotency key for the next revocation attempt of this link. */
  revokeKey: string;
};

export function sharedLinkState(
  share: Pick<CreatorShare, "status" | "expiresAt">,
  now: Date,
): SharedLinkState {
  // The server types its status as a plain string; anything but "active" or "revoked" fails
  // closed as expired, so a surprise value never offers a copy or revoke action.
  if (share.status === "revoked") return "revoked";
  if (share.status !== "active") return "expired";
  const remaining = share.expiresAt ? Date.parse(share.expiresAt) - now.getTime() : 0;
  return remaining <= shareExpiringWindowMs ? "expiring" : "active";
}

/** The recipient route. The token is the whole capability to read public facts, nothing more. */
export function recipientUrl(origin: string, locale: PublicLocale, token: string): string {
  return new URL(`/${locale}/share/${token}`, origin).toString();
}

export function sharedLinkView(
  share: CreatorShare,
  context: {
    locale: PublicLocale;
    origin: string;
    now: Date;
    revokeKey: string;
  },
): SharedLinkView {
  const { locale, origin, now, revokeKey } = context;
  return {
    id: share.id,
    url: recipientUrl(origin, locale, share.token),
    references: share.references,
    state: sharedLinkState(share, now),
    created: moment(locale, share.createdAt),
    expires: share.expiresAt ? moment(locale, share.expiresAt) : null,
    revoked: share.revokedAt ? moment(locale, share.revokedAt) : null,
    revokeKey,
  };
}

/** One page of this browser's links; a failed read is a state the page words, not a crash. */
export type CreatorLinks = { status: "ok"; links: SharedLinkView[] } | { status: "failed" };

/** What the recipient page needs to know about a ready list beyond the cards themselves. */
export function recipientSummary(read: RecipientReady) {
  const shown = read.items.filter((item) => item.status === "public");
  return {
    total: read.items.length,
    shown: shown.length,
    none: shown.length === 0,
    /** The P07 pair/triple of shown Listings. More than three need an explicit pick there. */
    compareReferences:
      shown.length >= 2 && shown.length <= 3 ? shown.map((i) => i.reference) : null,
  };
}
