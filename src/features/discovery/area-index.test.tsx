import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import type { ApprovedArea } from "@/server/content/public";
import type { ListingCard } from "@/server/listings/view-models";
import { areaCopy } from "./area-copy";
import type { AreaData } from "./area-data";
import { AreaDetail } from "./area-detail";
import { AreaIndex } from "./area-index";
import { AreaPhotograph } from "./area-media";
import { discoveryCopy } from "./copy";

afterEach(cleanup);
const placeId = "00000000-0000-4000-8000-000000000001";
const area: ApprovedArea = {
  title: "Одобрен синтетичен район",
  paragraphs: ["Точен одобрен текст. Без добавени обещания."],
  version: {
    id: "00000000-0000-4000-8000-000000000002",
    number: 2,
    contentHash: "hash",
    contentPageId: "page",
  },
  locale: "bg",
  jurisdiction: "Synthetic scope",
  reviewScope: "Synthetic review only",
  reviewedAt: "2026-01-01T10:00:00.000Z",
  slug: "synthetic-area",
  placeId,
  geography: [
    {
      id: placeId,
      level: "settlement",
      slug: "synthetic",
      name: "Тестово място",
      nameNative: "Тестово място",
      nameLatin: "Test place",
      countryCode: "BG",
    },
  ],
};
const noData: AreaData = {
  guides: [],
  locations: [],
  featured: null,
  contentFailed: false,
  inventoryFailed: false,
  sourceAvailable: false,
};
const [areaPlace] = area.geography;
if (!areaPlace) throw new Error("Missing synthetic place");
const [paragraph] = area.paragraphs;
if (!paragraph) throw new Error("Missing synthetic paragraph");

it("P15 shows truthful empty and failure states with functional manual paths", () => {
  const { rerender } = render(<AreaIndex locale="bg" data={noData} />);
  expect(screen.getByText(areaCopy("bg").noGuides)).toBeInTheDocument();
  expect(screen.getByText(areaCopy("bg").noLocations)).toBeInTheDocument();
  expect(screen.getByText(areaCopy("bg").noPhotograph)).toBeVisible();
  expect(screen.getByRole("link", { name: "Свържете се с нас" })).toHaveAttribute(
    "href",
    "/bg/contact",
  );
  rerender(
    <AreaIndex locale="bg" data={{ ...noData, contentFailed: true, inventoryFailed: true }} />,
  );
  expect(screen.queryByText(areaCopy("bg").noLocations)).not.toBeInTheDocument();
  expect(screen.getAllByRole("link", { name: "Опитайте отново", hidden: true })).toHaveLength(2);
  expect(screen.queryByText(areaCopy("bg").noGuides)).not.toBeInTheDocument();
});

it("P15 distinguishes settlement and municipality, and links exact inventory purposes and approved guides", () => {
  render(
    <AreaIndex
      locale="bg"
      data={{
        ...noData,
        guides: [area],
        locations: [
          {
            ...areaPlace,
            parentName: "Тестова община",
            count: 4,
            saleCount: 3,
            rentCount: 1,
          },
        ],
      }}
    />,
  );
  expect(screen.getByRole("heading", { name: area.title })).toBeVisible();
  const guideLinks = screen.getAllByRole("link", { name: new RegExp(area.title), hidden: true });
  expect(guideLinks).toHaveLength(2);
  for (const link of guideLinks) expect(link).toHaveAttribute("href", "/bg/areas/synthetic-area");
  expect(
    screen.getByText(
      (_text, element) =>
        element?.tagName === "P" && element.textContent === "Населено място · Тестова община · BG",
    ),
  ).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /Продажба · 3/, hidden: true })).toHaveAttribute(
    "href",
    `/bg/properties?purpose=sale&places=${placeId}`,
  );
  expect(screen.getByRole("link", { name: /Дългосрочен наем · 1/, hidden: true })).toHaveAttribute(
    "href",
    `/bg/properties?purpose=long_term_rent&places=${placeId}`,
  );
  expect(screen.getByText(areaCopy("bg").places).closest("summary")).toBeInTheDocument();
});

it("P15 labels absent approved translations and offers BG as a deliberate source switch", () => {
  render(<AreaIndex locale="he" data={{ ...noData, sourceAvailable: true }} />);
  expect(screen.queryByText(area.title)).not.toBeInTheDocument();
  expect(screen.getByText(areaCopy("he").noTranslation)).toBeInTheDocument();
  const source = document.querySelector('a[href="/bg/areas"]');
  expect(source).toHaveAttribute("hreflang", "bg");
});

