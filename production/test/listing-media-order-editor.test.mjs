// The gallery the editor renders is a bounded, filtered view of the listing's
// media relation: supported kinds only, at most fifty tiles. Ordering still has
// to address the whole relation, or the broker's own click is refused as stale
// (MS-00815 carries thirty-five relations and renders nineteen) and, worse, a
// naive fix would silently drop or shuffle everything the grid does not show.
//
// These tests take the order from the markup the real renderer produced, run
// the real client code against it, send the request through the real route to
// the Payload draft store, and read the listing back.
import test from "node:test";
import assert from "node:assert/strict";
import { appAdminConfigFromEnv, renderAppAdminResponse } from "../lib/app-admin-adapter.mjs";
import { createHttpApp, dispatchHttp } from "../lib/http.mjs";
import { mediaAssetId } from "../lib/media-reviews.mjs";
import { payloadAdminPrincipal } from "../lib/payload-admin-auth.mjs";
import { loadCmsSeed } from "../lib/runtime.mjs";
import { ADMIN_APP_JS } from "../lib/ui/client.mjs";
import { createPayloadDraftRuntime } from "./payload-draft-runtime.fixture.mjs";

const SESSION = "payload.gallery.session";
const EDITOR = { id: 3, collection: "admins", email: "owner@example.com", role: "admin", workspace_ids: [] };
const ORIGIN = "https://ms-realty.example";

function payloadAdminAuth() {
  return {
    async resolve(token) {
      return token === SESSION ? { user: EDITOR, principal: payloadAdminPrincipal(EDITOR) } : null;
    },
  };
}

// Both runtimes, in the durable mode where ordering is offered at all.
function runtimes(seed) {
  return [
    [
      "standalone",
      () => {
        const store = createPayloadDraftRuntime(seed);
        const app = createHttpApp({
          reviewedAt: "2026-09-16T09:00:00.000Z",
          payloadListingRuntime: store.payload,
          runtimeDataDurableOnly: true,
          payloadAdminAuth: payloadAdminAuth(),
        });
        const send = async (method, url, body = undefined) => {
          const response = await dispatchHttp(app, {
            method,
            url,
            body,
            headers: {
              cookie: `ms_admin=${SESSION}`,
              host: "ms-realty.example",
              accept: body ? "application/json" : "text/html",
              ...(body ? { "content-type": "application/json", "sec-fetch-site": "same-origin" } : {}),
            },
          });
          return {
            status: response.status,
            text: typeof response.body === "string" ? response.body : JSON.stringify(response.body),
          };
        };
        return { store, send };
      },
    ],
    [
      "next-adapter",
      () => {
        const store = createPayloadDraftRuntime(seed);
        const config = {
          ...appAdminConfigFromEnv({ NODE_ENV: "test", MS_REALTY_PUBLIC_ORIGIN: ORIGIN }),
          reviewedAt: "2026-09-16T09:00:00.000Z",
          payloadListingRuntime: store.payload,
          runtimeDataDurableOnly: true,
          payloadAdminAuth: payloadAdminAuth(),
        };
        const send = async (method, url, body = undefined) => {
          const response = await renderAppAdminResponse(
            new Request(`${ORIGIN}${url}`, {
              method,
              body,
              headers: {
                cookie: `ms_admin=${SESSION}`,
                accept: body ? "application/json" : "text/html",
                ...(body ? { "content-type": "application/json", "sec-fetch-site": "same-origin" } : {}),
              },
            }),
            { config },
          );
          return { status: response.status, text: await response.text() };
        };
        return { store, send };
      },
    ],
  ];
}

