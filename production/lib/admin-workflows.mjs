import { adminLocales, getLocale, requiredAdminLocales, requiredPublicLocales, websiteLanguageCoverage } from "./locales.mjs";
import { assertHermesActionAllowed, translationPrompt, validateHermesTranslationDraft } from "./hermes.mjs";
import { assignLeadBroker, createLeadDraft, normalizeLeadInput } from "./leads.mjs";
import { contentHash } from "./translations.mjs";

const ADMIN_COPY = {
  bg: {
    workspaceTitle: "Администрация MS Realty",
    crm: "CRM",
    cms: "CMS",
    translationQueue: "Преводи за преглед",
    leadInbox: "Входящи запитвания",
    leadInboxDescription: "Входящи CRM запитвания с отговори, прегледани от брокер.",
    leadDetail: "Детайли на запитване",
    sellerPipeline: "Продавачески поток",
    sellerPipelineQueue: "Опашка за оценки от продавачи",
    sellerRequest: "Заявка от продавач",
    sellerStage: "Етап",
    appraisalAt: "Дата и час за оценка",
    sellerPipelineNote: "Бележка за продаваческия поток",
    callbackCompleted: "Завърши обратно обаждане",
    scheduleAppraisal: "Насрочи оценка",
    appraisalCompleted: "Завърши оценката",
    mandateSigned: "Запиши подписан договор",
    startListingDraft: "Започни чернова на обява",
    closeLost: "Затвори без сделка",
    noOpenSellerTasks: "Няма отворени задачи за оценка от продавачи.",
    sellerPipelineSaving: "Записване на резултата от продаваческия поток…",
    sellerPipelineSaved: "Резултатът от продаваческия поток е записан.",
    sellerPipelineSaveFailed: "Резултатът от продаваческия поток не можа да бъде записан.",
    brokerAssignment: "Разпределение към брокер",
    replyReview: "Преглед на отговор",
    propertyEditor: "Редактор на имоти",
    listingEditor: "Редактор на обяви",
    mediaReview: "Преглед на медия",
    localeRegistry: "Регистър на езици",
    redirectReview: "Преглед на пренасочвания",
    showOriginal: "Покажи оригинала",
    translatedDraft: "Преведен чернови отговор",
    approveReply: "Одобри отговор",
    saveDraft: "Запази чернова",
    approveTranslation: "Одобри превод",
    publishTranslation: "Публикувай превод",
    markStale: "Маркирай като остарял",
    createListing: "Създай обява",
    assignBroker: "Назначи брокер",
    leads: "Запитвания",
    repliesQueued: "Отговори в опашка",
    slaReminders: "SLA напомняния",
    managerEscalations: "Ескалации към мениджър",
    languageRequests: "Заявки за език",
    viewings: "Огледи",
    viewingFollowUps: "Последващи действия за оглед",
    openFollowUps: "Отворени последващи",
    overdueFollowUps: "Просрочени последващи",
    viewingFollowUpQueue: "Последващи действия след оглед",
    viewingStatus: "Статус на огледа",
    task: "Задача",
    dueAt: "Срок",
    nextViewingAt: "Нова дата за оглед",
    followUpNote: "Бележка за последващо действие",
    recordOutcome: "Запиши",
    complete: "Завърши",
    reschedule: "Пренасрочи",
    noShow: "Не се яви",
    addNote: "Добави бележка",
    feedback: "Обратна връзка",
    followUp: "Последващо действие",
    broker: "Брокер",
    noOpenFollowUps: "Няма отворени последващи действия за оглед.",
    viewingFollowUpSaving: "Записване на последващото действие…",
    viewingFollowUpSaved: "Последващото действие е записано.",
    viewingFollowUpSaveFailed: "Последващото действие не можа да бъде записано.",
    savedSearches: "Запазени търсения",
    leadQueues: "Опашки със запитвания",
    all: "Всички",
    needsReply: "Нуждае се от отговор",
    sla: "SLA",
    crmLeads: "CRM запитвания",
    lead: "Запитване",
    type: "Тип",
    source: "Източник",
    language: "Език",
    contact: "Контакт",
    escalationDue: "Срок за ескалация",
    reply: "Отговор",
    draftWithHermes: "Чернова с Hermes",
    hermesDraftText: "Текст на Hermes чернова",
    reviewer: "Проверяващ",
    reviewedReply: "Проверен отговор",
    queueReply: "Добави отговор в опашка",
    editorSections: "Секции на редактора",
    facts: "Факти",
    translations: "Преводи",
    media: "Медия",
    quality: "Качество",
    editor: "Редактор",
    editorNamePlaceholder: "Име на редактора",
    sourceContent: "Съдържание от източника",
    propertyDetails: "Данни за имота",
    commercialTerms: "Търговски условия",
    saveSourceEdit: "Запази редакция на източника",
    translationState: "Състояние на преводите",
    qualityStatus: "Качество",
    migrationReview: "Преглед на миграцията",
    launchEvidence: "Доказателства за пускане",
  },
  ru: {
    workspaceTitle: "Администрирование MS Realty",
    crm: "CRM",
    cms: "CMS",
    translationQueue: "Переводы на проверку",
    leadInbox: "Входящие заявки",
    leadInboxDescription: "Входящие заявки CRM с ответами, проверенными брокером.",
    leadDetail: "Детали заявки",
    sellerPipeline: "Воронка продавцов",
    sellerPipelineQueue: "Очередь оценок продавцов",
    sellerRequest: "Заявка продавца",
    sellerStage: "Этап",
    appraisalAt: "Дата и время оценки",
    sellerPipelineNote: "Заметка по воронке продавца",
    callbackCompleted: "Завершить обратный звонок",
    scheduleAppraisal: "Назначить оценку",
    appraisalCompleted: "Завершить оценку",
    mandateSigned: "Записать подписанный договор",
    startListingDraft: "Начать черновик объекта",
    closeLost: "Закрыть без сделки",
    noOpenSellerTasks: "Нет открытых задач по оценкам продавцов.",
    sellerPipelineSaving: "Сохранение результата воронки продавца…",
    sellerPipelineSaved: "Результат воронки продавца сохранен.",
    sellerPipelineSaveFailed: "Не удалось сохранить результат воронки продавца.",
    brokerAssignment: "Назначение брокера",
    replyReview: "Проверка ответа",
    propertyEditor: "Редактор объектов",
    listingEditor: "Редактор объявлений",
    mediaReview: "Проверка медиа",
    localeRegistry: "Реестр языков",
    redirectReview: "Проверка редиректов",
    showOriginal: "Показать оригинал",
    translatedDraft: "Переведенный черновик",
    approveReply: "Одобрить ответ",
    saveDraft: "Сохранить черновик",
    approveTranslation: "Одобрить перевод",
    publishTranslation: "Опубликовать перевод",
    markStale: "Отметить устаревшим",
    createListing: "Создать объявление",
    assignBroker: "Назначить брокера",
    leads: "Заявки",
    repliesQueued: "Ответы в очереди",
    slaReminders: "SLA напоминания",
    managerEscalations: "Эскалации менеджеру",
    languageRequests: "Языковые заявки",
    viewings: "Просмотры",
    viewingFollowUps: "Последующие действия по просмотру",
    openFollowUps: "Открытые последующие действия",
    overdueFollowUps: "Просроченные последующие действия",
    viewingFollowUpQueue: "Действия после просмотра",
    viewingStatus: "Статус просмотра",
    task: "Задача",
    dueAt: "Срок",
    nextViewingAt: "Новая дата просмотра",
    followUpNote: "Заметка о дальнейшем действии",
    recordOutcome: "Записать",
    complete: "Завершить",
    reschedule: "Перенести",
    noShow: "Не пришел",
    addNote: "Добавить заметку",
    feedback: "Обратная связь",
    followUp: "Последующее действие",
    broker: "Брокер",
    noOpenFollowUps: "Нет открытых последующих действий по просмотрам.",
    viewingFollowUpSaving: "Сохранение последующего действия…",
    viewingFollowUpSaved: "Последующее действие сохранено.",
    viewingFollowUpSaveFailed: "Не удалось сохранить последующее действие.",
    savedSearches: "Сохраненные поиски",
    leadQueues: "Очереди заявок",
    all: "Все",
    needsReply: "Нужен ответ",
    sla: "SLA",
    crmLeads: "CRM заявки",
    lead: "Заявка",
    type: "Тип",
    source: "Источник",
    language: "Язык",
    contact: "Контакт",
    escalationDue: "Срок эскалации",
    reply: "Ответ",
    draftWithHermes: "Черновик Hermes",
    hermesDraftText: "Текст черновика Hermes",
    reviewer: "Проверяющий",
    reviewedReply: "Проверенный ответ",
    queueReply: "Поставить ответ в очередь",
    editorSections: "Разделы редактора",
    facts: "Факты",
    translations: "Переводы",
    media: "Медиа",
    quality: "Качество",
    editor: "Редактор",
    editorNamePlaceholder: "Имя редактора",
    sourceContent: "Содержание из источника",
    propertyDetails: "Данные объекта",
    commercialTerms: "Коммерческие условия",
    saveSourceEdit: "Сохранить правку источника",
    translationState: "Состояние переводов",
    qualityStatus: "Качество",
    migrationReview: "Проверка миграции",
    launchEvidence: "Доказательства запуска",
  },
  en: {
    workspaceTitle: "MS Realty Admin",
    crm: "CRM",
    cms: "CMS",
    translationQueue: "Translation review",
    leadInbox: "Lead inbox",
    leadInboxDescription: "CRM lead inbox with broker-reviewed replies.",
    leadDetail: "Lead detail",
    sellerPipeline: "Seller pipeline",
    sellerPipelineQueue: "Seller valuation queue",
    sellerRequest: "Seller request",
    sellerStage: "Stage",
    appraisalAt: "Appraisal time",
    sellerPipelineNote: "Seller pipeline note",
    callbackCompleted: "Complete callback",
    scheduleAppraisal: "Schedule appraisal",
    appraisalCompleted: "Complete appraisal",
    mandateSigned: "Record mandate",
    startListingDraft: "Start listing draft",
    closeLost: "Close lost",
    noOpenSellerTasks: "No open seller valuation tasks.",
    sellerPipelineSaving: "Recording seller outcome…",
    sellerPipelineSaved: "Seller outcome recorded.",
    sellerPipelineSaveFailed: "Could not record seller outcome.",
    brokerAssignment: "Broker assignment",
    replyReview: "Reply review",
    propertyEditor: "Property editor",
    listingEditor: "Listing editor",
    mediaReview: "Media review",
    localeRegistry: "Locale registry",
    redirectReview: "Redirect review",
    showOriginal: "Show original",
    translatedDraft: "Translated draft",
    approveReply: "Approve reply",
    saveDraft: "Save draft",
    approveTranslation: "Approve translation",
    publishTranslation: "Publish translation",
    markStale: "Mark stale",
    createListing: "Create listing",
    assignBroker: "Assign broker",
    leads: "Leads",
    repliesQueued: "Replies queued",
    slaReminders: "SLA reminders",
    managerEscalations: "Manager escalations",
    languageRequests: "Language requests",
    viewings: "Viewings",
    viewingFollowUps: "Viewing follow-ups",
    openFollowUps: "Open follow-ups",
    overdueFollowUps: "Overdue follow-ups",
    viewingFollowUpQueue: "Post-viewing follow-ups",
    viewingStatus: "Viewing status",
    task: "Task",
    dueAt: "Due at",
    nextViewingAt: "New viewing time",
    followUpNote: "Follow-up note",
    recordOutcome: "Record",
    complete: "Complete",
    reschedule: "Reschedule",
    noShow: "No-show",
    addNote: "Add note",
    feedback: "Feedback",
    followUp: "Follow-up",
    broker: "Broker",
    noOpenFollowUps: "No open viewing follow-ups.",
    viewingFollowUpSaving: "Recording follow-up…",
    viewingFollowUpSaved: "Follow-up recorded.",
    viewingFollowUpSaveFailed: "Could not record follow-up.",
    savedSearches: "Saved searches",
    leadQueues: "Lead queues",
    all: "All",
    needsReply: "Needs reply",
    sla: "SLA",
    crmLeads: "CRM leads",
    lead: "Lead",
    type: "Type",
    source: "Source",
    language: "Language",
    contact: "Contact",
    escalationDue: "Escalation due",
    reply: "Reply",
    draftWithHermes: "Draft with Hermes",
    hermesDraftText: "Hermes draft text",
    reviewer: "Reviewer",
    reviewedReply: "Reviewed reply",
    queueReply: "Queue reply",
    editorSections: "Editor sections",
    facts: "Facts",
    translations: "Translations",
    media: "Media",
    quality: "Quality",
    editor: "Editor",
    editorNamePlaceholder: "Editor name",
    sourceContent: "Source content",
    propertyDetails: "Property details",
    commercialTerms: "Commercial terms",
    saveSourceEdit: "Save source edit",
    translationState: "Translation state",
    qualityStatus: "Quality",
    migrationReview: "Migration review",
    launchEvidence: "Launch evidence",
  },
};