it("P15 shows retry and manual contact instead of missing-translation copy when the BG source probe fails", () => {
  render(<AreaIndex locale="en" data={{ ...noData, contentFailed: true }} />);
  expect(screen.getByText(discoveryCopy("en").failed)).toBeVisible();
  expect(screen.queryByText(areaCopy("en").noTranslation)).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: areaCopy("en").refresh })).toHaveAttribute(
    "href",
    "/en/areas",
  );
  expect(screen.getByRole("link", { name: areaCopy("en").contact })).toHaveAttribute(
    "href",
    "/en/contact",
  );
  expect(document.querySelector('a[href="/bg/areas"]')).toBeNull();
});

it("P15 preserves the approved edition and contextual inquiry without inventing an unbound location", () => {
  render(
    <AreaDetail
      locale="bg"
      area={{ ...area, placeId: null, geography: [] }}
      inventory={null}
      slug={area.slug}
    />,
  );
  expect(screen.getByText(paragraph)).toBeVisible();
  expect(screen.getByText(areaCopy("bg").noBinding)).toBeVisible();
  expect(document.querySelector('a[href*="places="]')).toBeNull();
  const inquiry =
    screen.getByRole("link", { name: "Свържете се с нас" }).getAttribute("href") ?? "";
  expect(
    JSON.parse(new URL(inquiry, "http://example.test").searchParams.get("contentReference") ?? ""),
  ).toEqual({ kind: "area", slug: area.slug, versionId: area.version.id });
  expect(screen.getByText(`${area.reviewScope} · ${area.jurisdiction}`)).toBeVisible();
});

it("P15 never reports a failed inventory read as no inventory", () => {
  const { rerender } = render(
    <AreaDetail
      locale="bg"
      area={area}
      inventory={{ items: [], saleCount: 0, rentCount: 0, failed: false }}
      slug={area.slug}
    />,
  );
  expect(screen.getByText(areaCopy("bg").noInventory)).toBeVisible();
  rerender(
    <AreaDetail
      locale="bg"
      area={area}
      inventory={{ items: [], saleCount: 0, rentCount: 0, failed: true }}
      slug={area.slug}
    />,
  );
  expect(screen.queryByText(areaCopy("bg").noInventory)).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Опитайте отново" })).toHaveAttribute(
    "href",
    `/bg/areas/${area.slug}`,
  );
});

it("P15 degrades a revoked or failed image visibly and does not render plans as photographs", () => {
  const media = {
    relationId: "relation",
    assetId: placeId,
    digest: "a".repeat(64),
    kind: "photo",
    contentType: "image/webp",
    width: 800,
    height: 600,
    alt: "Synthetic approved photo",
    caption: null,
    modificationDisclosure: null,
    position: 0,
  } as const;
  const { rerender } = render(<AreaPhotograph media={media} unavailable="Photo unavailable" />);
  fireEvent.error(screen.getByRole("img", { name: "Synthetic approved photo" }));
  expect(screen.queryByRole("img")).not.toBeInTheDocument();
  expect(screen.getByText("Photo unavailable")).toBeVisible();
  rerender(
    <AreaPhotograph media={{ ...media, kind: "floor_plan" }} unavailable="Photo unavailable" />,
  );
  expect(screen.queryByRole("img")).not.toBeInTheDocument();
});

it("P15 binds a viewing handoff to the displayed eligible manifest only when it supports requesting a viewing", () => {
  const featured = {
    reference: "MS-99991",
    slug: "ms-99991",
    manifestId: "manifest",
    purpose: "sale",
    title: "Synthetic listing",
    cover: null,
    place: { country: "BG", settlement: null, municipality: null, neighborhood: null },
    availability: { primaryAction: "request_viewing" },
  } as unknown as ListingCard;
  const { rerender } = render(<AreaIndex locale="bg" data={{ ...noData, featured }} />);
  let handoff = screen.getByRole("link", { name: /Вижте мястото лично/ }).getAttribute("href");
  expect(handoff).toBe("/bg/inquire?purpose=viewing_request&reference=MS-99991&manifest=manifest");
  expect(screen.queryByText(/Снимка от публикуван имот/)).not.toBeInTheDocument();
  rerender(
    <AreaIndex
      locale="bg"
      data={{
        ...noData,
        featured: {
          ...featured,
          availability: { ...featured.availability, primaryAction: "ask_question" },
        },
      }}
    />,
  );
  handoff = screen.getByRole("link", { name: /Вижте мястото лично/ }).getAttribute("href");
  expect(handoff).toBe("/bg/properties?purpose=sale");
});
