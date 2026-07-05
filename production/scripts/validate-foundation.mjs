import fs from "node:fs";
import { loadLocaleRegistry, assertLocaleRegistry, publicIndexableLocales } from "../lib/locales.mjs";
import { hreflangForListing } from "../lib/seo.mjs";
import { assertHermesActionAllowed } from "../lib/hermes.mjs";
import { assertHermesAuditLedger } from "../lib/translation-ledger.mjs";
import { createLeadDraft } from "../lib/leads.mjs";
import { assertLeadLedger } from "../lib/lead-ledger.mjs";
import { assertLeadSlaReport } from "../lib/lead-sla.mjs";
import { assertMigrationLaunchGate } from "../lib/migration.mjs";
import { assertDeployableRedirects } from "../lib/redirect-approvals.mjs";
import { assertSlugHistory } from "../lib/slug-history.mjs";
import { assertListingPublicationReport } from "../lib/listing-publication.mjs";
import { assertListingVerificationReport } from "../lib/listing-verification.mjs";
import { assertSavedSearchAlertReport } from "../lib/saved-search-alerts.mjs";
import { assertTranslationCoverageReport } from "../lib/translation-coverage.mjs";
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
const searchIndexDocs = JSON.parse(fs.readFileSync(fromRoot("search", "data", "index-listings.json"), "utf8"));
if (searchIndexDocs.length !== 167) throw new Error("Search index fixture must include 165 source docs plus Greek/Hebrew approvals");
const searchIndexLanguages = new Set(searchIndexDocs.map((doc) => doc.locale));
for (const code of ["bg", "ru", "el", "he"]) {
  if (!searchIndexLanguages.has(code)) throw new Error(`Search index fixture missing ${code} documents`);
}
const hebrewSearchDoc = searchIndexDocs.find((doc) => doc.source_listing_id === "MS-CRAWL-0001" && doc.locale === "he");
if (hebrewSearchDoc?.search_document_type !== "approved_translation" || hebrewSearchDoc.translation_indexable !== true) {
  throw new Error("Search index fixture must include approved Hebrew translation document");
}

const migration = JSON.parse(fs.readFileSync(fromRoot("production", "data", "migration-records.json"), "utf8"));
assertMigrationLaunchGate(migration.records);

const routeMap = JSON.parse(fs.readFileSync(fromRoot("production", "data", "legacy-route-map.json"), "utf8"));
if (routeMap.summary.mappedListings !== 165) throw new Error("Legacy route map must include 165 listing mappings");
if (routeMap.summary.byTargetLocale.ru !== 52) throw new Error("Legacy route map must preserve 52 RU listings");
if (routeMap.summary.homepageTargets !== 0) throw new Error("Legacy route map must not target homepages");
if (routeMap.summary.deployable !== 0) throw new Error("Legacy route map must stay review-gated");

const reviewQueue = JSON.parse(fs.readFileSync(fromRoot("production", "data", "migration-review-queue.json"), "utf8"));
if (
  reviewQueue.summary.total !== 457 ||
  reviewQueue.summary.ruRows !== 179 ||
  reviewQueue.summary.nonListingUnmapped !== 292 ||
  reviewQueue.summary.deployableRows !== 0
) {
  throw new Error("Migration review queue must cover every URL without making review-gated rows deployable");
}
if (reviewQueue.summary.byOwner.ru_preservation_editor !== 179) {
  throw new Error("Migration review queue must keep RU preservation first-class");
}

const deployableRedirects = JSON.parse(fs.readFileSync(fromRoot("production", "data", "deployable-redirects.json"), "utf8"));
const redirectSummary = assertDeployableRedirects(deployableRedirects.redirects);
if (redirectSummary.total !== routeMap.summary.mappedListings) {
  throw new Error("Deployable redirect export must include every reviewed mapped listing");
}
if (redirectSummary.byTargetLocale.bg !== 113 || redirectSummary.byTargetLocale.ru !== 52) {
  throw new Error("Deployable redirect export must preserve 113 BG and 52 RU listing routes");
}
if (redirectSummary.homepageTargets !== 0 || redirectSummary.duplicateOldUrls !== 0) {
  throw new Error("Deployable redirect export must not include homepage targets or duplicate old URLs");
}
const redirectWorkbook = fs.readFileSync(fromRoot("production", "data", "redirect-approval-workbook.csv"), "utf8").trim().split("\n");
if (redirectWorkbook.length !== 166 || !redirectWorkbook[0].includes("equivalent_content")) {
  throw new Error("Redirect approval workbook must include header plus 165 mapped listing rows");
}
if (redirectWorkbook.slice(1).some((row) => !row.includes(",false,"))) {
  throw new Error("Redirect approval workbook rows must default to not approved");
}
const redirectApprovals = fs
  .readFileSync(fromRoot("production", "data", "redirect-approvals.jsonl"), "utf8")
  .trim()
  .split("\n")
  .filter(Boolean);
if (redirectApprovals.length !== routeMap.summary.mappedListings) {
  throw new Error("Redirect approval ledger must contain every reviewed mapped listing");
}

const sitemap = JSON.parse(fs.readFileSync(fromRoot("production", "data", "localized-sitemap.json"), "utf8"));
if (
  sitemap.summary.home_pages !== 7 ||
  sitemap.summary.listing_entries !== 167 ||
  sitemap.summary.location_pages < 6 ||
  sitemap.summary.seller_pages !== 7 ||
  sitemap.summary.contact_pages !== 7
) {
  throw new Error("Localized sitemap must include approved home, listing, location, seller, and contact pages");
}
const expectedSitemapEntries =
  sitemap.summary.home_pages +
  sitemap.summary.listing_entries +
  sitemap.summary.location_pages +
  sitemap.summary.seller_pages +
  sitemap.summary.contact_pages;
if (sitemap.summary.entries !== expectedSitemapEntries) {
  throw new Error("Localized sitemap route count must match approved route buckets");
}
if (sitemap.summary.byLocale.bg < 118 || sitemap.summary.byLocale.ru !== 57) {
  throw new Error("Localized sitemap must include published source BG/RU listings");
}
if (sitemap.summary.byLocale.el !== 5 || sitemap.summary.byLocale.he !== 5) {
  throw new Error("Localized sitemap must include approved Greek and Hebrew seeds");
}
if (sitemap.summary.byLocale.fr) throw new Error("Localized sitemap must not include unapproved French");