function adminLocaleFor(registry, requestedLocale) {
  const allowed = adminLocales(registry);
  const localeCode = allowed.includes(requestedLocale) ? requestedLocale : "en";
  return getLocale(registry, localeCode);
}

function copyForAdminLocale(localeCode) {
  return ADMIN_COPY[localeCode] || ADMIN_COPY.en;
}

function adminControls(copy) {
  return {
    crm: [
      { id: "show_original", label: copy.showOriginal },
      { id: "translated_draft", label: copy.translatedDraft },
      { id: "approve_reply", label: copy.approveReply },
      { id: "assign_broker", label: copy.assignBroker },
    ],
    cms: [
      { id: "save_draft", label: copy.saveDraft },
      { id: "approve_translation", label: copy.approveTranslation },
      { id: "publish_translation", label: copy.publishTranslation },
      { id: "mark_stale", label: copy.markStale },
      { id: "create_listing", label: copy.createListing },
    ],
  };
}

export function adminSurfaceCatalog(registry, requestedLocale = "en") {
  const locale = adminLocaleFor(registry, requestedLocale);
  const copy = copyForAdminLocale(locale.code);
  const controls = adminControls(copy);

  return {
    requested_locale: requestedLocale,
    locale: locale.code,
    lang: locale.code,
    dir: locale.direction,
    title: copy.workspaceTitle,
    copy,
    interface_locales: adminLocales(registry),
    modules: [
      {
        id: "crm",
        label: copy.crm,
        screens: [
          { id: "lead_inbox", label: copy.leadInbox },
          { id: "lead_detail", label: copy.leadDetail },
          { id: "seller_pipeline", label: copy.sellerPipeline },
          { id: "broker_assignment", label: copy.brokerAssignment },
          { id: "reply_review", label: copy.replyReview },
        ],
        controls: controls.crm,
      },
      {
        id: "cms",
        label: copy.cms,
        screens: [
          { id: "property_editor", label: copy.propertyEditor },
          { id: "listing_editor", label: copy.listingEditor },
          { id: "media_review", label: copy.mediaReview },
          { id: "translation_queue", label: copy.translationQueue },
          { id: "locale_registry", label: copy.localeRegistry },
          { id: "redirect_review", label: copy.redirectReview },
        ],
        controls: controls.cms,
      },
    ],
  };
}

