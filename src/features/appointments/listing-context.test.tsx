import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { discoveryCopy } from "@/features/discovery/copy";
import { priceText } from "@/features/discovery/presentation";
import { viewingCopy } from "@/features/discovery/viewing-copy";
import type { ListingCard } from "@/server/listings/view-models";
import { AppointmentListingContext } from "./listing-context";

afterEach(cleanup);
const card: ListingCard = {
  reference: "MS-00001",
  slug: "ms-00001",
  manifestId: "12345678-1234-4123-8123-123456789001",
  locale: "en",
  purpose: "sale",
  propertyType: "apartment",
  title: "Approved synthetic property",
  price: {
    state: "known",
    value: { amountMinor: 9876543, currency: "EUR", period: "total", basis: "asking" },
    provenance: { sourceClass: "source_supplied" },
  },
  place: {
    country: "BG",
    district: null,
    municipality: null,
    settlement: null,
    neighborhood: null,
    precision: "region",
  },
  bedrooms: { state: "not_supplied" },
  area: { state: "not_supplied" },
  availability: {
    presented: "available",
    freshness: "current_under_policy",
    confirmedAt: null,
    primaryAction: "ask_question",
  },
  cover: null,
};

it("P14 displays only the supplied approved identity and exact public fact states", () => {
  const href = "https://public.example.test/en/properties/MS-00001/ms-00001";
  render(
    <AppointmentListingContext listing={{ reference: card.reference, card, href }} locale="en" />,
  );
  expect(screen.getByRole("link", { name: card.title ?? "" })).toHaveAttribute("href", href);
  const section = screen.getByRole("region", { name: discoveryCopy("en").reference });
  expect(section).toHaveTextContent(card.reference);
  expect(section).toHaveTextContent(priceText(card.price, "en", discoveryCopy("en")));
  expect(screen.getAllByText(discoveryCopy("en").not_supplied)).toHaveLength(2);
  expect(section.querySelector("img, iframe")).toBeNull();
});

it("P14 unavailable context shows the associated reference and fallback without a property link", () => {
  render(
    <AppointmentListingContext
      listing={{ reference: "MS-00001", card: null, href: null }}
      locale="he"
    />,
  );
  expect(screen.getByText("MS-00001")).toBeVisible();
  expect(screen.getByText(viewingCopy("he").unavailable)).toBeVisible();
  expect(screen.queryByRole("link")).not.toBeInTheDocument();
  expect(screen.queryByText(card.title ?? "")).not.toBeInTheDocument();
});
