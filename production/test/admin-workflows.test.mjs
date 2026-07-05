import test from "node:test";
import assert from "node:assert/strict";
import { findListingById, loadListings } from "../lib/content.mjs";
import { loadLocaleRegistry } from "../lib/locales.mjs";
import {
  approveTranslationTask,
  buildAdminWorkflowFixture,
  createCrmInboxItem,
  createTranslationReviewTask,
  publishApprovedTranslation,
  renderAdminWorkspace,
} from "../lib/admin-workflows.mjs";

const registry = loadLocaleRegistry();
const listing = findListingById(loadListings(), "MS-CRAWL-0001");

test("admin workspace is available in BG, RU, and EN with fallback for website-only languages", () => {
  assert.equal(renderAdminWorkspace({ registry, requestedLocale: "bg" }).locale, "bg");
  assert.equal(renderAdminWorkspace({ registry, requestedLocale: "ru" }).locale, "ru");
  assert.equal(renderAdminWorkspace({ registry, requestedLocale: "en" }).locale, "en");
  assert.equal(renderAdminWorkspace({ registry, requestedLocale: "he" }).locale, "en");
  assert.deepEqual(renderAdminWorkspace({ registry, requestedLocale: "ru" }).interface_locales, ["bg", "ru", "en"]);
});

test("Hermes translation tasks are drafts until human approval and publication", () => {
  const task = createTranslationReviewTask(registry, {
    objectType: "listing",
    objectId: listing.id,
    sourceLocale: "bg",
    targetLocale: "he",
    sourceContent: { title: listing.h1, description: listing.description || listing.h1 },
    propertyFacts: { id: listing.id, location: listing.location },
  });

  assert.equal(task.status, "hermes_drafted");
  assert.equal(task.public_indexable, false);
  assert.equal(task.hermes.can_publish, false);
  assert.match(task.hermes.prompt.rules.join(" "), /Do not describe Sandanski as a sea destination/);

  const approved = approveTranslationTask(registry, task, "translator_he");
  assert.equal(approved.status, "approved");
  assert.equal(approved.public_indexable, true);

  const published = publishApprovedTranslation(registry, approved);
  assert.equal(published.status, "published");
  assert.equal(published.public_indexable, true);
});

test("CRM inbox keeps original Greek and Hebrew lead language while routing admin work to EN", () => {
  const hebrew = createCrmInboxItem(registry, {
    id: "lead-he-buyer-test",
    source: "website_listing_detail",
    leadType: "buyer",
    language: "he",
    listingReference: listing.id,
    contact: { name: "Noa Levi" },
    contact_preference: "whatsapp",
    message: "Interested in the listing.",
  });
  const greek = createCrmInboxItem(registry, {
    id: "lead-el-seller-test",
    source: "website_seller_valuation",
    leadType: "seller",
    language: "el",
    contact: { name: "Nikos Papadopoulos" },
    message: "Please value my property.",
  });

  assert.equal(hebrew.original_language, "he");
  assert.equal(hebrew.original_direction, "rtl");
  assert.equal(hebrew.admin_locale, "en");
  assert.equal(hebrew.contact_preference, "whatsapp");
  assert.equal(hebrew.hermes_reply_draft.can_send_without_approval, false);
  assert.equal(greek.original_language, "el");
  assert.equal(greek.admin_locale, "en");
  assert.equal(greek.lead.leadType, "seller");
});

test("admin workflow fixture combines CMS translation review and CRM lead intake", () => {
  const fixture = buildAdminWorkflowFixture(registry, listing);

  assert.deepEqual(fixture.locale_contract.required_admin_locales, ["bg", "ru", "en"]);
  assert.deepEqual(fixture.locale_contract.admin_locales, ["bg", "ru", "en"]);
  assert.deepEqual(fixture.locale_contract.required_public_locales, ["bg", "en", "de", "nl", "ru", "el", "he"]);
  assert.equal(
    fixture.locale_contract.website_language_coverage.find((item) => item.market === "Israel").locale,
    "he",
  );
  assert.equal(
    fixture.locale_contract.website_language_coverage.find((item) => item.market === "Greece").locale,
    "el",
  );
  assert.equal(fixture.workspaces.ru.locale, "ru");
  assert.equal(fixture.workspaces.he_fallback.locale, "en");
  assert.equal(fixture.translation_tasks.he_draft.status, "hermes_drafted");
  assert.equal(fixture.translation_tasks.el_published.status, "published");
  assert.equal(fixture.crm_inbox.buyer_he.original_language, "he");
  assert.equal(fixture.crm_inbox.buyer_he.contact_preference, "whatsapp");
  assert.equal(fixture.crm_inbox.seller_el.lead.leadType, "seller");
});
