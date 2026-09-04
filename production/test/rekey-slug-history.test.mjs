import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { plannedRekeyRedirects } from "../../migration/build_rekey_slug_history.mjs";
import { createHttpApp, dispatchHttp } from "../lib/http.mjs";
import { buildListingIdMap, loadListingIdentityInputs } from "../lib/listing-identity.mjs";
import { fromRoot } from "../lib/paths.mjs";
import { readSlugHistory, slugRedirectForPath } from "../lib/slug-history.mjs";

// The rekey moved the public path of every surviving listing while those paths
// were live and indexed. A missing redirect here is a 404 on a page search
// engines already hold, so the contract is: every listing page the site serves
// is reachable from the URL it used to have.

const identity = buildListingIdMap(loadListingIdentityInputs());
const manifest = JSON.parse(fs.readFileSync(fromRoot("production", "data", "app-route-manifest.json"), "utf8"));
const listingRoutes = manifest.routes.filter((route) => route.type === "listing");
const rows = readSlugHistory();

test("every listing whose id moved is reachable from its crawl-era path", () => {
  const planned = plannedRekeyRedirects({ manifest, identity });
  assert.equal(planned.length, 127, "one redirect per surviving listing page");
  for (const entry of planned) {
    const redirect = slugRedirectForPath(rows, entry.oldPath);
    assert.ok(redirect, `${entry.oldPath} has no redirect`);
    assert.equal(redirect.new_path, entry.newPath, entry.oldPath);
    assert.equal(redirect.status, 301, entry.oldPath);
    assert.equal(redirect.listing_id, entry.listingId, entry.oldPath);
  }
});

test("a retired twin keeps its own path and needs no redirect", () => {
  const retired = [...identity.values()].filter((row) => row.migration_id === row.id);
  assert.equal(retired.length, 38);
  for (const row of retired) {
    const route = listingRoutes.find((entry) => entry.params?.listingId === row.id);
    if (!route) continue;
    assert.equal(slugRedirectForPath(rows, route.path), null, `${route.path} must serve, not redirect`);
  }
});

test("the runtime answers the old path with one hop to the new one", async () => {
  const app = createHttpApp({});
  const planned = plannedRekeyRedirects({ manifest, identity });
  for (const entry of planned.slice(0, 12)) {
    const moved = await dispatchHttp(app, { url: entry.oldPath });
    assert.equal(moved.status, 301, entry.oldPath);
    assert.equal(moved.headers.location, entry.newPath, entry.oldPath);
    const landed = await dispatchHttp(app, { url: entry.newPath });
    assert.equal(landed.status, 200, `${entry.newPath} must answer, not redirect again`);
  }
});
