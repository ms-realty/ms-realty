import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHttpApp, dispatchHttp } from "../lib/http.mjs";
import { MEDIA_LIBRARY_ISSUES, renderAdminMediaLibraryPayload } from "../lib/media-library.mjs";
import { loadLocaleRegistry } from "../lib/locales.mjs";
import { loadCmsSeed } from "../lib/runtime.mjs";

// Every operation on a media asset already existed on the server. The only way
// to reach one was to know which listing it hung off and open that listing's
// editor. 4,978 assets across 165 listings, and no list of them.

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const AUTH = { authorization: "Bearer local-admin-smoke" };

function app() {
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
  });
}

const get = (query = "") => dispatchHttp(app(), { url: `/admin/media?locale=en${query}`, headers: AUTH });
const results = (body) => {
  const match = body.match(/<h2>Results · (\d+)<\/h2>/);
  assert.ok(match, "the panel prints its row count");
  return Number(match[1]);
};

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
  for (const issue of ["media_review_pending", "missing_alt_text", "thin_public_gallery"]) {
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
    const response = await dispatchHttp(app(), { url: `/admin/listings/edit?listingId=MS-CRAWL-0001&locale=${locale}`, headers: AUTH });
    assert.equal(response.status, 200);
    const field = response.body.match(/<textarea[^>]*name="reviewNote"[^>]*>/)?.[0];
    assert.ok(field, `missing review note for ${locale}`);
    assert.match(field, /required(?:="")?\s/);
    assert.match(field, /maxLength="2000"/);
    assert.match(field, /dir="auto"/);
  }
});