export function renderAdminWorkspace({ registry, requestedLocale = "en" }) {
  const locale = adminLocaleFor(registry, requestedLocale);
  const surface = adminSurfaceCatalog(registry, requestedLocale);

  return {
    kind: "admin_workspace",
    requested_locale: requestedLocale,
    locale: locale.code,
    lang: locale.code,
    dir: locale.direction,
    interface_locales: surface.interface_locales,
    title: surface.title,
    copy: surface.copy,
    modules: surface.modules.map((module) => ({
      id: module.id,
      label: module.label,
      primary_view: module.screens[0]?.label || module.label,
      screens: module.screens,
      controls: module.controls,
    })),
    surface,
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
  const sourceHash = contentHash({ sourceLocale, sourceContent });
  const sourceSnapshot = {
    object_type: input.objectType,
    object_id: input.objectId,
    source_locale: sourceLocale,
    source_hash: sourceHash,
    approved_legal_content: input.approvedLegalContent === true,
  };
  const prompt = translationPrompt({
    sourceLocale,
    targetLocale: target.code,
    sourceText,
    propertyFacts: input.propertyFacts || {},
    glossary: input.glossary || {},
  });
  const output = input.draftOutput
    ? validateHermesTranslationDraft({
        draft: input.draftOutput,
        propertyFacts: input.propertyFacts || {},
        sourceSnapshot,
      })
    : null;

  return {
    id: `translation-${input.objectType}-${input.objectId}-${target.code}`,
    object_type: input.objectType,
    object_id: input.objectId,
    source_locale: sourceLocale,
    target_locale: target.code,
    target_direction: target.direction,
    status: "hermes_drafted",
    source_hash: sourceHash,
    draft_hash: contentHash({ targetLocale: target.code, sourceContent, propertyFacts: input.propertyFacts || {} }),
    provider_mode: target.translation_provider_mode,
    reviewer_role: target.reviewer_role,
    public_indexable: false,
    requires_human_approval: true,
    hermes: {
      prompt,
      output,
      source_snapshot: sourceSnapshot,
      can_publish: false,
      can_mark_indexable: false,
    },
  };
}

function assertValidatedHermesDraftOutput(task) {
  const output = task.hermes?.output;
  if (
    !output ||
    output.status !== "hermes_drafted" ||
    output.public_indexable !== false ||
    output.source_snapshot?.source_hash !== task.source_hash
  ) {
    throw new Error("Validated Hermes draft output is required before approval");
  }
}

export function approveTranslationTask(registry, task, reviewer, approvedAt = "2026-07-04T00:00:00Z") {
  const target = getLocale(registry, task.target_locale);
  if (!reviewer) throw new Error("reviewer is required");
  if (task.status !== "hermes_drafted" && task.status !== "human_edited") {
    throw new Error(`Cannot approve translation in state: ${task.status}`);
  }
  assertValidatedHermesDraftOutput(task);

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
  assertValidatedHermesDraftOutput(task);
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
  const leadInput = normalizeLeadInput(input);
  const lead = createLeadDraft(registry, {
    id: leadInput.id,
    source: leadInput.source,
    intent: leadInput.intent,
    leadType: leadInput.leadType,
    language: leadInput.language,
    listingReference: leadInput.listingReference,
    contact: leadInput.contact,
    property: leadInput.property,
    contact_preference: leadInput.contact_preference,
    contactPreference: leadInput.contactPreference,
    preferred_channel: leadInput.preferred_channel,
    message: leadInput.message,
  });
  const brokerAssignment = assignLeadBroker(lead, {
    manualBrokerId: leadInput.manualBrokerId,
    brokerProfiles: leadInput.brokerProfiles,
    listingContext: leadInput.listingContext || { location: lead.property.location || null, property_type: lead.property.type || null },
  });

  return {
    id: `inbox-${lead.id}`,
    lead,
    original_language: lead.language.language,
    original_direction: lead.language.direction,
    admin_locale: lead.language.adminLocale,
    requires_translation: lead.language.requiresTranslation,
    contact_preference: lead.contact_preference,
    message_original: lead.message,
    broker_assignment: brokerAssignment,
    confirmation: {
      status: "ready",
      message_key: "lead_received",
      locale: lead.language.language,
      channel: lead.contact_preference || "broker_follow_up",
      requires_broker_follow_up: true,
    },
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
    property_type: listing.property_type,
    price_eur: listing.price_eur,
    image_count: listing.image_count,
  };
  const factText = Object.values(propertyFacts)
    .filter((value) => ["string", "number"].includes(typeof value))
    .map(String)
    .filter(Boolean)
    .join(" ");
  const draftOutput = (targetLocale) => ({
    title: `${listing.id} ${listing.location} ${targetLocale}`,
    body: `${factText} reviewed ${targetLocale} translation draft`,
    seo_title: `${listing.id} ${listing.location}`,
    meta_description: `${factText} reviewed ${targetLocale} translation draft for approved MS Realty listing content.`,
    citations: [{ source: "cms", field: "title" }],
  });

  const hebrewTask = createTranslationReviewTask(registry, {
    objectType: "listing",
    objectId: listing.id,
    sourceLocale: listing.locale || registry.source_locale,
    targetLocale: "he",
    sourceContent,
    propertyFacts,
    draftOutput: draftOutput("he"),
  });
  const greekTask = createTranslationReviewTask(registry, {
    objectType: "listing",
    objectId: listing.id,
    sourceLocale: listing.locale || registry.source_locale,
    targetLocale: "el",
    sourceContent,
    propertyFacts,
    draftOutput: draftOutput("el"),
  });

  return {
    fixture_id: "admin-workflow-fixtures-20260704",
    locale_contract: {
      required_admin_locales: requiredAdminLocales(registry),
      admin_locales: adminLocales(registry),
      required_public_locales: requiredPublicLocales(registry),
      website_language_coverage: websiteLanguageCoverage(registry),
    },
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
        listingContext: { location: listing.location, property_type: listing.property_type },
        contact: { name: "Noa Levi" },
        contact_preference: "whatsapp",
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
