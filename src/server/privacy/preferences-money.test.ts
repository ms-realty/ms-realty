import { expect, it } from "vitest";
import { publicLocales } from "@/domain/ids";
import { formatMoney } from "@/i18n/format";
import type { NormalizedSearch } from "../search/search";
import { searchSummary } from "./preferences";

it.each(publicLocales)(
  "C13 %s reads saved criteria in the source currency's exact minor-unit scale",
  (locale) => {
    for (const currency of ["BGN", "EUR", "USD", "GBP"] as const) {
      const summary = searchSummary({
        locale,
        q: "",
        criteria: { purpose: "sale", price: { currency, min: 12345, max: 67890 } },
      } as NormalizedSearch);
      expect(summary).toContain(formatMoney(locale, 12345, currency));
      expect(summary).toContain(formatMoney(locale, 67890, currency));
    }
  },
);
