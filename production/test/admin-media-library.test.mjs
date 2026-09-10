import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHttpApp, dispatchHttp } from "../lib/http.mjs";
import { renderAppAdminResponse } from "../lib/app-admin-adapter.mjs";
import { MEDIA_LIBRARY_ISSUES, renderAdminMediaLibraryPayload } from "../lib/media-library.mjs";
import { loadLocaleRegistry } from "../lib/locales.mjs";
import { loadCmsSeed } from "../lib/runtime.mjs";
import { createTourField } from "../lib/tours.mjs";
import { createPayloadDraftRuntime } from "./payload-draft-runtime.fixture.mjs";

// Every operation on a media asset already existed on the server. The only way
// to reach one was to know which listing it hung off and open that listing's
// editor. The library makes all listings' assets reachable together.

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const AUTH = { authorization: "Bearer local-admin-smoke" };

function app(overrides = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ms-realty-media-library-"));
  const copy = (name) => {
    const target = path.join(dir, name);
    fs.copyFileSync(path.join(ROOT, "production/data", name), target);
    return target;
  };
  return createHttpApp({
    reviewedAt: "2026-07-19T12:00:00.000Z",
    leadLedgerPath: copy("lead-ledger.jsonl"),
    eventLedgerPath: copy("events.jsonl"),
    leadContactVaultPath: path.join(dir, "lead-contacts.jsonl"),
    leadContactKey: "test-only-media-library-key-32-chars",
    ...overrides,
  });
}

const get = (query = "") => dispatchHttp(app(), { url: `/admin/media?locale=en${query}`, headers: AUTH });
const results = (body) => {
  const match = body.match(/<h2>Results · (\d+)<\/h2>/);
  assert.ok(match, "the panel prints its row count");
  return Number(match[1]);
};

function photo(name, overrides = {}) {
  return {
    asset_url: `https://makler-realty.com/wp-content/uploads/2026/09/${name}.jpg`,
    kind: "photo",
    alt: `Property ${name}`,
    is_public: true,
    review_status: "approved_imported_photo",
    ...overrides,
  };
}

const listing = (id, media, tour) => ({ collection: "listings", id, media, tour });
const library = (records, options = {}) => renderAdminMediaLibraryPayload(loadLocaleRegistry(), "en", { seed: { records }, ...options });

test("thin galleries select all media of listings with fewer than three usable public photos", () => {
  const thinMedia = [
    photo("first"),
    photo("second"),
    photo("second"),
    photo("logo"),
    photo("small-72x72"),
    photo("private", { is_public: false }),
    photo("plan", { kind: "floor_plan", review_status: "approved_by_human" }),
    { kind: "photo", is_public: true },
  ];
  const records = [
    listing("thin", thinMedia),
    listing("ready", [photo("ready-1"), photo("ready-2"), photo("ready-3")]),
    listing("empty", []),
    listing("missing"),
    { collection: "properties", id: "not-a-listing", media: [photo("unrelated")] },
  ];
  const payload = library(records, { issue: "thin_public_gallery" });
  assert.deepEqual(payload.assets.map((row) => row.listing_id), Array(thinMedia.length).fill("thin"));
  assert.equal(payload.summary.thin_public_gallery, 3, "empty and missing galleries still need work");
  assert.equal(payload.summary.total, 11);
  assert.equal(payload.summary.visible, 8);
  assert.equal(payload.summary.listings, 4);
  const floorPlans = library(records, { issue: "thin_public_gallery", kind: "floor_plan" });
  assert.deepEqual(floorPlans.assets.map((row) => row.url), [thinMedia[6].asset_url]);
  assert.equal(floorPlans.summary.thin_public_gallery, 3);
});

