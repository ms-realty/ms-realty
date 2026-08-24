import test from "node:test";
import assert from "node:assert/strict";
import { createHttpApp, dispatchHttp } from "../lib/http.mjs";
import { loadLocaleRegistry } from "../lib/locales.mjs";
import { publicSeedFor } from "../lib/public-inventory.mjs";
import {
  approvedLaunchFreezeRouteArtifact,
  isApprovedLaunchFreezeRouteArtifact,
} from "../lib/redirect-approvals.mjs";
import { loadCmsSeed } from "../lib/runtime.mjs";
import { buildRuntimeLocalizedSitemap } from "../lib/seo-files.mjs";

test("approved launch freeze drives every legacy response and the owner-published listing surface", async () => {
  const contract = approvedLaunchFreezeRouteArtifact();
  const app = createHttpApp({ reviewedAt: "2026-08-20T12:29:16Z" });

  assert.equal(isApprovedLaunchFreezeRouteArtifact(contract), true);
  assert.deepEqual(contract.decision_summary.byStatus, { 200: 10, 301: 179, 410: 268 });
  assert.equal(contract.decisions.length, 457);
  assert.equal(contract.redirects.length, 179);

  for (const decision of contract.decisions) {
    const response = await dispatchHttp(app, { url: decision.old_url });
    assert.equal(response.status, decision.status, decision.old_url);
    if (decision.status === 301) assert.equal(response.headers.location, decision.target_path, decision.old_url);
    if (decision.status === 200) assert.equal(response.body.path, decision.target_path, decision.old_url);
  }

  // The owner's 2026-08-24 directive publishes the whole catalog, so every
  // approved terminal path now serves the real listing instead of the
  // preservation stand-in - archived-at-freeze rows included.
  const states = { active: 0, archived: 0 };
  for (const entry of contract.catalog) {
    const response = await dispatchHttp(app, { url: entry.target_path });
    assert.equal(response.status, 200, entry.target_path);
    assert.equal(response.body.kind, "listing", entry.target_path);
    assert.equal(response.body.indexable, true, entry.target_path);
    assert.equal(response.body.metadata.robots, "index,follow", entry.target_path);
    assert.notEqual(response.body.schema, null, entry.target_path);
    assert.equal("facts" in response.body.body, true, entry.target_path);
    assert.equal("media" in response.body.body, true, entry.target_path);
    states[entry.catalog_state] += 1;
  }
  assert.deepEqual(states, { active: 30, archived: 135 });

  const publicSeed = publicSeedFor(loadCmsSeed());
  const sitemap = buildRuntimeLocalizedSitemap(loadLocaleRegistry(), publicSeed, []);
  const sitemapPaths = new Set(sitemap.entries.map((entry) => entry.loc));
  assert.equal(publicSeed.records.filter((record) => record.collection === "listings").length, 165);
  assert.equal(contract.catalog.every((entry) => sitemapPaths.has(entry.target_path)), true);

  const forged = structuredClone(contract);
  forged.decisions[0].status = 301;
  assert.equal(isApprovedLaunchFreezeRouteArtifact(forged), false);
});