const sitemapXml = fs.readFileSync(fromRoot("production", "data", "sitemap.xml"), "utf8");
const robotsTxt = fs.readFileSync(fromRoot("production", "data", "robots.txt"), "utf8");
if (
  !sitemapXml.includes("/he/</loc>") ||
  !sitemapXml.includes("/he/properties/MS-CRAWL-0001") ||
  !sitemapXml.includes("/he/locations/sandanski") ||
  !sitemapXml.includes("/he/sell") ||
  !sitemapXml.includes("/he/contact") ||
  sitemapXml.includes("/fr/")
) {
  throw new Error("Sitemap XML must include approved Hebrew and exclude French");
}
if (!robotsTxt.includes("Sitemap:")) throw new Error("Robots must include sitemap URL");

const cmsSeed = JSON.parse(fs.readFileSync(fromRoot("production", "data", "cms-seed.json"), "utf8"));
if (cmsSeed.summary.listings !== 165) throw new Error("CMS seed must include 165 listings");
if (cmsSeed.summary.bySourceLocale.ru !== 52) throw new Error("CMS seed must include 52 RU source listings");
if (cmsSeed.summary.mediaAssets !== 4978) throw new Error("CMS seed must include listing media rows");
if (cmsSeed.summary.publicGalleryAssets <= 0 || cmsSeed.summary.mediaReviewGatedAssets <= 0) {
  throw new Error("CMS seed must split imported public photos from review-gated media");
}
if (cmsSeed.summary.videoCandidates !== 0) throw new Error("CMS seed must not invent listing videos from crawl media");
if (cmsSeed.summary.tourFields !== 165 || cmsSeed.summary.publicTours !== 0) {
  throw new Error("CMS seed must include draft 360 tour fields without publishing unreviewed tours");
}
if (cmsSeed.summary.deployableRoutes !== 0) throw new Error("CMS seed routes must stay review-gated");
if (cmsSeed.summary.translationLocales.fr) throw new Error("CMS seed must not include unapproved French translations");

const publicFixtures = JSON.parse(fs.readFileSync(fromRoot("production", "data", "public-fixtures.json"), "utf8"));
if (
  publicFixtures.website_language_coverage?.find((item) => item.market === "Israel")?.locale !== "he" ||
  publicFixtures.website_language_coverage?.find((item) => item.market === "Greece")?.locale !== "el"
) {
  throw new Error("Public fixtures must expose Greece and Israel website language coverage");
}
if (publicFixtures.listing_he.dir !== "rtl") throw new Error("Hebrew public fixture must render RTL");
if (publicFixtures.listing_el.path !== `/el/akinita/${publicFixtures.source_listing_id}`) {
  throw new Error("Greek listing fixture route missing");
}
if (publicFixtures.listing_fr_fallback.indexable !== false) throw new Error("French fallback listing must not be indexable");
if (publicFixtures.fallback_fr.indexable !== false) throw new Error("French language fallback must not be indexable");
if (
  publicFixtures.contact_he.path !== "/he/contact" ||
  publicFixtures.contact_he.body.callback.payload.source !== "website_contact_callback"
) {
  throw new Error("Public fixtures must include Hebrew contact callback page");
}
if (JSON.stringify(publicFixtures).match(/Sandanski sea|sea destination|Сандански море/i)) {
  throw new Error("Public fixtures must not introduce Sandanski sea framing");
}
if (JSON.stringify(publicFixtures.admin_ru.interface_locales.map((locale) => locale.code)) !== JSON.stringify(["bg", "ru", "en"])) {
  throw new Error("Admin fixture must expose only BG, RU, EN interface locales");
}

const adminFixtures = JSON.parse(fs.readFileSync(fromRoot("production", "data", "admin-fixtures.json"), "utf8"));
if (
  JSON.stringify(adminFixtures.locale_contract.required_admin_locales) !== JSON.stringify(["bg", "ru", "en"]) ||
  JSON.stringify(adminFixtures.locale_contract.admin_locales) !== JSON.stringify(["bg", "ru", "en"])
) {
  throw new Error("Admin fixture locale contract must expose BG, RU, EN admin locales");
}
if (
  adminFixtures.locale_contract.website_language_coverage?.find((item) => item.market === "Israel")?.locale !== "he" ||
  adminFixtures.locale_contract.website_language_coverage?.find((item) => item.market === "Greece")?.locale !== "el"
) {
  throw new Error("Admin fixture locale contract must expose Greece and Israel website language coverage");
}
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
if (adminFixtures.crm_inbox.buyer_he.contact_preference !== "whatsapp") {
  throw new Error("Admin fixture must preserve buyer contact preference");
}

