import { adminLocales, getLocale } from "./locales.mjs";
import { assertHermesActionAllowed, translationPrompt } from "./hermes.mjs";
import { createLeadDraft } from "./leads.mjs";
import { contentHash } from "./translations.mjs";

const ADMIN_COPY = {
  bg: {
    crm: "CRM",
    cms: "CMS",
    translationQueue: "Преводи за преглед",
    leadInbox: "Входящи запитвания",
  },
  ru: {
    crm: "CRM",
    cms: "CMS",
    translationQueue: "Переводы на проверку",
    leadInbox: "Входящие заявки",
  },
  en: {
    crm: "CRM",
    cms: "CMS",
    translationQueue: "Translation review",
    leadInbox: "Lead inbox",
  },
};

function adminLocaleFor(registry, requestedLocale) {
  const allowed = adminLocales(registry);
  const localeCode = allowed.includes(requestedLocale) ? requestedLocale : "en";
  return getLocale(registry, localeCode);
}

export function renderAdminWorkspace({ registry, requestedLocale = "en" }) {
  const locale = adminLocaleFor(registry, requestedLocale);
  const copy = ADMIN_COPY[locale.code] || ADMIN_COPY.en;

  return {
    kind: "admin_workspace",
    requested_locale: requestedLocale,
    locale: locale.code,
    lang: locale.code,
    dir: locale.direction,
    interface_locales: adminLocales(registry),
    modules: [
      { id: "crm", label: copy.crm, primary_view: copy.leadInbox },
      { id: "cms", label: copy.cms, primary_view: copy.translationQueue },
    ],
  };
}

export function createTranslationReviewTask(registry, input) {
  const target = getLocale(registry, input.targetLocale);
  const sourceLocale = input.sourceLocale || registry.source_locale;
  const sourceContent = input.sourceContent || {};
  const sourceText = [sourceContent.title, sourceContent.description, sourceContent.body].filter(Boolean).join("\n");
  if (!input.objectType || !input.objectId || !sourceText) {
    throw new Error("objectType, objectId, and source text are required");
  }

  assertHermesActionAllowed("draft_translation");
  const prompt = translationPrompt({
    sourceLocale,
    targetLocale: target.code,
    sourceText,
    propertyFacts: input.propertyFacts || {},
    glossary: input.glossary || {},
  });

  return {
    id: `translation-${input.objectType}-${input.objectId}-${target.code}`,
    object_type: input.objectType,
    object_id: input.objectId,
    source_locale: sourceLocale,
    target_locale: target.code,
    target_direction: target.direction,
    status: "hermes_drafted",
    source_hash: contentHash({ sourceLocale, sourceContent }),
    draft_hash: contentHash({ targetLocale: target.code, sourceContent, propertyFacts: input.propertyFacts || {} }),
    provider_mode: target.translation_provider_mode,
    reviewer_role: target.reviewer_role,
    public_indexable: false,
    requires_human_approval: true,
    hermes: {
      prompt,
      can_publish: false,
      can_mark_indexable: false,
    },
  };
}

export function approveTranslationTask(registry, task, reviewer, approvedAt = "2026-07-04T00:00:00Z") {
  const target = getLocale(registry, task.target_locale);
  if (!reviewer) throw new Error("reviewer is required");
  if (task.status !== "hermes_drafted" && task.status !== "human_edited") {
    throw new Error(`Cannot approve translation in state: ${task.status}`);
  }

  return {
    ...task,
    status: "approved",
    reviewer,
    approved_at: approvedAt,
    human_approved: true,
    public_indexable: Boolean(target.public_enabled && target.indexable),
  };
}

export function publishApprovedTranslation(registry, task) {
  getLocale(registry, task.target_locale);
  if (task.status !== "approved" || task.human_approved !== true) {
    throw new Error("Only human-approved translations can be published");
  }
  assertHermesActionAllowed("draft_translation");
  return {
    ...task,
    status: "published",
    published: true,
    public_indexable: task.public_indexable === true,
  };
}

export function createCrmInboxItem(registry, input) {
  assertHermesActionAllowed("draft_reply");
  const lead = createLeadDraft(registry, {
    id: input.id,
    source: input.source,
    leadType: input.leadType,
    language: input.language,
    listingReference: input.listingReference,
    contact: input.contact,
    message: input.message,
  });

  return {
    id: `inbox-${lead.id}`,
    lead,
    original_language: lead.language.language,
    original_direction: lead.language.direction,
    admin_locale: lead.language.adminLocale,
    requires_translation: lead.language.requiresTranslation,
    message_original: lead.message,
    hermes_reply_draft: {
      status: "draft",
      language: lead.language.language,
      broker_approval_required: true,
      can_send_without_approval: false,
    },
    views: {
      show_original_available: true,
      translated_draft_available: true,
    },
  };
}

export function buildAdminWorkflowFixture(registry, listing) {
  const sourceContent = {
    title: listing.h1 || listing.title,
    description: listing.description || listing.h1 || listing.title,
  };
  const propertyFacts = {
    id: listing.id,
    location: listing.location,
    price_eur: listing.price_eur,
    image_count: listing.image_count,
  };

  const hebrewTask = createTranslationReviewTask(registry, {
    objectType: "listing",
    objectId: listing.id,
    sourceLocale: listing.locale || registry.source_locale,
    targetLocale: "he",
    sourceContent,
    propertyFacts,
  });
  const greekTask = createTranslationReviewTask(registry, {
    objectType: "listing",
    objectId: listing.id,
    sourceLocale: listing.locale || registry.source_locale,
    targetLocale: "el",
    sourceContent,
    propertyFacts,
  });

  return {
    fixture_id: "admin-workflow-fixtures-20260704",
    workspaces: {
      bg: renderAdminWorkspace({ registry, requestedLocale: "bg" }),
      ru: renderAdminWorkspace({ registry, requestedLocale: "ru" }),
      en: renderAdminWorkspace({ registry, requestedLocale: "en" }),
      he_fallback: renderAdminWorkspace({ registry, requestedLocale: "he" }),
    },
    translation_tasks: {
      he_draft: hebrewTask,
      he_approved: approveTranslationTask(registry, hebrewTask, "translator_he"),
      el_draft: greekTask,
      el_published: publishApprovedTranslation(registry, approveTranslationTask(registry, greekTask, "translator_el")),
    },
    crm_inbox: {
      buyer_he: createCrmInboxItem(registry, {
        id: "lead-he-buyer-0001",
        source: "website_listing_detail",
        leadType: "buyer",
        language: "he",
        listingReference: listing.id,
        contact: { name: "Noa Levi" },
        message: "Interested in this listing.",
      }),
      seller_el: createCrmInboxItem(registry, {
        id: "lead-el-seller-0001",
        source: "website_seller_valuation",
        leadType: "seller",
        language: "el",
        contact: { name: "Nikos Papadopoulos" },
        message: "I want a valuation for my property.",
      }),
    },
  };
}
