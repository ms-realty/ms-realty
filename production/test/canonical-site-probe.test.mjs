import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// "Production is up" and "the site works" are different claims, and only the
// first one was ever checked. The journey probe asks eight questions of one
// host; this probe asks whether a buyer in each of the seven public languages
// can reach every page type, whether the SEO files name the real domain, and
// whether each class of approved legacy decision still resolves.
//
// A probe nobody can narrow is the point, so its coverage is pinned here: the
// locale list comes from the registry rather than a literal, and the deploy
// refuses to finish until it passes on the canonical domain.

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const source = fs.readFileSync(path.join(ROOT, "production", "scripts", "probe-canonical-site.mjs"), "utf8");
const ciWorkflow = fs.readFileSync(path.join(ROOT, ".github", "workflows", "ci.yml"), "utf8");
const registry = JSON.parse(fs.readFileSync(path.join(ROOT, "locales", "registry.json"), "utf8"));

test("the probe covers every public locale from the registry, not a copied list", () => {
  // Seven locales ship today. A literal list would silently stop covering an
  // eighth the day the agency adds one, which is exactly when it matters.
  assert.match(source, /locales\/registry\.json|"locales", "registry\.json"/);
  assert.match(source, /registry\.locales\.filter\(\(locale\) => locale\.public_enabled && locale\.indexable\)/);
  assert.doesNotMatch(source, /\["bg", "en", "de", "nl", "ru", "el", "he"\]/);

  const publicLocales = registry.locales.filter((locale) => locale.public_enabled && locale.indexable);
  assert.equal(publicLocales.length, 7);
  // Every one of them must have the four route segments the probe opens.
  for (const locale of publicLocales) {
    for (const segment of ["search", "seller", "contact"]) {
      assert.ok(locale.route_segments?.[segment], `${locale.code} needs a ${segment} route segment`);
    }
  }
});

test("the probe asserts what a rendered page cannot tell you", () => {
  // Hebrew is a full right-to-left build, not a stylesheet flip.
  assert.match(source, /locale\.direction === "rtl"/);
  assert.match(source, /dir="rtl"/);
  // The canonical domain must be indexable and must never publish the
  // operational origin into its own metadata.
  assert.match(source, /is noindex on the canonical domain/);
  assert.match(source, /published an operational workers\.dev origin/);
  // Search has to return inventory, not merely answer.
  assert.match(source, /total_matches/);
  assert.match(source, /total > 0/);
  // A one-hop 301 is the whole legacy contract; a chain loses the equity.
  assert.match(source, /launch-freeze\.json/);
  assert.match(source, /one hop/);
  // The operator surface is reachable, closed, and out of the index.
  assert.match(source, /api requires auth/);
  assert.match(source, /login stays noindex/);
  // It fails the process, so a workflow step cannot pass while checks fail.
  assert.match(source, /process\.exit\(1\)/);
});

test("a release is not finished until the whole public site answers", () => {
  const deployJob = ciWorkflow.slice(ciWorkflow.indexOf("  deploy:\n"));
  assert.match(deployJob, /Verify the whole public site on the canonical domain/);
  assert.match(deployJob, /MS_REALTY_PUBLIC_URL: https:\/\/makler-realty\.com/);
  assert.match(deployJob, /probe-canonical-site\.mjs/);
  // It runs before the rollback step, so a failure rolls the release back
  // rather than leaving a broken site deployed.
  assert.ok(
    deployJob.indexOf("probe-canonical-site.mjs") < deployJob.indexOf("- name: Roll back failed deployment"),
    "the site probe must gate the release, not report after it",
  );
});

test("every public route selects its origin from the forwarded host", () => {
  // /en/search, /ru/search and /he/search published
  // https://ms-realty.ms-realty-bg.workers.dev as their own canonical link and
  // og:url on the live canonical domain, while /bg/tarsene and /de/suche were
  // correct. Only the locales whose search segment is literally "search" reach
  // app/[locale]/search/route.js, and that one file forwarded no host, so
  // publicOriginForHost fell back to the operational origin. Three of seven
  // languages were telling Google the wrong home for every search page.
  const appRoot = path.join(ROOT, "app");
  // Render helpers that resolve a public origin from the request host. Admin
  // and API handlers take the whole Request and are not in this contract.
  const hostAware = /renderApp(?:Route|SearchRoute|SiteRoot|Sitemap|Robots)Response/;

  const walk = (dir) =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const target = path.join(dir, entry.name);
      return entry.isDirectory() ? walk(target) : entry.name === "route.js" ? [target] : [];
    });

  const offenders = walk(appRoot)
    .filter((file) => hostAware.test(fs.readFileSync(file, "utf8")))
    .filter((file) => !fs.readFileSync(file, "utf8").includes("x-forwarded-host"));

  assert.deepEqual(
    offenders.map((file) => path.relative(ROOT, file)),
    [],
    "a public route that renders without the forwarded host publishes the operational origin",
  );
  // The contract is worth nothing if it matches no files.
  assert.ok(walk(appRoot).filter((file) => hostAware.test(fs.readFileSync(file, "utf8"))).length >= 6);
});