const ENTITIES = { "&quot;": '"', "&#x27;": "'", "&#39;": "'", "&lt;": "<", "&gt;": ">", "&amp;": "&" };
function attributes(tag) {
  const out = {};
  for (const [, name, value] of tag.matchAll(/\s([\w-]+)(?:="([^"]*)")?/g)) {
    out[name] = value === undefined ? "" : value.replace(/&(?:quot|#x27|#39|lt|gt|amp);/g, (entity) => ENTITIES[entity]);
  }
  return out;
}

// Just enough DOM for initListingMediaOrder: the manager, its status line, and
// the tiles in document order with the move controls each one renders.
class FakeElement {
  constructor(attrs = {}) {
    this.attrs = new Map(Object.entries(attrs));
    this.children = [];
    this.parentNode = null;
    this.listeners = {};
    this.textContent = "";
    this.hidden = Object.hasOwn(attrs, "hidden");
    this.disabled = Object.hasOwn(attrs, "disabled");
  }
  getAttribute(name) { return this.attrs.has(name) ? this.attrs.get(name) : null; }
  setAttribute(name, value) { this.attrs.set(name, String(value)); }
  hasAttribute(name) { return this.attrs.has(name); }
  append(child) { child.parentNode = this; this.children.push(child); return child; }
  addEventListener(type, listener) { (this.listeners[type] ||= []).push(listener); }
  focus() {}
  get nextSibling() {
    const siblings = this.parentNode?.children || [];
    return siblings[siblings.indexOf(this) + 1] || null;
  }
  insertBefore(node, reference) {
    const from = node.parentNode;
    if (from) from.children.splice(from.children.indexOf(node), 1);
    node.parentNode = this;
    const at = reference ? this.children.indexOf(reference) : -1;
    if (at < 0) this.children.push(node);
    else this.children.splice(at, 0, node);
    return node;
  }
  matches(selector) {
    const match = selector.match(/^\[([\w-]+)(?:="([^"]*)")?\]$/);
    if (!match) throw new Error(`unsupported selector ${selector}`);
    return this.hasAttribute(match[1]) && (match[2] === undefined || this.getAttribute(match[1]) === match[2]);
  }
  querySelectorAll(selector) {
    const found = [];
    const walk = (node) => {
      for (const child of node.children) {
        if (child.matches(selector)) found.push(child);
        walk(child);
      }
    };
    walk(this);
    return found;
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  closest(selector) {
    for (let node = this; node; node = node.parentNode) if (node.matches?.(selector)) return node;
    return null;
  }
}

function galleryFromMarkup(html) {
  const managerTag = html.match(/<section[^>]*data-media-order-listing="[^"]*"[^>]*>/)?.[0];
  if (!managerTag) return null;
  const manager = new FakeElement(attributes(managerTag));
  if (/data-media-order-status="true"/.test(html)) manager.append(new FakeElement({ "data-media-order-status": "true" }));
  for (const [tileHtml] of html.matchAll(/<article[^>]*data-media-asset="[^"]+"[\s\S]*?<\/article>/g)) {
    const tile = manager.append(new FakeElement(attributes(tileHtml.match(/<article[^>]*>/)[0])));
    for (const [control] of tileHtml.matchAll(/<(?:button|span|div)\b[^>]*data-media-(?:move|cover|order-controls|open)[^>]*>/g)) {
      tile.append(new FakeElement(attributes(control)));
    }
  }
  return manager;
}

const settle = () => new Promise((resolve) => setImmediate(resolve));

// The real client, not a restatement of it.
function mountClient(manager, send, { fetchOverride = null } = {}) {
  const source = ADMIN_APP_JS.slice(
    ADMIN_APP_JS.indexOf("  function initListingMediaOrder() {"),
    ADMIN_APP_JS.indexOf("  function initAdminSearchEntry() {"),
  );
  const requests = [];
  const fetch = async (url, init) => {
    const body = JSON.parse(init.body);
    requests.push(body);
    if (fetchOverride) return fetchOverride(body);
    const response = await send("POST", url, init.body);
    return { ok: response.status >= 200 && response.status < 300, status: response.status, json: async () => JSON.parse(response.text) };
  };
  new Function("document", "fetch", `${source}\ninitListingMediaOrder();`)(
    { querySelector: (selector) => (selector === "[data-media-order-listing]" ? manager : null) },
    fetch,
  );
  const click = async (tile, direction) => {
    const button = tile.querySelector(`[data-media-move="${direction}"]`);
    assert.ok(button, `tile has a ${direction} control`);
    for (const listener of manager.listeners.click || []) listener({ target: button, preventDefault() {} });
    for (let round = 0; round < 6; round += 1) await settle();
  };
  return { requests, click, tiles: () => manager.querySelectorAll("[data-media-asset]") };
}

function storedAssetOrder(store, listingId) {
  const rows = store.currentRows();
  const byId = new Map(rows.media_assets.map((asset) => [asset.id, asset]));
  return rows.listings.find((row) => row.id === listingId).media.map((id) => ({ id, asset_id: mediaAssetId(byId.get(id)), kind: byId.get(id).kind }));
}

// Number(null) is 0, which would quietly turn every tile into the cover's
// entry and every expected move into a no-op that matches an untouched store.
function entryOf(tile) {
  const raw = tile.getAttribute("data-media-order-entry");
  assert.match(String(raw), /^\d+$/, "each tile names its place in the whole relation");
  return Number(raw);
}

async function openGallery(send, listingId) {
  const page = await send("GET", `/admin/listings/edit?listingId=${listingId}&locale=en&tab=media`);
  assert.equal(page.status, 200);
  const manager = galleryFromMarkup(page.text);
  assert.ok(manager, "the durable editor offers gallery ordering");
  return manager;
}

for (const [runtime, open] of runtimes(loadCmsSeed())) {
  test(`${runtime}: choosing a cover from the rendered subset keeps every hidden and repeated relation`, async () => {
    const { store, send } = open();
    const before = storedAssetOrder(store, "MS-00815");
    const manager = await openGallery(send, "MS-00815");
    const fullOrder = JSON.parse(manager.getAttribute("data-media-order"));
    const openedRevision = manager.getAttribute("data-media-order-revision");
    assert.match(openedRevision, /^[a-f0-9]{64}$/);
    const client = mountClient(manager, send);
    const tiles = client.tiles();
    // The subset is real: fewer tiles than relations, and the order the page
    // carries covers every relation rather than only the visible ones.
    assert.equal(before.length, 35);
    assert.equal(tiles.length, 19);
    assert.equal(fullOrder.length, before.length);
    assert.deepEqual(fullOrder.map((row) => row.relation_id), before.map((row) => String(row.id)));

    const last = tiles.at(-1);
    const chosen = entryOf(last);
    await client.click(last, "front");

    assert.equal(client.requests.length, 1);
    const status = manager.querySelector("[data-media-order-status]");
    assert.equal(status.getAttribute("data-state"), "success", status.textContent);
    const after = storedAssetOrder(store, "MS-00815");
    // The chosen record - not merely a record with the same source - is first.
    assert.equal(after[0].id, before[chosen].id);
    // Everything else keeps its relative order, including relations the grid
    // never showed and sources attached more than once.
    assert.deepEqual(after.slice(1).map((row) => row.id), before.filter((_, index) => index !== chosen).map((row) => row.id));
    assert.equal(after.length, before.length);
    assert.equal(new Set(after.map((row) => row.asset_id)).size, new Set(before.map((row) => row.asset_id)).size);
    // The page now shows the new cover, and the next request is bound to the
    // version this save produced.
    assert.equal(client.tiles()[0], last);
    assert.equal(last.querySelector("[data-media-cover]").hidden, false);
    assert.notEqual(manager.getAttribute("data-media-order-revision"), openedRevision);

    // A second move from the same page works because the revision advanced.
    const second = client.tiles()[1];
    await client.click(second, "front");
    assert.equal(client.requests.length, 2);
    assert.equal(status.getAttribute("data-state"), "success", status.textContent);
    assert.equal(storedAssetOrder(store, "MS-00815")[0].id, before[entryOf(second)].id);
  });

  test(`${runtime}: moving a tile earlier swaps it with its visible neighbour and nothing else`, async () => {
    const { store, send } = open();
    const before = storedAssetOrder(store, "MS-00815");
    const manager = await openGallery(send, "MS-00815");
    const client = mountClient(manager, send);
    const tiles = client.tiles();
    // Two neighbouring tiles with relations the grid does not show between
    // them: the case where "swap with the tile above" and "move one place up"
    // would disagree.
    const pair = tiles.findIndex((tile, index) => index > 0 && entryOf(tile) - entryOf(tiles[index - 1]) > 1);
    assert.ok(pair > 0, "the fixture has hidden relations between two neighbouring tiles");
    const upper = entryOf(tiles[pair - 1]);
    const lower = entryOf(tiles[pair]);
    await client.click(tiles[pair], "up");
    assert.equal(manager.querySelector("[data-media-order-status]").getAttribute("data-state"), "success");
    const after = storedAssetOrder(store, "MS-00815");
    assert.notDeepEqual(after, before, "the move was written");
    const expected = before.map((row) => row.id);
    [expected[upper], expected[lower]] = [expected[lower], expected[upper]];
    assert.deepEqual(after.map((row) => row.id), expected, "hidden relations between the two tiles stay where they were");
  });

  test(`${runtime}: moving the first tile earlier sends nothing`, async () => {
    const { store, send } = open();
    const before = storedAssetOrder(store, "MS-00815");
    const manager = await openGallery(send, "MS-00815");
    const client = mountClient(manager, send);
    await client.click(client.tiles()[0], "up");
    assert.equal(client.requests.length, 0);
    assert.deepEqual(storedAssetOrder(store, "MS-00815"), before);
  });

  test(`${runtime}: a gallery that changed after the page loaded is refused, and the page goes back`, async () => {
    const { store, send } = open();
    const manager = await openGallery(send, "MS-00815");
    const client = mountClient(manager, send);
    const shown = client.tiles().map(entryOf);
    // Somebody else reorders the same gallery; membership is unchanged, so only
    // the version can tell the two pages apart.
    const listing = store.currentRows().listings.find((row) => row.id === "MS-00815");
    const concurrent = [...listing.media].reverse();
    const transactionID = await store.payload.db.beginTransaction();
    await store.payload.update({ collection: "listings", id: "MS-00815", draft: true, data: { media: concurrent }, req: { transactionID } });
    await store.payload.db.commitTransaction(transactionID);
    const stored = storedAssetOrder(store, "MS-00815");
    await client.click(client.tiles().at(-1), "front");
    const status = manager.querySelector("[data-media-order-status]");
    assert.equal(status.getAttribute("data-state"), "error");
    assert.ok(status.textContent.length > 0, "the refusal is announced");
    assert.equal(client.requests.length, 1, "the stale page did ask");
    assert.deepEqual(client.tiles().map(entryOf), shown, "tiles are back where they were");
    assert.deepEqual(storedAssetOrder(store, "MS-00815"), stored, "the other editor's order survives");
  });

  test(`${runtime}: an unrecognised 200 is not treated as a saved order`, async () => {
    const { send } = open();
    const manager = await openGallery(send, "MS-00815");
    const client = mountClient(manager, send, {
      fetchOverride: async () => ({ ok: true, status: 200, json: async () => ({ ok: true }) }),
    });
    const shown = client.tiles().map(entryOf);
    const revision = manager.getAttribute("data-media-order-revision");
    await client.click(client.tiles().at(-1), "front");
    assert.equal(manager.querySelector("[data-media-order-status]").getAttribute("data-state"), "error");
    assert.equal(client.requests.length, 1);
    assert.deepEqual(client.tiles().map(entryOf), shown);
    assert.equal(manager.getAttribute("data-media-order-revision"), revision);
  });

  test(`${runtime}: the route refuses orders no editor page could have produced`, async () => {
    const { store, send } = open();
    const manager = await openGallery(send, "MS-00815");
    const fullOrder = JSON.parse(manager.getAttribute("data-media-order"));
    const revision = manager.getAttribute("data-media-order-revision");
    const stored = storedAssetOrder(store, "MS-00815");
    const body = (overrides) =>
      JSON.stringify({
        listingId: "MS-00815",
        assetIds: fullOrder.map((row) => row.asset_id),
        relationIds: fullOrder.map((row) => row.relation_id),
        galleryRevision: revision,
        ...overrides,
      });
    const duplicateIndex = fullOrder.findIndex((row, index) => fullOrder.findIndex((other) => other.asset_id === row.asset_id) !== index);
    assert.ok(duplicateIndex > 0, "the fixture repeats a source");
    const cases = [
      ["a foreign record", { relationIds: ["999999", ...fullOrder.slice(1).map((row) => row.relation_id)] }],
      ["a record listed twice", { relationIds: [fullOrder[0].relation_id, ...fullOrder.slice(0, -1).map((row) => row.relation_id)] }],
      ["a record left out", { relationIds: fullOrder.slice(1).map((row) => row.relation_id), assetIds: fullOrder.slice(1).map((row) => row.asset_id) }],
      ["an asset that does not match its record", { assetIds: [fullOrder[1].asset_id, fullOrder[0].asset_id, ...fullOrder.slice(2).map((row) => row.asset_id)].map((id, index) => (index === 0 && fullOrder[1].asset_id === fullOrder[0].asset_id ? "media-00000000000000000000" : id)) }],
      ["no version", { galleryRevision: undefined }],
      ["an old version", { galleryRevision: "0".repeat(64) }],
    ];
    for (const [name, overrides] of cases) {
      const response = await send("POST", "/api/admin/media/order", body(overrides));
      assert.ok([400, 409].includes(response.status), `${name}: ${response.status} ${response.text}`);
      assert.deepEqual(storedAssetOrder(store, "MS-00815"), stored, `${name} changed the gallery`);
    }
    // The unchanged order is accepted and writes nothing.
    const same = await send("POST", "/api/admin/media/order", body({}));
    assert.equal(same.status, 200, same.text);
    assert.equal(JSON.parse(same.text).idempotent, true);
    assert.deepEqual(storedAssetOrder(store, "MS-00815"), stored);
  });
}

// The grid stops at fifty tiles and shows only photos, plans and videos. A
// relation past the fiftieth, or of another kind, is still part of the order.
test("both runtimes keep relations beyond the fifty-tile grid and of unshown kinds", async () => {
  const seed = structuredClone(loadCmsSeed());
  const listing = seed.records.find((record) => record.collection === "listings" && record.id === "MS-00815");
  listing.media = Array.from({ length: 56 }, (_, index) => ({
    url: `https://example.test/gallery/${index === 53 ? 7 : index}.jpg`,
    kind: index === 3 ? "document" : "photo",
    alt: `Asset ${index}`,
    is_public: false,
    review_status: "needs_media_review",
  }));
  for (const [runtime, open] of runtimes(seed)) {
    const { store, send } = open();
    const before = storedAssetOrder(store, "MS-00815");
    const manager = await openGallery(send, "MS-00815");
    const client = mountClient(manager, send);
    assert.equal(before.length, 56, runtime);
    assert.equal(client.tiles().length, 50, `${runtime}: the grid is bounded`);
    const lastShown = client.tiles().at(-1);
    const chosen = entryOf(lastShown);
    await client.click(lastShown, "front");
    const after = storedAssetOrder(store, "MS-00815");
    assert.ok(chosen >= 50, `${runtime}: the fiftieth tile sits past the unshown relation`);
    assert.notDeepEqual(after, before, `${runtime}: the move was written`);
    assert.equal(after[0].id, before[chosen].id, runtime);
    assert.deepEqual(after.slice(1).map((row) => row.id), before.filter((_, index) => index !== chosen).map((row) => row.id), runtime);
    assert.equal(after.filter((row) => row.kind === "document").length, 1, `${runtime}: the unshown kind is kept`);
    assert.equal(after.filter((row) => row.asset_id === before[7].asset_id).length, 2, `${runtime}: the repeated source is kept twice`);
  }
});
