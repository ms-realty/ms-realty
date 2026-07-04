import fs from "node:fs";
import { loadLocaleRegistry, assertLocaleRegistry, publicIndexableLocales } from "../lib/locales.mjs";
import { hreflangForListing } from "../lib/seo.mjs";
import { assertHermesActionAllowed } from "../lib/hermes.mjs";
import { createLeadDraft } from "../lib/leads.mjs";
import { assertMigrationLaunchGate } from "../lib/migration.mjs";
import { assertDeployableRedirects } from "../lib/redirect-approvals.mjs";
import { fromRoot } from "../lib/paths.mjs";

const registry = loadLocaleRegistry();
assertLocaleRegistry(registry);

const publicLocales = publicIndexableLocales(registry).map((locale) => locale.code);
for (const code of ["bg", "en", "de", "nl", "ru", "el", "he"]) {
  if (!publicLocales.includes(code)) throw new Error(`Missing public locale ${code}`);
}

const translations = publicLocales.map((locale) => ({
  locale,
  status: "approved",
  human_approved: true,
}));
translations.push({ locale: "fr", status: "hermes_drafted", human_approved: false });

const hreflang = hreflangForListing(registry, "ms-987", translations);
if (hreflang.some((link) => link.hreflang === "fr")) throw new Error("Draft French must not generate hreflang");
if (!hreflang.some((link) => link.hreflang === "he" && link.href === "/he/properties/ms-987")) {
  throw new Error("Hebrew hreflang route missing");
}
if (!hreflang.some((link) => link.hreflang === "el" && link.href === "/el/akinita/ms-987")) {
  throw new Error("Greek hreflang route missing");
}

try {
  assertHermesActionAllowed("publish");
  throw new Error("Hermes publish action should fail");
} catch (error) {
  if (!String(error.message).includes("cannot perform")) throw error;
}

const hebrewLead = createLeadDraft(registry, {
  source: "website_listing_detail",
  leadType: "buyer",
  language: "he",
  contact: { name: "Noa Levi" },
});
if (hebrewLead.language.direction !== "rtl") throw new Error("Hebrew lead must preserve RTL");
if (hebrewLead.language.adminLocale !== "en") throw new Error("Hebrew lead must route to EN admin queue");

const listings = JSON.parse(fs.readFileSync(fromRoot("search", "data", "listings.json"), "utf8"));
if (!listings.length) throw new Error("Search listing fixture is empty");
for (const field of ["locale", "locale_prefix", "locale_is_indexable", "translation_status"]) {
  if (!(field in listings[0])) throw new Error(`Search fixture missing ${field}`);
}

const migration = JSON.parse(fs.readFileSync(fromRoot("production", "data", "migration-records.json"), "utf8"));
assertMigrationLaunchGate(migration.records);

const routeMap = JSON.parse(fs.readFileSync(fromRoot("production", "data", "legacy-route-map.json"), "utf8"));
if (routeMap.summary.mappedListings !== 165) throw new Error("Legacy route map must include 165 listing mappings");
if (routeMap.summary.byTargetLocale.ru !== 52) throw new Error("Legacy route map must preserve 52 RU listings");
if (routeMap.summary.homepageTargets !== 0) throw new Error("Legacy route map must not target homepages");
if (routeMap.summary.deployable !== 0) throw new Error("Legacy route map must stay review-gated");

const deployableRedirects = JSON.parse(fs.readFileSync(fromRoot("production", "data", "deployable-redirects.json"), "utf8"));
const redirectSummary = assertDeployableRedirects(deployableRedirects.redirects);
if (redirectSummary.total !== 2) throw new Error("Deployable redirect smoke must include exactly two reviewed listings");
if (redirectSummary.byTargetLocale.bg !== 1 || redirectSummary.byTargetLocale.ru !== 1) {
  throw new Error("Deployable redirect smoke must include one BG and one RU route");
}
const redirectApprovals = fs
  .readFileSync(fromRoot("production", "data", "redirect-approvals.jsonl"), "utf8")
  .trim()
  .split("\n")
  .filter(Boolean);
if (redirectApprovals.length !== 2) throw new Error("Redirect approval ledger must contain two reviewed rows");

