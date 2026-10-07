import { afterEach, beforeEach, expect, it, vi } from "vitest";
import DetailPage, {
  generateMetadata as detailMetadata,
} from "../../../app/public/[locale]/(site)/areas/[slug]/page";
import { generateMetadata as indexMetadata } from "../../../app/public/[locale]/(site)/areas/page";

const { approved, source } = vi.hoisted(() => ({ approved: vi.fn(), source: vi.fn() }));
vi.mock("@/db/client", () => ({ getDb: () => ({}) }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ host: "makler-realty.com" }),
}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("not found");
  },
}));
vi.mock("@/server/content/public", () => ({
  readApprovedContent: source,
  readApprovedAreas: approved,
}));
beforeEach(() => {
  vi.stubEnv("CANONICAL_ORIGIN", "https://makler-realty.com");
  vi.stubEnv("STAGING", "false");
  approved.mockReset();
  approved.mockResolvedValue([]);
  source.mockReset();
  source.mockResolvedValue(null);
});
afterEach(() => {
  vi.unstubAllEnvs();
});

it("P15 index cannot be indexed in any locale even on the canonical production host", async () => {
  for (const locale of ["bg", "en", "ru", "de", "nl", "el", "he"])
    expect((await indexMetadata({ params: Promise.resolve({ locale }) })).robots).toMatchObject({
      index: false,
    });
});

it("P15 unknown content is a real not-found route rather than a generic 200 guide", async () => {
  for (const locale of ["bg", "en"]) {
    const request = { params: Promise.resolve({ locale, slug: "unknown-area" }) };
    await expect(detailMetadata(request)).rejects.toThrow("not found");
    await expect(DetailPage(request)).rejects.toThrow("not found");
  }
});

it("P15 missing translations retain deliberate source recovery and noindex outside staging", async () => {
  source.mockResolvedValue({ title: "Approved BG guide" });
  for (const locale of ["en", "he"]) {
    const request = { params: Promise.resolve({ locale, slug: "synthetic-area" }) };
    expect((await detailMetadata(request)).robots).toMatchObject({ index: false });
    expect((await DetailPage(request)).props).toMatchObject({
      area: null,
      sourceAvailable: true,
      failed: false,
    });
  }
});

it("P15 failed reads retain recovery and noindex instead of claiming missing content", async () => {
  approved.mockRejectedValue(new Error("Synthetic database outage"));
  for (const locale of ["bg", "en"]) {
    const request = { params: Promise.resolve({ locale, slug: "synthetic-area" }) };
    expect((await detailMetadata(request)).robots).toMatchObject({ index: false });
    expect((await DetailPage(request)).props).toMatchObject({
      area: null,
      sourceAvailable: false,
      failed: true,
    });
  }
});

it("P15 noindex overrides preserve the shared staging nofollow policy", async () => {
  vi.stubEnv("STAGING", "true");
  expect((await indexMetadata({ params: Promise.resolve({ locale: "bg" }) })).robots).toEqual({
    index: false,
    follow: false,
  });
  source.mockResolvedValue({ title: "Approved BG guide" });
  expect(
    (await detailMetadata({ params: Promise.resolve({ locale: "en", slug: "synthetic-area" }) }))
      .robots,
  ).toEqual({ index: false, follow: false });
});

it("P15 BG content metadata retains the exact approved edition and existing source locale policy", async () => {
  approved.mockResolvedValue([
    {
      slug: "synthetic-area",
      title: "Approved BG guide",
      paragraphs: ["Exact approved BG prose"],
    },
  ]);
  const metadata = await detailMetadata({
    params: Promise.resolve({ locale: "bg", slug: "synthetic-area" }),
  });
  expect(metadata.title).toBe("Approved BG guide");
  expect(metadata.description).toBe("Exact approved BG prose");
  expect(metadata.robots).toMatchObject({ index: true });
  expect(metadata.alternates?.canonical).toBe("https://makler-realty.com/bg/areas/synthetic-area");
});
