import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fromRoot } from "../lib/paths.mjs";
import { loadLocaleRegistry, siteRootRedirectTarget } from "../lib/locales.mjs";
import { renderAppRouteResponse, renderAppSiteRoot, renderAppSiteRootResponse } from "../lib/app-router-adapter.mjs";
import {
  PREVIEW_NOINDEX,
  canonicalLegacyHost,
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

test("the Next root serves the approved apex retain_200 content without changing other hosts", async () => {
  const route = await import("../../app/route.js");
  const request = (url, host) =>
    new Request(url, {
      headers: { accept: "text/html", "x-forwarded-host": host },
    });

  for (const url of ["https://makler-realty.com", "https://makler-realty.com/"]) {
    const response = await route.GET(request(url, "makler-realty.com"));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("location"), null);
    assert.match(await response.text(), /<html[^>]*lang="bg"/);
  }

  const worker = await route.GET(request("https://ms-realty.ms-realty-bg.workers.dev/", "ms-realty.ms-realty-bg.workers.dev"));
  assert.equal(worker.status, 308);
  assert.equal(worker.headers.get("location"), "/bg");

  const www = await route.GET(request("https://www.makler-realty.com/", "www.makler-realty.com"));
  assert.equal(www.status, 308);
  assert.equal(www.headers.get("location"), "/bg");

  const legacyRu = await route.GET(request("https://makler-realty.ru/", "makler-realty.ru"));
  assert.equal(legacyRu.status, 308);
  assert.equal(legacyRu.headers.get("location"), "/bg");
});

test("the shared root response renders the same page as its retain_200 target", async () => {
  const retained = renderAppSiteRootResponse({
    url: "http://app:3000/",
    host: "makler-realty.com:443",
    accept: "text/html",
  });
  const target = renderAppRouteResponse({ pathname: "/bg", url: "http://app:3000/bg", accept: "text/html" });
  assert.equal(retained.status, 200);
  assert.equal(retained.headers.get("location"), null);
  assert.equal(await retained.text(), await target.text());
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

test("www legacy hosts canonicalize to the approved apex route contract", () => {
  assert.equal(canonicalLegacyHost("WWW.MAKLER-REALTY.COM."), "makler-realty.com");
  assert.equal(canonicalLegacyHost("www.makler-realty.ru"), "makler-realty.ru");
  assert.equal(canonicalLegacyHost("mail.makler-realty.com"), "");
  assert.match(workerSource, /return Response\.redirect\(url, 301\);/);
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
