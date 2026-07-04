import fs from "node:fs";
import path from "node:path";
import { assertHttpSmoke, createHttpApp, dispatchHttp } from "../lib/http.mjs";
import { assertLeadLedger, DEFAULT_LEAD_LEDGER_PATH, readLeadLedger, resetLeadLedger } from "../lib/lead-ledger.mjs";
import {
  assertLanguageRequests,
  DEFAULT_LANGUAGE_REQUEST_LEDGER_PATH,
  readLanguageRequests,
  resetLanguageRequests,
} from "../lib/language-requests.mjs";
import {
  assertTranslationLedger,
  DEFAULT_TRANSLATION_LEDGER_PATH,
  readTranslationLedger,
  resetTranslationLedger,
} from "../lib/translation-ledger.mjs";
import {
  assertListingEdits,
  DEFAULT_LISTING_EDIT_LEDGER_PATH,
  readListingEdits,
  resetListingEdits,
} from "../lib/listing-edits.mjs";
import {
  assertReplyOutbox,
  DEFAULT_REPLY_OUTBOX_PATH,
  readReplyOutbox,
  resetReplyOutbox,
} from "../lib/lead-replies.mjs";
import { loadLocaleRegistry } from "../lib/locales.mjs";
import { fromRoot } from "../lib/paths.mjs";

resetLeadLedger(DEFAULT_LEAD_LEDGER_PATH);
resetReplyOutbox(DEFAULT_REPLY_OUTBOX_PATH);
resetLanguageRequests(DEFAULT_LANGUAGE_REQUEST_LEDGER_PATH);
resetTranslationLedger(DEFAULT_TRANSLATION_LEDGER_PATH);
resetListingEdits(DEFAULT_LISTING_EDIT_LEDGER_PATH);
const localeRegistryPath = fromRoot("production", "data", "admin-locale-registry-smoke.json");
fs.writeFileSync(localeRegistryPath, `${JSON.stringify(loadLocaleRegistry(), null, 2)}\n`);
const app = createHttpApp({
  leadLedgerPath: DEFAULT_LEAD_LEDGER_PATH,
  replyOutboxPath: DEFAULT_REPLY_OUTBOX_PATH,
  languageRequestPath: DEFAULT_LANGUAGE_REQUEST_LEDGER_PATH,
  translationLedgerPath: DEFAULT_TRANSLATION_LEDGER_PATH,
  listingEditLedgerPath: DEFAULT_LISTING_EDIT_LEDGER_PATH,
  localeRegistryPath,
  receivedAt: "2026-07-04T00:00:00Z",
  requestedAt: "2026-07-04T00:01:00Z",
  editedAt: "2026-07-04T00:03:00Z",
  reviewedAt: "2026-07-04T00:05:00Z",
});
const legacyRedirect = JSON.parse(fs.readFileSync(fromRoot("production", "data", "deployable-redirects.json"), "utf8")).redirects[0];
const smoke = {
  fixture_id: "http-smoke-20260704",
  legacyRedirect: await dispatchHttp(app, { url: legacyRedirect.old_url }),
  listing: await dispatchHttp(app, { url: "/he/properties/MS-CRAWL-0001" }),
  search: await dispatchHttp(app, { url: "/api/search?locale=he&q=Sandanski" }),
  fallback: await dispatchHttp(app, { url: "/fr/" }),
  languageRequest: await dispatchHttp(app, {
    method: "POST",
    url: "/api/language-requests",
    body: {
      id: "language-request-fr-0001",
      requestedLocale: "fr",
      requestedPath: "/fr/",
      contact: { name: "Claire Martin" },
      message: "Please notify me when French property pages are reviewed.",
    },
  }),
  sitemap: await dispatchHttp(app, { url: "/sitemap.xml" }),
  robots: await dispatchHttp(app, { url: "/robots.txt" }),
  lead: await dispatchHttp(app, {
    method: "POST",
    url: "/api/leads",
    body: {
      id: "http-lead-he-0001",
      leadType: "buyer",
      language: "he",
      listingReference: "MS-CRAWL-0001",
      contact: { name: "Noa Levi" },
      message: "Interested in this property.",
    },
  }),
  sellerLead: await dispatchHttp(app, {
    method: "POST",
    url: "/api/leads",
    body: {
      id: "http-lead-seller-el-0001",
      source: "website_seller_valuation",
      leadType: "seller",
      language: "el",
      contact: { name: "Nikos Papadopoulos" },
      message: "I want a valuation for my property.",
    },
  }),
  admin: null,
  adminUnauthorized: null,
};
smoke.admin = await dispatchHttp(app, {
  url: "/api/admin/leads?locale=ru",
  headers: { authorization: "Bearer local-admin-smoke" },
});
smoke.adminUnauthorized = await dispatchHttp(app, { url: "/api/admin/leads?locale=ru" });
smoke.reply = await dispatchHttp(app, {
  method: "POST",
  url: "/api/admin/replies",
  headers: { authorization: "Bearer local-admin-smoke" },
  body: {
    id: "reply-http-lead-he-0001",
    leadId: "http-lead-he-0001",
    language: "he",
    hermesDraft: "Hermes draft for broker review.",
    reviewedReply: "Reviewed reply approved by broker.",
    reviewer: "broker_ru",
    approved: true,
  },
});
smoke.replyUnauthorized = await dispatchHttp(app, {
  method: "POST",
  url: "/api/admin/replies",
  body: { leadId: "http-lead-he-0001", reviewedReply: "No auth", reviewer: "broker_ru", approved: true },
});
smoke.translationDraft = await dispatchHttp(app, {
  method: "POST",
  url: "/api/admin/translations/draft",
  headers: { authorization: "Bearer local-admin-smoke" },
  body: {
    objectType: "listing",
    objectId: "MS-CRAWL-0001",
    sourceLocale: "bg",
    targetLocale: "el",
    sourceContent: {
      title: "Reviewed listing title",
      description: "Reviewed listing description for Sandanski.",
    },
    propertyFacts: { id: "MS-CRAWL-0001", location: "Sandanski" },
  },
});
smoke.translationPublish = await dispatchHttp(app, {
  method: "POST",
  url: "/api/admin/translations/publish",
  headers: { authorization: "Bearer local-admin-smoke" },
  body: {
    taskId: smoke.translationDraft.body.id,
    reviewer: "translator_el",
    approvedAt: "2026-07-04T00:02:00Z",
  },
});
smoke.listingEdit = await dispatchHttp(app, {
  method: "POST",
  url: "/api/admin/listings/edit",
  headers: { authorization: "Bearer local-admin-smoke" },
  body: {
    listingId: "MS-CRAWL-0001",
    editor: "editor_bg",
    patch: { description: "Updated approved source description." },
  },
});
smoke.staleListing = await dispatchHttp(app, { url: "/el/akinita/MS-CRAWL-0001" });
smoke.staleSearch = await dispatchHttp(app, { url: "/api/search?locale=el&q=Sandanski" });
smoke.localeCreate = await dispatchHttp(app, {
  method: "POST",
  url: "/api/admin/locales",
  headers: { authorization: "Bearer local-admin-smoke" },
  body: {
    code: "es",
    native_name: "Español",
    admin_name: "Spanish",
    route_segments: { listing: "propiedades", search: "buscar" },
  },
});
smoke.localeFallback = await dispatchHttp(app, { url: "/es/" });
smoke.admin = await dispatchHttp(app, {
  url: "/api/admin/leads?locale=ru",
  headers: { authorization: "Bearer local-admin-smoke" },
});

