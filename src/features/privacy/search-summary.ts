import { z } from "zod";
import { listingPurposes } from "@/domain/facts";
import { currencyCodes, publicLocales } from "@/domain/ids";
import { privacyCopy } from "./copy";

// Read only the generated summary's inputs. Unknown legacy criteria or prose stays verbatim.
const summarySearch = z.object({
  locale: z.enum(publicLocales),
  q: z.string().nullable(),
  criteria: z.object({
    purpose: z.enum(listingPurposes),
    price: z
      .object({
        currency: z.enum(currencyCodes),
        min: z.number().int().nonnegative().optional(),
        max: z.number().int().nonnegative().optional(),
      })
      .refine(
        (price) => price.min === undefined || price.max === undefined || price.min <= price.max,
      )
      .optional(),
  }),
});
type SummarySearch = z.infer<typeof summarySearch>;

function summaryParts(search: SummarySearch, locale: string) {
  const copy = privacyCopy(locale);
  return {
    purpose: search.criteria.purpose === "sale" ? copy.sale : copy.rent,
    query: search.q,
    price: search.criteria.price
      ? `${search.criteria.price.currency} ${search.criteria.price.min === undefined ? "0" : search.criteria.price.min / 100} – ${search.criteria.price.max === undefined ? "∞" : search.criteria.price.max / 100}`
      : null,
  };
}

export function searchSummary(search: SummarySearch, locale: string = search.locale): string {
  const { purpose, query, price } = summaryParts(search, locale);
  return [purpose, query, price].filter(Boolean).join(" · ");
}

export function localizedSavedSearchSummary(
  criteria: unknown,
  storedSummary: string | null,
  locale: string,
) {
  if (!storedSummary) return storedSummary;
  const parsed = summarySearch.safeParse(criteria);
  if (!parsed.success) return storedSummary;
  const search = parsed.data;
  // Earlier records used English for every non-Bulgarian purpose label. Only replace a
  // recognized generated summary, never custom/historical prose or any saved query text.
  const legacy = searchSummary(search, search.locale === "bg" ? "bg" : "en");
  if (storedSummary !== legacy && storedSummary !== searchSummary(search)) return storedSummary;
  return summaryParts(search, locale);
}
