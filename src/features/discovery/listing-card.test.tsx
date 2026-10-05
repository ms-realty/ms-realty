import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { formatExactArea } from "@/i18n/format";
import type { ListingCard as Listing } from "@/server/listings/view-models";
import { discoveryCopy } from "./copy";
import { ListingCard } from "./listing-card";
import { priceText } from "./presentation";

afterEach(cleanup);

const provenance = { source: "synthetic", verification: "broker_verified", reviewed: true };
const listing = {
  reference: "MS-00101",
  slug: "ms-00101",
  manifestId: "manifest-synthetic",
  locale: "he",
  purpose: "sale",
  propertyType: "apartment",
  title: null,
  price: {
    state: "known",
    value: { amountMinor: 15_000_000, currency: "EUR", period: "total", basis: "asking" },
    provenance,
  },
  place: {
    country: "BG",
    district: null,
    municipality: null,
    settlement: null,
    neighborhood: null,
  },
  bedrooms: { state: "known", value: 2, provenance },
  area: { state: "known", value: { value: 85.25, unit: "m2", basis: "living" }, provenance },
  availability: {
    presented: "available",
    freshness: "fresh",
    confirmedAt: null,
    primaryAction: "request_viewing",
  },
  cover: null,
} as unknown as Listing;

// P02/P05 in Hebrew: Latin references, money and areas keep their own direction (plan §3.4)
// and are the exact facts, only isolated.
it("isolates the reference, price and area of a card without changing them", () => {
  const copy = discoveryCopy("he");
  // Testing Library compares text with whitespace collapsed; Intl output has no-break spaces.
  const shown = (text: string) => text.replace(/\s+/g, " ").trim();
  render(<ListingCard listing={listing} locale="he" copy={copy} />);
  const title = screen.getByRole("link", { name: "MS-00101" });
  expect(title.querySelector("bdi")?.textContent).toBe("MS-00101");
  const price = screen.getByText(shown(priceText(listing.price, "he", copy)));
  expect(price.tagName).toBe("BDI");
  const area = screen.getByText(shown(formatExactArea("he", 85.25)));
  expect(area.tagName).toBe("BDI");
  expect(area.textContent).toBe(formatExactArea("he", 85.25));
  expect(area.closest("dd")?.previousElementSibling?.textContent).toBe(copy.living);
});
