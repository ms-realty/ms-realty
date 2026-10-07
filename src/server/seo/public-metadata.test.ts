import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  headers: new Headers(),
  listing: vi.fn(),
  catalogue: vi.fn(),
  content: vi.fn(),
}));
vi.mock("next/headers", () => ({ headers: async () => mocks.headers }));
vi.mock("@/db/client", () => ({ getDb: () => ({}) }));
vi.mock("@/server/listings/detail", () => ({ getPublicListing: mocks.listing }));
vi.mock("@/server/content/public", () => ({ readApprovedContent: mocks.content }));
vi.mock("./public-pages", () => ({ publicCataloguePages: mocks.catalogue }));

import {
  publicContentMetadata,
  publicPageMetadata,
  publicPageUrl,
  publicSeoOrigin,
} from "./public-metadata";

beforeEach(() => {
  mocks.headers = new Headers({ host: "staging.makler-realty.com" });
  vi.stubEnv("CANONICAL_ORIGIN", "https://staging.makler-realty.com");
  vi.stubEnv("STAGING", "true");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});
it("retained legacy200 metadata and JSONLD use the authenticated external path, including its actual locale canonical", async () => {
  mocks.headers.set("x-msr-rendered-path", `${encodeURI("/стара-страница/")}?lang=bg`);
  const result = await publicPageMetadata({
    locale: "bg",
    path: "/legacy/source",
    title: "Exact public source title",
    description: "Exact source description",
    availableIn: ["bg"],
  });
  const actual =
    "https://staging.makler-realty.com/%D1%81%D1%82%D0%B0%D1%80%D0%B0-%D1%81%D1%82%D1%80%D0%B0%D0%BD%D0%B8%D1%86%D0%B0/?lang=bg";
  expect(result.alternates).toEqual({
    canonical: actual,
    languages: { bg: actual, "x-default": actual },
  });
  expect(result.title).toBe("Exact public source title");
  expect(result.description).toBe("Exact source description");
  expect(result.robots).toEqual({ index: false, follow: false });
  expect(await publicPageUrl("bg", "/legacy/source")).toBe(actual);
});
it("an external-path header cannot change canonical origin or inject a fragment/response delimiter", async () => {
  for (const value of [
    "//attacker.test/path",
    "https://attacker.test",
    "/path#fragment",
    "/path\\backslash",
  ]) {
    mocks.headers.set("x-msr-rendered-path", value);
    expect(
      (await publicPageMetadata({ locale: "ru", path: "/help/privacy", availableIn: ["ru"] }))
        .alternates?.canonical,
    ).toBe("https://staging.makler-realty.com/ru/help/privacy");
  }
});
it("CMS metadata never invents locale siblings or uses another locale's approved text", async () => {
  mocks.content.mockResolvedValueOnce(null);
  const absent = await publicContentMetadata("en", "help", "privacy", "/help/privacy");
  expect(absent.alternates?.languages).toEqual({});
  mocks.content.mockResolvedValueOnce({
    title: "Одобрено заглавие",
    paragraphs: ["Точно одобрен текст."],
  });
  const present = await publicContentMetadata("bg", "help", "privacy", "/help/privacy");
  expect(present.title).toBe("Одобрено заглавие");
  expect(Object.keys(present.alternates?.languages ?? {})).toEqual(["bg", "x-default"]);
});
it("fails closed on missing production origin rather than adopting an incoming header", () => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("CANONICAL_ORIGIN", "");
  vi.stubEnv("PUBLIC_ORIGIN", "");
  expect(() => publicSeoOrigin()).toThrow("valid CANONICAL_ORIGIN");
});
