import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { known } from "@/domain/facts";
import type { ListingCard } from "@/server/listings/view-models";
import { shareCopy } from "./share-copy";
import type { RecipientItem, RecipientRead } from "./share-model";
import { SharedShortlist } from "./shared-shortlist";

afterEach(cleanup);

const token = "T".repeat(43);
const manifestId = "10000000-0000-4000-8000-000000000001";
const instant = "2026-03-08T10:00:00.000Z";

function card(reference: string): ListingCard {
  return {
    reference,
    slug: reference.toLowerCase(),
    manifestId,
    locale: "en",
    purpose: "sale",
    propertyType: "apartment",
    title: `Synthetic property ${reference}`,
    price: known(
      { amountMinor: 12345678, currency: "EUR", period: "total", basis: "asking" },
      { sourceClass: "agency_observed" },
    ),
    area: known({ value: 76, unit: "m2", basis: "total" }, { sourceClass: "agency_observed" }),
    bedrooms: known(2, { sourceClass: "agency_observed" }),
    place: {
      country: "BG",
      district: null,
      municipality: null,
      settlement: null,
      neighborhood: "Synthetic place",
      precision: "neighborhood",
    },
    availability: {
      presented: "available",
      freshness: "current_under_policy",
      confirmedAt: null,
      primaryAction: "request_viewing",
    },
    cover: null,
  };
}
const shown = (reference: string): RecipientItem => ({
  status: "public",
  reference,
  card: card(reference),
});
const gone = (reference: string): RecipientItem => ({ status: "unavailable", reference });
const ready = (...items: RecipientItem[]): RecipientRead => ({
  status: "ready",
  expiresAt: instant,
  items,
});
const view = (read: RecipientRead, locale: "en" | "bg" | "he" = "en") =>
  render(<SharedShortlist locale={locale} token={token} read={read} />);

describe("P09 recipient list", () => {
  it("shows the neutral title, only public facts and when the link works until", () => {
    const { container } = view(ready(shown("MS-00001"), shown("MS-00002")));
    const labels = shareCopy("en");
    expect(screen.getByRole("heading", { level: 1, name: labels.title })).toBeVisible();
    expect(screen.getByText(labels.publicOnly)).toBeVisible();
    expect(screen.getByText(labels.checked)).toBeVisible();
    const until = container.querySelector("time");
    expect(until?.getAttribute("datetime")).toBe(instant);
    expect(until?.textContent).toMatch(/2026/);
    // Facts are preserved exactly: price with basis, area, bedrooms, place, reference.
    const first = container.querySelector('article[data-listing-reference="MS-00001"]');
    expect(first).not.toBeNull();
    const scope = within(first as HTMLElement);
    expect(scope.getByText(/123,456\.78/)).toBeVisible();
    expect(scope.getByText("Synthetic place")).toBeVisible();
    expect(scope.getByText("2")).toBeVisible();
    expect(scope.getByRole("link", { name: "Synthetic property MS-00001" })).toHaveAttribute(
      "href",
      "/en/properties/MS-00001/ms-00001",
    );
  });

  it("offers compare, open and contact for the shown Listings", () => {
    view(ready(shown("MS-00001"), shown("MS-00002"), gone("MS-00003")));
    const labels = shareCopy("en");
    expect(screen.getByRole("link", { name: labels.compareThese })).toHaveAttribute(
      "href",
      "/en/compare?references=MS-00001,MS-00002",
    );
    const contact = screen.getAllByRole("link", { name: "Send an inquiry" });
    expect(contact).toHaveLength(2);
    expect(contact[0]).toHaveAttribute(
      "href",
      `/en/inquire?purpose=question&reference=MS-00001&manifest=${manifestId}`,
    );
  });

  it("keeps only the reference of a closed Listing and counts what is shown", () => {
    const { container } = view(ready(shown("MS-00001"), gone("MS-00002")));
    const placeholder = container.querySelector('article[data-listing-reference="MS-00002"]');
    expect(placeholder).toHaveAttribute("data-unavailable");
    expect(placeholder?.textContent).toContain(shareCopy("en").unavailableItem);
    // No price, media or title survives for a closed offer.
    expect(placeholder?.textContent).not.toMatch(/€|123|Synthetic/);
    expect(placeholder?.querySelector("img,a,button")).toBeNull();
    expect(screen.getByText(/Properties shown:/).textContent).toContain("1 / 2");
    expect(screen.queryByRole("link", { name: shareCopy("en").compareThese })).toBeNull();
    // A missing item may only lack an approved version here: the source language is one click away.
    expect(screen.getByRole("link", { name: shareCopy("en").inBulgarian })).toHaveAttribute(
      "href",
      `/bg/share/${token}`,
    );
  });

  it("does not offer Bulgarian to a reader who is already in it", () => {
    view(ready(shown("MS-00001"), gone("MS-00002")), "bg");
    expect(screen.getByText(new RegExp(`${shareCopy("bg").shown}:`))).toBeVisible();
    expect(screen.queryByRole("link", { name: shareCopy("bg").inBulgarian })).toBeNull();
  });

  it("explains an all-unavailable list and offers the source language only off Bulgarian", () => {
    const { container, unmount } = view(ready(gone("MS-00001"), gone("MS-00002")));
    expect(screen.getByText(shareCopy("en").allGoneTitle)).toBeVisible();
    expect(screen.getByRole("link", { name: shareCopy("en").inBulgarian })).toHaveAttribute(
      "href",
      `/bg/share/${token}`,
    );
    expect(container.querySelectorAll("[data-unavailable]")).toHaveLength(2);
    unmount();
    view(ready(gone("MS-00001")), "bg");
    expect(screen.getByText(shareCopy("bg").allGoneTitle)).toBeVisible();
    expect(screen.queryByRole("link", { name: shareCopy("bg").inBulgarian })).toBeNull();
  });

  it("renders in Hebrew from the same data", () => {
    view(ready(shown("MS-00001")), "he");
    expect(screen.getByRole("heading", { level: 1, name: shareCopy("he").title })).toBeVisible();
  });
});

describe("P09 closed links", () => {
  it.each([
    ["expired", "expiredTitle", "expiredBody"],
    ["revoked", "revokedTitle", "revokedBody"],
    ["unavailable", "unknownTitle", "unknownBody"],
  ] as const)(
    "shows a safe %s state with no listing facts and no creator",
    (status, title, body) => {
      const labels = shareCopy("en");
      const { container } = view({ status });
      expect(screen.getByRole("heading", { level: 1, name: labels[title] })).toBeVisible();
      expect(screen.getByText(labels[body])).toBeVisible();
      expect(screen.getByText(labels.noCreator)).toBeVisible();
      expect(container.querySelector(`[data-share-status="${status}"]`)).not.toBeNull();
      expect(container.querySelector("article")).toBeNull();
      // Search stays one click away; the token never echoes into the page.
      expect(screen.getByRole("link", { name: "Search properties" })).toHaveAttribute(
        "href",
        "/en/properties",
      );
      expect(container.innerHTML).not.toContain(token);
    },
  );

  it("words expired and revoked differently from each other and from unknown", () => {
    const labels = shareCopy("en");
    expect(new Set([labels.expiredTitle, labels.revokedTitle, labels.unknownTitle]).size).toBe(3);
  });
});