const sitemap = JSON.parse(fs.readFileSync(fromRoot("production", "data", "localized-sitemap.json"), "utf8"));
if (sitemap.summary.byLocale.bg !== 113 || sitemap.summary.byLocale.ru !== 52) {
  throw new Error("Localized sitemap must include published source BG/RU listings");
}
if (sitemap.summary.byLocale.el !== 1 || sitemap.summary.byLocale.he !== 1) {
  throw new Error("Localized sitemap must include approved Greek and Hebrew seeds");
}
if (sitemap.summary.byLocale.fr) throw new Error("Localized sitemap must not include unapproved French");

const sitemapXml = fs.readFileSync(fromRoot("production", "data", "sitemap.xml"), "utf8");
const robotsTxt = fs.readFileSync(fromRoot("production", "data", "robots.txt"), "utf8");
if (!sitemapXml.includes("/he/properties/MS-CRAWL-0001") || sitemapXml.includes("/fr/")) {
  throw new Error("Sitemap XML must include approved Hebrew and exclude French");
}
if (!robotsTxt.includes("Sitemap:")) throw new Error("Robots must include sitemap URL");

const cmsSeed = JSON.parse(fs.readFileSync(fromRoot("production", "data", "cms-seed.json"), "utf8"));
if (cmsSeed.summary.listings !== 165) throw new Error("CMS seed must include 165 listings");
if (cmsSeed.summary.bySourceLocale.ru !== 52) throw new Error("CMS seed must include 52 RU source listings");
if (cmsSeed.summary.mediaAssets !== 4978) throw new Error("CMS seed must include listing media rows");
if (cmsSeed.summary.deployableRoutes !== 0) throw new Error("CMS seed routes must stay review-gated");
if (cmsSeed.summary.translationLocales.fr) throw new Error("CMS seed must not include unapproved French translations");

const publicFixtures = JSON.parse(fs.readFileSync(fromRoot("production", "data", "public-fixtures.json"), "utf8"));
if (publicFixtures.listing_he.dir !== "rtl") throw new Error("Hebrew public fixture must render RTL");
if (publicFixtures.listing_el.path !== `/el/akinita/${publicFixtures.source_listing_id}`) {
  throw new Error("Greek listing fixture route missing");
}
if (publicFixtures.listing_fr_fallback.indexable !== false) throw new Error("French fallback listing must not be indexable");
if (publicFixtures.fallback_fr.indexable !== false) throw new Error("French language fallback must not be indexable");
if (JSON.stringify(publicFixtures).match(/Sandanski sea|sea destination|Сандански море/i)) {
  throw new Error("Public fixtures must not introduce Sandanski sea framing");
}
if (JSON.stringify(publicFixtures.admin_ru.interface_locales.map((locale) => locale.code)) !== JSON.stringify(["bg", "ru", "en"])) {
  throw new Error("Admin fixture must expose only BG, RU, EN interface locales");
}

const adminFixtures = JSON.parse(fs.readFileSync(fromRoot("production", "data", "admin-fixtures.json"), "utf8"));
if (JSON.stringify(adminFixtures.workspaces.ru.interface_locales) !== JSON.stringify(["bg", "ru", "en"])) {
  throw new Error("Admin workspace must expose BG, RU, EN");
}
if (adminFixtures.workspaces.he_fallback.locale !== "en") throw new Error("Website-only admin locale must fall back to EN");
if (adminFixtures.translation_tasks.he_draft.public_indexable !== false) {
  throw new Error("Hermes draft translation must not be indexable");
}
if (adminFixtures.translation_tasks.el_published.public_indexable !== true) {
  throw new Error("Published Greek translation fixture must be indexable");
}
if (adminFixtures.crm_inbox.buyer_he.hermes_reply_draft.can_send_without_approval !== false) {
  throw new Error("Hermes CRM reply draft must require broker approval");
}
if (adminFixtures.crm_inbox.buyer_he.admin_locale !== "en" || adminFixtures.crm_inbox.seller_el.admin_locale !== "en") {
  throw new Error("Greek and Hebrew CRM work must route to EN admin queue");
}

const runtimeSmoke = JSON.parse(fs.readFileSync(fromRoot("production", "data", "runtime-smoke.json"), "utf8"));
if (runtimeSmoke.listing_he.dir !== "rtl" || runtimeSmoke.listing_he.status !== 200) {
  throw new Error("Runtime smoke must render Hebrew listing as RTL 200");
}
if (runtimeSmoke.fallback_fr.indexable !== false) throw new Error("Runtime smoke must keep French fallback non-indexable");
if (runtimeSmoke.lead_he.admin_locale !== "en") throw new Error("Runtime smoke lead must route to EN admin queue");

