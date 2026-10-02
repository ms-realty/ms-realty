import { isPublicLocale } from "@/domain/ids";
import type { LegacyPage } from "./pages";

export interface CurrentListingFacts {
  reference: string | null;
  locale: string | null;
  title: string | null;
  fields: { label: string; value: string }[];
}

/** A current source body may not inherit the frozen record's numeric facts or availability. */
export function projectListingFacts(
  frozen: LegacyPage["listing"],
  current: CurrentListingFacts | null,
): LegacyPage["listing"] {
  if (!current) return frozen;
  if (!current.reference || !current.title || !current.locale || !isPublicLocale(current.locale))
    return null;
  return {
    reference: current.reference,
    sourceLocale: current.locale,
    sourceTitle: current.title,
    lifecycleAtFreeze: {},
    sold: null,
    price: { amount: null, currency: null, period: null, on_request: null },
    areas: { recorded: [] },
    rooms: { count: null, recorded: false },
    bedrooms: { recorded: null },
    location: { recorded: [] },
    sourceStatedFacts: current.fields,
    liveSourceFields: current.fields,
    statusParityVerified: false,
  };
}