test("tour review selects uploaded private tours and respects valid approval overrides", () => {
  const media = [photo("tour-fallback")];
  const pending = createTourField({ listingId: "pending", panoramaUrl: "https://ms-realty.ms-realty-bg.workers.dev/tours/pending.jpg", media });
  const approved = { ...pending, is_public: true, accessibility_caption: "Reviewed panorama", review_status: "approved" };
  const records = [
    listing("pending", media, pending),
    listing("pending-3d", media, createTourField({ listingId: "pending-3d", provider: "supersplat-viewer", viewerUrl: "https://ms-realty.ms-realty-bg.workers.dev/tours/3d/", media })),
    listing("approved-record", media, approved),
    listing("approved-ledger", media, pending),
    listing("invalid-ledger", media, pending),
    listing("no-upload", media, { review_status: "review_required", is_public: false }),
    listing("no-tour", media),
    listing("no-media", undefined, pending),
  ];
  const tourApprovals = [
    { ...approved, listing_id: "approved-ledger" },
    { ...approved, listing_id: "invalid-ledger", panorama_url: "https://unapproved.test/tour.jpg" },
  ];
  const payload = library(records, { issue: "tour_review_pending", tourApprovals });
  assert.deepEqual(payload.assets.map((row) => row.listing_id), ["pending", "pending-3d", "invalid-ledger"]);
  assert.equal(payload.summary.tour_review_pending, 4, "a tour on a listing with no media still needs review");
  assert.equal(payload.summary.visible, 3);
  assert.equal(library(records, { tourApprovals }).summary.tour_review_pending, 4);
  assert.equal(library(records, { issue: "tour_review_pending", listing: "approved-record" }).assets.length, 0);
});

for (const issue of ["thin_public_gallery", "tour_review_pending"]) {
  test(`${issue} composes with search, kind, listing and pagination`, () => {
    const pending = { panorama_url: "https://ms-realty.ms-realty-bg.workers.dev/tours/pending.jpg", is_public: false };
    const videos = Array.from({ length: 50 }, (_, index) => photo(`walkthrough-${index}`, { kind: "video", alt: `Courtyard ${index}`, is_public: false }));
    const records = [
      listing("selected", [...videos, photo("courtyard", { alt: "Courtyard photo" }), photo("interior", { kind: "video" })], pending),
      listing("other-pending", [videos[0]], pending),
      listing("ready", [photo("ready-1"), photo("ready-2"), photo("ready-3"), videos[0]]),
    ];
    const options = { issue, query: "  CoUrTyArD  ", kind: "video", listing: "selected", page: 2 };
    const payload = library(records, options);
    assert.deepEqual(payload.assets.map((row) => row.url), videos.slice(48).map((asset) => asset.asset_url));
    assert.deepEqual(payload.pagination, { page: 2, pageSize: 48, totalRows: 50, totalPages: 2 });
    assert.equal(payload.summary.visible, 50);
    assert.equal(payload.summary[issue], 2, "listing issue counts remain catalogue-wide");
    assert.equal(payload.summary.total, 57);
    assert.equal(library(records, { ...options, page: 99 }).pagination.page, 2);
    assert.equal(library(records, { ...options, listing: "ready" }).pagination.totalRows, 0);
    assert.equal(library(records, { ...options, query: "not found" }).pagination.totalRows, 0);
  });
}

test("issue filters handle an empty catalogue and listings with missing media or tours", () => {
  for (const seed of [{}, { records: [] }, { records: [listing("missing"), listing("empty", [])] }]) {
    for (const issue of ["thin_public_gallery", "tour_review_pending"]) {
      const payload = renderAdminMediaLibraryPayload(loadLocaleRegistry(), "en", { seed, issue, page: 9 });
      assert.deepEqual(payload.assets, []);
      assert.deepEqual(payload.pagination, { page: 1, pageSize: 48, totalRows: 0, totalPages: 1 });
      assert.equal(payload.summary.thin_public_gallery, seed.records?.length || 0);
      assert.equal(payload.summary.tour_review_pending, 0);
    }
  }
});

