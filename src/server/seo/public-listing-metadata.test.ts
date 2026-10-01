import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ listing: vi.fn(), catalogue: vi.fn() }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ host: "staging.makler-realty.com" }),
}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
  permanentRedirect: (href: string) => {
    throw new Error(`PERMANENT_REDIRECT:${href}`);
  },
}));
vi.mock("@/db/client", () => ({ getDb: () => ({}) }));
vi.mock("@/server/listings/detail", () => ({ getPublicListing: mocks.listing }));
vi.mock("./public-pages", () => ({ publicCataloguePages: mocks.catalogue }));

import { normalizePublicListingRoute, publicListingMetadata } from "./public-metadata";

const input = { locale: "bg", reference: "MS-00101", slug: "ms-00101" };
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("CANONICAL_ORIGIN", "https://staging.makler-realty.com");
  vi.stubEnv("STAGING", "true");
  mocks.listing.mockResolvedValue({ status: "not_found" });
  mocks.catalogue.mockResolvedValue([]);
});
afterEach(() => vi.unstubAllEnvs());

it.each([
  { reference: "ms-00101", slug: "ms-00101" },
  { reference: "MS-00101", slug: "arbitrary-slug" },
  { reference: "MS-00101", slug: "MS-00101" },
])("normalizes native listing identity before metadata reads: $reference/$slug", async (alias) => {
  await expect(publicListingMetadata({ ...input, ...alias })).rejects.toThrow(
    "PERMANENT_REDIRECT:/bg/properties/MS-00101/ms-00101",
  );
  expect(mocks.listing).not.toHaveBeenCalled();
});
it("rejects malformed and non-listing identities without a lookup or a redirect", () => {
  for (const reference of ["unrecorded-id", "RQ-2026-000001", "MS-00101/unsafe"])
    expect(() => normalizePublicListingRoute({ ...input, reference })).toThrow("NOT_FOUND");
  expect(mocks.listing).not.toHaveBeenCalled();
});
it("uses only eligible fact locales for a public listing's hreflang", async () => {
  mocks.listing.mockResolvedValue({
    status: "listing",
    listing: { reference: input.reference, title: "Approved title", description: "Approved copy." },
  });
  mocks.catalogue.mockResolvedValue(
    ["bg", "en"].map((locale) => ({ reference: input.reference, locale })),
  );
  const result = await publicListingMetadata(input);
  expect(result.alternates).toEqual({
    canonical: "https://staging.makler-realty.com/bg/properties/MS-00101/ms-00101",
    languages: {
      bg: "https://staging.makler-realty.com/bg/properties/MS-00101/ms-00101",
      en: "https://staging.makler-realty.com/en/properties/MS-00101/ms-00101",
      "x-default": "https://staging.makler-realty.com/bg/properties/MS-00101/ms-00101",
    },
  });
});
it.each(["unavailable", "not_found"])(
  "a %s placeholder has no approved fact alternates",
  async (status) => {
    mocks.listing.mockResolvedValue({
      status,
      reference: input.reference,
      title: "Private draft title",
    });
    mocks.catalogue.mockResolvedValue([{ reference: input.reference, locale: "en" }]);
    const result = await publicListingMetadata(input);
    expect(result.title).toBe(input.reference);
    expect(result.alternates?.languages).toEqual({});
    expect(JSON.stringify(result)).not.toContain("Private draft title");
  },
);
it("metadata failure preserves the page's recovery path without emitting database error text or facts", async () => {
  mocks.listing.mockRejectedValue(new Error("private database connection details"));
  const result = await publicListingMetadata(input);
  expect(result.title).toBe(input.reference);
  expect(result.alternates?.languages).toEqual({});
  expect(JSON.stringify(result)).not.toContain("private database");
  expect(mocks.catalogue).not.toHaveBeenCalled();
});
it("hreflang read failure does not discard independently read approved public copy", async () => {
  mocks.listing.mockResolvedValue({
    status: "listing",
    listing: { reference: input.reference, title: "Approved title", description: "Approved copy." },
  });
  mocks.catalogue.mockRejectedValue(new Error("catalogue unavailable"));
  const result = await publicListingMetadata(input);
  expect(result.title).toBe("Approved title");
  expect(result.alternates?.languages).toEqual({});
});
