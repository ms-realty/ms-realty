import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { known } from "@/domain/facts";
import type { PublicFact, PublicListingDetail } from "@/server/listings/view-models";
import { discoveryCopy, propertyFactsCopy } from "./copy";
import { ListingFacts } from "./listing-card";
import { PropertyFacts, publicFactText } from "./property-facts";

afterEach(cleanup);
const provenance = { sourceClass: "owner_confirmed", sourceLanguage: "bg" } as const;
const fact = (key: string, value: unknown, group: PublicFact["group"] = "space"): PublicFact => ({
  key,
  fact: known(value, provenance),
  group,
  verification: "owner_supplied",
  reviewed: true,
});
function listing(overrides: Partial<PublicListingDetail> = {}): PublicListingDetail {
  return {
    reference: "MS-10001",
    slug: "ms-10001",
    manifestId: "00000000-0000-4000-8000-000000000001",
    locale: "en",
    title: "Synthetic property",
    purpose: "sale",
    propertyType: "apartment",
    price: known(
      { amountMinor: 12345678, currency: "EUR", period: "total", basis: "asking" },
      provenance,
    ),
    area: known({ value: 72.123456789, unit: "m2", basis: "built" }, provenance),
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
      presented: "confirmation_required",
      freshness: "review_due",
      confirmedAt: null,
      primaryAction: "ask_question",
    },
    cover: null,
    description: null,
    facts: [],
    media: [],
    toConfirm: [],
    responsibleTeam: { label: "MS Realty" },
    indexable: false,
    publishedAt: new Date(0).toISOString(),
    ...overrides,
  };
}
it("P05 groups approved facts, preserves false/zero/exact area and exposes unsettled decision questions", () => {
  const value = listing({
    facts: [
      fact("area.built", { value: 72.123456789, unit: "m2", basis: "built" }),
      fact("feature.lift", false, "access"),
      fact("feature.floor_number", 0, "building"),
    ],
    toConfirm: [{ key: "feature.parking_kind", group: "facilities", state: "conflicting" }],
  });
  render(<PropertyFacts listing={value} locale="en" />);
  expect(screen.getByRole("heading", { name: "Building", level: 3 })).toBeInTheDocument();
  expect(screen.getByText(/72\.123456789/)).toBeInTheDocument();
  expect(screen.getByText("No")).toBeInTheDocument();
  expect(screen.getByText("0")).toBeInTheDocument();
  const confirm = screen.getByRole("region", { name: "What to confirm" });
  expect(within(confirm).getByText(/Parking type/)).toHaveTextContent(
    discoveryCopy("en").conflicting,
  );
  expect(screen.getAllByText(discoveryCopy("en").owner_supplied)).toHaveLength(3);
});
it("P06 uses the canonical rental values and never invents a deposit, charge or date", () => {
  render(
    <PropertyFacts
      listing={listing({
        purpose: "long_term_rent",
        facts: [
          fact("rental.deposit", { amountMinor: 70005, currency: "EUR", period: "total" }),
          fact("rental.restrictions", "Съгласуване за домашни любимци"),
        ],
      })}
      locale="en"
    />,
  );
  const rental = screen.getByRole("region", { name: "Long-term rental terms" });
  expect(within(rental).getByText(/700\.05/)).toBeInTheDocument();
  expect(within(rental).getAllByText("Unknown")).toHaveLength(2);
  expect(screen.getByText("Съгласуване за домашни любимци")).toHaveAttribute("lang", "bg");
  expect(within(rental).queryByText(/0\.00/)).not.toBeInTheDocument();
});
it("P05 does not render private evidence objects or conflicting candidates as a fact", () => {
  const secret = fact(
    "feature.permitted_use",
    { privateEvidence: "PRIVATE-DO-NOT-RENDER" },
    "planning",
  );
  expect(publicFactText(secret, "en")).toBe(propertyFactsCopy("en").unreadable);
  expect(
    publicFactText(
      { ...secret, fact: { state: "conflicting", candidates: ["PRIVATE-DO-NOT-RENDER"] } },
      "en",
    ),
  ).toBe(discoveryCopy("en").conflicting);
  render(<PropertyFacts listing={listing({ facts: [secret] })} locale="en" />);
  expect(document.body).not.toHaveTextContent("PRIVATE-DO-NOT-RENDER");
});
it("P05 retains named inclusions from the approved price without inventing charges", () => {
  const price = known(
    {
      amountMinor: 10000,
      currency: "EUR",
      period: "total",
      basis: "asking",
      inclusions: ["Synthetic source inclusion"],
    } as const,
    provenance,
  );
  render(
    <PropertyFacts
      listing={listing({ price, facts: [fact("price", price.value, "price")] })}
      locale="en"
    />,
  );
  expect(screen.getByRole("listitem")).toHaveTextContent("Synthetic source inclusion");
});
it("P02 plot summaries use property-appropriate facts without invented bedrooms", () => {
  render(
    <ListingFacts
      listing={listing({ propertyType: "plot" })}
      locale="en"
      copy={discoveryCopy("en")}
    />,
  );
  expect(screen.queryByText("Bedrooms")).not.toBeInTheDocument();
  expect(screen.getByText(/72\.123456789/)).toBeInTheDocument();
});
