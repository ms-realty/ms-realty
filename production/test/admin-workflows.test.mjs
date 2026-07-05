import test from "node:test";
import assert from "node:assert/strict";
import { findListingById, loadListings } from "../lib/content.mjs";
import { loadLocaleRegistry } from "../lib/locales.mjs";
import {
  adminSurfaceCatalog,
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

test("admin CRM and CMS surfaces have localized BG, RU, and EN labels", () => {
  const bg = adminSurfaceCatalog(registry, "bg");
  const ru = adminSurfaceCatalog(registry, "ru");
  const en = adminSurfaceCatalog(registry, "en");
  const moduleIds = (surface) => surface.modules.map((module) => module.id);
  const screenIds = (surface, moduleId) =>
    surface.modules.find((module) => module.id === moduleId).screens.map((screen) => screen.id);
  const controlIds = (surface, moduleId) =>
    surface.modules.find((module) => module.id === moduleId).controls.map((control) => control.id);

  assert.deepEqual(moduleIds(bg), ["crm", "cms"]);
  assert.deepEqual(moduleIds(ru), moduleIds(bg));
  assert.deepEqual(moduleIds(en), moduleIds(bg));
  assert.deepEqual(screenIds(ru, "crm"), screenIds(bg, "crm"));
  assert.deepEqual(screenIds(en, "cms"), screenIds(bg, "cms"));
  assert.deepEqual(controlIds(ru, "crm"), ["show_original", "translated_draft", "approve_reply", "assign_broker"]);
  assert.deepEqual(controlIds(en, "cms"), ["save_draft", "approve_translation", "publish_translation", "mark_stale", "create_listing"]);
  assert.equal(bg.modules.find((module) => module.id === "crm").screens[0].label, "Входящи запитвания");
  assert.equal(ru.modules.find((module) => module.id === "cms").screens[0].label, "Редактор объектов");
  assert.equal(en.modules.find((module) => module.id === "cms").screens[0].label, "Property editor");
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

test("Hermes draft output must preserve facts and source snapshot before review", () => {
  const task = createTranslationReviewTask(registry, {
    objectType: "listing",
    objectId: listing.id,
    sourceLocale: "bg",
    targetLocale: "el",
    sourceContent: { title: listing.h1, description: listing.description || listing.h1 },
    propertyFacts: { id: listing.id, location: "Sandanski" },
    draftOutput: {
      title: `${listing.id} Sandanski`,
      body: `${listing.id} Sandanski approved draft`,
      seo_title: `${listing.id} Sandanski`,
      meta_description: `${listing.id} Sandanski`,
      citations: [{ source: "cms", field: "title" }],
    },
  });

  assert.equal(task.hermes.output.status, "hermes_drafted");
  assert.equal(task.hermes.output.public_indexable, false);
  assert.equal(task.hermes.output.source_snapshot.source_hash, task.source_hash);
  assert.throws(
    () =>
      createTranslationReviewTask(registry, {
        objectType: "listing",
        objectId: listing.id,
        targetLocale: "he",
        sourceContent: { title: listing.h1, description: listing.description || listing.h1 },
        propertyFacts: { id: listing.id, location: "Sandanski" },
        draftOutput: {
          title: `${listing.id} Sandanski sea view`,
          body: `${listing.id} Sandanski beach property`,
          citations: [{ source: "cms", field: "title" }],
        },
      }),
    /Sandanski/,
  );
});

test("CRM inbox keeps original Greek and Hebrew lead language while routing admin work to EN", () => {
  const hebrew = createCrmInboxItem(registry, {
    id: "lead-he-buyer-test",
    source: "website_listing_detail",
    leadType: "buyer",
    language: "he",
    listingReference: listing.id,
    listingContext: { location: listing.location, property_type: listing.property_type },
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
  assert.equal(hebrew.broker_assignment.broker_id, "broker_international");
  assert.equal(hebrew.broker_assignment.method, "rules");
  assert.deepEqual(hebrew.broker_assignment.criteria, {
    language: "he",
    admin_locale: "en",
    location: listing.location,
    property_type: listing.property_type,
    lead_type: "buyer",
  });
  assert.deepEqual(hebrew.confirmation, {
    status: "ready",
    message_key: "lead_received",
    locale: "he",
    channel: "whatsapp",
    requires_broker_follow_up: true,
  });
  assert.equal(hebrew.hermes_reply_draft.can_send_without_approval, false);
  assert.equal(greek.original_language, "el");
  assert.equal(greek.admin_locale, "en");
  assert.equal(greek.lead.leadType, "seller");
  assert.equal(greek.broker_assignment.broker_id, "broker_international");
  assert.equal(greek.confirmation.channel, "broker_follow_up");

  const manual = createCrmInboxItem(registry, {
    id: "lead-bg-manual-test",
    source: "website_listing_detail",
    leadType: "buyer",
    language: "bg",
    listingReference: listing.id,
    manualBrokerId: "broker_ru",
    contact: { name: "Manual Owner" },
  });
  assert.equal(manual.broker_assignment.broker_id, "broker_ru");
  assert.equal(manual.broker_assignment.method, "manual_override");
  assert.throws(
    () =>
      createCrmInboxItem(registry, {
        id: "lead-bg-bad-manual-test",
        source: "website_listing_detail",
        leadType: "buyer",
        language: "bg",
        manualBrokerId: "missing_broker",
        contact: { name: "Manual Owner" },
      }),
    /manualBrokerId/,
  );
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
  assert.equal(fixture.crm_inbox.buyer_he.broker_assignment.broker_id, "broker_international");
  assert.equal(fixture.crm_inbox.buyer_he.confirmation.message_key, "lead_received");
  assert.equal(fixture.crm_inbox.seller_el.lead.leadType, "seller");
});
