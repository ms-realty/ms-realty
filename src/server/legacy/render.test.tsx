import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";
import Page, { generateMetadata } from "../../../app/public/[locale]/(site)/legacy/[id]/page";
import snapshots from "../../../data/legacy/migration/source-pages.json";
import type { LegacyPage } from "./pages";

const mocks = vi.hoisted(() => ({
  page: vi.fn(),
  metadata: vi.fn(),
  url: vi.fn(),
  schema: vi.fn(),
}));
vi.mock("./pages", () => ({ getLegacyPage: mocks.page }));
vi.mock("next-intl/server", () => ({
  getTranslations: async () => () => "Нет результатов по этим условиям",
}));
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
it("P21 renders measured empty archives without treating the absence of historical entries as a current search result", async () => {
  mocks.page.mockReturnValue({ ...source, bodyText: "", contentState: "verified_empty_archive" });
  render(await Page({ params }));
  expect(document.querySelector("[data-legacy-source-body]")?.textContent).toBe("");
  expect(screen.getByRole("status")).toHaveTextContent("В сохранённой коллекции не было записей.");
  expect(document.querySelector("article script, article form")).toBeNull();
  expect(mocks.schema).not.toHaveBeenCalled();
});
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

// P21 / F09 / M-072: bind the presentation regression to the preserved real source
// records. Source content stays in the existing inventory rather than copied fixtures.
for (const [id, identity] of [
  ["0060c155d560ff91e51b4193", "Archive listing"],
  ["1b78f029a9e6cf185268e61a", "Archive page"],
  ["49bedd92a43a06d767046abe", "Архивна статия"],
  ["042922f874af5e9cf3f6092d", "Архивна колекция"],
] as const) {
  it(`P21 / M-072: ${id} has honest archive identity, clean reading and a native recovery path`, async () => {
    const original = snapshots.pages.find((page) => page.id === id);
    if (!original) throw new Error(`Missing recorded source ${id}`);
    const unchanged = JSON.stringify(original);
    mocks.page.mockReturnValue(original);
    render(await Page({ params: Promise.resolve({ locale: original.locale, id }) }));
    const article = document.querySelector("article");
    expect(article).toHaveAttribute("lang", original.locale);
    expect(screen.getByRole("heading", { name: original.title })).toBeVisible();
    expect(screen.getByText(identity, { exact: true })).toBeVisible();
    expect(article).toHaveAttribute("data-legacy-source-hash", original.sourceHash);
    expect(article?.querySelector('a[href="tel:+359879696870"]')).not.toBeNull();
    expect(article?.querySelector(`a[href="/${original.locale}/properties"]`)).not.toBeNull();
    expect(article?.querySelector("script, form, input, button")).toBeNull();
    expect(article?.textContent).not.toMatch(
      /\[si-contact-form|\[email protected\]|Tweet|Name Email Phone Message Send/u,
    );
    expect(JSON.stringify(original)).toBe(unchanged);
  });
}

it("P21 keeps a recorded reference, literal source fields and image failure recovery visible", async () => {
  const original = snapshots.pages.find((page) => page.id === "0060c155d560ff91e51b4193");
  if (!original?.listing) throw new Error("Missing recorded listing");
  mocks.page.mockReturnValue(original);
  render(await Page({ params: Promise.resolve({ locale: original.locale, id: original.id }) }));
  const facts = document.querySelector("[data-legacy-source-facts]");
  expect(facts).not.toBeNull();
  for (const field of original.listing.liveSourceFields ?? []) {
    expect(facts).toHaveTextContent(field.label);
    expect(facts).toHaveTextContent(field.value);
  }
  expect(document.querySelector("aside bdi")?.textContent).toBe(original.listing.reference);
  const photo = document.querySelector("article img");
  expect(photo?.closest("a")).toHaveAttribute("href", photo?.getAttribute("src"));
  expect(photo?.closest("a")).toHaveTextContent("Open image 1");
  expect(screen.getByText("Current availability and conditions are unconfirmed.")).toBeVisible();
  expect(screen.queryByText(/approved|reviewed facts|available now/iu)).toBeNull();
});

it("P21 retains Hebrew direction and bidirectional reference/phone isolation without translating source prose", async () => {
  const synthetic = {
    ...source,
    locale: "he",
    title: "כותרת מקור סינתטית",
    bodyText: "תוכן מקור סינתטי.",
    sourceHost: "makler-realty.com",
    sourceUrl: "https://makler-realty.com/synthetic-archive/",
    sourceType: "listing",
    listing: { reference: "SYNTHETIC-001" },
  } as unknown as LegacyPage;
  mocks.page.mockReturnValue(synthetic);
  render(await Page({ params: Promise.resolve({ locale: "he", id: source.id }) }));
  expect(document.querySelector("article")).toHaveAttribute("dir", "rtl");
  expect(document.querySelector("article")).toHaveAttribute("lang", "he");
  expect(document.querySelector("[data-legacy-source-body]")?.textContent).toBe(synthetic.bodyText);
  expect(document.querySelector('a[href="tel:+359879696870"] bdi')?.textContent).toBe(
    "+359879696870",
  );
  expect(document.querySelector("aside bdi")?.textContent).toBe("SYNTHETIC-001");
});
