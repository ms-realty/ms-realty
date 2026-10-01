import "server-only";
import { isPublicLocale, type PublicLocale } from "@/domain/ids";
import snapshots from "../../../data/legacy/migration/source-pages.json";
import { primaryScopes, sha256 } from "./manifest";

export interface LegacyPage {
  id: string;
  canonicalPath: string;
  locale: PublicLocale;
  title: string;
  description: string | null;
  bodyText: string;
  sourceUrl: string;
  sourceHost: string;
  sourcePath: string;
  sourceType: string;
  sourceHash: string;
  capturedAt: string;
  contentScope: string;
  provenance: { kind: "archived" | "live"; artifact: string; gitTag?: string; gitCommit?: string };
  equivalenceReview: {
    status: "pending" | "reviewed";
    reviewer: string | null;
    reviewedAt: string | null;
  };
  media: {
    id: string;
    url: string;
    alt: string;
    r2Key: string | null;
    storedImageLoadVerified: boolean;
  }[];
  contentLinks?: { url: string; text: string }[];
  listing: {
    reference: string;
    sourceLocale: string;
    sourceTitle: string;
    lifecycleAtFreeze: Record<string, unknown>;
    sold: boolean | null;
    price: {
      amount: number | null;
      currency: string | null;
      period: string | null;
      on_request: boolean | null;
    };
    areas: unknown;
    rooms: { count: number | null; recorded: boolean };
    bedrooms: unknown;
    location: unknown;
    sourceStatedFacts: unknown;
    statusParityVerified: boolean;
    liveSourceFields?: { label: string; value: string }[];
  } | null;
}

/** Exact source text is stageable; equivalence review and launch sign-off are separate gates. */
export function selectLegacyPage(
  pages: readonly LegacyPage[],
  locale: string,
  id: string,
): LegacyPage | null {
  if (!isPublicLocale(locale) || !/^[0-9a-f]{24}$/.test(id)) return null;
  const page = pages.find((candidate) => candidate.id === id && candidate.locale === locale);
  if (
    !page?.title ||
    !page.bodyText.trim() ||
    !primaryScopes.includes(page.contentScope as (typeof primaryScopes)[number]) ||
    sha256(page.bodyText) !== page.sourceHash ||
    page.canonicalPath !== `/${locale}/legacy/${id}`
  )
    return null;
  return page;
}

const pages = snapshots.pages as unknown as readonly LegacyPage[];
export const getLegacyPage = (locale: string, id: string) => selectLegacyPage(pages, locale, id);
/** For sitemap planning only: this list does not approve indexability or route equivalence. */
export const legacySnapshotPages = () =>
  pages.filter((page) => selectLegacyPage(pages, page.locale, page.id));
