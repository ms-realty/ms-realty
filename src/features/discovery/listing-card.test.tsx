import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import type { ListingCard as Listing } from "@/server/listings/view-models";
import { discoveryCopy } from "./copy";
import { ListingGrid } from "./listing-card";

afterEach(cleanup);

it("M-019 gives responsive card photos the one/two/three-column grid's fallback sizes", () => {
  const listing: Listing = {
    reference: "MS-00001",
    slug: "ms-00001",
    manifestId: "10000000-0000-4000-8000-000000000001",
    locale: "en",
    purpose: "sale",
    propertyType: "apartment",
    title: "Synthetic property",
    price: { state: "unknown" },
    area: { state: "unknown" },
    bedrooms: { state: "unknown" },
    place: {
      country: "BG",
      district: null,
      municipality: null,
      settlement: null,
      neighborhood: null,
      precision: "region",
    },
    availability: {
      presented: "available",
      freshness: "current_under_policy",
      confirmedAt: null,
      primaryAction: "request_viewing",
    },
    cover: {
      relationId: "cover",
      assetId: "00000000-0000-4000-8000-000000000001",
      digest: "a".repeat(64),
      renditions: [
        { digest: "b".repeat(64), width: 480, height: 270 },
        { digest: "a".repeat(64), width: 960, height: 540 },
      ],
      kind: "photo",
      contentType: "image/webp",
      width: 960,
      height: 540,
      alt: "Synthetic approved photo",
      caption: null,
      modificationDisclosure: null,
      position: 0,
    },
  };
  render(<ListingGrid items={[listing]} locale="en" copy={discoveryCopy("en")} />);
  const photo = screen.getByRole("img", { name: "Synthetic approved photo" });
  expect(photo).toHaveAttribute("loading", "lazy");
  expect(photo).toHaveAttribute(
    "sizes",
    "(min-width: 64rem) 28rem, (min-width: 40rem) 46vw, calc(100vw - 2.5rem)",
  );
  expect(photo.getAttribute("srcset")).toContain("480w");
  expect(photo.getAttribute("srcset")).toContain("960w");
});

const base = (overrides: Partial<Listing>): Listing => ({
  reference: "MS-00002",
  slug: "ms-00002",
  manifestId: "10000000-0000-4000-8000-000000000002",
  locale: "en",
  purpose: "sale",
  propertyType: "apartment",
  title: "Synthetic flat",
  price: { state: "unknown" },
  area: { state: "unknown" },
  bedrooms: { state: "unknown" },
  place: {
    country: "BG",
    district: null,
    municipality: null,
    settlement: null,
    neighborhood: null,
    precision: "region",
  },
  availability: {
    presented: "available",
    freshness: "current_under_policy",
    confirmedAt: null,
    primaryAction: "request_viewing",
  },
  cover: null,
  ...overrides,
});
const priced = (basis: "asking" | "negotiable" | "fixed" | "indicative"): Listing["price"] =>
  ({
    state: "known",
    value: { amountMinor: 900_000, currency: "EUR", period: "total", basis },
    provenance: { sourceClass: "agency_observed" },
  }) as Listing["price"];

it("shows a price basis that is not a plain asking price as one quiet line under the price", () => {
  const copy = discoveryCopy("en");
  for (const basis of ["negotiable", "fixed", "indicative"] as const) {
    const { container } = render(
      <ListingGrid items={[base({ price: priced(basis) })]} locale="en" copy={copy} />,
    );
    expect(container.querySelector("[data-price-basis]")).toHaveTextContent(copy[basis]);
    cleanup();
  }
  const { container } = render(
    <ListingGrid items={[base({ price: priced("asking") })]} locale="en" copy={copy} />,
  );
  expect(container.querySelector("[data-price-basis]")).toBeNull();
});

it("gives a card without a photo a named placeholder in the same 4:3 frame", () => {
  const copy = discoveryCopy("en");
  const { container } = render(<ListingGrid items={[base({})]} locale="en" copy={copy} />);
  const placeholder = screen.getByRole("img", { name: `Synthetic flat. ${copy.noPhoto}` });
  expect(placeholder.parentElement?.className).toContain("aspect-4/3");
  expect(container.querySelector("article img")).toBeNull();
});