const runtimeSmoke = JSON.parse(fs.readFileSync(fromRoot("production", "data", "runtime-smoke.json"), "utf8"));
if (runtimeSmoke.home_he.kind !== "home" || runtimeSmoke.home_he.body.search.path !== "/he/search") {
  throw new Error("Runtime smoke must expose Hebrew homepage search");
}
if (runtimeSmoke.home_he.body.seller.path !== "/he/sell") {
  throw new Error("Runtime smoke homepage must expose seller path");
}
if (runtimeSmoke.home_he.body.contact.path !== "/he/contact") {
  throw new Error("Runtime smoke homepage must expose contact path");
}
if (runtimeSmoke.listing_he.dir !== "rtl" || runtimeSmoke.listing_he.status !== 200) {
  throw new Error("Runtime smoke must render Hebrew listing as RTL 200");
}
if (runtimeSmoke.listing_he.body.media.tour.provider !== "photo-sphere-viewer" || runtimeSmoke.listing_he.body.media.tour.available !== false) {
  throw new Error("Runtime smoke must expose draft 360 tour field with fallback gallery");
}
if (runtimeSmoke.listing_he.body.media.gallery_count <= 0 || runtimeSmoke.listing_he.body.media.videos.length !== 0) {
  throw new Error("Runtime smoke must expose reviewed photo gallery without unreviewed videos");
}
if (
  runtimeSmoke.listing_he.body.actions?.primary?.find((action) => action.id === "callback")?.payload.source !==
    "website_callback_request" ||
  runtimeSmoke.listing_he.body.actions?.primary?.find((action) => action.id === "request_viewing")?.payload.source !==
    "website_viewing_request" ||
  runtimeSmoke.listing_he.body.actions?.direct_contact?.review_status !== "needs_broker_contact_review"
) {
  throw new Error("Runtime smoke must expose conversion actions without unreviewed broker contact data");
}
if (
  runtimeSmoke.sold_listing_he.status !== 200 ||
  runtimeSmoke.sold_listing_he.body.lifecycle?.active_in_search !== false ||
  runtimeSmoke.sold_listing_he.body.facts?.listing_status !== "sold" ||
  runtimeSmoke.sold_listing_he.body.related_listings.length < 1
) {
  throw new Error("Runtime smoke must keep sold listing pages live with related active listings");
}
if (
  runtimeSmoke.sold_search_he.cards.some((card) => card.id === "MS-CRAWL-0001") ||
  runtimeSmoke.sold_location_he.cards.some((card) => card.id === "MS-CRAWL-0001")
) {
  throw new Error("Runtime smoke must remove sold listings from active search and location inventory");
}
if (runtimeSmoke.fallback_fr.indexable !== false) throw new Error("Runtime smoke must keep French fallback non-indexable");
if (
  runtimeSmoke.contact_he.status !== 200 ||
  runtimeSmoke.contact_he.kind !== "contact" ||
  runtimeSmoke.contact_he.body.callback.payload.source !== "website_contact_callback"
) {
  throw new Error("Runtime smoke must expose contact callback page");
}
if (runtimeSmoke.lead_he.admin_locale !== "en") throw new Error("Runtime smoke lead must route to EN admin queue");
if (runtimeSmoke.lead_he.contact_preference !== "whatsapp") throw new Error("Runtime smoke lead must preserve contact preference");
if (
  runtimeSmoke.viewingLead_he.lead.source !== "website_viewing_request" ||
  runtimeSmoke.viewingLead_he.contact_preference !== "phone"
) {
  throw new Error("Runtime smoke viewing request lead must route through CRM");
}
if (
  runtimeSmoke.contactLead_he.lead.source !== "website_contact_callback" ||
  runtimeSmoke.contactLead_he.lead.leadType !== "general" ||
  runtimeSmoke.contactLead_he.contact_preference !== "phone"
) {
  throw new Error("Runtime smoke contact callback lead must route through CRM");
}
if (runtimeSmoke.search_he.cards.find((card) => card.id === "MS-CRAWL-0001")?.translation_display !== "reviewed_translation") {
  throw new Error("Runtime smoke search must show reviewed Hebrew translation state");
}
if (runtimeSmoke.search_he.search.total_matches <= runtimeSmoke.search_he.cards.length) {
  throw new Error("Runtime smoke search must expose total matches before pagination");
}

