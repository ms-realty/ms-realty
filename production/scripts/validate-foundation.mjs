import fs from "node:fs";
import { loadLocaleRegistry, assertLocaleRegistry, publicIndexableLocales } from "../lib/locales.mjs";
import { hreflangForListing } from "../lib/seo.mjs";
import { assertHermesActionAllowed } from "../lib/hermes.mjs";
import { createLeadDraft } from "../lib/leads.mjs";
import { assertMigrationLaunchGate } from "../lib/migration.mjs";
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

console.log("PASS: production foundation locale, SEO, Hermes, lead, and search contracts");
