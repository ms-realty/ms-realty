import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { known } from "@/domain/facts";
import type { PublicListingDetail } from "@/server/listings/view-models";
import { compareCopy } from "./compare-copy";
import {
  Comparison,
  ComparisonCorrection,
  type ComparisonItem,
  comparisonSelection,
} from "./comparison";
import { discoveryCopy } from "./copy";

afterEach(cleanup);
const copy = discoveryCopy("en");
const labels = compareCopy("en");
const provenance = { sourceClass: "agency_observed" } as const;
function listing(index: number, overrides: Partial<PublicListingDetail> = {}): PublicListingDetail {
  const reference = `MS-0000${index}`;
  const cover = {
    relationId: `relation-${index}`,
    assetId: `00000000-0000-4000-8000-00000000000${index}`,
    digest: `${index}`.repeat(64),
    kind: "photo" as const,
    contentType: "image/webp",
    width: 1200,
    height: 800,
    alt: `Approved synthetic photo ${reference}`,
    caption: null,
    modificationDisclosure: null,
    position: 0,
  };
  return {
    reference,
    slug: reference.toLowerCase(),
    manifestId: `10000000-0000-4000-8000-00000000000${index}`,
    locale: "en",
    purpose: "sale",
    propertyType: "apartment",
    title: `Synthetic long property title ${reference} ${"description ".repeat(8)}`,
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
      neighborhood: "Synthetic neighborhood",
      precision: "neighborhood",
    },
    availability: {
      presented: "available",
      freshness: "current_under_policy",
      confirmedAt: null,
      primaryAction: "request_viewing",
    },
    cover,
    description: null,
    facts: [],
    media: [cover],
    toConfirm: [],
    responsibleTeam: { label: "MS Realty" },
    indexable: false,
    publishedAt: "2026-09-30T00:00:00Z",
    ...overrides,
  };
}
function item(value: PublicListingDetail): ComparisonItem {
  return {
    reference: value.reference,
    result: { status: "listing", listing: value, alternatives: [] },
  };
}
function cell(row: string, reference: string) {
  const header = document.getElementById(`compare-${row}`);
  if (!header?.parentElement) throw new Error("Missing row header");
  const cells = within(header.parentElement).getAllByRole("cell");
  const value = cells.find(
    (element) => element.getAttribute("headers") === `compare-${row} compare-${reference}`,
  );
  if (!value) throw new Error("Missing correctly associated cell");
  return value;
}

it("compares the exact three ordered public identities, approved images and fact bases in a semantic table", () => {
  const values: [PublicListingDetail, PublicListingDetail, PublicListingDetail] = [
    listing(1),
    listing(2, {
      purpose: "long_term_rent",
      price: known(
        { amountMinor: 70005, currency: "EUR", period: "month", basis: "negotiable" },
        provenance,
      ),
      area: known({ value: 65, unit: "m2", basis: "living" }, provenance),
      bedrooms: known(0, provenance),
      facts: [
        {
          key: "feature.lift",
          group: "access",
          fact: known(false, provenance),
          verification: "broker_verified",
          reviewed: true,
        },
      ],
    }),
    listing(3, {
      price: { state: "not_supplied" },
      area: { state: "unknown" },
      facts: [
        {
          key: "feature.lift",
          group: "access",
          fact: { state: "conflicting", candidates: [true, false] },
          verification: "imported",
          reviewed: false,
        },
      ],
    }),
  ];
  render(<Comparison items={values.map(item)} locale="en" copy={copy} />);
  const table = screen.getByRole("table", { name: labels.title });
  expect(within(table).getAllByRole("row")).toHaveLength(7);
  for (const row of within(table).getAllByRole("row").slice(1))
    expect(within(row).getAllByRole("cell")).toHaveLength(3);
  for (const value of values) {
    const header = document.getElementById(`compare-${value.reference}`);
    expect(header?.tagName).toBe("TH");
    expect(header).toHaveAttribute("scope", "col");
    const image = within(header as HTMLElement).getByRole("img");
    expect(new URL(image.getAttribute("src") ?? "", "https://example.test").pathname).toBe(
      `/api/media/${value.cover?.assetId}/${value.cover?.digest}`,
    );
    const individual = screen.getByRole("link", { name: `${copy.ask} · ${value.reference}` });
    const query = new URL(individual.getAttribute("href") ?? "", "https://example.test")
      .searchParams;
    expect(Object.fromEntries(query)).toEqual({
      purpose: "question",
      reference: value.reference,
      manifest: value.manifestId,
      comparisonReferences: values.map((other) => other.reference).join(","),
    });
  }
  expect(cell("price", values[0].reference)).toHaveTextContent("123,456.78");
  expect(cell("price", values[0].reference)).toHaveTextContent(copy.asking);
  expect(cell("price", values[0].reference)).toHaveTextContent(labels.total);
  expect(cell("price", values[1].reference)).toHaveTextContent("700.05");
  expect(cell("price", values[1].reference)).toHaveTextContent(copy.perMonth);
  expect(cell("price", values[1].reference)).toHaveTextContent(copy.negotiable);
  expect(cell("area", values[0].reference)).toHaveTextContent("72.123456789 m²");
  expect(cell("area", values[0].reference)).toHaveTextContent(copy.built);
  expect(cell("area", values[1].reference)).toHaveTextContent(copy.living);
  expect(cell("bedrooms", values[0].reference)).toHaveTextContent(copy.unknown);
  expect(cell("bedrooms", values[1].reference)).toHaveTextContent("0");
  expect(cell("lift", values[0].reference)).toHaveTextContent(copy.unknown);
  expect(cell("lift", values[1].reference)).toHaveTextContent(labels.no);
  expect(cell("lift", values[2].reference)).toHaveTextContent(copy.conflicting);
  expect(cell("price", values[2].reference)).toHaveTextContent(copy.not_supplied);
  const collective = screen.getByRole("link", { name: labels.collective });
  const query = new URL(collective.getAttribute("href") ?? "", "https://example.test").searchParams;
  expect(query.get("purpose")).toBe("question");
  expect(JSON.parse(query.get("selection") ?? "null")).toEqual(
    values.map(({ reference, manifestId }) => ({ reference, observedManifestId: manifestId })),
  );
  expect(query.has("reference")).toBe(false);
});