const httpSmoke = JSON.parse(fs.readFileSync(fromRoot("production", "data", "http-smoke.json"), "utf8"));
if (httpSmoke.legacyRedirect.status !== 301 || httpSmoke.legacyRedirect.headers.location !== "/bg/imoti/MS-CRAWL-0001") {
  throw new Error("HTTP smoke must serve approved legacy redirect");
}
if (
  httpSmoke.slugChange.status !== 201 ||
  httpSmoke.slugChange.body.old_path !== "/he/properties/old-sandanski-slug" ||
  httpSmoke.slugChange.body.new_path !== "/he/properties/MS-CRAWL-0001" ||
  httpSmoke.slugRedirect.status !== 301 ||
  httpSmoke.slugRedirect.headers.location !== "/he/properties/MS-CRAWL-0001"
) {
  throw new Error("HTTP smoke must create and serve listing slug-change redirects");
}
if (
  httpSmoke.home.status !== 200 ||
  httpSmoke.home.body.body.search.path !== "/he/search" ||
  !httpSmoke.homeHtml.body.includes("data-kind=\"home\"")
) {
  throw new Error("HTTP smoke must expose server-rendered Hebrew homepage");
}
if (httpSmoke.listing.status !== 200 || httpSmoke.listing.body.dir !== "rtl") {
  throw new Error("HTTP smoke must serve Hebrew listing as RTL 200");
}
if (httpSmoke.listing.body.body.actions?.secondary?.find((action) => action.id === "print")?.pdf_status !== "browser_print_ready") {
  throw new Error("HTTP smoke must expose browser-print action contract");
}
if (
  httpSmoke.listingHtml.status !== 200 ||
  !httpSmoke.listingHtml.body.includes("<html lang=\"he\" dir=\"rtl\">") ||
  !httpSmoke.listingHtml.body.includes("<link rel=\"canonical\"") ||
  httpSmoke.listingHtml.body.includes("tel:+359880000000")
) {
  throw new Error("HTTP smoke must expose SEO-safe listing HTML without unapproved direct contact");
}
if (
  httpSmoke.listingPrint.status !== 200 ||
  httpSmoke.listingPrint.headers["content-type"] !== "text/html; charset=utf-8" ||
  !httpSmoke.listingPrint.body.includes("data-kind=\"listing-print\"") ||
  !httpSmoke.listingPrint.body.includes("data-print-status=\"browser-pdf-ready\"") ||
  httpSmoke.listingPrint.body.includes("tel:+359880000000")
) {
  throw new Error("HTTP smoke must expose browser-print listing HTML without unapproved direct contact");
}
if (httpSmoke.searchHtml.status !== 200 || !httpSmoke.searchHtml.body.includes("data-kind=\"search\"")) {
  throw new Error("HTTP smoke must expose server-rendered search HTML");
}
if (
  httpSmoke.sellerPage.status !== 200 ||
  httpSmoke.sellerPage.body.body.valuation.payload.leadType !== "seller" ||
  !httpSmoke.sellerHtml.body.includes("data-lead-type=\"seller\"")
) {
  throw new Error("HTTP smoke must expose seller valuation page contract");
}
if (
  httpSmoke.contact.status !== 200 ||
  httpSmoke.contact.body.body.callback.payload.leadType !== "general" ||
  !httpSmoke.contactHtml.body.includes("data-lead-type=\"general\"")
) {
  throw new Error("HTTP smoke must expose contact callback page contract");
}
if (
  httpSmoke.brokerContact.status !== 201 ||
  httpSmoke.listingAfterBrokerContact.body.body.actions.direct_contact.review_status !== "approved_broker_contact" ||
  httpSmoke.listingAfterBrokerContact.body.body.actions.direct_contact.channels.some((channel) => !channel.enabled || !channel.href)
) {
  throw new Error("HTTP smoke must expose approved broker contact links");
}
if (
  httpSmoke.tourApproval.status !== 201 ||
  httpSmoke.tourApproval.body.is_public !== true ||
  httpSmoke.listingAfterTourApproval.body.body.media.tour.available !== true ||
  httpSmoke.listingAfterTourApproval.body.body.media.tour.mount_target !== "psv-listing-tour"
) {
  throw new Error("HTTP smoke must expose approved Photo Sphere Viewer tour only after review");
}
if (httpSmoke.languageRequest.status !== 201 || httpSmoke.languageRequest.body.requested_locale !== "fr") {
  throw new Error("HTTP smoke must accept French language request");
}
if (httpSmoke.lead.body.contact_preference !== "whatsapp") {
  throw new Error("HTTP smoke must preserve lead contact preference");
}
if (httpSmoke.savedSearch.status !== 201 || httpSmoke.savedSearch.body.alert_task?.status !== "open") {
  throw new Error("HTTP smoke must store one saved search alert task");
}
if (
  httpSmoke.ctaClick.status !== 201 ||
  httpSmoke.eventLedger.rows < 1 ||
  !httpSmoke.eventLedger.byType.page_view ||
  !httpSmoke.eventLedger.byType.search ||
  !httpSmoke.eventLedger.byType.lead_submitted ||
  !httpSmoke.eventLedger.byType.cta_click
) {
  throw new Error("HTTP smoke must persist privacy-safe page, search, lead, and CTA analytics events");
}
if (
  httpSmoke.searchFiltered.status !== 200 ||
  httpSmoke.searchFiltered.body.search.filters.property_type !== "apartment" ||
  httpSmoke.savedSearch.body.match_count <= 12
) {
  throw new Error("HTTP smoke must apply search filters and store full saved-search match counts");
}
if (
  httpSmoke.localeCreate.status !== 201 ||
  httpSmoke.localeCreate.body.locale.code !== "es" ||
  httpSmoke.localeCreate.body.locale.indexable !== false ||
  JSON.stringify(httpSmoke.localeCreate.body.required_admin_locales) !== JSON.stringify(["bg", "ru", "en"]) ||
  JSON.stringify(httpSmoke.localeCreate.body.admin_locales) !== JSON.stringify(["bg", "ru", "en"])
) {
  throw new Error("HTTP smoke must add non-indexable website locale without changing admin locales");
}
if (
  JSON.stringify(httpSmoke.localeCreate.body.required_public_locales) !== JSON.stringify(["bg", "en", "de", "nl", "ru", "el", "he"]) ||
  httpSmoke.localeCreate.body.website_language_coverage?.find((item) => item.market === "Israel")?.locale !== "he" ||
  httpSmoke.localeCreate.body.website_language_coverage?.find((item) => item.market === "Greece")?.locale !== "el"
) {
  throw new Error("HTTP smoke must preserve required public Greek and Israel Hebrew coverage");
}
if (httpSmoke.localeFallback.status !== 200 || httpSmoke.localeFallback.body.locale !== "en") {
  throw new Error("HTTP smoke must keep newly added locale fallback non-indexable");
}
if (httpSmoke.translationDraft.status !== 201 || httpSmoke.translationDraft.body.public_indexable !== false) {
  throw new Error("HTTP smoke must store non-indexable Hermes translation draft");
}
if (httpSmoke.translationPublish.status !== 201 || httpSmoke.translationPublish.body.public_indexable !== true) {
  throw new Error("HTTP smoke must publish human-approved translation");
}
if (
  httpSmoke.listingEditorHtml.status !== 200 ||
  !httpSmoke.listingEditorHtml.body.includes("data-kind=\"admin-listing-editor\"") ||
  !httpSmoke.listingEditorHtml.body.includes("data-editor-form=\"listing\"")
) {
  throw new Error("HTTP smoke must serve admin listing editor HTML");
}
if (httpSmoke.listingEdit.status !== 201 || httpSmoke.listingEdit.body.edit.stale_translation_count < 1) {
  throw new Error("HTTP smoke must stale dependent translations after listing edit");
}
if (httpSmoke.staleListing.status !== 200 || httpSmoke.staleListing.body.indexable !== false) {
  throw new Error("HTTP smoke must noindex stale public translation");
}
const httpStaleSearchCard = httpSmoke.staleSearch.body.cards.find((card) => card.id === "MS-CRAWL-0001");
if (
  httpSmoke.staleSearch.status !== 200 ||
  httpStaleSearchCard?.translation_display !== "stale_translation_fallback" ||
  httpStaleSearchCard?.translation_indexable !== false
) {
  throw new Error("HTTP smoke must mark stale search cards as fallback");
}
if (httpSmoke.lead.status !== 201 || httpSmoke.lead.body.admin_locale !== "en") {
  throw new Error("HTTP smoke must accept Hebrew lead into EN admin queue");
}
if (
  httpSmoke.lead.body.broker_assignment?.broker_id !== "broker_international" ||
  httpSmoke.lead.body.broker_assignment?.criteria?.location !== "Sandanski"
) {
  throw new Error("HTTP smoke must assign listing leads by language and listing facts");
}
if (
  httpSmoke.viewingLead.status !== 201 ||
  httpSmoke.viewingLead.body.lead.source !== "website_viewing_request" ||
  httpSmoke.viewingLead.body.contact_preference !== "phone" ||
  httpSmoke.viewingLead.body.broker_assignment?.broker_id !== "broker_international"
) {
  throw new Error("HTTP smoke must accept public viewing request leads");
}
if (
  httpSmoke.contactLead.status !== 201 ||
  httpSmoke.contactLead.body.lead.source !== "website_contact_callback" ||
  httpSmoke.contactLead.body.lead.leadType !== "general" ||
  httpSmoke.contactLead.body.contact_preference !== "phone"
) {
  throw new Error("HTTP smoke must accept public contact callback leads");
}
if (httpSmoke.leadLedger.rows !== 4) throw new Error("HTTP smoke must persist buyer, viewing, contact, and seller lead rows");
if (httpSmoke.sellerLead.status !== 201 || httpSmoke.sellerLead.body.lead.leadType !== "seller") {
  throw new Error("HTTP smoke must accept seller valuation lead");
}
if (httpSmoke.sellerLead.body.sellerPipeline?.stage !== "valuation_requested") {
  throw new Error("HTTP smoke must create seller valuation pipeline row");
}
if (httpSmoke.sitemap.status !== 200 || httpSmoke.sitemap.body.includes("/fr/")) {
  throw new Error("HTTP smoke must serve approved sitemap");
}
if (httpSmoke.admin.status !== 200 || httpSmoke.admin.body.workspace.locale !== "ru") {
  throw new Error("HTTP smoke must serve RU admin lead inbox");
}
if (
  httpSmoke.adminHtml.status !== 200 ||
  !httpSmoke.adminHtml.body.includes("data-kind=\"admin-lead-inbox\"") ||
  !httpSmoke.adminHtml.body.includes("data-interface-locales=\"bg,ru,en\"")
) {
  throw new Error("HTTP smoke must serve RU admin lead inbox HTML");
}
if (
  httpSmoke.adminMigrationReview.status !== 200 ||
  httpSmoke.adminMigrationReview.body.workspace.locale !== "bg" ||
  httpSmoke.adminMigrationReview.body.dashboard.media_reconciliation.media_rows !== 11859 ||
  httpSmoke.adminMigrationReview.body.routeMap.total !== 457 ||
  httpSmoke.adminMigrationReview.body.routeMap.mappedListings !== 165
) {
  throw new Error("HTTP smoke must expose admin migration review workbench");
}
if (httpSmoke.adminUnauthorized.status !== 401) throw new Error("HTTP smoke must reject unauthenticated admin lead inbox");
if (httpSmoke.reply.status !== 201 || httpSmoke.reply.body.status !== "queued_for_manual_send") {
  throw new Error("HTTP smoke must queue broker-approved reply");
}
if (httpSmoke.formReply.status !== 201 || httpSmoke.formReply.body.status !== "queued_for_manual_send") {
  throw new Error("HTTP smoke must queue form-encoded broker-approved reply");
}
if (httpSmoke.replyOutbox.rows !== 2) throw new Error("HTTP smoke must persist two reply outbox rows");
if (
  httpSmoke.viewing.status !== 201 ||
  httpSmoke.viewing.body.follow_up_task?.status !== "open" ||
  httpSmoke.viewing.body.feedback_request?.status !== "open"
) {
  throw new Error("HTTP smoke must book one viewing with follow-up and feedback tasks");
}
if (
  httpSmoke.dealClose.status !== 201 ||
  httpSmoke.dealClose.body.testimonial_request?.status !== "open" ||
  httpSmoke.dealClose.body.referral_request?.status !== "open"
) {
  throw new Error("HTTP smoke must close one deal with testimonial and referral tasks");
}
if (
  httpSmoke.viewingCalendar.status !== 200 ||
  !httpSmoke.viewingCalendar.body.includes("BEGIN:VCALENDAR") ||
  !httpSmoke.viewingCalendar.body.includes("DTSTART:20260706T100000Z")
) {
  throw new Error("HTTP smoke must export booked viewings as an admin calendar feed");
}
if (httpSmoke.viewingLedger.rows !== 1) throw new Error("HTTP smoke must persist one viewing row");
if (httpSmoke.savedSearchLedger.rows !== 1) throw new Error("HTTP smoke must persist one saved search row");
if (httpSmoke.sellerPipelineLedger.rows !== 1) throw new Error("HTTP smoke must persist one seller pipeline row");
if (httpSmoke.dealLedger.rows !== 1) throw new Error("HTTP smoke must persist one closed deal row");
if (httpSmoke.tourApprovalLedger.rows !== 1) throw new Error("HTTP smoke must persist one tour approval row");
if (!httpSmoke.eventLedger.byType.cta_click) throw new Error("HTTP smoke must persist one CTA analytics event row");
if (httpSmoke.languageRequestLedger.rows !== 1) throw new Error("HTTP smoke must persist one language request row");
if (httpSmoke.translationLedger.rows !== 3) throw new Error("HTTP smoke must persist draft, published, and stale translation rows");
if (httpSmoke.listingEditLedger.rows !== 1) throw new Error("HTTP smoke must persist one listing edit row");
if (httpSmoke.slugHistoryLedger.rows !== 1) throw new Error("HTTP smoke must persist one slug-history row");

