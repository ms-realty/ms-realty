import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fromRoot } from "../lib/paths.mjs";
import { loadLocaleRegistry, siteRootRedirectTarget } from "../lib/locales.mjs";
import { renderAppSiteRoot } from "../lib/app-router-adapter.mjs";
import {
  PREVIEW_NOINDEX,
  isPreviewHost,
  isProductionPublicHost,
  mediaCandidateKeys,
} from "../../workers/preview-host.mjs";

const workerSource = fs.readFileSync(fromRoot("workers", "index.js"), "utf8");

test("the site root resolves instead of 404ing", () => {
  const result = renderAppSiteRoot();
  assert.equal(result.status, 308);
  assert.equal(result.headers.location, "/bg");
});

test("the root target is a single hop: /bg, not the registry x_default /bg/", () => {
  const registry = loadLocaleRegistry();
  assert.equal(registry.x_default, "/bg/");
  // "/bg/" would redirect again to "/bg"; §13 allows no chain longer than one hop.
  assert.equal(siteRootRedirectTarget(registry), "/bg");
  assert.equal(siteRootRedirectTarget({ source_locale: "en" }), "/en");
});

test("both runtimes serve the root redirect", () => {
  assert.ok(fs.existsSync(fromRoot("app", "route.js")), "Next needs app/route.js for /");
  const httpSource = fs.readFileSync(fromRoot("production", "lib", "http.mjs"), "utf8");
  assert.match(httpSource, /url\.pathname === "\/"\) \{\n\s+const location = siteRootRedirectTarget/);
});

test("only isolated *.workers.dev hosts count as preview hosts", () => {
  assert.equal(isProductionPublicHost("ms-realty.ms-realty-bg.workers.dev"), true);
  assert.equal(isProductionPublicHost("MS-REALTY.MS-REALTY-BG.WORKERS.DEV."), true);
  assert.equal(isPreviewHost("ms-realty.ms-realty-bg.workers.dev"), false);
  assert.equal(isPreviewHost("MS-REALTY.MS-REALTY-BG.WORKERS.DEV"), false);
  assert.equal(isPreviewHost("msr-monitoring-drill-123.account.workers.dev"), true);
  assert.equal(isPreviewHost("makler-realty.com"), false);
  assert.equal(isPreviewHost("makler-realty.ru"), false);
  // Not a suffix match on a lookalike domain.
  assert.equal(isPreviewHost("evil-workers.dev"), false);
  assert.equal(isPreviewHost(""), false);
  assert.equal(isPreviewHost(undefined), false);
});

test("the Worker noindexes isolated drills and leaves the production origin indexable", () => {
  assert.equal(PREVIEW_NOINDEX, "noindex, nofollow, noarchive");
  assert.match(workerSource, /const preview = isPreviewHost\(url\.hostname\);/);
  assert.match(workerSource, /if \(preview && url\.pathname === "\/robots\.txt"\) return previewRobotsResponse\(\);/);
  assert.match(workerSource, /return preview \? withPreviewNoindex\(response\) : response;/);
  assert.match(workerSource, /"User-agent: \*\\nDisallow: \/\\n"/);
});

test("the normalized production host reads newly uploaded workers.dev media first", () => {
  assert.deepEqual(mediaCandidateKeys("MS-REALTY.MS-REALTY-BG.WORKERS.DEV.", "/wp-content/uploads/new.jpg"), [
    "ms-realty.ms-realty-bg.workers.dev/wp-content/uploads/new.jpg",
    "makler-realty.com/wp-content/uploads/new.jpg",
    "makler-realty.ru/wp-content/uploads/new.jpg",
  ]);
});
