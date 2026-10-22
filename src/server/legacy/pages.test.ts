import { expect, it } from "vitest";
import { sha256, sourceIdentity } from "./manifest";
import { legacySnapshotPages, selectLegacyPage } from "./pages";

it("accepts only a live hash-bound measured empty archive, never an unknown empty page", () => {
  const original = legacySnapshotPages()[0];
  if (!original) throw new Error("source fixture missing");
  const url = "https://makler-realty.ru/category-type/studio/",
    id = sourceIdentity(url).id,
    responseHash = "a".repeat(64);
  const page = {
    ...original,
    id,
    canonicalPath: `/ru/legacy/${id}`,
    locale: "ru" as const,
    sourceUrl: url,
    sourceHost: "makler-realty.ru",
    sourcePath: "/category-type/studio/",
    bodyText: "",
    sourceHash: sha256(""),
    sourceResponseHash: responseHash,
    contentScope: "column:empty_archive",
    contentState: "verified_empty_archive" as const,
    provenance: {
      kind: "live" as const,
      artifact: `data/legacy/migration/live-source-html/${responseHash}.html.gz`,
    },
  };
  expect(selectLegacyPage([page], "ru", id)).toBe(page);
  expect(selectLegacyPage([{ ...page, contentState: undefined }], "ru", id)).toBeNull();
  expect(selectLegacyPage([{ ...page, sourceResponseHash: undefined }], "ru", id)).toBeNull();
  expect(selectLegacyPage([{ ...page, contentScope: "class:post_content" }], "ru", id)).toBeNull();
});

it("all staged snapshots have verified body hashes and keep source locale without invented translations", () => {
  const pages = legacySnapshotPages();
  // The direct-origin recovery preserves all previous 1108 identities and adds 65.
  expect(pages).toHaveLength(1173);
  expect(pages.filter((page) => page.provenance.kind === "archived").length).toBe(49);
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
  // Current origin captures replace historical observations without deleting source identities.
  expect(listings.length).toBe(22);
  expect(listings.some((page) => page.listing?.lifecycleAtFreeze.state === "archived")).toBe(true);
  expect(listings.every((page) => page.listing?.sold === null && page.media.length > 0)).toBe(true);
});

it("keeps the measured empty archives and direct-origin source provenance distinct from public DNS or approval", () => {
  const pages = legacySnapshotPages();
  const empty = pages.filter((page) => page.contentState === "verified_empty_archive");
  expect(empty).toHaveLength(6);
  for (const page of empty) {
    expect(page.bodyText).toBe("");
    expect(page.sourceHash).toBe(sha256(""));
    expect(page.provenance.publicDnsPathObserved).toBe(false);
    expect(page.provenance.transport).toBe("curl_strict_https_explicit_resolve");
    expect(page.provenance.originObservation?.originIp).toBe("185.80.2.102");
    expect(page.equivalenceReview.status).toBe("pending");
  }
  for (const reference of ["925", "926", "715", "964"]) {
    expect(
      pages.some(
        (page) =>
          page.sourceHost === "makler-realty.com" &&
          page.listing?.reference === reference &&
          page.provenance.publicDnsPathObserved === false,
      ),
    ).toBe(true);
  }
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