const nodeServerSmoke = JSON.parse(fs.readFileSync(fromRoot("production", "data", "node-server-smoke.json"), "utf8"));
if (nodeServerSmoke.legacyRedirect.status !== 301 || nodeServerSmoke.legacyRedirect.headers.location !== "/bg/imoti/MS-CRAWL-0001") {
  throw new Error("Node server smoke must serve approved legacy redirect");
}
if (
  nodeServerSmoke.slugChange.status !== 201 ||
  nodeServerSmoke.slugChange.body.old_path !== "/he/properties/old-sandanski-slug" ||
  nodeServerSmoke.slugChange.body.new_path !== "/he/properties/MS-CRAWL-0001" ||
  nodeServerSmoke.slugRedirect.status !== 301 ||
  nodeServerSmoke.slugRedirect.headers.location !== "/he/properties/MS-CRAWL-0001"
) {
  throw new Error("Node server smoke must create and serve listing slug-change redirects");
}
if (
  nodeServerSmoke.home.status !== 200 ||
  nodeServerSmoke.home.body.body.search.path !== "/he/search" ||
  !nodeServerSmoke.homeHtml.body.includes("data-kind=\"home\"")
) {
  throw new Error("Node server smoke must expose server-rendered Hebrew homepage");
}
if (nodeServerSmoke.listing.status !== 200 || nodeServerSmoke.listing.body.dir !== "rtl") {
  throw new Error("Node server smoke must serve Hebrew listing as RTL 200");
}
if (
  nodeServerSmoke.tourApproval.status !== 201 ||
  nodeServerSmoke.tourApproval.body.is_public !== true ||
  nodeServerSmoke.listingAfterTourApproval.body.body.media.tour.available !== true ||
  nodeServerSmoke.listingAfterTourApproval.body.body.media.tour.mount_target !== "psv-listing-tour"
) {
  throw new Error("Node server smoke must expose approved Photo Sphere Viewer tour only after review");
}
if (nodeServerSmoke.badLead.status !== 400) throw new Error("Node server smoke must reject unknown buyer listing");
if (
  nodeServerSmoke.ctaClick.status !== 201 ||
  nodeServerSmoke.eventLedger.rows < 1 ||
  !nodeServerSmoke.eventLedger.byType.page_view ||
  !nodeServerSmoke.eventLedger.byType.search ||
  !nodeServerSmoke.eventLedger.byType.lead_submitted ||
  !nodeServerSmoke.eventLedger.byType.cta_click
) {
  throw new Error("Node server smoke must persist privacy-safe page, search, lead, and CTA analytics events");
}
if (
  nodeServerSmoke.viewingLead.status !== 201 ||
  nodeServerSmoke.viewingLead.body.lead.source !== "website_viewing_request" ||
  nodeServerSmoke.viewingLead.body.contact_preference !== "phone" ||
  nodeServerSmoke.viewingLead.body.broker_assignment?.broker_id !== "broker_international"
) {
  throw new Error("Node server smoke must accept public viewing request leads");
}
if (
  nodeServerSmoke.contact.status !== 200 ||
  nodeServerSmoke.contact.body.body.callback.payload.leadType !== "general" ||
  !nodeServerSmoke.contactHtml.body.includes("data-lead-type=\"general\"")
) {
  throw new Error("Node server smoke must expose contact callback page contract");
}
if (
  nodeServerSmoke.contactLead.status !== 201 ||
  nodeServerSmoke.contactLead.body.lead.source !== "website_contact_callback" ||
  nodeServerSmoke.contactLead.body.lead.leadType !== "general" ||
  nodeServerSmoke.contactLead.body.contact_preference !== "phone"
) {
  throw new Error("Node server smoke must accept public contact callback leads");
}
if (nodeServerSmoke.leadLedger.rows !== 4) throw new Error("Node server smoke must persist buyer, viewing, contact, and seller lead rows");
if (nodeServerSmoke.sellerLead.status !== 201 || nodeServerSmoke.sellerLead.body.lead.leadType !== "seller") {
  throw new Error("Node server smoke must accept seller valuation lead");
}
if (nodeServerSmoke.sellerLead.body.sellerPipeline?.stage !== "valuation_requested") {
  throw new Error("Node server smoke must create seller valuation pipeline row");
}
if (nodeServerSmoke.languageRequest.status !== 201 || nodeServerSmoke.languageRequest.body.requested_locale !== "fr") {
  throw new Error("Node server smoke must accept French language request");
}
if (nodeServerSmoke.savedSearch.status !== 201 || nodeServerSmoke.savedSearch.body.alert_task?.status !== "open") {
  throw new Error("Node server smoke must store one saved search alert task");
}
for (const response of [
  nodeServerSmoke.languageRequest,
  nodeServerSmoke.savedSearch,
  nodeServerSmoke.lead,
  nodeServerSmoke.viewingLead,
  nodeServerSmoke.contactLead,
  nodeServerSmoke.sellerLead,
  nodeServerSmoke.badLead,
]) {
  if (response.headers?.["cache-control"] !== "no-store") {
    throw new Error("Node server smoke must mark visitor form responses no-store");
  }
}
if (nodeServerSmoke.languageRequestLedger.rows !== 1) {
  throw new Error("Node server smoke must persist one language request row");
}
if (nodeServerSmoke.translationDraft.status !== 201 || nodeServerSmoke.translationDraft.body.public_indexable !== false) {
  throw new Error("Node server smoke must store non-indexable Hermes translation draft");
}
if (nodeServerSmoke.translationPublish.status !== 201 || nodeServerSmoke.translationPublish.body.public_indexable !== true) {
  throw new Error("Node server smoke must publish human-approved translation");
}
if (nodeServerSmoke.listingEdit.status !== 201 || nodeServerSmoke.listingEdit.body.edit.stale_translation_count < 1) {
  throw new Error("Node server smoke must stale dependent translations after listing edit");
}
if (nodeServerSmoke.staleListing.status !== 200 || nodeServerSmoke.staleListing.body.indexable !== false) {
  throw new Error("Node server smoke must noindex stale public translation");
}
const nodeStaleSearchCard = nodeServerSmoke.staleSearch.body.cards.find((card) => card.id === "MS-CRAWL-0001");
if (
  nodeServerSmoke.staleSearch.status !== 200 ||
  nodeStaleSearchCard?.translation_display !== "stale_translation_fallback" ||
  nodeStaleSearchCard?.translation_indexable !== false
) {
  throw new Error("Node server smoke must mark stale search cards as fallback");
}
if (nodeServerSmoke.translationLedger.rows !== 3) {
  throw new Error("Node server smoke must persist draft, published, and stale translation rows");
}
if (nodeServerSmoke.listingEditLedger.rows !== 1) {
  throw new Error("Node server smoke must persist one listing edit row");
}
if (nodeServerSmoke.robots.status !== 200 || !nodeServerSmoke.robots.body.includes("Sitemap:")) {
  throw new Error("Node server smoke must serve robots");
}
if (nodeServerSmoke.admin.status !== 200 || nodeServerSmoke.admin.body.workspace.locale !== "ru") {
  throw new Error("Node server smoke must serve RU admin lead inbox");
}
for (const response of [
  nodeServerSmoke.adminUnauthorized,
  nodeServerSmoke.replyUnauthorized,
  nodeServerSmoke.viewingUnauthorized,
  nodeServerSmoke.viewingCalendarUnauthorized,
  nodeServerSmoke.dealCloseUnauthorized,
]) {
  if (
    response.headers?.["cache-control"] !== "no-store" ||
    response.headers["www-authenticate"] !== 'Bearer realm="ms-realty-admin"'
  ) {
    throw new Error("Node server smoke must mark admin 401 responses private with a bearer challenge");
  }
}
if (nodeServerSmoke.reply.status !== 201 || nodeServerSmoke.reply.body.status !== "queued_for_manual_send") {
  throw new Error("Node server smoke must queue broker-approved reply");
}
if (
  nodeServerSmoke.viewing.status !== 201 ||
  nodeServerSmoke.viewing.body.follow_up_task?.status !== "open" ||
  nodeServerSmoke.viewing.body.feedback_request?.status !== "open"
) {
  throw new Error("Node server smoke must book one viewing with follow-up and feedback tasks");
}
if (
  nodeServerSmoke.dealClose.status !== 201 ||
  nodeServerSmoke.dealClose.body.testimonial_request?.status !== "open" ||
  nodeServerSmoke.dealClose.body.referral_request?.status !== "open"
) {
  throw new Error("Node server smoke must close one deal with testimonial and referral tasks");
}
if (
  nodeServerSmoke.viewingCalendar.status !== 200 ||
  !nodeServerSmoke.viewingCalendar.body.includes("BEGIN:VCALENDAR") ||
  !nodeServerSmoke.viewingCalendar.body.includes("DTSTART:20260706T100000Z")
) {
  throw new Error("Node server smoke must export booked viewings as an admin calendar feed");
}
if (nodeServerSmoke.viewingLedger.rows !== 1) throw new Error("Node server smoke must persist one viewing row");
if (nodeServerSmoke.savedSearchLedger.rows !== 1) throw new Error("Node server smoke must persist one saved search row");
if (nodeServerSmoke.sellerPipelineLedger.rows !== 1) throw new Error("Node server smoke must persist one seller pipeline row");
if (nodeServerSmoke.dealLedger.rows !== 1) throw new Error("Node server smoke must persist one closed deal row");
if (nodeServerSmoke.tourApprovalLedger.rows !== 1) throw new Error("Node server smoke must persist one tour approval row");
if (!nodeServerSmoke.eventLedger.byType.cta_click) throw new Error("Node server smoke must persist one CTA analytics event row");
if (nodeServerSmoke.slugHistoryLedger.rows !== 1) throw new Error("Node server smoke must persist one slug-history row");