assertHttpSmoke(smoke);
const ledger = readLeadLedger(DEFAULT_LEAD_LEDGER_PATH);
assertLeadLedger(ledger);
smoke.leadLedger = { path: DEFAULT_LEAD_LEDGER_PATH, rows: ledger.length };
const outbox = readReplyOutbox(DEFAULT_REPLY_OUTBOX_PATH);
assertReplyOutbox(outbox);
smoke.replyOutbox = { path: DEFAULT_REPLY_OUTBOX_PATH, rows: outbox.length };
const languageRequests = readLanguageRequests(DEFAULT_LANGUAGE_REQUEST_LEDGER_PATH);
assertLanguageRequests(languageRequests);
smoke.languageRequestLedger = { path: DEFAULT_LANGUAGE_REQUEST_LEDGER_PATH, rows: languageRequests.length };
const translations = readTranslationLedger(DEFAULT_TRANSLATION_LEDGER_PATH);
assertTranslationLedger(translations);
smoke.translationLedger = { path: DEFAULT_TRANSLATION_LEDGER_PATH, rows: translations.length };
const listingEdits = readListingEdits(DEFAULT_LISTING_EDIT_LEDGER_PATH);
assertListingEdits(listingEdits);
smoke.listingEditLedger = { path: DEFAULT_LISTING_EDIT_LEDGER_PATH, rows: listingEdits.length };
smoke.localeRegistry = { path: localeRegistryPath, locales: loadLocaleRegistry(localeRegistryPath).locales.length };

const outPath = fromRoot("production", "data", "http-smoke.json");
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, `${JSON.stringify(smoke, null, 2)}\n`);
console.log(`Wrote HTTP smoke fixture to ${outPath}`);
