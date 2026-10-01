import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";
import Page, { generateMetadata } from "../../../app/public/[locale]/(site)/legacy/[id]/page";

const mocks = vi.hoisted(() => ({
  page: vi.fn(),
  metadata: vi.fn(),
  url: vi.fn(),
  schema: vi.fn(),
}));
vi.mock("./pages", () => ({ getLegacyPage: mocks.page }));
vi.mock("@/server/seo/public-metadata", () => ({
  publicPageMetadata: mocks.metadata,
  publicPageUrl: mocks.url,
}));
vi.mock("@/i18n/structured-data", () => ({ legacyListingStructuredData: mocks.schema }));
vi.mock("@/ui/structured-data", () => ({
  StructuredData: ({ value }: { value: unknown }) => (
    <script type="application/ld+json">{JSON.stringify(value)}</script>
  ),
}));
vi.mock("@/features/discovery/page", () => ({
  DiscoveryPage: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("not-found");
  },
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
const params = Promise.resolve({ locale: "ru", id: "a".repeat(24) });
const source = {
  id: "a".repeat(24),
  locale: "ru",
  title: "Original title",
  seoTitle: "Exact source title | Original brand",
  description: "Original description",
  bodyText: 'Exact source contact +359879696870 <script>alert("source")</script>',
  listing: null,
  media: [],
  contentLinks: [
    { url: "https://makler-realty.ru/listing/original/", text: "Original listing summary" },
  ],
};
it("renders actual source text without executing source HTML, recreating WordPress forms or inventing translations", async () => {
  mocks.page.mockReturnValue(source);
  render(await Page({ params }));
  expect(screen.getByRole("heading", { name: source.title })).toBeVisible();
  expect(document.querySelector("article")).toHaveAttribute("lang", "ru");
  expect(document.querySelector("article")).toHaveTextContent(source.bodyText);
  expect(document.querySelector("article script, article form")).toBeNull();
  expect(screen.getByRole("link", { name: "Original listing summary" })).toHaveAttribute(
    "href",
    source.contentLinks[0]?.url,
  );
  await generateMetadata({ params });
  expect(mocks.metadata).toHaveBeenCalledWith({
    locale: "ru",
    path: `/legacy/${source.id}`,
    title: source.title,
    description: source.description,
    availableIn: ["ru"],
  });
});
it("uses the exact absolute source head title and untrimmed long description while retaining the visible heading", async () => {
  const description = `  ${"Exact original description. ".repeat(20)}  `;
  const page = { ...source, description };
  mocks.page.mockReturnValue(page);
  mocks.metadata.mockResolvedValue({
    title: "Generated title",
    description: "Generic intro",
    alternates: { canonical: "https://makler-realty.com/ru/legacy/original" },
    robots: { index: false, follow: false },
  });
  const metadata = await generateMetadata({ params });
  expect(metadata.title).toEqual({ absolute: page.seoTitle });
  expect(metadata.description).toBe(description);
  expect(metadata.alternates?.canonical).toBe("https://makler-realty.com/ru/legacy/original");
  expect(metadata.robots).toEqual({ index: false, follow: false });
  render(await Page({ params }));
  expect(screen.getByRole("heading", { name: source.title })).toBeVisible();
});
it("an unknown source title or absent description never becomes a generated source head claim", async () => {
  mocks.page.mockReturnValue({ ...source, seoTitle: null, description: null });
  mocks.metadata.mockResolvedValue({ title: "Generated title", description: "Generic intro" });
  const metadata = await generateMetadata({ params });
  expect(metadata.title).toBeUndefined();
  expect(metadata.description).toBeUndefined();
});
it("listing JSON-LD uses the retained source URL helper and exact source page projection", async () => {
  const page = { ...source, listing: { reference: "962" } };
  const url = "https://makler-realty.com/en/listing/original/";
  const value = { "@type": "RealEstateListing", url };
  mocks.page.mockReturnValue(page);
  mocks.url.mockResolvedValue(url);
  mocks.schema.mockReturnValue(value);
  render(await Page({ params }));
  expect(mocks.url).toHaveBeenCalledWith(source.locale, `/legacy/${source.id}`);
  expect(mocks.schema).toHaveBeenCalledWith(page, url);
  expect(document.querySelector('script[type="application/ld+json"]')?.textContent).toBe(
    JSON.stringify(value),
  );
});
it("cannot replace a missing main-content source with a 200 placeholder", async () => {
  mocks.page.mockReturnValue(null);
  await expect(Page({ params })).rejects.toThrow("not-found");
});