const leadLedger = fs
  .readFileSync(fromRoot("production", "data", "lead-ledger.jsonl"), "utf8")
  .trim()
  .split("\n")
  .filter(Boolean)
  .map((line) => JSON.parse(line));
assertLeadLedger(leadLedger);
if (leadLedger.length !== 4) throw new Error("Lead ledger artifact must contain buyer, viewing, contact, and seller smoke rows");
const leadSla = JSON.parse(fs.readFileSync(fromRoot("production", "data", "lead-sla-report.json"), "utf8"));
assertLeadSlaReport(leadSla);
if (leadSla.summary.manager_escalation_required !== 2 || leadSla.summary.broker_replied !== 2) {
  throw new Error("Lead SLA report must create manager escalations only for unreplied missed leads");
}
const replyOutbox = fs.readFileSync(fromRoot("production", "data", "reply-outbox.jsonl"), "utf8").trim().split("\n").filter(Boolean);
if (replyOutbox.length !== 2) throw new Error("Reply outbox artifact must contain two deterministic smoke rows");
const languageRequests = fs.readFileSync(fromRoot("production", "data", "language-requests.jsonl"), "utf8").trim().split("\n").filter(Boolean);
if (languageRequests.length !== 1) throw new Error("Language request artifact must contain one deterministic smoke row");
const translationTasks = fs.readFileSync(fromRoot("production", "data", "translation-tasks.jsonl"), "utf8").trim().split("\n").filter(Boolean);
if (translationTasks.length !== 3) throw new Error("Translation task artifact must contain draft, published, and stale smoke rows");
const translationCoverage = JSON.parse(fs.readFileSync(fromRoot("production", "data", "translation-coverage-report.json"), "utf8"));
assertTranslationCoverageReport(translationCoverage);
if (
  translationCoverage.summary.open_translation_tasks !== 989 ||
  translationCoverage.summary.stale_translation_tasks !== 1 ||
  translationCoverage.summary.by_task_type.hermes_draft_required !== 658 ||
  translationCoverage.rows.find((row) => row.listing_id === "MS-CRAWL-0001" && row.target_locale === "el")?.task_type !==
    "stale_review_required"
) {
  throw new Error("Translation coverage report must open missing and stale translation review tasks");
}
const hermesAudit = fs
  .readFileSync(fromRoot("production", "data", "hermes-audit.jsonl"), "utf8")
  .trim()
  .split("\n")
  .filter(Boolean)
  .map((line) => JSON.parse(line));
