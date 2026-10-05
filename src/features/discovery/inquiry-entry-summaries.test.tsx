import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { known } from "@/domain/facts";
import { issueSubmissionKey } from "@/server/inquiries/intake";
import type { ListingCard } from "@/server/listings/view-models";
import InquiryPage from "../../../app/public/[locale]/(site)/inquire/page";
import { discoveryCopy } from "./copy";
import { InquiryForm } from "./inquiry-form";
import { inquiryListingSummary } from "./inquiry-listing-summaries";
import { emptyInquiry, type InquiryState } from "./inquiry-state";

const source = vi.hoisted(() => vi.fn());
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => ({ value: "a".repeat(43) }) }),
}));
vi.mock("@/db/client", () => ({ getDb: () => ({}) }));
vi.mock("@/server/listings/detail", () => ({ getPublicListing: source }));
vi.mock("next/navigation", () => ({
  redirect: () => {
    throw new Error("unexpected redirect");
  },
  notFound: () => {
    throw new Error("unexpected not found");
  },
}));

const copy = discoveryCopy("en");
function listing(index: number): ListingCard {
  const reference = `MS-0000${index}`;
  return {
    reference,
    slug: reference.toLowerCase(),
    manifestId: `10000000-0000-4000-8000-00000000000${index}`,
    locale: "en",
    purpose: "sale",
    propertyType: "apartment",
    title: `Approved synthetic property ${index}`,
    price: known(
      { amountMinor: 13500000 + index, currency: "EUR", period: "total", basis: "asking" },
      { sourceClass: "agency_observed" },
    ),
    bedrooms: { state: "unknown" },
    area: known(
      { value: 71.25 + index, unit: "m2", basis: "built" },
      { sourceClass: "agency_observed" },
    ),
    place: {
      country: "BG",
      district: null,
      municipality: null,
      settlement: null,
      neighborhood: "Approved synthetic locality",
      precision: "neighborhood",
    },
    availability: {
      presented: "available",
      freshness: "current_under_policy",
      confirmedAt: null,
      primaryAction: "request_viewing",
    },
    cover: {
      relationId: `relation-${index}`,
      assetId: `00000000-0000-4000-8000-00000000000${index}`,
      digest: String(index).repeat(64),
      kind: "photo",
      contentType: "image/webp",
      width: 1200,
      height: 800,
      alt: `Approved photo ${index}`,
      caption: null,
      modificationDisclosure: null,
      position: 0,
    },
  };
}
const cards = [listing(3), listing(1), listing(2)];
const selection = JSON.stringify(
  cards.map(({ reference, manifestId }) => ({ reference, observedManifestId: manifestId })),
);
afterEach(cleanup);
beforeEach(() => {
  source.mockReset();
  source.mockImplementation(async (_db, query) => ({
    status: "listing",
    listing: cards.find((card) => card.reference === query.reference),
  }));
});

it("shows each already-read approved photo/fact summary in chosen order before the entry fields", async () => {
  const view = render(
    await InquiryPage({
      params: Promise.resolve({ locale: "en" }),
      searchParams: Promise.resolve({ selection, submission: issueSubmissionKey() }),
    }),
  );
  const summaries = Array.from(view.container.querySelectorAll("[data-entry-listing]"));
  expect(summaries.map((node) => node.getAttribute("data-entry-listing"))).toEqual(
    cards.map((card) => card.reference),
  );
  expect(source.mock.calls.map((call) => call[1].reference)).toEqual(
    cards.map((card) => card.reference),
  );
  const purpose = screen.getByRole("combobox", { name: "Purpose" });
  for (const [index, node] of summaries.entries()) {
    const card = cards[index];
    if (!card) throw new Error("Summary has no selected source");
    expect(node.compareDocumentPosition(purpose) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(node as HTMLElement).getByText(copy.unknown)).toBeVisible();
    expect(within(node as HTMLElement).getByText("Built area")).toBeVisible();
    const photo = within(node as HTMLElement).getByRole("img");
    expect(new URL(photo.getAttribute("src") ?? "", "http://localhost:3000").pathname).toBe(
      `/api/media/${card.cover?.assetId}/${card.cover?.digest}`,
    );
    expect(node.textContent).toContain("135,000.0");
  }
  expect(screen.getByText(/Property context loaded with this page/)).toBeVisible();
  expect(view.container.querySelector('[name="selectedListings"]')).toHaveValue(selection);
});

it.each(["changed", "unavailable", "ambiguous"])(
  "does not present a %s subject as an offered card or drop its identity",
  async (kind) => {
    if (kind !== "ambiguous")
      source.mockResolvedValueOnce(
        kind === "unavailable"
          ? { status: "unavailable" }
          : {
              status: "listing",
              listing: { ...cards[0], manifestId: "10000000-0000-4000-8000-000000000009" },
            },
      );
    const view = render(
      await InquiryPage({
        params: Promise.resolve({ locale: "en" }),
        searchParams: Promise.resolve({
          selection,
          submission: issueSubmissionKey(),
          ...(kind === "ambiguous" ? { reference: "MS-00003" } : {}),
        }),
      }),
    );
    expect(view.container.querySelectorAll("[data-entry-listing]")).toHaveLength(0);
    expect(
      screen.queryByRole("button", { name: "Send inquiry to MS Realty" }),
    ).not.toBeInTheDocument();
    if (kind === "ambiguous") {
      expect(source).not.toHaveBeenCalled();
      expect(view.container.querySelector("form")).toBeNull();
    } else {
      expect(view.container.querySelector('[name="selectedListings"]')).toHaveValue(selection);
      expect(screen.getByRole("button", { name: "Review current sources" })).toBeVisible();
      for (const card of cards)
        expect(screen.getByRole("link", { name: card.reference })).toBeVisible();
    }
  },
);

it("removes page-loaded summaries after a source conflict while retaining the original selection", async () => {
  const user = userEvent.setup();
  const state: InquiryState = {
    operationId: "issued-operation",
    expectedRevision: null,
    responseId: "initial",
    values: { ...emptyInquiry, selectedListings: selection },
    outcome: { kind: "idle" },
  };
  const view = render(
    <InquiryForm
      initialState={state}
      initialListings={cards}
      locale="en"
      copy={copy}
      action={async (previous) => ({
        ...previous,
        responseId: "changed",
        sourcesChanged: true,
        outcome: {
          kind: "validation",
          code: "VALIDATION_FAILED",
          message: "Changed",
          fieldErrors: { contentReference: ["Review current sources"] },
        },
      })}
    />,
  );
  expect(view.container.querySelectorAll("[data-entry-listing]")).toHaveLength(3);
  await user.click(screen.getByRole("button", { name: "Review inquiry" }));
  expect(view.container.querySelectorAll("[data-entry-listing]")).toHaveLength(0);
  expect(view.container.querySelector('[name="selectedListings"]')).toHaveValue(selection);
});

it("passes only the public card projection rather than arbitrary source details", () => {
  const card = listing(1);
  const projection = inquiryListingSummary({
    ...card,
    internalNote: "Do not serialize this",
  } as ListingCard & { internalNote: string });
  expect(projection).toEqual(card);
  expect(projection).not.toHaveProperty("internalNote");
});