test("both media routes use file approvals or the durable Payload tour according to their authority", async (t) => {
  const seed = loadCmsSeed();
  const record = seed.records.find((row) => row.collection === "listings" && row.media?.length);
  const approved = createTourField({
    listingId: record.id,
    panoramaUrl: "https://ms-realty.ms-realty-bg.workers.dev/tours/reviewed.jpg",
    accessibilityCaption: "Reviewed property panorama",
    isPublic: true,
    media: record.media,
  });
  const pending = { ...approved, is_public: false, review_status: "review_required" };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ms-realty-media-tour-authority-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const tourApprovalLedgerPath = path.join(dir, "tour-approvals.jsonl");
  fs.writeFileSync(tourApprovalLedgerPath, `${JSON.stringify(approved)}\n`);
  const url = `/admin/media?locale=en&issue=tour_review_pending&listing=${record.id}`;

  for (const { durable, tour, expected } of [
    { durable: false, tour: pending, expected: 0 },
    { durable: true, tour: pending, expected: record.media.length },
    { durable: true, tour: approved, expected: 0 },
  ]) {
    const projectedSeed = { ...seed, records: seed.records.map((row) => row.id === record.id ? { ...row, tour } : row) };
    const runtime = createPayloadDraftRuntime(projectedSeed);
    const config = {
      runtimeDataDurableOnly: durable,
      payloadListingRuntime: runtime.payload,
      payloadListingEnv: {},
      authEnv: {},
      tourApprovalLedgerPath,
    };
    const standalone = await dispatchHttp(app({ ...config, seed: durable ? seed : projectedSeed }), { url, headers: AUTH });
    assert.equal(standalone.status, 200);
    assert.equal(results(standalone.body), expected, `standalone durable=${durable} public=${tour.is_public}`);
    const next = await renderAppAdminResponse(new Request(`https://local.test${url}`), {
      config: { ...config, adminPrincipal: { id: "media_test_admin", roles: ["admin"], can_mutate: true } },
    });
    assert.equal(next.status, 200);
    assert.equal(results(await next.text()), expected, `adapter durable=${durable} public=${tour.is_public}`);
  }
});

test("the whole catalogue's media is on one screen", async () => {
  const res = await get();
  assert.equal(res.status, 200);
  assert.match(res.body, /data-kind="admin-media-library"/);

  const seed = loadCmsSeed();
  const assets = seed.records.filter((r) => r.collection === "listings").reduce((n, r) => n + (r.media || []).length, 0);
  assert.ok(assets > 1000, `the catalogue carries a lot of media, found ${assets}`);
  // Every asset is reachable, not just the ones on a listing someone opened.
  assert.equal(results(res.body), assets);
});

test("a count is a link into the work behind it", async () => {
  const res = await get();
  // The redesign exists partly because KPI numbers could not be clicked.
  for (const issue of ["media_review_pending", "missing_alt_text", "thin_public_gallery", "tour_review_pending"]) {
    assert.match(res.body, new RegExp(`href="/admin/media\\?issue=${issue}"`), issue);
  }
  const narrowed = await get("&issue=missing_alt_text");
  assert.ok(results(narrowed.body) < results(res.body), "the filter narrows the rows");
  // ...and the queue counts stay counted over the catalogue, so narrowing a
  // filter never makes the backlog look shorter than it is.
  for (const issue of ["media_review_pending", "missing_alt_text"]) {
    assert.match(narrowed.body, new RegExp(`href="/admin/media\\?issue=${issue}"`));
  }
});

test("the queue counts the four issues the code computes, and says so", async () => {
  assert.deepEqual(MEDIA_LIBRARY_ISSUES, [
    "media_review_pending",
    "missing_alt_text",
    "thin_public_gallery",
    "tour_review_pending",
  ]);
  const res = await get();
  // The canvas invented five categories nothing computes — a face is visible,
  // a plate is in frame, watermarked, below minimum size, not attached.
  assert.doesNotMatch(res.body, /face is visible|plate is in frame|Watermarked/i);
  assert.match(res.body, /data-media-taxonomy="true"/);
  assert.match(res.body, /a person finds those and records them as a note/);
});

