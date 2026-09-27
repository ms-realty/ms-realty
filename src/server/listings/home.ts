// Public home overview (spec F01, P01): the newest offered listings, where they are, and how
// many listings are live. With nothing live every list is empty (P01 "empty inventory").
import "server-only";
import type { PublicLocale } from "@/domain/ids";
import type { Executor } from "../db";
import { listPlacesForSearch, liveListingSummary } from "../search/search";
import { loadCards } from "./published";
import type { HomeOverview } from "./view-models";

export async function getHomeOverview(
  db: Executor,
  input: { readonly locale: PublicLocale; readonly limit?: number; readonly placesLimit?: number },
): Promise<HomeOverview> {
  const limit = Math.max(0, Math.trunc(input.limit ?? 6));
  const summary = await liveListingSummary(db);
  const places = await listPlacesForSearch(db, input.locale);
  return {
    totalPublished: summary.total,
    totalOffered: summary.offeredNewestFirst.length,
    latest: await loadCards(db, summary.offeredNewestFirst.slice(0, limit), input.locale),
    topPlaces: places.slice(0, Math.max(0, Math.trunc(input.placesLimit ?? 8))),
  };
}