if (hermesAudit.length !== 3) throw new Error("Hermes audit artifact must contain draft, published, and stale smoke rows");
assertHermesAuditLedger(hermesAudit);
const listingEdits = fs
  .readFileSync(fromRoot("production", "data", "listing-edits.jsonl"), "utf8")
  .trim()
  .split("\n")
  .filter(Boolean)
  .map((line) => JSON.parse(line));
if (!listingEdits.some((edit) => edit.listing_id === "MS-CRAWL-0001" && edit.patch?.description)) {
  throw new Error("Listing edit artifact must retain the deterministic description smoke row");
}
for (const listingId of ["MS-CRAWL-0013", "MS-CRAWL-0064"]) {
  const edit = listingEdits.find((row) => row.listing_id === listingId && row.patch?.location === "Hotovo");
  if (!edit?.source_hash_before || !edit?.source_hash_after) throw new Error(`Listing edit artifact missing reviewed Hotovo row for ${listingId}`);
}
const viewings = fs.readFileSync(fromRoot("production", "data", "viewings.jsonl"), "utf8").trim().split("\n").filter(Boolean);
if (viewings.length !== 1) throw new Error("Viewing artifact must contain one deterministic smoke row");
if (JSON.parse(viewings[0]).feedback_request?.status !== "open") {
  throw new Error("Viewing artifact must contain a post-viewing feedback request");
}
const savedSearches = fs.readFileSync(fromRoot("production", "data", "saved-searches.jsonl"), "utf8").trim().split("\n").filter(Boolean);
if (savedSearches.length !== 1) throw new Error("Saved search artifact must contain one deterministic smoke row");
const savedSearchAlerts = JSON.parse(fs.readFileSync(fromRoot("production", "data", "saved-search-alert-report.json"), "utf8"));
assertSavedSearchAlertReport(savedSearchAlerts);
if (
  savedSearchAlerts.summary.saved_searches !== 1 ||
  savedSearchAlerts.rows[0].saved_search_id !== "saved-search-he-0001" ||
  savedSearchAlerts.rows[0].current_match_count !== 41 ||
  savedSearchAlerts.rows[0].status !== "no_new_matches"
) {
  throw new Error("Saved-search alert report must evaluate the persisted Hebrew search without duplicate alerts");
}
const sellerPipeline = fs.readFileSync(fromRoot("production", "data", "seller-pipeline.jsonl"), "utf8").trim().split("\n").filter(Boolean);
if (sellerPipeline.length !== 1) throw new Error("Seller pipeline artifact must contain one deterministic smoke row");
const deals = fs.readFileSync(fromRoot("production", "data", "deals.jsonl"), "utf8").trim().split("\n").filter(Boolean);
if (deals.length !== 1) throw new Error("Deal artifact must contain one deterministic smoke row");
const deal = JSON.parse(deals[0]);
if (deal.testimonial_request?.status !== "open" || deal.referral_request?.status !== "open") {
  throw new Error("Deal artifact must contain testimonial and referral requests");
}
const tourApprovals = fs.readFileSync(fromRoot("production", "data", "tour-approvals.jsonl"), "utf8").trim().split("\n").filter(Boolean);
if (tourApprovals.length !== 1) throw new Error("Tour approval artifact must contain one deterministic smoke row");
const events = fs.readFileSync(fromRoot("production", "data", "events.jsonl"), "utf8").trim().split("\n").filter(Boolean);
if (events.length < 1) throw new Error("Event artifact must contain deterministic smoke rows");
const slugHistory = fs
  .readFileSync(fromRoot("production", "data", "slug-history.jsonl"), "utf8")
  .trim()
  .split("\n")
  .filter(Boolean)
  .map((line) => JSON.parse(line));