test("the figures are the catalogue's, not invented", () => {
  const registry = loadLocaleRegistry();
  const seed = loadCmsSeed();
  const payload = renderAdminMediaLibraryPayload(registry, "en", { seed });
  const rows = seed.records.filter((r) => r.collection === "listings").flatMap((r) => r.media || []);

  assert.equal(payload.summary.total, rows.length);
  assert.equal(payload.summary.missing_alt_text, rows.filter((a) => !String(a.alt || "").trim()).length);
  assert.equal(payload.summary.public, rows.filter((a) => a.is_public === true).length);
  // A filtered view reports the same catalogue-wide counts. Narrowing to one
  // listing is the case that catches counting over the page: that listing holds
  // a handful of assets, so a page-derived backlog would collapse to single
  // digits while the catalogue's is over a thousand.
  const oneListing = seed.records.find((r) => r.collection === "listings" && (r.media || []).length).id;
  const narrowed = renderAdminMediaLibraryPayload(registry, "en", { seed, listing: oneListing });
  assert.ok(narrowed.pagination.totalRows > 0 && narrowed.pagination.totalRows < payload.pagination.totalRows);
  assert.equal(narrowed.summary.total, payload.summary.total);
  assert.equal(narrowed.summary.missing_alt_text, payload.summary.missing_alt_text);
  assert.equal(narrowed.summary.media_review_pending, payload.summary.media_review_pending);
  assert.equal(narrowed.summary.public, payload.summary.public);
});

test("an asset that cannot be reviewed is shown as such, not dropped", () => {
  const registry = loadLocaleRegistry();
  const seed = loadCmsSeed();
  const broken = {
    ...seed,
    records: seed.records.map((record, index) =>
      record.collection === "listings" && index === 0
        ? { ...record, media: [...(record.media || []), { kind: "photo", alt: "", is_public: false, review_status: "needs_media_review" }] }
        : record,
    ),
  };
  const payload = renderAdminMediaLibraryPayload(registry, "en", { seed: broken });
  const base = renderAdminMediaLibraryPayload(registry, "en", { seed });

  // An asset with no source URL has no id, so it cannot be reviewed — it is
  // counted and shown rather than disappearing from the total.
  assert.equal(payload.summary.total, base.summary.total + 1);
  assert.equal(payload.summary.unreviewable, 1);
});

test("the library is reachable from the rail, under listings", async () => {
  const res = await dispatchHttp(app(), { url: "/admin/today?locale=en", headers: AUTH });
  assert.match(res.body, /data-admin-nav-route="media_library"/);
  assert.match(res.body, /href="\/admin\/media"/);
});


test("a completed human media review leaves the pending queue", () => {
  const seed = loadCmsSeed();
  const record = seed.records.find(row => row.collection === "listings" && row.media?.length);
  const reviewed = { ...seed, records: [{ ...record, media: [{ ...record.media[0], review_status: "approved_by_human" }] }] };
  const payload = renderAdminMediaLibraryPayload(loadLocaleRegistry(), "en", { seed: reviewed, issue: "media_review_pending" });
  assert.equal(payload.summary.media_review_pending, 0);
  assert.equal(payload.assets.length, 0);
});

test("the media review form asks for a reason in each admin language", async () => {
  for (const locale of ["bg", "ru", "en"]) {
    const response = await dispatchHttp(app(), { url: `/admin/listings/edit?listingId=MS-00815&locale=${locale}&tab=media`, headers: AUTH });
    assert.equal(response.status, 200);
    const field = response.body.match(/<textarea[^>]*name="reviewNote"[^>]*>/)?.[0];
    assert.ok(field, `missing review note for ${locale}`);
    assert.match(field, /required(?:="")?\s/);
    assert.match(field, /maxLength="2000"/);
    assert.match(field, /dir="auto"/);
  }
});
