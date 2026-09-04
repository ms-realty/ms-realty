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
const listing = findListingById(loadListings(), "MS-00815");

function hermesDraftOutput(propertyFacts, targetLocale = "he") {
  const factText = Object.values(propertyFacts)
    .filter((value) => ["string", "number"].includes(typeof value))
    .map(String)
    .filter(Boolean)
    .join(" ");
  return {
    title: `${propertyFacts.id} ${propertyFacts.location} ${targetLocale}`,
    body: `${factText} reviewed ${targetLocale} translation draft`,
    seo_title: `${propertyFacts.id} ${propertyFacts.location}`,
    meta_description: `${factText} reviewed ${targetLocale} translation draft for approved MS Realty listing content.`,
    citations: [{ source: "cms", field: "title" }],
  };
}

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
  const propertyFacts = { id: listing.id, location: listing.location };
  const draftOnlyTask = createTranslationReviewTask(registry, {
    objectType: "listing",
    objectId: listing.id,
    sourceLocale: "bg",
    targetLocale: "he",
    sourceContent: { title: listing.h1, description: listing.description || listing.h1 },
    propertyFacts,
  });

  assert.equal(draftOnlyTask.status, "hermes_drafted");
  assert.equal(draftOnlyTask.public_indexable, false);
  assert.equal(draftOnlyTask.hermes.can_publish, false);
  assert.match(draftOnlyTask.hermes.prompt.rules.join(" "), /Do not describe Sandanski as a sea destination/);
  assert.match(draftOnlyTask.hermes.prompt.forbiddenClaims.join(" "), /Sandanski/);
  assert.equal(draftOnlyTask.hermes.prompt.capabilities.requires_human_approval, true);
  assert.equal(draftOnlyTask.hermes.prompt.seoTargets.meta_description_max_chars, 160);
  assert.throws(() => approveTranslationTask(registry, draftOnlyTask, "translator_he"), /Validated Hermes draft output/);

  const task = createTranslationReviewTask(registry, {
    objectType: "listing",
    objectId: listing.id,
    sourceLocale: "bg",
    targetLocale: "he",
    sourceContent: { title: listing.h1, description: listing.description || listing.h1 },
    propertyFacts,
    draftOutput: hermesDraftOutput(propertyFacts, "he"),
  });

  const approved = approveTranslationTask(registry, task, "translator_he");
  assert.equal(approved.status, "approved");
  assert.equal(approved.public_indexable, true);

  const published = publishApprovedTranslation(registry, approved, "payload-owner", "2026-08-30T00:00:00+03:00");
  assert.equal(published.status, "published");
  assert.equal(published.public_indexable, true);
  assert.equal(published.description, approved.hermes.output.body);
  assert.equal(published.content_origin, "human_reviewed_hermes_draft");
  assert.equal(published.publication_authorized_by, "payload-owner");
  assert.equal(published.published_at, "2026-08-30T00:00:00+03:00");
});

test("human translation mode can be edited, approved, and published without impersonating Hermes", () => {
  const propertyFacts = { id: listing.id, location: listing.location };
  const task = createTranslationReviewTask(registry, {
    objectType: "listing",
    objectId: listing.id,
    sourceLocale: "bg",
    targetLocale: "en",
    draftSource: "human",
    reviewer: "editor_en",
    sourceContent: { title: listing.h1, description: listing.description || listing.h1 },
    propertyFacts,
    draftOutput: hermesDraftOutput(propertyFacts, "en"),
  });

  assert.equal(task.status, "human_edited");
  assert.equal(task.public_indexable, false);
  assert.equal("hermes" in task, false);
  assert.equal(task.human.editor, "editor_en");
  assert.equal(task.human.output.status, "human_edited");
  const approved = approveTranslationTask(registry, task, "editor_en");
  assert.equal(approved.status, "approved");
  assert.equal(publishApprovedTranslation(registry, approved).status, "published");

  assert.throws(
    () =>
      createTranslationReviewTask(registry, {
        objectType: "listing",
        objectId: listing.id,
        sourceLocale: "bg",
        targetLocale: "en",
        draftSource: "human",
        sourceContent: { title: listing.h1 },
      }),
    /reviewer is required/,
  );
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
    listingContext: { location: "Injected location", property_type: "injected_type" },
    contact: { name: "Noa Levi" },
    contact_preference: "whatsapp",
    message: "Interested in the listing.",
  }, {
    listingContext: { location: listing.location, property_type: listing.property_type },
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
  assert.equal(hebrew.broker_assignment.broker_id, null);
  assert.equal(hebrew.broker_assignment.status, "unassigned");
  assert.equal(hebrew.broker_assignment.method, "manager_queue");
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
  assert.equal(greek.broker_assignment.broker_id, null);
  assert.equal(greek.broker_assignment.method, "manager_queue");
  assert.equal(greek.confirmation.channel, "broker_follow_up");

  const manual = createCrmInboxItem(
    registry,
    {
      id: "lead-bg-manual-test",
      source: "website_listing_detail",
      leadType: "buyer",
      language: "bg",
      listingReference: listing.id,
      manualBrokerId: "untrusted-body-value",
      brokerProfiles: [{ id: "untrusted-body-value" }],
      contact: { name: "Manual Owner" },
    },
    { manualBrokerId: "broker-fixture", brokerProfiles: [{ id: "broker-fixture" }] },
  );
  assert.equal(manual.broker_assignment.broker_id, "broker-fixture");
  assert.equal(manual.broker_assignment.method, "manual_override");
  assert.throws(
    () =>
      createCrmInboxItem(
        registry,
        {
          id: "lead-bg-bad-manual-test",
          source: "website_listing_detail",
          leadType: "buyer",
          language: "bg",
          contact: { name: "Manual Owner" },
        },
        { manualBrokerId: "missing-broker", brokerProfiles: [{ id: "broker-fixture" }] },
      ),
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
  assert.equal(fixture.crm_inbox.buyer_he.broker_assignment.broker_id, null);
  assert.equal(fixture.crm_inbox.buyer_he.broker_assignment.method, "manager_queue");
  assert.equal(fixture.crm_inbox.buyer_he.confirmation.message_key, "lead_received");
  assert.equal(fixture.crm_inbox.seller_el.lead.leadType, "seller");
});