const httpSmoke = JSON.parse(fs.readFileSync(fromRoot("production", "data", "http-smoke.json"), "utf8"));
if (httpSmoke.legacyRedirect.status !== 301 || httpSmoke.legacyRedirect.headers.location !== "/bg/imoti/MS-CRAWL-0001") {
  throw new Error("HTTP smoke must serve approved legacy redirect");
}
if (httpSmoke.listing.status !== 200 || httpSmoke.listing.body.dir !== "rtl") {
  throw new Error("HTTP smoke must serve Hebrew listing as RTL 200");
}
if (httpSmoke.lead.status !== 201 || httpSmoke.lead.body.admin_locale !== "en") {
  throw new Error("HTTP smoke must accept Hebrew lead into EN admin queue");
}
if (httpSmoke.leadLedger.rows !== 2) throw new Error("HTTP smoke must persist buyer and seller lead rows");
if (httpSmoke.sellerLead.status !== 201 || httpSmoke.sellerLead.body.lead.leadType !== "seller") {
  throw new Error("HTTP smoke must accept seller valuation lead");
}
if (httpSmoke.sitemap.status !== 200 || httpSmoke.sitemap.body.includes("/fr/")) {
  throw new Error("HTTP smoke must serve approved sitemap");
}
if (httpSmoke.admin.status !== 200 || httpSmoke.admin.body.workspace.locale !== "ru") {
  throw new Error("HTTP smoke must serve RU admin lead inbox");
}
if (httpSmoke.adminUnauthorized.status !== 401) throw new Error("HTTP smoke must reject unauthenticated admin lead inbox");
if (httpSmoke.reply.status !== 201 || httpSmoke.reply.body.status !== "queued_for_manual_send") {
  throw new Error("HTTP smoke must queue broker-approved reply");
}
if (httpSmoke.replyOutbox.rows !== 1) throw new Error("HTTP smoke must persist one reply outbox row");

const nodeServerSmoke = JSON.parse(fs.readFileSync(fromRoot("production", "data", "node-server-smoke.json"), "utf8"));
if (nodeServerSmoke.legacyRedirect.status !== 301 || nodeServerSmoke.legacyRedirect.headers.location !== "/bg/imoti/MS-CRAWL-0001") {
  throw new Error("Node server smoke must serve approved legacy redirect");
}
if (nodeServerSmoke.listing.status !== 200 || nodeServerSmoke.listing.body.dir !== "rtl") {
  throw new Error("Node server smoke must serve Hebrew listing as RTL 200");
}
if (nodeServerSmoke.badLead.status !== 400) throw new Error("Node server smoke must reject unknown buyer listing");
if (nodeServerSmoke.leadLedger.rows !== 2) throw new Error("Node server smoke must persist buyer and seller lead rows");
if (nodeServerSmoke.robots.status !== 200 || !nodeServerSmoke.robots.body.includes("Sitemap:")) {
  throw new Error("Node server smoke must serve robots");
}
if (nodeServerSmoke.admin.status !== 200 || nodeServerSmoke.admin.body.workspace.locale !== "ru") {
  throw new Error("Node server smoke must serve RU admin lead inbox");
}
if (nodeServerSmoke.reply.status !== 201 || nodeServerSmoke.reply.body.status !== "queued_for_manual_send") {
  throw new Error("Node server smoke must queue broker-approved reply");
}

const leadLedger = fs.readFileSync(fromRoot("production", "data", "lead-ledger.jsonl"), "utf8").trim().split("\n").filter(Boolean);
if (leadLedger.length !== 2) throw new Error("Lead ledger artifact must contain buyer and seller smoke rows");
const replyOutbox = fs.readFileSync(fromRoot("production", "data", "reply-outbox.jsonl"), "utf8").trim().split("\n").filter(Boolean);
if (replyOutbox.length !== 1) throw new Error("Reply outbox artifact must contain one deterministic smoke row");

console.log("PASS: production foundation locale, SEO, Hermes, lead, search, migration, and public route contracts");
