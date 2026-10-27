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
    "auto, (min-width: 90rem) 27.5rem, (min-width: 80rem) calc(33.333vw - 2.75rem), (min-width: 40rem) calc(50vw - 2rem), calc(100vw - 2.5rem)",
  );
  expect(photo.getAttribute("srcset")).toContain("480w");
  expect(photo.getAttribute("srcset")).toContain("960w");
  expect(photo).toHaveClass("object-cover");
  expect(photo.parentElement).toHaveClass("aspect-[3/2]");
});
