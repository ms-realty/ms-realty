// Locale registry (spec §18.2, §20.4, plan AD9).
// A public locale is routable when enabled. It is indexable only when it is the editorial
// source locale, or when a recorded human approval exists AND its catalog was human-reviewed.
// `indexable` is never a configurable field: it is derived from approvals below.
import type { Approval } from "@/domain/approval";
import {
  isPublicLocale,
  type PublicLocale,
  publicLocales,
  type StaffLocale,
  sourceLocale,
  staffLocales,
} from "@/domain/ids";
import catalogStatus from "../../messages/_status.json";

export type { PublicLocale, StaffLocale };
export { isPublicLocale, publicLocales, staffLocales };

export const defaultLocale = sourceLocale;
export const defaultStaffLocale: StaffLocale = "bg";

/** The agency's time zone; every date shown to people is formatted in an explicit zone. */
export const agencyTimeZone = "Europe/Sofia";

export function isStaffLocale(value: string): value is StaffLocale {
  return (staffLocales as readonly string[]).includes(value);
}

export function localeDirection(locale: PublicLocale): "ltr" | "rtl" {
  return locale === "he" ? "rtl" : "ltr";
}

/** Each language named in itself, so a visitor can find their own in any interface language. */
export const localeEndonyms: Record<PublicLocale, string> = {
  bg: "Български",
  en: "English",
  ru: "Русский",
  de: "Deutsch",
  nl: "Nederlands",
  el: "Ελληνικά",
  he: "עברית",
};

/** Routability per locale. Preview serves every locale; production enablement comes later. */
const routable: Record<PublicLocale, boolean> = {
  bg: true,
  en: true,
  ru: true,
  de: true,
  nl: true,
  el: true,
  he: true,
};

/**
 * The only record that can make a non-source locale indexable: a human approval of kind
 * `locale_indexability` (capability `settings.manage`) whose subject is the locale itself.
 */
export interface LocaleIndexabilityApproval extends Approval {
  readonly kind: "locale_indexability";
  readonly subject: Approval["subject"] & { readonly type: "locale"; readonly id: PublicLocale };
}

/** Recorded approvals. None exist yet; S4 reads them from `locale_settings`/`approvals`. */
export const recordedIndexabilityApprovals: readonly LocaleIndexabilityApproval[] = [];

export type CatalogStatus = "draft_unreviewed" | "approved";
export interface CatalogReview {
  readonly status: CatalogStatus;
  readonly reviewer: string | null;
  readonly reviewedAt: string | null;
}

export const catalogReviews = catalogStatus.locales as Record<PublicLocale, CatalogReview>;

function isApprovedCatalog(review: CatalogReview | undefined): boolean {
  return review?.status === "approved" && Boolean(review.reviewer) && Boolean(review.reviewedAt);
}

export interface LocalePolicy {
  readonly routable: boolean;
  readonly indexable: boolean;
}

export function localePolicy(
  locale: PublicLocale,
  approvals: readonly LocaleIndexabilityApproval[] = recordedIndexabilityApprovals,
  reviews: Partial<Record<PublicLocale, CatalogReview>> = catalogReviews,
): LocalePolicy {
  const isRoutable = routable[locale];
  if (!isRoutable) return { routable: false, indexable: false };
  if (locale === sourceLocale) return { routable: true, indexable: true };
  const approved = approvals.some(
    (approval) =>
      approval.kind === "locale_indexability" &&
      approval.subject.type === "locale" &&
      approval.subject.id === locale &&
      approval.state === "approved" &&
      Boolean(approval.decidedBy),
  );
  return { routable: true, indexable: approved && isApprovedCatalog(reviews[locale]) };
}

export function routableLocales(): PublicLocale[] {
  return publicLocales.filter((locale) => localePolicy(locale).routable);
}

export function indexableLocales(
  approvals: readonly LocaleIndexabilityApproval[] = recordedIndexabilityApprovals,
  reviews: Partial<Record<PublicLocale, CatalogReview>> = catalogReviews,
): PublicLocale[] {
  return publicLocales.filter((locale) => localePolicy(locale, approvals, reviews).indexable);
}

export function isRoutableLocale(value: string): value is PublicLocale {
  return isPublicLocale(value) && localePolicy(value).routable;
}

/** Cookie holding a visitor's explicit language choice; `/` honours it before Accept-Language. */
export const localeCookie = "NEXT_LOCALE";
/** Cookie recording that the visitor dismissed the language suggestion. */
export const suggestionDismissedCookie = "locale_suggestion_dismissed";
/** Staff interface language until the staff preference record exists (S2). */
export const staffLocaleCookie = "staff_locale";
/** Set by proxy.ts on every rendered request: the URL locale, staff locale or negotiated one. */
export const appLocaleHeader = "x-app-locale";
/** Set by proxy.ts: which surface the URL belongs to, so a 404 renders inside its shell. */
export const appSurfaceHeader = "x-app-surface";
