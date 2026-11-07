import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rows: vi.fn(), content: vi.fn(), offerings: vi.fn() }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/db/client", () => ({
  getDb: () => ({ select: () => ({ from: () => ({ where: mocks.rows }) }) }),
}));
vi.mock("@/server/content/public", () => ({ readApprovedContent: mocks.content }));
vi.mock("@/server/service-intake/scope", () => ({ publicServiceOfferings: mocks.offerings }));
vi.mock("./public-pages", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./public-pages")>()),
  publicListingRoutePages: async () => [],
}));

import { publicLocales } from "@/i18n/config";
import sitemap from "../../../app/sitemap";
import { publicContentMetadata } from "./public-metadata";
import { publicContentPages } from "./public-pages";

const origin = "https://makler-realty.com";
const editions = [
  { kind: "help", slug: "contact", native: "/contact", generic: "/help/contact" },
  { kind: "service", slug: "sell", native: "/sell", generic: "/services/sell" },
  { kind: "service", slug: "let", native: "/let", generic: "/services/let" },
] as const;
const approved = {
  title: "Синтетична одобрена страница",
  paragraphs: ["Точно одобрен синтетичен текст."],
  reviewedAt: new Date(0).toISOString(),
};
const url = (locale: string, path: string) => `${origin}/${locale}${path}`;
const bgOnly = async (_db: unknown, _kind: string, _slug: string, locale: string) =>
  locale === "bg" ? approved : null;

beforeEach(() => {
  vi.stubEnv("CANONICAL_ORIGIN", origin);
  vi.stubEnv("STAGING", "false");
  mocks.rows.mockResolvedValue(editions);
  mocks.content.mockResolvedValue(null);
  mocks.offerings.mockResolvedValue([]);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetAllMocks();
});

it("R09/AT27 excludes missing CMS native entries independently of the static route list", async () => {
  expect(await publicContentPages()).toEqual([]);
  const pages = await sitemap();
  for (const edition of editions)
    for (const locale of publicLocales) {
      const metadata = await publicContentMetadata(
        locale,
        edition.kind,
        edition.slug,
        edition.native,
      );
      expect(metadata.robots).toEqual({ index: false, follow: true });
      expect(metadata.alternates).toEqual({
        canonical: url(locale, edition.native),
        languages: {},
      });
      for (const path of [edition.native, edition.generic])
        expect(pages.some((page) => page.url === url(locale, path))).toBe(false);
    }
});

it("R09 preserves approved native CMS identities without inventing available generic services", async () => {
  mocks.content.mockImplementation(bgOnly);
  expect((await publicContentPages()).map((page) => page.path).sort()).toEqual([
    "/contact",
    "/help/contact",
    "/let",
    "/sell",
  ]);
  const pages = await sitemap();
  for (const edition of editions) {
    const metadata = await publicContentMetadata("bg", edition.kind, edition.slug, edition.native);
    expect(metadata.title).toBe(approved.title);
    expect(metadata.description).toBe(approved.paragraphs[0]);
    expect(metadata.robots).toEqual({ index: true, follow: true });
    const canonical = url("bg", edition.native);
    expect(metadata.alternates).toEqual({
      canonical,
      languages: { bg: canonical, "x-default": canonical },
    });
    expect(pages.find((page) => page.url === canonical)?.alternates?.languages).toEqual({
      bg: canonical,
      "x-default": canonical,
    });
  }
});

it.each(["sell", "let", "synthetic-service"])(
  "P16/AT27 requires a current offering for the generic /services/%s body and metadata",
  async (slug) => {
    mocks.rows.mockResolvedValue([{ kind: "service", slug }]);
    mocks.content.mockImplementation(bgOnly);
    const path = `/services/${slug}`;
    const absent = await publicContentMetadata("bg", "service", slug, path);
    expect(absent.robots).toEqual({ index: false, follow: true });
    expect(absent.alternates).toEqual({ canonical: url("bg", path), languages: {} });
    expect((await sitemap()).some((page) => page.url === url("bg", path))).toBe(false);

    mocks.offerings.mockResolvedValue([{}]);
    const present = await publicContentMetadata("bg", "service", slug, path);
    expect(present.title).toBe(approved.title);
    expect(present.robots).toEqual({ index: true, follow: true });
    expect(
      (await publicContentPages()).some((page) => page.path === path && page.locale === "bg"),
    ).toBe(true);
    expect((await sitemap()).some((page) => page.url === url("bg", path))).toBe(true);
  },
);

it("R09 excludes failed CMS reads and preserves only the unrelated approved edition", async () => {
  mocks.content.mockImplementation(async (db, kind, slug, locale) => {
    if (slug !== "contact") throw new Error("synthetic private CMS error");
    return bgOnly(db, kind, slug, locale);
  });
  mocks.offerings.mockResolvedValue([{}]);
  expect((await publicContentPages()).map((page) => page.path).sort()).toEqual([
    "/contact",
    "/help/contact",
  ]);
  for (const slug of ["sell", "let"]) {
    const metadata = await publicContentMetadata("bg", "service", slug, `/${slug}`);
    expect(metadata.robots).toEqual({ index: false, follow: true });
    expect(metadata.alternates?.languages).toEqual({});
    expect(JSON.stringify(metadata)).not.toContain("synthetic private CMS error");
    expect((await sitemap()).some((page) => page.url === url("bg", `/${slug}`))).toBe(false);
  }
});

it("P16 preserves native consultations but excludes generic services after offering read errors", async () => {
  mocks.content.mockImplementation(bgOnly);
  mocks.offerings.mockRejectedValue(new Error("synthetic private offering error"));
  expect((await publicContentPages()).map((page) => page.path).sort()).toEqual([
    "/contact",
    "/help/contact",
    "/let",
    "/sell",
  ]);
  for (const slug of ["sell", "let"]) {
    expect((await publicContentMetadata("bg", "service", slug, `/${slug}`)).robots).toEqual({
      index: true,
      follow: true,
    });
    expect(
      (await publicContentMetadata("bg", "service", slug, `/services/${slug}`)).robots,
    ).toEqual({ index: false, follow: true });
  }
});

it("R09 CMS approval never grants a translated locale catalogue-wide indexability", async () => {
  mocks.content.mockResolvedValue(approved);
  mocks.offerings.mockResolvedValue([{}]);
  const collected = await publicContentPages();
  const pages = await sitemap();
  for (const edition of editions)
    for (const locale of publicLocales)
      for (const path of [edition.native, edition.generic]) {
        expect(collected.some((page) => page.locale === locale && page.path === path)).toBe(true);
        expect(pages.some((page) => page.url === url(locale, path))).toBe(locale === "bg");
        const metadata = await publicContentMetadata(locale, edition.kind, edition.slug, path);
        expect(metadata.robots).toEqual({ index: locale === "bg", follow: true });
        expect(metadata.alternates?.canonical).toBe(url(locale, path));
        if (locale !== "bg") expect(metadata.alternates?.languages).toEqual({});
      }
});