assertSlugHistory(slugHistory);
if (
  slugHistory.length !== 1 ||
  slugHistory[0].old_path !== "/he/properties/old-sandanski-slug" ||
  slugHistory[0].new_path !== "/he/properties/MS-CRAWL-0001"
) {
  throw new Error("Slug history artifact must contain the deterministic listing 301 row");
}

const seoEvidence = JSON.parse(fs.readFileSync(fromRoot("production", "data", "seo-evidence.json"), "utf8"));
if (seoEvidence.summary.crawl_urls !== 457 || seoEvidence.url_evidence.length !== 457) {
  throw new Error("SEO evidence joins must cover every crawled URL");
}
if (seoEvidence.summary.sources.privacy_events.status !== "imported") {
  throw new Error("SEO evidence joins must include privacy-aware analytics");
}
for (const source of ["search_console", "yandex_webmaster", "backlinks"]) {
  if (!seoEvidence.summary.missing_required_sources.includes(source)) {
    throw new Error(`SEO evidence joins must flag missing ${source} export before launch`);
  }
}

const structuredData = JSON.parse(fs.readFileSync(fromRoot("production", "data", "structured-data-report.json"), "utf8"));
if (structuredData.summary.listing_entries !== 167 || structuredData.summary.failing_entries !== 0) {
  throw new Error("Structured data report must cover all indexable listing entries without schema failures");
}
if (!Object.hasOwn(structuredData.summary.warnings, "missing_price")) {
  throw new Error("Structured data report must preserve the missing-price warning metric");
}

const listingQuality = JSON.parse(fs.readFileSync(fromRoot("production", "data", "listing-quality-report.json"), "utf8"));
if (listingQuality.summary.listings !== 165 || listingQuality.summary.affected_listings < 1) {
  throw new Error("Listing quality report must cover source listings and expose actionable content gaps");
}
if (
  !Object.hasOwn(listingQuality.summary.issue_counts, "missing_price") ||
  !Object.hasOwn(listingQuality.summary.issue_counts, "media_review_pending") ||
  !Object.hasOwn(listingQuality.summary.issue_counts, "missing_alt_text") ||
  !Object.hasOwn(listingQuality.summary.issue_counts, "tour_review_pending")
) {
  throw new Error("Listing quality report must keep price, media, alt text, and tour metrics actionable");
}
const listingPublication = JSON.parse(fs.readFileSync(fromRoot("production", "data", "listing-publication-report.json"), "utf8"));
assertListingPublicationReport(listingPublication);
if (
  listingPublication.summary.listings !== 165 ||
  listingPublication.summary.missing_sitemap_entries !== 0 ||
  !listingPublication.rows.find((row) => row.listing_id === "MS-CRAWL-0001")?.internal_link_suggestion_count
) {
  throw new Error("Listing publication report must prove sitemap coverage and internal-link suggestions");
}
const listingVerification = JSON.parse(fs.readFileSync(fromRoot("production", "data", "listing-verification-report.json"), "utf8"));
assertListingVerificationReport(listingVerification);
if (
  listingVerification.summary.edited_listings !== 165 ||
  listingVerification.summary.broker_verification_tasks !== 165 ||
  listingVerification.summary.by_owner.broker_bg !== 113 ||
  listingVerification.summary.by_owner.broker_ru !== 52 ||
  listingVerification.rows.find((row) => row.listing_id === "MS-CRAWL-0001")?.priority !== "high"
) {
  throw new Error("Listing verification report must create broker tasks for edited BG/RU listings");
}

const mobileQa = JSON.parse(fs.readFileSync(fromRoot("production", "data", "mobile-elderly-qa-report.json"), "utf8"));
if (mobileQa.status !== "pass" || mobileQa.summary.failed !== 0) {
  throw new Error("Mobile/elderly QA report must pass");
}
for (const id of ["mobile_search_form", "listing_sticky_actions", "admin_and_market_languages"]) {
  if (!mobileQa.checks.some((check) => check.id === id && check.status === "pass")) {
    throw new Error(`Mobile/elderly QA report missing ${id}`);
  }
}

const launchReadiness = JSON.parse(fs.readFileSync(fromRoot("production", "data", "launch-readiness.json"), "utf8"));
if (launchReadiness.launch_ready !== false || launchReadiness.status !== "blocked") {
  throw new Error("Launch readiness report must stay blocked until production blockers are cleared");
}
for (const blocker of ["external_seo_exports"]) {
  if (!launchReadiness.blockers.includes(blocker)) throw new Error(`Launch readiness report must include ${blocker}`);
}
if (launchReadiness.blockers.includes("redirect_reviews")) {
  throw new Error("Launch readiness report should not include redirect_reviews after all listing redirects are approved");
}
if (launchReadiness.blockers.includes("production_app_layer")) {
  throw new Error("Launch readiness report should not include production_app_layer after the Node adapter is present");
}

console.log("PASS: production foundation locale, SEO, Hermes, lead, search, migration, and public route contracts");
