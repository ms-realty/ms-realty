// The storefront's reading rules: price first and in plain words, only known facts, no record
// vocabulary on any public surface, and a photo gallery that works without JavaScript.
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { area as areaFact, known, money } from "@/domain/facts";
import { publicLocales } from "@/i18n/config";
import type { ListingCard as Listing, PublicMedia } from "@/server/listings/view-models";
import { discoveryCopy } from "./copy";
import { ListingCard } from "./listing-card";
import { PhotoGallery } from "./photo-gallery";
import { plural, priceText, propertyCountText, shownCaption, shownFacts } from "./presentation";

afterEach(cleanup);

const provenance = { sourceClass: "source_supplied" } as const;
const photo = (n: number, caption: string | null = null): PublicMedia => ({
  relationId: `relation-${n}`,
  assetId: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
  digest: String(n % 10).repeat(64),
  renditions: [
    { digest: "b".repeat(64), width: 480, height: 360 },
    { digest: "c".repeat(64), width: 960, height: 720 },
  ],
  kind: "photo",
  contentType: "image/webp",
  width: 960,
  height: 720,
  alt: null,
  caption,
  modificationDisclosure: null,
  position: n,
});

function listing(overrides: Partial<Listing> = {}): Listing {
  return {
    reference: "MS-00042",
    slug: "ms-00042",
    manifestId: "10000000-0000-4000-8000-000000000042",
    locale: "en",
    purpose: "sale",
    propertyType: "plot",
    title: "Building plot near Sandanski",
    price: { state: "withheld" },
    area: { state: "unknown" },
    bedrooms: { state: "not_applicable" },
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
    cover: photo(1, "Building plot near Sandanski"),
    ...overrides,
  };
}

describe("storefront reading rules", () => {
  it("shows the price first and never the record's words on a card, in every language", () => {
    for (const locale of publicLocales) {
      const copy = discoveryCopy(locale);
      const { container } = render(
        <ListingCard listing={listing({ locale })} locale={locale} copy={copy} />,
      );
      const card = container.querySelector("article") as HTMLElement;
      expect(card.querySelector("[data-price]")).toHaveTextContent(copy.priceOnRequest);
      for (const word of [
        copy.withheld,
        copy.unknown,
        copy.not_applicable,
        copy.not_supplied,
        copy.conflicting,
      ])
        expect(card).not.toHaveTextContent(word);
      // Only the type is known; no area or bedrooms item, no caption, no availability badge.
      expect(
        [...card.querySelectorAll("[data-fact]")].map((n) => n.getAttribute("data-fact")),
      ).toEqual(["type"]);
      expect(card.querySelector("figcaption")).toBeNull();
      expect(card.querySelector("[data-family='availability']")).toBeNull();
      // The whole card opens the listing.
      expect(within(card).getByRole("link")).toHaveAttribute(
        "href",
        `/${locale}/properties/MS-00042/ms-00042`,
      );
      cleanup();
    }
  });

  it("formats a rent per month, keeps the photo filling its frame and lazy below the fold", () => {
    const copy = discoveryCopy("en");
    const rent = listing({
      purpose: "long_term_rent",
      price: known(money(65000, "EUR", "month", "asking"), provenance),
      availability: {
        presented: "reserved_with_recorded_basis",
        freshness: "current_under_policy",
        confirmedAt: null,
        primaryAction: "ask_question",
      },
    });
    expect(priceText(rent.price, "en", copy)).toBe("€650 per month");
    render(<ListingCard listing={rent} locale="en" copy={copy} />);
    const image = screen.getByRole("img");
    expect(image).toHaveClass("object-cover");
    expect(image).toHaveAttribute("loading", "lazy");
    expect(image.getAttribute("srcset")).toMatch(/480w, .+ 960w/);
    // Availability shows only when it is not plainly available.
    expect(screen.getByText(copy.reserved_with_recorded_basis)).toBeVisible();
  });

  it("lists only known facts, at most three, with the recorded values", () => {
    const copy = discoveryCopy("en");
    const facts = shownFacts(
      {
        propertyType: "apartment",
        area: known(areaFact(68.5, "living"), provenance),
        bedrooms: known(2, provenance),
      },
      "en",
      copy,
    );
    expect(facts.map((f) => f.text)).toEqual(["68.5 m²", "2 bedrooms", "Apartment"]);
    expect(facts[0]?.label).toBe(copy.living);
    expect(
      shownFacts(
        { propertyType: "plot", area: { state: "unknown" }, bedrooms: { state: "unknown" } },
        "en",
        copy,
      ).map((f) => f.key),
    ).toEqual(["type"]);
  });

  it("counts in each language's plural forms", () => {
    expect(plural("ru", discoveryCopy("ru"), "bedroomCount", 1)).toBe("1 спальня");
    expect(plural("ru", discoveryCopy("ru"), "bedroomCount", 3)).toBe("3 спальни");
    expect(plural("ru", discoveryCopy("ru"), "bedroomCount", 5)).toBe("5 спален");
    expect(propertyCountText("en", discoveryCopy("en"), 1)).toBe("1 property");
    expect(propertyCountText("en", discoveryCopy("en"), 30)).toBe("30 properties");
    expect(propertyCountText("bg", discoveryCopy("bg"), 26)).toBe("26 имота");
    expect(propertyCountText("he", discoveryCopy("he"), 2)).toBe("2 נכסים");
  });

  it("drops a caption that only repeats the title", () => {
    expect(
      shownCaption("Building plot near Sandanski.", "building plot near  sandanski"),
    ).toBeNull();
    expect(shownCaption("View from the terrace", "Building plot")).toBe("View from the terrace");
    expect(shownCaption("  ", "Building plot")).toBeNull();
  });
});

describe("photo gallery", () => {
  it("leads with the photos and opens the whole set without JavaScript", () => {
    const copy = discoveryCopy("en");
    const media = Array.from({ length: 7 }, (_, n) =>
      photo(n + 1, n === 2 ? "Terrace at sunset" : "Building plot near Sandanski"),
    );
    const { container } = render(
      <PhotoGallery media={media} title="Building plot near Sandanski" locale="en" copy={copy} />,
    );
    // One large photo and the next four, each a real link into the in-page gallery.
    const tiles = container.querySelectorAll('#listing-photos > div > a[href^="#photo-"]');
    expect(tiles).toHaveLength(5);
    expect(tiles[0]?.querySelector("img")).toHaveAttribute("loading", "eager");
    const all = screen.getByRole("link", { name: /All 7 photos/ });
    expect(all).toHaveAttribute("href", "#photos");
    // The full set is a real section the address can target; every photo has an anchor.
    const section = container.querySelector("section#photos");
    expect(section).not.toBeNull();
    expect(section?.className).toContain("target:block");
    for (let n = 1; n <= 7; n++) expect(section?.querySelector(`#photo-${n} img`)).not.toBeNull();
    // A caption equal to the title is not shown; a real one is.
    const captions = [...(section?.querySelectorAll("figcaption") ?? [])].map((c) => c.textContent);
    expect(captions).toEqual(["Terrace at sunset"]);
    expect(
      within(section as HTMLElement).getByRole("link", { name: copy.closePhotos }),
    ).toHaveAttribute("href", "#listing-photos");
  });
});