describe("unavailable comparison entries", () => {
  it.each(["unavailable", "not_found", "failed", "view_similar"] as const)(
    "keeps the %s slot and blocks the whole-selection inquiry",
    (state) => {
      const unavailable = listing(2);
      const unavailableItem: ComparisonItem = {
        reference: unavailable.reference,
        result:
          state === "failed"
            ? null
            : state === "not_found"
              ? { status: "not_found" }
              : state === "unavailable"
                ? {
                    status: "unavailable",
                    reference: unavailable.reference,
                    purpose: "sale",
                    alternatives: [],
                  }
                : item({
                    ...unavailable,
                    availability: {
                      ...unavailable.availability,
                      presented: "sold",
                      primaryAction: "view_similar",
                    },
                  }).result,
      };
      render(
        <Comparison
          items={[item(listing(1)), unavailableItem, item(listing(3))]}
          locale="en"
          copy={copy}
        />,
      );
      expect(screen.queryByRole("link", { name: labels.collective })).not.toBeInTheDocument();
      expect(screen.getByText(labels.blocked)).toBeVisible();
      expect(document.getElementById(`compare-${unavailable.reference}`)).toBeInTheDocument();
      for (const row of screen.getAllByRole("row").slice(1))
        expect(within(row).getAllByRole("cell")).toHaveLength(3);
      expect(
        screen.queryByRole("link", { name: `${copy.ask} · ${unavailable.reference}` }),
      ).not.toBeInTheDocument();
      expect(
        screen.getByRole("link", { name: `${copy.remove} ${unavailable.reference}` }),
      ).toHaveAttribute("href", "/en/compare?references=MS-00001,MS-00003");
      if (state !== "view_similar") {
        const unavailableText = state === "failed" ? copy.failed : copy.unavailable;
        expect(screen.getAllByText(unavailableText, { exact: true })).toHaveLength(1);
        expect(cell("price", unavailable.reference)).toHaveAccessibleName(unavailableText);
        expect(
          screen.queryByText(unavailable.title ?? "", { exact: true }),
        ).not.toBeInTheDocument();
        expect(
          screen.queryByRole("img", { name: unavailable.cover?.alt ?? "" }),
        ).not.toBeInTheDocument();
      }
    },
  );
});

it("keeps localized labels and unknown values explicit in Hebrew", () => {
  render(<Comparison items={[item(listing(1))]} locale="he" copy={discoveryCopy("he")} />);
  expect(screen.getByRole("table", { name: compareCopy("he").title })).toBeInTheDocument();
  expect(cell("lift", "MS-00001")).toHaveTextContent(discoveryCopy("he").unknown);
  expect(screen.getByRole("link", { name: compareCopy("he").collective })).toHaveAttribute(
    "href",
    expect.stringContaining("/he/inquire?"),
  );
});

it("validates a URL choice without silently changing ordered identities", () => {
  expect(comparisonSelection("MS-00003,MS-00001,MS-00002")).toEqual({
    references: ["MS-00003", "MS-00001", "MS-00002"],
    correction: null,
  });
  expect(comparisonSelection("")).toEqual({ references: [], correction: null });
  for (const input of [
    "MS-00001,MS-00001",
    "MS-00001,invalid",
    "MS-00001,",
    "MS-00001,MS-00002,MS-00003,MS-00004",
  ])
    expect(comparisonSelection(input)).toEqual({ references: [], correction: input.split(",") });
  expect(comparisonSelection(["MS-00001", "MS-00002"]).correction).toEqual([]);
  expect(comparisonSelection("x".repeat(4097)).correction).toEqual([]);
});

it("lets a native GET remove one problematic URL entry without normalizing the others", () => {
  render(
    <ComparisonCorrection
      entries={["MS-00001", "invalid", "MS-00001", "MS-00004"]}
      locale="en"
      copy={copy}
    />,
  );
  expect(screen.getByRole("status")).toHaveTextContent(labels.correction);
  const href = screen.getByRole("link", { name: `${copy.remove} invalid` }).getAttribute("href");
  expect(new URL(href ?? "", "https://example.test").searchParams.get("references")).toBe(
    "MS-00001,MS-00001,MS-00004",
  );
  expect(screen.queryByRole("link", { name: labels.collective })).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: labels.clear })).toHaveAttribute(
    "href",
    "/en/compare?references=",
  );
});
