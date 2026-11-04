import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { legacySnapshotPages } from "@/server/legacy/pages";
import { reviewedSamePathLegacyPages } from "@/server/legacy/sitemap";
import robots from "../../../app/robots";
import sitemap from "../../../app/sitemap";
import { type PublicListingRoutePage, publicStaticPaths } from "./public-pages";

const mocks = vi.hoisted(() => ({ content: vi.fn(), listings: vi.fn() }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("./public-metadata", () => ({
  publicSeoOrigin: () => new URL("https://makler-realty.com"),
}));
vi.mock("./public-pages", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./public-pages")>()),
  publicContentPages: mocks.content,
  publicListingRoutePages: mocks.listings,
}));

const origin = "https://makler-realty.com";
beforeEach(() => {
  vi.stubEnv("STAGING", "false");
  mocks.content.mockResolvedValue([]);
  mocks.listings.mockResolvedValue([]);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

it("R09/AT27 lists only approved static locales, leaving unapproved legacy inventories intact", async () => {
  const pages = await sitemap();
  expect(pages).toHaveLength(publicStaticPaths.length);
  expect(pages.map((page) => page.url)).toEqual(
    publicStaticPaths.map((path) => `${origin}/bg${path === "/" ? "" : path}`),
  );
  for (const page of pages)
    expect(page.alternates?.languages).toEqual({ bg: page.url, "x-default": page.url });
  expect(legacySnapshotPages().length).toBeGreaterThan(0);
  expect(reviewedSamePathLegacyPages(new URL(origin)).length).toBeGreaterThan(0);
});

it("AT27 excludes unapproved translations, unavailable and fallback routes, and missing self editions", async () => {
  mocks.content.mockResolvedValue([
    { locale: "bg", path: "/help/synthetic-approved" },
    { locale: "en", path: "/help/synthetic-approved" },
    { locale: "ru", path: "/help/synthetic-translation-only" },
  ]);
  const listing = (reference: string, fields: Partial<PublicListingRoutePage>) => ({
    reference,
    locale: "bg",
    path: `/properties/${reference}/${reference.toLowerCase()}`,
    surface: "listing",
    availableIn: ["bg", "en"],
    ...fields,
  });
  mocks.listings.mockResolvedValue([
    listing("MS-00101", {}),
    listing("MS-00101", { locale: "en" }),
    listing("MS-00102", { surface: "unavailable", availableIn: [] }),
    listing("MS-00103", { surface: "translation_fallback", availableIn: [] }),
    listing("MS-00104", { availableIn: ["en"] }),
  ]);
  const pages = await sitemap();
  const expected = [
    `${origin}/bg/help/synthetic-approved`,
    `${origin}/bg/properties/MS-00101/ms-00101`,
  ];
  const added = pages.filter((page) => /\/help\/|\/properties\/MS-|\/legacy\//.test(page.url));
  expect(added.map((page) => page.url)).toEqual(expected);
  expect(pages).toHaveLength(publicStaticPaths.length + expected.length);
  for (const page of added)
    expect(page.alternates?.languages).toEqual({ bg: page.url, "x-default": page.url });
});

it("R09 keeps production pages crawlable so crawlers can observe noindex, while staging stays blocked", async () => {
  expect(await robots()).toEqual({
    rules: { userAgent: "*", allow: "/", disallow: "/api/" },
    sitemap: `${origin}/sitemap.xml`,
  });
  vi.stubEnv("STAGING", "true");
  expect(await robots()).toEqual({ rules: { userAgent: "*", disallow: "/" } });
});
