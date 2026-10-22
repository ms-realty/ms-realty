import { cleanup, render, screen } from "@testing-library/react";
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
vi.mock("@/server/seo/public-pages", () => ({ publicCataloguePages: mocks.catalogue }));

import PropertyPage, {
  generateMetadata,
} from "../../../app/public/[locale]/(site)/properties/[reference]/[slug]/page";
import { discoveryCopy } from "./copy";

const input = { locale: "bg", reference: "MS-00101", slug: "ms-00101" };
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("CANONICAL_ORIGIN", "https://staging.makler-realty.com");
  vi.stubEnv("STAGING", "true");
  mocks.catalogue.mockResolvedValue([]);
  mocks.listing.mockResolvedValue({ status: "not_found" });
});
afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

it("redirects an arbitrary native slug before loading or rendering listing facts", async () => {
  await expect(
    PropertyPage({ params: Promise.resolve({ ...input, slug: "arbitrary-slug" }) }),
  ).rejects.toThrow("PERMANENT_REDIRECT:/bg/properties/MS-00101/ms-00101");
  expect(mocks.listing).not.toHaveBeenCalled();
});
it("does not redirect a malformed listing reference to another public identity", async () => {
  await expect(
    PropertyPage({ params: Promise.resolve({ ...input, reference: "RQ-2026-000001" }) }),
  ).rejects.toThrow("NOT_FOUND");
  expect(mocks.listing).not.toHaveBeenCalled();
});
it("a canonical unavailable page preserves its safe identity and renders no private draft copy", async () => {
  mocks.listing.mockResolvedValue({
    status: "unavailable",
    reference: input.reference,
    purpose: "sale",
    alternatives: [],
    privateTitle: "Private draft title",
  });
  render(await PropertyPage({ params: Promise.resolve(input) }));
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(input.reference);
  expect(screen.getByText(discoveryCopy("bg").unavailable)).toBeVisible();
  expect(screen.queryByText("Private draft title")).not.toBeInTheDocument();
});
it("a missing translation renders only the source reference/link rather than BG property facts", async () => {
  mocks.listing.mockResolvedValueOnce({ status: "not_found" }).mockResolvedValueOnce({
    status: "listing",
    listing: {
      reference: input.reference,
      slug: input.slug,
      title: "Source title must not appear here",
    },
  });
  render(await PropertyPage({ params: Promise.resolve({ ...input, locale: "de" }) }));
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(input.reference);
  expect(screen.getByRole("link", { name: discoveryCopy("de").source })).toHaveAttribute(
    "href",
    "/bg/properties/MS-00101/ms-00101",
  );
  expect(screen.queryByText("Source title must not appear here")).not.toBeInTheDocument();
});
it("metadata and the canonical page retain the recovery screen when the database is unavailable", async () => {
  mocks.listing.mockRejectedValue(new Error("Private database connection details"));
  await expect(generateMetadata({ params: Promise.resolve(input) })).resolves.toMatchObject({
    title: input.reference,
  });
  render(await PropertyPage({ params: Promise.resolve(input) }));
  expect(screen.getByText(discoveryCopy("bg").failed)).toBeVisible();
  expect(screen.queryByText("Private database connection details")).not.toBeInTheDocument();
});
it("a failed BG source lookup also renders the recovery screen", async () => {
  mocks.listing
    .mockResolvedValueOnce({ status: "not_found" })
    .mockRejectedValueOnce(new Error("Private source lookup details"));
  render(await PropertyPage({ params: Promise.resolve({ ...input, locale: "de" }) }));
  expect(screen.getByText(discoveryCopy("de").failed)).toBeVisible();
});
