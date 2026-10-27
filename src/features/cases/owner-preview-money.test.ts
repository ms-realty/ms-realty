import { expect, it } from "vitest";
import { currencyCodes, publicLocales } from "@/domain/ids";
import { formatMoney } from "@/i18n/format";
import { ownerPreviewScalar } from "./owner-preview-screen";

it.each(publicLocales)(
  "C12 %s preserves source minor units for every supported currency",
  (locale) => {
    for (const currency of currencyCodes)
      expect(ownerPreviewScalar({ amountMinor: 12345, currency, period: "total" }, locale)).toBe(
        formatMoney(locale, 12345, currency),
      );
  },
);
