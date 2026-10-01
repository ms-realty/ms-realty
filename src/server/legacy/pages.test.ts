import { expect, it } from "vitest";
import { legacySnapshotPages, selectLegacyPage } from "./pages";

it("all staged snapshots have verified body hashes and keep source locale without invented translations", () => {
  const pages = legacySnapshotPages();
  expect(pages.filter((page) => page.provenance.kind === "archived").length).toBe(267);
  const page = pages[0];
  expect(page).toBeDefined();
  if (!page) return;
  expect(selectLegacyPage(pages, page.locale, page.id)).toBe(page);
  expect(selectLegacyPage(pages, page.locale === "en" ? "ru" : "en", page.id)).toBeNull();
  expect(
    selectLegacyPage([{ ...page, bodyText: "Rewritten body" }], page.locale, page.id),
  ).toBeNull();
  expect(pages.every((item) => item.equivalenceReview.status === "pending")).toBe(true);
});
it("archived listings remain actual source pages without a fabricated sold status or empty photo gallery", () => {
  const listings = legacySnapshotPages().filter(
    (page) => page.listing && page.provenance.kind === "archived",
  );
  expect(listings.length).toBe(160);
  expect(listings.some((page) => page.listing?.lifecycleAtFreeze.state === "archived")).toBe(true);
  expect(listings.every((page) => page.listing?.sold === null && page.media.length > 0)).toBe(true);
});
it("the current public delta preserves actual BG/EN source pages and galleries without granting translations or guessing availability", () => {
  const pages = legacySnapshotPages().filter(
    (page) =>
      page.provenance.kind === "live" &&
      ["958", "961", "962"].includes(page.listing?.reference ?? "") &&
      /^\/(?:en\/)?listing\//u.test(page.sourcePath),
  );
  expect(pages.length).toBe(6);
  for (const reference of ["958", "961", "962"] as const) {
    const sources = pages.filter((page) => page.listing?.reference === reference);
    expect(sources.map((page) => page.locale).sort()).toEqual(["bg", "en"]);
    expect(
      sources.every((page) => page.media.length === { "958": 11, "961": 9, "962": 10 }[reference]),
    ).toBe(true);
    expect(
      sources.every((page) =>
        page.media.every((photo) => photo.r2Key === null && !photo.storedImageLoadVerified),
      ),
    ).toBe(true);
    expect(
      sources.every((page) => page.listing?.sold === null && !page.listing.statusParityVerified),
    ).toBe(true);
    expect(
      sources.every((page) =>
        page.listing?.liveSourceFields?.some((field) => field.value === reference),
      ),
    ).toBe(true);
  }
});
