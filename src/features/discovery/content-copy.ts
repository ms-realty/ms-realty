import type { PublicLocale } from "@/i18n/config";
import { discoveryCopy } from "./copy";

// Interface labels only; an eligible approved content title always takes precedence.
export const contentLabels = (locale: PublicLocale) => discoveryCopy(locale).contentLabels;
export function contentFallbackTitle(
  locale: PublicLocale,
  input: {
    kind: "area" | "service" | "help";
    route: string;
    intent?: "seller_consultation" | "landlord_consultation";
  },
) {
  const copy = discoveryCopy(locale),
    label = contentLabels(locale);
  return input.intent === "seller_consultation"
    ? copy.sell
    : input.intent === "landlord_consultation"
      ? copy.let
      : input.route === "/contact"
        ? label.contact
        : label[input.kind];
}
