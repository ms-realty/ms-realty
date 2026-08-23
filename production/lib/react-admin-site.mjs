import { createHash, randomUUID } from "node:crypto";
import { CANONICAL_PROPERTY_FAMILIES, isFactApplicable, propertyFamilyFor } from "./listing-facts.mjs";
import { h, renderStaticElement } from "./react-static-html.mjs";
import { Icon } from "./ui/icons.mjs";
import { LOGO_ASPECT, LOGO_URL_REVERSED } from "./ui/design-assets.mjs";

function adminCopy(page) {
  return page.workspace?.copy || {};
}

function label(copy, key, fallback) {
  return copy[key] || fallback;
}

function pageCan(page, capability) {
  const capabilities = page.workspace?.operator_capabilities;
  if (!Array.isArray(capabilities)) return true;
  return capabilities.includes("*") || capabilities.includes(capability);
}

const DURABLE_ONLY_NAV_IDS = new Set([
  "today",
  "lead_inbox",
  "realty_cases",
  "listing_manager",
  "translation_queue",
]);

function durableRuntimeMutationAvailable(page, pathname) {
  if (page.runtime_data_mode !== "durable_only") return true;
  return [
    "/api/admin/listings/edit",
    "/api/admin/listings/status",
    "/api/admin/cases",
    "/api/admin/cases/actions",
    "/api/admin/cases/conditions",
    "/api/admin/cases/conditions/actions",
  ].includes(pathname);
}

function adminHomeForPage(page) {
  const roles = page.workspace?.operator_roles || [];
  if (roles.includes("admin") || roles.includes("broker")) return "/admin/today";
  if (roles.includes("editor")) return "/admin/listings";
  if (roles.includes("translator")) return "/admin/translations";
  return "/admin";
}

// Design-workbench vocabulary that is not part of the domain workflow model.
// The CMS/CRM stays limited to BG, RU, and EN, so every visible operator label
// can be reviewed in the same locale set as the rest of the admin surface.
const ADMIN_UI_COPY = {
  bg: {
    urls: "URL адреси",
    reviewRequired: "Изисква преглед",
    mappedListings: "Свързани обяви",
    deployablePreview: "Преглед за публикуване",
    missingDescriptions: "Липсващи описания",
    mediaRows: "Медийни редове",
    search: "Търсене",
    migrationSubtitle: "Работно място за преглед на старите URL адреси, SEO доказателствата и решенията за пренасочване.",
    agencyDecisionQueue: "Опашка за решения на агенцията",
    agencyDecisionQueueNote: "Платформата може да работи в режим за производствен преглед, докато тези решения са отворени. Всяко публично действие остава блокирано, докато съответната опашка не бъде одобрена.",
    agencySafetyBoundary: "Защитна граница",
    reviewAction: "Преглед",
    agencyReviewOwners: {
      content_and_seo: "Съдържание и SEO",
      broker: "Брокер",
      translation_editors: "Редактори на преводи",
      seo_editor: "SEO редактор",
      agency_admin: "Администратор на агенцията",
    },
    agencyReviewLanes: {
      legacy_routes: { title: "Решения за старите URL адреси", guardrail: "Без смяна на DNS, докато всеки стар URL няма прегледано окончателно решение." },
      listing_quality: { title: "Данни и медии на обявите", guardrail: "Непрегледаните обяви остават блокирани за публикуване." },
      broker_verification: { title: "Проверка на обявите от брокер", guardrail: "Наличността, основните данни и SEO одобрението трябва да бъдат проверени преди публикуване." },
      broker_contacts: { title: "Одобрение на контактите на брокерите", guardrail: "Обявите използват безопасния общ контакт, докато независим проверен контакт не бъде одобрен." },
      translations: { title: "Преглед и одобрение на преводите", guardrail: "Черновите и липсващите преводи остават неиндексируеми до човешко одобрение и публикуване." },
      external_seo: { title: "Външни SEO доказателства", guardrail: "Преминаването от старите домейни остава блокирано, докато и двата домейна нямат прегледани изходни доказателства." },
      operational_signoff: { title: "Одобрение на мониторинга и възстановяването", guardrail: "Публичното пускане остава блокирано до налични производствени доказателства и задължителното одобрение от проверяващ." },
    },
    launch: "Пускане",
    nextActions: "следващи действия",
    noLaunchBlockers: "Няма блокери за пускане.",
    launchReadiness: "Готовност за пускане",
    launchInputChecklist: "Списък за пускане",
    preflightReports: "Проверки преди пускане",
    seoPreflight: "SEO проверка",
    liveServices: "Работещи услуги",
    liveProvisioning: "Настройка на услуги",
    payloadRuntime: "Payload среда",
    payloadBootstrap: "Payload начална настройка",
    productionRecovery: "Възстановяване на продукцията",
    runtimeEvidenceImports: "Импорт на доказателства от работеща среда",
    runtimeEvidenceHint: "Поставете само редактиран JSON отчет от реалната среда. Секрети не се приемат.",
    liveServiceReports: "Отчети за търсене и Hermes",
    redactedJsonReport: "Редактиран JSON отчет",
    reportSource: "Тип отчет",
    openStatus: "Отвори състоянието",
    downloadTemplate: "Изтегли шаблон",
    importReport: "Импортирай отчет",
    reportSaving: "Проверка и импорт…",
    reportSaved: "Отчетът е импортиран.",
    reportFailed: "Отчетът не можа да бъде импортиран.",
    csvContents: "CSV данни",
    cmsContracts: "CMS договори",
    payloadCollections: "Payload колекции",
    listingQuality: "Качество на обявите",
    exportLaunchReadiness: "Изтегли готовността",
    openLaunchEvidence: "Отвори файловете за пускане",
    openCsvTools: "Отвори CSV инструментите",
    openSeoImport: "Отвори SEO импорта",
    openQualityQueue: "Отвори опашката за качество",
    launchGates: {
      redirect_reviews: "преглед на старите URL адреси",
      external_seo_exports: "външни SEO данни",
      listing_quality_review: "преглед на качеството",
      live_services: "работещи услуги",
      monitoring_rollback: "наблюдение и връщане към предишна версия",
      payload_runtime: "работещ Payload",
      production_recovery: "аварийно възстановяване",
      local_preview_only: "само локален преглед",
    },
    reviewedDecisions: "Прегледани решения",
    pendingLegacyDecisions: "Чакащи решения за стари URL адреси",
    pendingLegacyHint: "Всеки стар URL трябва да има отделно човешко решение. Целите трябва да са публикувани, еквивалентни страници, никога начална страница или общо търсене.",
    sourceEvidence: "Данни от стария сайт",
    sourceTitle: "Заглавие",
    sourceHeading: "H1 заглавие",
    sourceCanonical: "Canonical",
    sourceMetrics: "Съдържание",
    sourceWords: "думи",
    sourceImages: "снимки",
    sourceLinks: "вътрешни връзки",
    openLegacyPage: "Отвори старата страница",
    openTargetPage: "Отвори целевата страница",
    reviewOwner: "Отговорник",
    requiredAction: "Нужно действие",
    approvableRedirects: "Пренасочвания за одобрение",
    oldUrl: "Стар URL",
    routeType: "Тип маршрут",
    target: "Цел",
    targetPath: "Целеви вътрешен път",
    locale: "Език",
    approval: "Одобрение",
    decision: "Решение",
    chooseDecision: "Избери решение",
    redirect301: "301 към еквивалентна страница",
    retain200: "Запази URL с 200",
    approved410: "Одобрено премахване с 410",
    equivalentContent: "Потвърждавам еквивалентно публикувано съдържание",
    reviewer: "Проверяващ",
    reason: "Причина",
    saveDecision: "Запази решението",
    routeDecisionSaving: "Записване на решението…",
    routeDecisionSaved: "Решението за стария URL е записано.",
    routeDecisionFailed: "Решението не беше записано.",
    noPendingLegacyDecisions: "Няма чакащи решения за стари URL адреси.",
    approve301: "Одобри 301",
    reviewedSameContent: "Проверено пренасочване към същото съдържание.",
    importRedirectCsv: "Импортирай проверен CSV за пренасочвания",
    downloadPendingWorkbook: "Изтегли чакащата таблица",
    redirectWorkbookHint: "Данните за старите страници са само за справка. Попълнете решение, потвърждение за еквивалентност, проверяващ и причина; непопълнените редове остават чакащи при импорт.",
    importCsv: "Импортирай CSV",
    exportRedirects: "Изтегли готовите пренасочвания",
    externalSeoEvidence: "Външни SEO данни",
    missingRequiredSources: "Липсващи задължителни източници",
    csvTemplate: "CSV шаблон",
    importSeoCsv: "Импортирай SEO CSV",
    listingQualityQueue: "Опашка за качество на обявите",
    downloadQualityWorkbook: "Изтегли таблицата за качество",
    downloadQualityDraft: "Изтегли черновата за проверка",
    importQualityCsv: "Импортирай CSV за качество",
    reviewListing: "Прегледай обявата",
    factsReviewer: "Проверил данните",
    mediaReviewer: "Проверил медиите",
    reviewNotes: "Бележки и източник на проверката",
    reviewNotesHint: "Опишете как данните и медиите са проверени.",
    saveListingReview: "Запази проверката",
    listingReviewSaving: "Записване на проверката…",
    listingReviewSaved: "Проверката е записана.",
    listingReviewFailed: "Проверката не беше записана.",
    issue: "Проблем",
    issues: "Проблеми",
    listing: "Обява",
    location: "Локация",
    propertyFamily: "Тип имот",
    publicPhoto: "Публична снимка",
    publicPhotos: "Публични снимки",
    selectListings: "Избери обяви",
    selectAllVisible: "Избери всички на страницата",
    clearSelection: "Изчисти избора",
    selectedListings: "{count} избрани",
    bulkStatus: "Статус за избраните",
    bulkStatusHint: "Промяната важи само за изрично избраните обяви на тази страница и се записва в одита.",
    updateSelected: "Промени избраните",
    chooseOption: "Избери",
    notSet: "Не е зададено",
    noData: "Няма данни",
    discardChanges: "Отмени промените",
    rangeTo: "до",
    listingChecks: "Пропуски и снимки",
    noLeads: "Все още няма запитвания.",
    noQueueMatches: "Няма запитвания в тази опашка.",
    noPipelineMatches: "Няма възможности в този изглед.",
    noTranslationTasks: "Няма задачи за превод за тези филтри.",
    noContacts: "Все още няма клиентски контакти.",
    noChecklists: "Все още няма процесни чеклисти.",
    selectLead: "Изберете запитване, за да видите детайлите.",
    backToList: "Към списъка",
    justNow: "сега",
    ageMinutes: "{n} мин",
    ageHours: "{n} ч",
    ageDays: "{n} д",
    received: "Получено",
    replyDue: "Отговор до",
    customerConfirmation: "Потвърждение към клиента",
    stageInquiry: "Нови запитвания",
    stageQualified: "Квалифицирани",
    stageViewing: "Огледи",
    stageOffer: "Оферта и договор",
    stageClosed: "Затворени и загубени",
    noCardsInStage: "Няма нищо на този етап.",
    withAccount: "С акаунт",
    withoutAccount: "Без акаунт",
    newAccountAction: "Нов акаунт",
    completedRequests: "Завършени и затворени",
    noFilterMatches: "Нищо не отговаря на този филтър.",
    noCommunicationYet: "Още няма разменени съобщения.",
    comingSoon: "Очаква се",
    savedViews: "Запазени изгледи",
    savedViewsDefault: "Всички запитвания",
    savedViewsNote: "Запазените изгледи чакат съхранен филтър за всеки оператор в настройките на работното пространство.",
    listTools: "Инструменти за списъка",
    bulkActions: "Групови действия",
    selectAllLeads: "Избери всички в този изглед",
    bulkAssign: "Възложи на брокер",
    bulkActionsNote: "Груповото възлагане и отлагане чакат партиден endpoint, който записва по едно одобрение на запитване.",
    snooze: "Отложи",
    snoozeNote: "Отлагането чака поле за срок в реда на запитването, за да не пропада SLA таймерът.",
    viewingLayout: "Изглед на графика",
    listView: "Списък",
    weekView: "Седмица",
    weekViewNote: "Седмичният календар чака заетостта на брокерите, за да показва свободните часове.",
    bulkStatusSaving: "Промяна на избраните обяви…",
    bulkStatusSaved: "Статусът на избраните обяви е променен.",
    bulkStatusFailed: "Статусът на избраните обяви не беше променен.",
    publicationSchedule: "Планирано публикуване",
    sellerPipelineNote: "Бележка по потока за продавача",
    publicationScheduleHint: "Публикуването и свалянето се одобряват от човек. Свалянето архивира обявата и запазва стария URL.",
    publicationAction: "Действие",
    publishListing: "Публикувай",
    unpublishListing: "Свали в архив",
    publicationTime: "Дата и час (София)",
    publishStatus: "Статус след публикуване",
    schedulePublication: "Планирай",
    runDuePublications: "Изпълни дължимите",
    scheduledPublications: "Предстоящи промени",
    noScheduledPublications: "Няма планирани промени.",
    cancelSchedule: "Отмени",
    cancellationReason: "Причина за отмяна",
    publicationSaving: "Записване на графика…",
    publicationSaved: "Графикът е записан.",
    publicationFailed: "Графикът не беше записан.",
    missingAlt: "Липсващ alt текст",
    reviewGatedMedia: "Медия за преглед",
    approvedRedirects: "Одобрени пренасочвания",
    source: "Източник",
    schema: "Схема",
    seoSettings: "SEO настройки за изходния език",
    listingWorkflow: "Проверка и публикуване",
    availabilityVerification: "Проверка на наличността",
    notVerified: "Не е проверена",
    publishApproval: "Одобрение за публикуване",
    approvedForPublishing: "Одобрена за публикуване",
    notApprovedForPublishing: "Не е одобрена",
    mediaManager: "Медиен мениджър",
    mediaManagerHint: "Всяка публична снимка, схема или видео изисква преглед от човек. Изходният URL се запазва в одита.",
    mediaDecision: "Решение",
    publishMedia: "Одобри за публично показване",
    keepMediaPrivate: "Остави скрито",
    mediaKind: "Тип медия",
    mediaAlt: "Alt текст или описание за достъпност",
    replacementUrl: "Проверен заместващ URL (по избор)",
    mediaReviewConfirmation: "Потвърждавам, че прегледах файла, типа и описанието.",
    reviewMediaAsset: "Прегледай файла",
    saveMediaReview: "Запази прегледа",
    mediaReviewSaving: "Записване на прегледа…",
    mediaReviewSaved: "Медийният преглед е записан.",
    mediaReviewFailed: "Медийният преглед не беше записан.",
    sourceAsset: "Изходен файл",
    noReviewableMedia: "Няма медийни файлове за преглед.",
    tour360: "360 обиколка",
    tourStatus: "Статус на обиколката",
    tourProvider: "Визуализатор на обиколката",
    tourPanoramaUrl: "URL на панорамата",
    tourViewerUrl: "URL на 3D визуализатора",
    tourThumbnailUrl: "URL на миниатюрата",
    tourAccessibilityCaption: "Описание за достъпност",
    tourReviewer: "Проверяващ",
    tourFallbackGallery: "Резервна фотогалерия",
    tourApprovalNotice: "Одобряването публикува обиколката само след ръчен преглед.",
    tourApprovalConfirmation: "Потвърждавам, че медията за обиколката, описанието и резервната галерия са прегледани.",
    tourApprovePublish: "Одобри и публикувай 360 обиколката",
    tourSaving: "Запазване...",
    tourSaved: "360 обиколката е одобрена.",
    tourSaveFailed: "360 обиколката не беше запазена.",
    replyDraftPending: "Подготвя се чернова само за брокера…",
    replyDraftReady: "Черновата е готова за преглед от брокер.",
    replyDraftFailed: "Черновата за брокера не беше подготвена.",
    replyDraftUnavailable: "Hermes не е настроен в тази среда. Използвайте одобрен шаблон или напишете отговора ръчно.",
    replyQueuePending: "Отговорът с одобрение от брокер се поставя на опашка…",
    replyQueueReady: "Отговорът е поставен на опашка за ръчно изпращане.",
    replyQueueFailed: "Провереният отговор не можа да бъде поставен на опашка.",
    communicationHistory: "История на комуникацията",
    communicationEvents: "събития",
    inboundRequest: "Получена заявка",
    approvedReply: "Одобрен отговор",
    deliverySent: "Изпратено",
    deliveryFailed: "Неуспешно изпращане",
    deliveryRequeue: "Върнато в опашката",
    noMessageBody: "Няма въведен текст.",
    replyTemplate: "Шаблон за отговор",
    chooseReplyTemplate: "Изберете проверим начален шаблон",
    templateReviewNotice: "Шаблонът е само начална точка. Проверете фактите и редактирайте текста преди одобрение.",
    skipToContent: "Към съдържанието",
    workspaceNavigation: "Навигация в работното пространство",
    operationsReports: "Оперативни отчети",
    actualResponses: "Действително изпратени отговори",
    responseRate: "Дял с изпратен отговор",
    medianResponse: "Медианно време за отговор",
    overdueWork: "Просрочена работа",
    leadVolume: "Обем на запитванията",
    bySource: "По източник",
    byLanguage: "По език",
    byType: "По тип",
    sourceQuality: "Качество на източниците",
    qualified: "Квалифицирани",
    viewingLeads: "С насрочен оглед",
    closedDeals: "Затворени сделки",
    conversion: "Конверсия",
    responseTime: "Време за отговор",
    average: "Средно",
    p90: "90-и персентил",
    withinSla: "В рамките на SLA",
    pipelines: "Потоци",
    workQueueHealth: "Състояние на работните опашки",
    queue: "Опашка",
    open: "Отворени",
    overdue: "Просрочени",
    blocked: "Блокирани",
    listingInventory: "Наличност на обявите",
    activeListings: "Активни обяви",
    translationReview: "Преводи за преглед",
    searchSignals: "Сигнали от търсенето",
    websiteFunnel: "Фуния на сайта",
    pageViews: "Преглеждания",
    ctaClicks: "Натискания на действие",
    funnelLeads: "Запитвания",
    searchesPer100Views: "Търсения на 100 преглеждания",
    ctaClickRate: "Дял на натисканията",
    leadConversion: "Конверсия към запитване",
    durableWebsiteLeads: "Реално записани запитвания",
    leadTrackingGap: "Разлика в измерването",
    searchEvents: "Търсения",
    zeroResults: "Без резултати",
    popularFilters: "Популярни филтри",
    downloadSourceReport: "Изтегли CSV по източници",
    privacySafeReport: "Отчетът използва оперативните регистри и не включва лични контакти или съобщения.",
    readOnlyAccess: "Достъп само за преглед за тази роля.",
    viewingFollowUpReadOnly: "Записването е скрито, докато надеждната история на действията не бъде включена.",
    minutesShort: "мин",
    noReportData: "Все още няма данни за този отчет.",
    auditActions: {
      media_reviewed: "Прегледан медиен файл",
      lead_assigned: "Запитването е пренасочено към брокер",
      account_created: "Създаден клиентски акаунт",
      contact_linked: "Контакт, свързан с акаунт",
      consent_withdrawn: "Оттеглено съгласие или известие",
      document_checklist_updated: "Обновен контролен списък за документи",
      lead_created: "Създадено запитване от брокер",
      broker_contact_approved: "Одобрен контакт на брокер", deal_closed: "Затворена сделка", deployable_redirects_exported: "Експортирани пренасочвания", hermes_model_call: "Заявена чернова от Hermes", launch_readiness_exported: "Експортирана готовност за пускане", listing_edited: "Редактирана обява", listing_publication_scheduled: "Планирана промяна на публикация", listing_publication_cancelled: "Отменена промяна на публикация", listing_publication_executed: "Изпълнена промяна на публикация", listing_quality_imported: "Импортиран преглед на качеството", listing_slug_changed: "Променен адрес на обява", lead_pipeline_outcome_recorded: "Записано действие за купувач или наемател", live_service_provisioning_report_imported: "Импортиран отчет за услугите", live_service_report_imported: "Импортиран отчет от работеща услуга", locale_created: "Добавен език", payload_runtime_report_imported: "Импортиран отчет от Payload", public_request_outcome_recorded: "Записан резултат за заявка от сайта", redirect_approval_created: "Одобрено пренасочване", redirect_approvals_imported: "Импортирани одобрения на пренасочвания", reply_approved: "Одобрен отговор", reply_delivery_recorded: "Записано изпращане на отговор", seller_pipeline_outcome_recorded: "Записан резултат за продавач", seo_evidence_imported: "Импортирани SEO данни", tour_approved: "Одобрена 360 обиколка", translation_drafted: "Създадена чернова на превод", translation_approved: "Одобрен превод", translation_published: "Публикуван превод", viewing_booked: "Насрочен оглед", viewing_follow_up_recorded: "Записано действие след оглед",
    },
    values: {
      website_listing_detail: "Запитване от обява", website_seller_valuation: "Заявка за оценка", website_callback_request: "Заявка за обратно обаждане", website_viewing_request: "Заявка за оглед", website_contact_callback: "Заявка за обратно обаждане", broker_phone: "Телефонно обаждане", broker_viber: "Viber", broker_whatsapp: "WhatsApp", broker_email: "Имейл", broker_walk_in: "Посещение в офис", partner_referral: "Партньорска препоръка", lead_response_sla: "SLA за отговор", buyer_renter_pipeline: "Купувачи и наематели", reply_delivery: "Изпращане на отговори", viewing_follow_up: "След оглед", seller_pipeline: "Продавачи", website_requests: "Заявки от сайта", translation_review: "Преглед на преводи", deal_aftercare: "След сделка",
      email: "Имейл", phone: "Телефон", whatsapp: "WhatsApp", viber: "Viber", sms: "SMS", other: "Друг канал", acknowledgement: "Потвърждение", viewing: "Оглед", callback: "Обратно обаждане", valuation: "Оценка",
    },
    statuses: {
      buyer: "Купувач", foreign_buyer: "Чуждестранен купувач", investor: "Инвеститор", renter: "Наемател", seller: "Продавач", landlord: "Наемодател", partner_referral: "Партньор / препоръка", pending: "В изчакване", ok: "В срок", ready: "Готово", blocked: "Блокирано", unknown: "Неизвестно",
      new: "Ново", inquiry: "Запитване", qualified: "Квалифицирано", viewing_booked: "Насрочен оглед", viewed: "Проведен оглед", offer: "Оферта", due_diligence: "Правна проверка", contract: "Договор", application: "Кандидатура", lease: "Договор за наем", lost: "Загубено",
      qualify: "Квалифициране", book_viewing: "Насрочване на оглед", complete_viewing: "Провеждане на оглед", record_offer: "Записване на оферта", start_due_diligence: "Начало на проверка", sign_contract: "Подписване на договор", record_application: "Записване на кандидатура", sign_lease: "Подписване на наем", close_deal: "Затваряне на сделка",
      cash: "В брой", mortgage: "Ипотека", preapproved: "Предварително одобрено", not_applicable: "Не е приложимо",
      published: "Публикувано", approved: "Одобрено", stale: "Остаряло", missing: "Липсва", present: "Налично",
      unverified: "Непроверена", available: "Налична", reserved: "Резервирана", sold: "Продадена", rented: "Отдадена", archived: "Архивирана", source_imported_review_required: "Внесена от източник - изисква преглед", review_required: "Изисква преглед", needs_panorama_upload: "Нужна е панорама",
      general: "Общо запитване", viewing: "Оглед", draft: "Чернова", ai_drafted: "AI чернова", human_edited: "Редактирано от човек", manager_escalation_required: "Нужна е ескалация към мениджър", reminder_required: "Напомняне за отговор", needs_reply: "Нужен отговор", queued: "В опашка", sent: "Изпратено", failed: "Неуспешно", open: "Отворено", contacted: "Осъществен контакт", completed: "Завършено", rescheduled: "Пренасрочено", no_show: "Не се яви", not_required: "Не е нужно", overdue: "Просрочено", valuation_requested: "Заявка за оценка", callback_completed: "Обратното обаждане е завършено", appraisal_scheduled: "Оценката е насрочена", appraisal_completed: "Оценката е завършена", mandate_signed: "Договорът е подписан", listing_draft_started: "Черновата на обявата е започната", offer_received: "Получена оферта", closed_lost: "Затворено без сделка", seller_callback: "Обратно обаждане към продавача", callback: "Обратно обаждане", appraisal: "Оценка", mandate: "Договор", listing_draft: "Чернова на обявата", listing_publish: "Публикуване на обявата", listing_offer: "Оферта за обявата", seller_close: "Приключване на продажбата", scheduled: "Насрочено", in_progress: "В процес", closed: "Затворено",
      commercial: "Търговски имот", multi_unit: "Апартаменти", apartment: "Апартамент", hotel: "Хотел", house: "Къща", plot: "Парцел", agricultural_land: "Земеделска земя", land: "Парцел", property: "Имот", sale: "Продажба", rent: "Наем",
      instant: "Веднага", daily: "Ежедневно", weekly: "Седмично",
      booked: "Насрочено", price_on_request: "Цена при запитване", hermes_drafted: "Чернова от Hermes", human_translation_required: "Нужен е човешки превод", hermes_draft_required: "Нужна е чернова от Hermes", external_import_required: "Нужен е външен превод", draft_review_required: "Чернова за преглед", stale_review_required: "Остарял превод за преглед", publish_required: "Одобрен превод за публикуване",
    },
    fields: { title: "Заглавие", h1: "Основно заглавие", description: "Описание", location: "Локация", property_type: "Тип имот", offer_type: "Тип оферта", listing_status: "Статус", price_eur: "Цена в EUR", price_on_request: "Цена при запитване", area_sqm: "Площ в m²", bedrooms: "Спални", bedrooms_not_applicable: "Спалните не са приложими", floor: "Етаж", total_floors: "Общо етажи", land_area_sqm: "Площ на парцела в m²", condition: "Състояние", location_precision: "Точност на локацията", availability_verified_at: "Наличността е проверена на", publish_approved: "Одобрена за публикуване", seo_title: "SEO заглавие", seo_description: "Meta описание", seo_canonical: "Canonical път", seo_og_title: "Open Graph заглавие", seo_og_description: "Open Graph описание", seo_robots: "Robots", seo_review_confirmed: "SEO е прегледано и одобрено от човек", option_yes: "Да", option_no: "Не", option_area_only: "Само район", option_approximate: "Приблизителна локация", option_exact: "Точна локация", media_kind_photo: "Снимка", media_kind_floor_plan: "План", media_kind_video: "Видео" },
  },
  ru: {
    urls: "URL-адреса",
    reviewRequired: "Требует проверки",
    mappedListings: "Связанные объекты",
    deployablePreview: "Предпросмотр для публикации",
    missingDescriptions: "Нет описаний",
    mediaRows: "Строки медиа",
    search: "Поиск",
    migrationSubtitle: "Рабочее место для проверки старых URL, SEO-доказательств и решений по редиректам.",
    agencyDecisionQueue: "Очередь решений агентства",
    agencyDecisionQueueNote: "Платформа может работать в режиме производственной проверки, пока эти решения остаются открытыми. Любое публичное действие остается заблокированным, пока соответствующая очередь не будет одобрена.",
    agencySafetyBoundary: "Граница безопасности",
    reviewAction: "Проверить",
    agencyReviewOwners: {
      content_and_seo: "Контент и SEO",
      broker: "Брокер",
      translation_editors: "Редакторы переводов",
      seo_editor: "SEO-редактор",
      agency_admin: "Администратор агентства",
    },
    agencyReviewLanes: {
      legacy_routes: { title: "Решения по старым URL", guardrail: "Не менять DNS, пока для каждого старого URL не принято проверенное окончательное решение." },
      listing_quality: { title: "Данные и медиа объектов", guardrail: "Непроверенные объекты остаются заблокированными для публикации." },
      broker_verification: { title: "Проверка объектов брокером", guardrail: "Доступность, основные данные и SEO-одобрение должны быть проверены до публикации." },
      broker_contacts: { title: "Одобрение контактов брокеров", guardrail: "Объекты используют безопасный общий контакт, пока независимый проверенный контакт не будет одобрен." },
      translations: { title: "Проверка и одобрение переводов", guardrail: "Черновики и отсутствующие переводы не индексируются до одобрения человеком и публикации." },
      external_seo: { title: "Внешние SEO-доказательства", guardrail: "Переход со старых доменов остается заблокированным, пока по обоим доменам не проверены исходные доказательства." },
      operational_signoff: { title: "Одобрение мониторинга и восстановления", guardrail: "Публичный запуск остается заблокированным до появления производственных доказательств и обязательного одобрения проверяющим." },
    },
    launch: "Запуск",
    nextActions: "следующих действий",
    noLaunchBlockers: "Нет блокеров запуска.",
    launchReadiness: "Готовность к запуску",
    launchInputChecklist: "Чек-лист запуска",
    preflightReports: "Предпусковые проверки",
    seoPreflight: "SEO-проверка",
    liveServices: "Рабочие сервисы",
    liveProvisioning: "Настройка сервисов",
    payloadRuntime: "Среда Payload",
    payloadBootstrap: "Начальная настройка Payload",
    productionRecovery: "Восстановление production-среды",
    runtimeEvidenceImports: "Импорт доказательств рабочей среды",
    runtimeEvidenceHint: "Вставьте только очищенный JSON-отчет из реальной среды. Секреты не принимаются.",
    liveServiceReports: "Отчеты поиска и Hermes",
    redactedJsonReport: "Очищенный JSON-отчет",
    reportSource: "Тип отчета",
    openStatus: "Открыть состояние",
    downloadTemplate: "Скачать шаблон",
    importReport: "Импортировать отчет",
    reportSaving: "Проверка и импорт…",
    reportSaved: "Отчет импортирован.",
    reportFailed: "Не удалось импортировать отчет.",
    csvContents: "Содержимое CSV",
    cmsContracts: "Контракты CMS",
    payloadCollections: "Коллекции Payload",
    listingQuality: "Качество объектов",
    exportLaunchReadiness: "Скачать готовность",
    openLaunchEvidence: "Открыть файлы запуска",
    openCsvTools: "Открыть инструменты CSV",
    openSeoImport: "Открыть импорт SEO",
    openQualityQueue: "Открыть очередь качества",
    launchGates: {
      redirect_reviews: "проверка старых URL",
      external_seo_exports: "внешние SEO-данные",
      listing_quality_review: "проверка качества объектов",
      live_services: "рабочие сервисы",
      monitoring_rollback: "мониторинг и откат",
      payload_runtime: "рабочая среда Payload",
      production_recovery: "аварийное восстановление",
      local_preview_only: "только локальный просмотр",
    },
    reviewedDecisions: "Проверенные решения",
    pendingLegacyDecisions: "Ожидающие решения по старым URL",
    pendingLegacyHint: "Для каждого старого URL нужно отдельное решение человека. Целью может быть только опубликованная эквивалентная страница, а не главная и не общий поиск.",
    sourceEvidence: "Данные со старого сайта",
    sourceTitle: "Заголовок",
    sourceHeading: "Заголовок H1",
    sourceCanonical: "Canonical",
    sourceMetrics: "Содержимое",
    sourceWords: "слов",
    sourceImages: "изображений",
    sourceLinks: "внутренних ссылок",
    openLegacyPage: "Открыть старую страницу",
    openTargetPage: "Открыть целевую страницу",
    reviewOwner: "Ответственный",
    requiredAction: "Нужное действие",
    approvableRedirects: "Редиректы для одобрения",
    oldUrl: "Старый URL",
    routeType: "Тип маршрута",
    target: "Цель",
    targetPath: "Целевой внутренний путь",
    locale: "Язык",
    approval: "Одобрение",
    decision: "Решение",
    chooseDecision: "Выберите решение",
    redirect301: "301 на эквивалентную страницу",
    retain200: "Сохранить URL с 200",
    approved410: "Подтвержденное удаление с 410",
    equivalentContent: "Подтверждаю эквивалентный опубликованный контент",
    reviewer: "Проверяющий",
    reason: "Причина",
    saveDecision: "Сохранить решение",
    routeDecisionSaving: "Сохраняем решение…",
    routeDecisionSaved: "Решение по старому URL сохранено.",
    routeDecisionFailed: "Не удалось сохранить решение.",
    noPendingLegacyDecisions: "Нет ожидающих решений по старым URL.",
    approve301: "Одобрить 301",
    reviewedSameContent: "Проверенное перенаправление на тот же контент.",
    importRedirectCsv: "Импортировать проверенный CSV редиректов",
    downloadPendingWorkbook: "Скачать таблицу ожидания",
    redirectWorkbookHint: "Данные старых страниц приведены только для справки. Заполните решение, подтверждение эквивалентности, проверяющего и причину; незаполненные строки при импорте останутся в очереди.",
    importCsv: "Импортировать CSV",
    exportRedirects: "Скачать готовые редиректы",
    externalSeoEvidence: "Внешние SEO-данные",
    missingRequiredSources: "Отсутствующие обязательные источники",
    csvTemplate: "Шаблон CSV",
    importSeoCsv: "Импортировать SEO CSV",
    listingQualityQueue: "Очередь качества объектов",
    downloadQualityWorkbook: "Скачать таблицу качества",
    downloadQualityDraft: "Скачать черновик проверки",
    importQualityCsv: "Импортировать CSV качества",
    reviewListing: "Проверить объект",
    factsReviewer: "Проверил данные",
    mediaReviewer: "Проверил медиа",
    reviewNotes: "Заметки и источник проверки",
    reviewNotesHint: "Опишите, как были проверены данные и медиа.",
    saveListingReview: "Сохранить проверку",
    listingReviewSaving: "Сохраняем проверку…",
    listingReviewSaved: "Проверка сохранена.",
    listingReviewFailed: "Не удалось сохранить проверку.",
    issue: "Проблема",
    issues: "Проблемы",
    listing: "Объект",
    location: "Локация",
    propertyFamily: "Тип объекта",
    publicPhoto: "Публичное фото",
    publicPhotos: "Публичные фото",
    selectListings: "Выбрать объекты",
    selectAllVisible: "Выбрать все на странице",
    clearSelection: "Снять выбор",
    selectedListings: "Выбрано: {count}",
    bulkStatus: "Статус выбранных",
    bulkStatusHint: "Изменение применяется только к явно выбранным объектам на этой странице и записывается в аудит.",
    updateSelected: "Изменить выбранные",
    chooseOption: "Выберите",
    notSet: "Не указано",
    noData: "Нет данных",
    discardChanges: "Отменить изменения",
    rangeTo: "до",
    listingChecks: "Пробелы и фото",
    noLeads: "Запросов пока нет.",
    noQueueMatches: "В этой очереди нет запросов.",
    noPipelineMatches: "В этом представлении нет возможностей.",
    noTranslationTasks: "Нет задач перевода для этих фильтров.",
    noContacts: "Клиентских контактов пока нет.",
    noChecklists: "Процессных чек-листов пока нет.",
    selectLead: "Выберите заявку, чтобы увидеть детали.",
    backToList: "К списку",
    justNow: "сейчас",
    ageMinutes: "{n} мин",
    ageHours: "{n} ч",
    ageDays: "{n} д",
    received: "Получено",
    replyDue: "Ответ до",
    customerConfirmation: "Подтверждение клиенту",
    stageInquiry: "Новые заявки",
    stageQualified: "Квалифицированы",
    stageViewing: "Просмотры",
    stageOffer: "Предложение и договор",
    stageClosed: "Закрытые и потерянные",
    noCardsInStage: "На этом этапе ничего нет.",
    withAccount: "С аккаунтом",
    withoutAccount: "Без аккаунта",
    newAccountAction: "Новый аккаунт",
    completedRequests: "Завершённые и закрытые",
    noFilterMatches: "Ничего не подходит под этот фильтр.",
    noCommunicationYet: "Сообщений пока не было.",
    comingSoon: "Скоро",
    savedViews: "Сохранённые виды",
    savedViewsDefault: "Все заявки",
    savedViewsNote: "Сохранённые виды ждут хранимый фильтр для каждого оператора в настройках рабочего пространства.",
    listTools: "Инструменты списка",
    bulkActions: "Групповые действия",
    selectAllLeads: "Выбрать все в этом виде",
    bulkAssign: "Назначить брокеру",
    bulkActionsNote: "Групповое назначение и откладывание ждут пакетный endpoint, который пишет по одному подтверждению на заявку.",
    snooze: "Отложить",
    snoozeNote: "Откладывание ждёт поле срока в записи заявки, чтобы таймер SLA не сбрасывался.",
    viewingLayout: "Вид расписания",
    listView: "Список",
    weekView: "Неделя",
    weekViewNote: "Недельный календарь ждёт занятость брокеров, чтобы показывать свободные часы.",
    bulkStatusSaving: "Изменяем выбранные объекты…",
    bulkStatusSaved: "Статус выбранных объектов изменен.",
    bulkStatusFailed: "Не удалось изменить статус выбранных объектов.",
    publicationSchedule: "Отложенная публикация",
    sellerPipelineNote: "Заметка по воронке продавца",
    publicationScheduleHint: "Публикация и снятие подтверждаются человеком. Снятие архивирует объект и сохраняет старый URL.",
    publicationAction: "Действие",
    publishListing: "Опубликовать",
    unpublishListing: "Снять в архив",
    publicationTime: "Дата и время (София)",
    publishStatus: "Статус после публикации",
    schedulePublication: "Запланировать",
    runDuePublications: "Выполнить наступившие",
    scheduledPublications: "Предстоящие изменения",
    noScheduledPublications: "Нет запланированных изменений.",
    cancelSchedule: "Отменить",
    cancellationReason: "Причина отмены",
    publicationSaving: "Сохраняем расписание…",
    publicationSaved: "Расписание сохранено.",
    publicationFailed: "Не удалось сохранить расписание.",
    missingAlt: "Нет alt-текста",
    reviewGatedMedia: "Медиа на проверке",
    approvedRedirects: "Одобренные редиректы",
    source: "Источник",
    schema: "Схема",
    seoSettings: "SEO для исходного языка",
    listingWorkflow: "Проверка и публикация",
    availabilityVerification: "Проверка доступности",
    notVerified: "Не проверена",
    publishApproval: "Одобрение публикации",
    approvedForPublishing: "Одобрено к публикации",
    notApprovedForPublishing: "Не одобрено",
    mediaManager: "Медиаменеджер",
    mediaManagerHint: "Каждое публичное фото, план или видео требует проверки человеком. Исходный URL сохраняется в аудите.",
    mediaDecision: "Решение",
    publishMedia: "Одобрить для публикации",
    keepMediaPrivate: "Оставить скрытым",
    mediaKind: "Тип медиа",
    mediaAlt: "Alt-текст или описание доступности",
    replacementUrl: "Проверенный URL замены (необязательно)",
    mediaReviewConfirmation: "Подтверждаю, что проверил файл, тип и описание.",
    reviewMediaAsset: "Проверить файл",
    saveMediaReview: "Сохранить проверку",
    mediaReviewSaving: "Сохранение проверки…",
    mediaReviewSaved: "Проверка медиа сохранена.",
    mediaReviewFailed: "Не удалось сохранить проверку медиа.",
    sourceAsset: "Исходный файл",
    noReviewableMedia: "Нет медиафайлов для проверки.",
    tour360: "360 тур",
    tourStatus: "Статус тура",
    tourProvider: "Просмотр тура",
    tourPanoramaUrl: "URL панорамы",
    tourViewerUrl: "URL 3D-просмотра",
    tourThumbnailUrl: "URL миниатюры",
    tourAccessibilityCaption: "Описание для доступности",
    tourReviewer: "Проверяющий",
    tourFallbackGallery: "Резервная фотогалерея",
    tourApprovalNotice: "Одобрение публикует тур только после ручной проверки.",
    tourApprovalConfirmation: "Подтверждаю, что медиа тура, описание и резервная галерея проверены.",
    tourApprovePublish: "Одобрить и опубликовать 360 тур",
    tourSaving: "Сохранение...",
    tourSaved: "360 тур одобрен.",
    tourSaveFailed: "Не удалось сохранить 360 тур.",
    replyDraftPending: "Готовим черновик только для брокера…",
    replyDraftReady: "Черновик готов к проверке брокером.",
    replyDraftFailed: "Не удалось подготовить черновик для брокера.",
    replyDraftUnavailable: "Hermes не настроен в этой среде. Используйте утверждённый шаблон или напишите ответ вручную.",
    replyQueuePending: "Ответ, одобренный брокером, ставится в очередь…",
    replyQueueReady: "Ответ поставлен в очередь для ручной отправки.",
    replyQueueFailed: "Не удалось поставить проверенный ответ в очередь.",
    communicationHistory: "История коммуникации",
    communicationEvents: "событий",
    inboundRequest: "Полученная заявка",
    approvedReply: "Одобренный ответ",
    deliverySent: "Отправлено",
    deliveryFailed: "Ошибка отправки",
    deliveryRequeue: "Возвращено в очередь",
    noMessageBody: "Текст не указан.",
    replyTemplate: "Шаблон ответа",
    chooseReplyTemplate: "Выберите проверяемый начальный шаблон",
    templateReviewNotice: "Шаблон: только отправная точка. Проверьте факты и отредактируйте текст перед одобрением.",
    skipToContent: "К содержанию",
    workspaceNavigation: "Навигация по рабочему пространству",
    operationsReports: "Операционные отчеты",
    actualResponses: "Фактически отправленные ответы",
    responseRate: "Доля с отправленным ответом",
    medianResponse: "Медианное время ответа",
    overdueWork: "Просроченная работа",
    leadVolume: "Объем заявок",
    bySource: "По источнику",
    byLanguage: "По языку",
    byType: "По типу",
    sourceQuality: "Качество источников",
    qualified: "Квалифицировано",
    viewingLeads: "С назначенным просмотром",
    closedDeals: "Закрытые сделки",
    conversion: "Конверсия",
    responseTime: "Время ответа",
    average: "Среднее",
    p90: "90-й перцентиль",
    withinSla: "В пределах SLA",
    pipelines: "Воронки",
    workQueueHealth: "Состояние рабочих очередей",
    queue: "Очередь",
    open: "Открыто",
    overdue: "Просрочено",
    blocked: "Заблокировано",
    listingInventory: "Состояние объектов",
    activeListings: "Активные объекты",
    translationReview: "Переводы на проверке",
    searchSignals: "Сигналы поиска",
    websiteFunnel: "Воронка сайта",
    pageViews: "Просмотры",
    ctaClicks: "Клики по действиям",
    funnelLeads: "Заявки",
    searchesPer100Views: "Поисков на 100 просмотров",
    ctaClickRate: "Доля кликов",
    leadConversion: "Конверсия в заявку",
    durableWebsiteLeads: "Реально записанные заявки",
    leadTrackingGap: "Разница измерения",
    searchEvents: "Поиски",
    zeroResults: "Без результатов",
    popularFilters: "Популярные фильтры",
    downloadSourceReport: "Скачать CSV по источникам",
    privacySafeReport: "Отчет использует операционные журналы и не включает личные контакты или сообщения.",
    readOnlyAccess: "Для этой роли доступен только просмотр.",
    viewingFollowUpReadOnly: "Запись скрыта, пока не включено надежное хранение истории действий.",
    minutesShort: "мин",
    noReportData: "Для этого отчета пока нет данных.",
    auditActions: {
      media_reviewed: "Медиафайл проверен",
      lead_assigned: "Заявка переназначена брокеру",
      account_created: "Создан клиентский аккаунт",
      contact_linked: "Контакт связан с аккаунтом",
      consent_withdrawn: "Согласие или уведомление отозвано",
      document_checklist_updated: "Обновлен чек-лист документов",
      lead_created: "Заявка создана брокером",
      broker_contact_approved: "Одобрен контакт брокера", deal_closed: "Сделка закрыта", deployable_redirects_exported: "Редиректы экспортированы", hermes_model_call: "Запрошен черновик Hermes", launch_readiness_exported: "Готовность к запуску экспортирована", listing_edited: "Объект отредактирован", listing_publication_scheduled: "Изменение публикации запланировано", listing_publication_cancelled: "Изменение публикации отменено", listing_publication_executed: "Изменение публикации выполнено", listing_quality_imported: "Проверка качества импортирована", listing_slug_changed: "Адрес объекта изменен", lead_pipeline_outcome_recorded: "Действие по покупателю или арендатору записано", live_service_provisioning_report_imported: "Отчет настройки сервисов импортирован", live_service_report_imported: "Отчет рабочего сервиса импортирован", locale_created: "Язык добавлен", payload_runtime_report_imported: "Отчет Payload импортирован", public_request_outcome_recorded: "Результат заявки с сайта записан", redirect_approval_created: "Редирект одобрен", redirect_approvals_imported: "Одобрения редиректов импортированы", reply_approved: "Ответ одобрен", reply_delivery_recorded: "Отправка ответа записана", seller_pipeline_outcome_recorded: "Результат по продавцу записан", seo_evidence_imported: "SEO-данные импортированы", tour_approved: "360 тур одобрен", translation_drafted: "Черновик перевода создан", translation_approved: "Перевод одобрен", translation_published: "Перевод опубликован", viewing_booked: "Просмотр назначен", viewing_follow_up_recorded: "Действие после просмотра записано",
    },
    values: {
      website_listing_detail: "Запрос со страницы объекта", website_seller_valuation: "Заявка на оценку", website_callback_request: "Заявка на обратный звонок", website_viewing_request: "Заявка на просмотр", website_contact_callback: "Заявка на обратный звонок", broker_phone: "Телефонный звонок", broker_viber: "Viber", broker_whatsapp: "WhatsApp", broker_email: "Эл. почта", broker_walk_in: "Визит в офис", partner_referral: "Партнерская рекомендация", lead_response_sla: "SLA ответа", buyer_renter_pipeline: "Покупатели и арендаторы", reply_delivery: "Отправка ответов", viewing_follow_up: "После просмотра", seller_pipeline: "Продавцы", website_requests: "Заявки с сайта", translation_review: "Проверка переводов", deal_aftercare: "После сделки",
      email: "Эл. почта", phone: "Телефон", whatsapp: "WhatsApp", viber: "Viber", sms: "SMS", other: "Другой канал", acknowledgement: "Подтверждение", viewing: "Просмотр", callback: "Обратный звонок", valuation: "Оценка",
    },
    statuses: {
      buyer: "Покупатель", foreign_buyer: "Иностранный покупатель", investor: "Инвестор", renter: "Арендатор", seller: "Продавец", landlord: "Арендодатель", partner_referral: "Партнер / рекомендация", pending: "Ожидание", ok: "В срок", ready: "Готово", blocked: "Заблокировано", unknown: "Неизвестно",
      new: "Новая", inquiry: "Запрос", qualified: "Квалифицирована", viewing_booked: "Просмотр назначен", viewed: "Просмотр проведен", offer: "Предложение", due_diligence: "Проверка", contract: "Договор", application: "Заявка", lease: "Договор аренды", lost: "Потеряна",
      qualify: "Квалифицировать", book_viewing: "Назначить просмотр", complete_viewing: "Провести просмотр", record_offer: "Записать предложение", start_due_diligence: "Начать проверку", sign_contract: "Подписать договор", record_application: "Записать заявку", sign_lease: "Подписать аренду", close_deal: "Закрыть сделку",
      cash: "Наличные", mortgage: "Ипотека", preapproved: "Предварительно одобрено", not_applicable: "Не применимо",
      published: "Опубликовано", approved: "Одобрено", stale: "Устарело", missing: "Отсутствует", present: "Есть",
      unverified: "Не проверено", available: "Доступно", reserved: "Зарезервировано", sold: "Продано", rented: "Сдано", archived: "В архиве", source_imported_review_required: "Импортировано из источника - нужна проверка", review_required: "Требует проверки", needs_panorama_upload: "Нужна панорама",
      general: "Общий запрос", viewing: "Просмотр", draft: "Черновик", ai_drafted: "Черновик AI", human_edited: "Отредактировано человеком", manager_escalation_required: "Нужна эскалация менеджеру", reminder_required: "Напоминание об ответе", needs_reply: "Нужен ответ", queued: "В очереди", sent: "Отправлено", failed: "Ошибка", open: "Открыто", contacted: "Контакт установлен", completed: "Завершено", rescheduled: "Перенесено", no_show: "Не пришел", not_required: "Не требуется", overdue: "Просрочено", valuation_requested: "Запрос оценки", callback_completed: "Обратный звонок завершен", appraisal_scheduled: "Оценка назначена", appraisal_completed: "Оценка завершена", mandate_signed: "Договор подписан", listing_draft_started: "Черновик объекта начат", offer_received: "Предложение получено", closed_lost: "Закрыто без сделки", seller_callback: "Обратный звонок продавцу", callback: "Обратный звонок", appraisal: "Оценка", mandate: "Договор", listing_draft: "Черновик объекта", listing_publish: "Публикация объекта", listing_offer: "Предложение по объекту", seller_close: "Завершение продажи", scheduled: "Назначено", in_progress: "В работе", closed: "Закрыто",
      commercial: "Коммерческая недвижимость", multi_unit: "Апартаменты", apartment: "Квартира", hotel: "Отель", house: "Дом", plot: "Участок", agricultural_land: "Сельхозземля", land: "Участок", property: "Объект", sale: "Продажа", rent: "Аренда",
      instant: "Сразу", daily: "Ежедневно", weekly: "Еженедельно",
      booked: "Назначено", price_on_request: "Цена по запросу", hermes_drafted: "Черновик Hermes", human_translation_required: "Нужен ручной перевод", hermes_draft_required: "Нужен черновик Hermes", external_import_required: "Нужен внешний перевод", draft_review_required: "Черновик на проверку", stale_review_required: "Устаревший перевод на проверку", publish_required: "Одобренный перевод к публикации",
    },
    fields: { title: "Название", h1: "Основной заголовок", description: "Описание", location: "Локация", property_type: "Тип объекта", offer_type: "Тип предложения", listing_status: "Статус", price_eur: "Цена в EUR", price_on_request: "Цена по запросу", area_sqm: "Площадь в m²", bedrooms: "Спальни", bedrooms_not_applicable: "Спальни не применимы", floor: "Этаж", total_floors: "Всего этажей", land_area_sqm: "Площадь участка в m²", condition: "Состояние", location_precision: "Точность локации", availability_verified_at: "Доступность проверена", publish_approved: "Одобрено к публикации", seo_title: "SEO-заголовок", seo_description: "Meta-описание", seo_canonical: "Canonical-путь", seo_og_title: "Заголовок Open Graph", seo_og_description: "Описание Open Graph", seo_robots: "Robots", seo_review_confirmed: "SEO проверено и одобрено человеком", option_yes: "Да", option_no: "Нет", option_area_only: "Только район", option_approximate: "Приблизительная локация", option_exact: "Точная локация", media_kind_photo: "Фото", media_kind_floor_plan: "Планировка", media_kind_video: "Видео" },
  },
  en: {
    urls: "URLs",
    reviewRequired: "Review required",
    mappedListings: "Mapped listings",
    deployablePreview: "Deployable preview",
    missingDescriptions: "Missing descriptions",
    mediaRows: "Media rows",
    search: "Search",
    migrationSubtitle: "Workspace for reviewing legacy URLs, SEO evidence, and redirect decisions.",
    agencyDecisionQueue: "Agency decision queue",
    agencyDecisionQueueNote: "The platform may run in production review mode while these decisions remain open. Every public effect stays fail-closed until its lane is approved.",
    agencySafetyBoundary: "Safety boundary",
    reviewAction: "Review",
    launch: "Launch",
    nextActions: "next actions",
    noLaunchBlockers: "No launch blockers.",
    launchReadiness: "Launch readiness",
    launchInputChecklist: "Launch input checklist",
    preflightReports: "Preflight reports",
    seoPreflight: "SEO preflight",
    liveServices: "Live services",
    liveProvisioning: "Live service provisioning",
    payloadRuntime: "Payload runtime",
    payloadBootstrap: "Payload runtime bootstrap",
    productionRecovery: "Production recovery",
    runtimeEvidenceImports: "Import runtime evidence",
    runtimeEvidenceHint: "Paste only a redacted JSON report captured from the real environment. Secrets are rejected.",
    liveServiceReports: "Search and Hermes reports",
    redactedJsonReport: "Redacted JSON report",
    reportSource: "Report type",
    openStatus: "Open status",
    downloadTemplate: "Download template",
    importReport: "Import report",
    reportSaving: "Validating and importing…",
    reportSaved: "Report imported.",
    reportFailed: "Report could not be imported.",
    csvContents: "CSV contents",
    cmsContracts: "CMS collection contracts",
    payloadCollections: "Payload collection configs",
    listingQuality: "Listing quality",
    exportLaunchReadiness: "Export launch readiness",
    openLaunchEvidence: "Open launch files",
    openCsvTools: "Open CSV tools",
    openSeoImport: "Open SEO import",
    openQualityQueue: "Open quality queue",
    launchGates: {
      redirect_reviews: "legacy URL review",
      external_seo_exports: "external SEO evidence",
      listing_quality_review: "listing quality review",
      live_services: "live services",
      monitoring_rollback: "monitoring and rollback",
      payload_runtime: "Payload runtime",
      production_recovery: "Production recovery",
      local_preview_only: "local preview only",
    },
    reviewedDecisions: "Reviewed decisions",
    pendingLegacyDecisions: "Pending legacy URL decisions",
    pendingLegacyHint: "Every legacy URL needs a separate human decision. Targets must be published equivalent pages, never a homepage or generic search fallback.",
    sourceEvidence: "Legacy source evidence",
    sourceTitle: "Title",
    sourceHeading: "H1 heading",
    sourceCanonical: "Canonical",
    sourceMetrics: "Content",
    sourceWords: "words",
    sourceImages: "images",
    sourceLinks: "internal links",
    openLegacyPage: "Open legacy page",
    openTargetPage: "Open target page",
    reviewOwner: "Review owner",
    requiredAction: "Required action",
    approvableRedirects: "Approvable listing redirects",
    oldUrl: "Old URL",
    routeType: "Route type",
    target: "Target",
    targetPath: "Target internal path",
    locale: "Locale",
    approval: "Approval",
    decision: "Decision",
    chooseDecision: "Choose a decision",
    redirect301: "301 to equivalent page",
    retain200: "Retain URL with 200",
    approved410: "Approved removal with 410",
    equivalentContent: "I confirm equivalent published content",
    reviewer: "Reviewer",
    reason: "Reason",
    saveDecision: "Save decision",
    routeDecisionSaving: "Saving route decision…",
    routeDecisionSaved: "Legacy URL decision recorded.",
    routeDecisionFailed: "Could not record the route decision.",
    noPendingLegacyDecisions: "No legacy URL decisions are pending.",
    approve301: "Approve 301",
    reviewedSameContent: "Reviewed same-content route mapping.",
    importRedirectCsv: "Import reviewed redirect CSV",
    downloadPendingWorkbook: "Download pending workbook",
    redirectWorkbookHint: "Legacy source columns are read-only evidence. Complete the decision, equivalence confirmation, reviewer, and reason; untouched rows remain pending when imported.",
    importCsv: "Import CSV",
    exportRedirects: "Export deployable redirects",
    externalSeoEvidence: "External SEO evidence",
    missingRequiredSources: "Missing required sources",
    csvTemplate: "CSV template",
    importSeoCsv: "Import SEO CSV",
    listingQualityQueue: "Listing quality queue",
    downloadQualityWorkbook: "Download listing quality workbook",
    downloadQualityDraft: "Download listing quality review draft",
    importQualityCsv: "Import listing quality CSV",
    reviewListing: "Review listing",
    factsReviewer: "Facts reviewer",
    mediaReviewer: "Media reviewer",
    reviewNotes: "Review notes and source",
    reviewNotesHint: "Describe how the listing facts and media were verified.",
    saveListingReview: "Save review",
    listingReviewSaving: "Saving listing review…",
    listingReviewSaved: "Listing review recorded.",
    listingReviewFailed: "Could not record the listing review.",
    issue: "Issue",
    issues: "Issues",
    listing: "Listing",
    location: "Location",
    propertyFamily: "Property type",
    publicPhoto: "Public photo",
    publicPhotos: "Public photos",
    selectListings: "Select listings",
    selectAllVisible: "Select all on this page",
    clearSelection: "Clear selection",
    selectedListings: "{count} selected",
    bulkStatus: "Status for selected",
    bulkStatusHint: "The change applies only to explicitly selected listings on this page and is recorded in the audit log.",
    updateSelected: "Update selected",
    chooseOption: "Choose",
    notSet: "Not set",
    noData: "No data",
    discardChanges: "Discard changes",
    rangeTo: "to",
    listingChecks: "Gaps and photos",
    noLeads: "No enquiries yet.",
    noQueueMatches: "No enquiries in this queue.",
    noPipelineMatches: "No opportunities in this view.",
    noTranslationTasks: "No translation tasks match these filters.",
    noContacts: "No customer contacts yet.",
    noChecklists: "No process checklists yet.",
    selectLead: "Select an enquiry to see its details.",
    backToList: "Back to list",
    justNow: "just now",
    ageMinutes: "{n} min",
    ageHours: "{n} h",
    ageDays: "{n} d",
    received: "Received",
    replyDue: "Reply due",
    customerConfirmation: "Customer confirmation",
    stageInquiry: "New enquiries",
    stageQualified: "Qualified",
    stageViewing: "Viewings",
    stageOffer: "Offer and contract",
    stageClosed: "Closed and lost",
    noCardsInStage: "Nothing in this stage.",
    withAccount: "With account",
    withoutAccount: "Without account",
    newAccountAction: "New account",
    completedRequests: "Completed and closed",
    noFilterMatches: "Nothing matches this filter.",
    noCommunicationYet: "No messages have been exchanged yet.",
    comingSoon: "Coming soon",
    savedViews: "Saved views",
    savedViewsDefault: "All enquiries",
    savedViewsNote: "Saved views are waiting for a stored per-operator filter in the workspace settings ledger.",
    listTools: "List tools",
    bulkActions: "Bulk actions",
    selectAllLeads: "Select all in this view",
    bulkAssign: "Assign to broker",
    bulkActionsNote: "Bulk assignment and snoozing are waiting for a batch endpoint that records one approval per enquiry.",
    snooze: "Snooze",
    snoozeNote: "Snoozing is waiting for a due-date field on the enquiry record, so the SLA timer is not lost.",
    viewingLayout: "Schedule layout",
    listView: "List",
    weekView: "Week",
    weekViewNote: "The week calendar is waiting for broker availability, so it can show free slots.",
    bulkStatusSaving: "Updating selected listings…",
    bulkStatusSaved: "Selected listing statuses updated.",
    bulkStatusFailed: "Could not update selected listing statuses.",
    publicationSchedule: "Scheduled publication",
    sellerPipelineNote: "Seller pipeline note",
    publicationScheduleHint: "Publishing and unpublishing are human-approved. Unpublishing archives the listing and preserves its legacy URL.",
    publicationAction: "Action",
    publishListing: "Publish",
    unpublishListing: "Unpublish to archive",
    publicationTime: "Date and time (Sofia)",
    publishStatus: "Status after publishing",
    schedulePublication: "Schedule",
    runDuePublications: "Run due changes",
    scheduledPublications: "Upcoming changes",
    noScheduledPublications: "No publication changes are scheduled.",
    cancelSchedule: "Cancel",
    cancellationReason: "Cancellation reason",
    publicationSaving: "Saving publication schedule…",
    publicationSaved: "Publication schedule saved.",
    publicationFailed: "Could not save publication schedule.",
    missingAlt: "Missing alt text",
    reviewGatedMedia: "Review-gated media",
    approvedRedirects: "Approved redirects",
    source: "Source",
    schema: "Schema",
    seoSettings: "Source-language SEO",
    listingWorkflow: "Verification and publishing",
    availabilityVerification: "Availability verification",
    notVerified: "Not verified",
    publishApproval: "Publication approval",
    approvedForPublishing: "Approved for publishing",
    notApprovedForPublishing: "Not approved",
    mediaManager: "Media manager",
    mediaManagerHint: "Every public photo, floor plan, or video requires human review. The source URL remains in the audit trail.",
    mediaDecision: "Decision",
    publishMedia: "Approve for public display",
    keepMediaPrivate: "Keep hidden",
    mediaKind: "Media type",
    mediaAlt: "Alt text or accessibility caption",
    replacementUrl: "Reviewed replacement URL (optional)",
    mediaReviewConfirmation: "I confirm that I reviewed the file, type, and accessibility text.",
    reviewMediaAsset: "Review asset",
    saveMediaReview: "Save media review",
    mediaReviewSaving: "Saving media review…",
    mediaReviewSaved: "Media review saved.",
    mediaReviewFailed: "Could not save media review.",
    sourceAsset: "Source asset",
    noReviewableMedia: "There are no media assets to review.",
    tour360: "360 tour",
    tourStatus: "Tour status",
    tourProvider: "Tour viewer",
    tourPanoramaUrl: "Panorama URL",
    tourViewerUrl: "3D viewer URL",
    tourThumbnailUrl: "Thumbnail URL",
    tourAccessibilityCaption: "Accessibility caption",
    tourReviewer: "Reviewer",
    tourFallbackGallery: "Fallback photo gallery",
    tourApprovalNotice: "Approval publishes this tour only after manual review.",
    tourApprovalConfirmation: "I confirm the tour media, caption, and fallback gallery have been reviewed.",
    tourApprovePublish: "Approve and publish 360 tour",
    tourSaving: "Saving...",
    tourSaved: "360 tour approved.",
    tourSaveFailed: "Could not save 360 tour.",
    replyDraftPending: "Preparing broker-only draft…",
    replyDraftReady: "Draft ready for broker review.",
    replyDraftFailed: "Could not prepare a broker draft.",
    replyDraftUnavailable: "Hermes is not configured in this environment. Use an approved template or write the reply manually.",
    replyQueuePending: "Queueing broker-approved reply…",
    replyQueueReady: "Reply queued for manual sending.",
    replyQueueFailed: "Could not queue the reviewed reply.",
    communicationHistory: "Communication history",
    communicationEvents: "events",
    inboundRequest: "Inbound request",
    approvedReply: "Approved reply",
    deliverySent: "Sent",
    deliveryFailed: "Delivery failed",
    deliveryRequeue: "Returned to queue",
    noMessageBody: "No message body was provided.",
    replyTemplate: "Reply template",
    chooseReplyTemplate: "Choose a reviewable starting template",
    templateReviewNotice: "Templates are a starting point only. Check the facts and edit the text before approval.",
    skipToContent: "Skip to content",
    workspaceNavigation: "Workspace navigation",
    operationsReports: "Operations reports",
    actualResponses: "Actual responses sent",
    responseRate: "Response sent rate",
    medianResponse: "Median response time",
    overdueWork: "Overdue work",
    leadVolume: "Lead volume",
    bySource: "By source",
    byLanguage: "By language",
    byType: "By type",
    sourceQuality: "Source quality",
    qualified: "Qualified",
    viewingLeads: "With a viewing",
    closedDeals: "Closed deals",
    conversion: "Conversion",
    responseTime: "Response time",
    average: "Average",
    p90: "90th percentile",
    withinSla: "Within SLA",
    pipelines: "Pipelines",
    workQueueHealth: "Work queue health",
    queue: "Queue",
    open: "Open",
    overdue: "Overdue",
    blocked: "Blocked",
    listingInventory: "Listing inventory",
    activeListings: "Active listings",
    translationReview: "Translations to review",
    searchSignals: "Search signals",
    websiteFunnel: "Website funnel",
    pageViews: "Page views",
    ctaClicks: "Action clicks",
    funnelLeads: "Leads",
    searchesPer100Views: "Searches per 100 views",
    ctaClickRate: "Action click rate",
    leadConversion: "Lead conversion",
    durableWebsiteLeads: "Durable website leads",
    leadTrackingGap: "Measurement gap",
    searchEvents: "Searches",
    zeroResults: "Zero results",
    popularFilters: "Popular filters",
    downloadSourceReport: "Download source CSV",
    privacySafeReport: "This report uses operating ledgers and excludes private contacts and messages.",
    readOnlyAccess: "This role has read-only access.",
    viewingFollowUpReadOnly: "Recording is hidden until durable action history is enabled.",
    minutesShort: "min",
    noReportData: "There is no data for this report yet.",
    auditActions: {
      media_reviewed: "Media asset reviewed",
      lead_assigned: "Lead assigned to broker",
      account_created: "Customer account created",
      contact_linked: "Contact linked to account",
      consent_withdrawn: "Consent or notification withdrawn",
      document_checklist_updated: "Document checklist updated",
      lead_created: "Broker-created enquiry",
      broker_contact_approved: "Broker contact approved", deal_closed: "Deal closed", deployable_redirects_exported: "Redirects exported", hermes_model_call: "Hermes draft requested", launch_readiness_exported: "Launch readiness exported", listing_edited: "Listing edited", listing_publication_scheduled: "Publication change scheduled", listing_publication_cancelled: "Publication change cancelled", listing_publication_executed: "Publication change executed", listing_quality_imported: "Listing quality review imported", listing_slug_changed: "Listing URL changed", lead_pipeline_outcome_recorded: "Buyer or renter action recorded", live_service_provisioning_report_imported: "Service provisioning report imported", live_service_report_imported: "Live service report imported", locale_created: "Locale added", payload_runtime_report_imported: "Payload runtime report imported", public_request_outcome_recorded: "Website request outcome recorded", redirect_approval_created: "Redirect approved", redirect_approvals_imported: "Redirect approvals imported", reply_approved: "Reply approved", reply_delivery_recorded: "Reply delivery recorded", seller_pipeline_outcome_recorded: "Seller outcome recorded", seo_evidence_imported: "SEO evidence imported", tour_approved: "360 tour approved", translation_drafted: "Translation draft created", translation_approved: "Translation approved", translation_published: "Translation published", viewing_booked: "Viewing booked", viewing_follow_up_recorded: "Viewing follow-up recorded",
    },
    values: {
      website_listing_detail: "Listing inquiry", website_seller_valuation: "Seller valuation request", website_callback_request: "Callback request", website_viewing_request: "Viewing request", website_contact_callback: "Callback request", broker_phone: "Phone call", broker_viber: "Viber", broker_whatsapp: "WhatsApp", broker_email: "Email", broker_walk_in: "Office walk-in", partner_referral: "Partner referral", lead_response_sla: "Response SLA", buyer_renter_pipeline: "Buyers and renters", reply_delivery: "Reply delivery", viewing_follow_up: "Post-viewing", seller_pipeline: "Sellers", website_requests: "Website requests", translation_review: "Translation review", deal_aftercare: "Deal aftercare",
      email: "Email", phone: "Phone", whatsapp: "WhatsApp", viber: "Viber", sms: "SMS", other: "Other channel", acknowledgement: "Acknowledgement", viewing: "Viewing", callback: "Callback", valuation: "Valuation",
    },
    statuses: {
      buyer: "Buyer", foreign_buyer: "Foreign buyer", investor: "Investor", renter: "Renter", seller: "Seller", landlord: "Landlord", partner_referral: "Partner / referral", pending: "Pending", ok: "On time", ready: "Ready", blocked: "Blocked", unknown: "Unknown",
      new: "New", inquiry: "Inquiry", qualified: "Qualified", viewing_booked: "Viewing booked", viewed: "Viewed", offer: "Offer", due_diligence: "Due diligence", contract: "Contract", application: "Application", lease: "Lease", lost: "Lost",
      qualify: "Qualify", book_viewing: "Book viewing", complete_viewing: "Complete viewing", record_offer: "Record offer", start_due_diligence: "Start due diligence", sign_contract: "Sign contract", record_application: "Record application", sign_lease: "Sign lease", close_deal: "Close deal",
      cash: "Cash", mortgage: "Mortgage", preapproved: "Pre-approved", not_applicable: "Not applicable",
      published: "Published", approved: "Approved", stale: "Stale", missing: "Missing", present: "Present",
      unverified: "Unverified", available: "Available", reserved: "Reserved", sold: "Sold", rented: "Rented", archived: "Archived", source_imported_review_required: "Imported from source - review required", review_required: "Review required", needs_panorama_upload: "Panorama required",
      general: "General inquiry", viewing: "Viewing", draft: "Draft", ai_drafted: "AI draft", human_edited: "Human edited", manager_escalation_required: "Manager escalation required", reminder_required: "Reply reminder", needs_reply: "Needs reply", queued: "Queued", sent: "Sent", failed: "Failed", open: "Open", contacted: "Contacted", completed: "Completed", rescheduled: "Rescheduled", no_show: "No-show", not_required: "Not required", overdue: "Overdue", valuation_requested: "Valuation requested", callback_completed: "Callback completed", appraisal_scheduled: "Appraisal scheduled", appraisal_completed: "Appraisal completed", mandate_signed: "Mandate signed", listing_draft_started: "Listing draft started", offer_received: "Offer received", closed_lost: "Closed lost", seller_callback: "Seller callback", callback: "Callback", appraisal: "Appraisal", mandate: "Mandate", listing_draft: "Listing draft", listing_publish: "Listing publication", listing_offer: "Listing offer", seller_close: "Sale completion", scheduled: "Scheduled", in_progress: "In progress", closed: "Closed",
      commercial: "Commercial property", multi_unit: "Apartments", apartment: "Apartment", hotel: "Hotel", house: "House", plot: "Plot", agricultural_land: "Agricultural land", land: "Land", property: "Property", sale: "For sale", rent: "For rent",
      instant: "As soon as possible", daily: "Daily", weekly: "Weekly",
      booked: "Booked", price_on_request: "Price on request", hermes_drafted: "Hermes draft", human_translation_required: "Human translation required", hermes_draft_required: "Hermes draft required", external_import_required: "External translation required", draft_review_required: "Draft review required", stale_review_required: "Stale translation review", publish_required: "Approved translation to publish",
    },
    fields: { title: "Title", h1: "Primary heading", description: "Description", location: "Location", property_type: "Property type", offer_type: "Offer type", listing_status: "Status", price_eur: "Price in EUR", price_on_request: "Price on request", area_sqm: "Area in m²", bedrooms: "Bedrooms", bedrooms_not_applicable: "Bedrooms not applicable", floor: "Floor", total_floors: "Total floors", land_area_sqm: "Land area in m²", condition: "Condition", location_precision: "Location precision", availability_verified_at: "Availability verified at", publish_approved: "Approved for publishing", seo_title: "SEO title", seo_description: "Meta description", seo_canonical: "Canonical path", seo_og_title: "Open Graph title", seo_og_description: "Open Graph description", seo_robots: "Robots", seo_review_confirmed: "SEO reviewed and approved by a human", option_yes: "Yes", option_no: "No", option_area_only: "Area only", option_approximate: "Approximate location", option_exact: "Exact location", media_kind_photo: "Photo", media_kind_floor_plan: "Floor plan", media_kind_video: "Video" },
  },
};

function workbenchCopy(page) {
  return ADMIN_UI_COPY[page.workspace?.locale] || ADMIN_UI_COPY.en;
}

function statusText(copy, value) {
  return copy.statuses[value] || valueText(copy, value);
}

const LISTING_EDITOR_FACT_FIELDS = Object.freeze({
  bedrooms: "bedrooms_count",
  bedrooms_not_applicable: "bedrooms_count",
  floor: "floor_number",
  total_floors: ["total_floors", "storeys_count"],
  land_area_sqm: "land_area_sqm",
});

function listingEditorFieldApplicable(family, field) {
  const mapped = LISTING_EDITOR_FACT_FIELDS[field];
  if (!mapped) return true;
  return (Array.isArray(mapped) ? mapped : [mapped]).some((key) => isFactApplicable(family, key));
}

function propertyTypeSelectOptions(value) {
  const current = String(value || "").trim();
  const family = propertyFamilyFor({ property_type: current, property_family: current });
  const selected = family || current || "apartment";
  const values = [...CANONICAL_PROPERTY_FAMILIES];
  if (selected && !values.includes(selected)) values.push(selected);
  return { selected, values };
}

function PropertyFamilyChecks({ ui, name, selected = [], legend }) {
  const chosen = new Set(
    (Array.isArray(selected) ? selected : String(selected || "").split(","))
      .map((value) => String(value).trim())
      .filter(Boolean),
  );
  return h(
    "fieldset",
    { className: "adm-family-checks", "data-property-family-options": "true" },
    legend ? h("legend", null, legend) : null,
    ...CANONICAL_PROPERTY_FAMILIES.map((family) =>
      h(
        "label",
        { key: family, className: "adm-check" },
        h("input", { type: "checkbox", name, value: family, defaultChecked: chosen.has(family) }),
        h("span", null, statusText(ui, family)),
      ),
    ),
  );
}

function valueText(copy, value) {
  return copy.values?.[value] || String(value || "").replaceAll("_", " ");
}

function fieldText(copy, field) {
  return copy.fields[field] || String(field || "").replaceAll("_", " ");
}

function listingQualityIssueText(ui, issue) {
  const fieldByIssue = {
    missing_price: "price_eur",
    missing_area: "area_sqm",
    missing_bedrooms: "bedrooms",
    missing_location: "location",
    missing_description: "description",
  };
  if (fieldByIssue[issue]) return fieldText(ui, fieldByIssue[issue]);
  if (issue === "missing_alt_text") return ui.missingAlt;
  if (issue === "thin_public_gallery") return ui.publicPhotos;
  if (issue === "media_review_pending") return ui.reviewGatedMedia;
  if (issue === "tour_review_pending") return ui.tour360;
  return statusText(ui, issue);
}

function adminHref(path, page) {
  const locale = page.workspace?.locale;
  if (!locale || locale === "en") return path;
  const url = new URL(path, "http://ms-realty.local");
  url.searchParams.set("locale", locale);
  return `${url.pathname}${url.search}${url.hash}`;
}

function adminLocaleHref(page, locale) {
  const url = new URL(page.path || "/admin", "http://ms-realty.local");
  for (const [key, value] of Object.entries(page.filters || {})) {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
  }
  if (page.listing?.id) url.searchParams.set("listingId", page.listing.id);
  if (locale && locale !== "en") url.searchParams.set("locale", locale);
  return `${url.pathname}${url.search}${url.hash}`;
}

function payloadAdminListingHref(listingId, page) {
  return adminHref(`/admin/listings/edit?listingId=${encodeURIComponent(listingId)}`, page);
}

function currentOperatorId(page, fallback) {
  return page.workspace?.operator_id || fallback;
}

function formatAdminDateTime(value, locale) {
  if (!value || Number.isNaN(new Date(value).getTime())) return "";
  const language = locale === "bg" ? "bg-BG" : locale === "ru" ? "ru-RU" : "en-GB";
  return new Intl.DateTimeFormat(language, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Sofia",
  }).format(new Date(value));
}

function leadContactActions(lead, copy) {
  const contact = lead.contact || {};
  const channels = ["phone", "whatsapp", "viber", "email"].flatMap((channel) => {
    const value = String(contact[channel] || "").trim();
    if (!value) return [];
    const number = value.replace(/[^\d+]/g, "");
    const href =
      channel === "email"
        ? `mailto:${value}`
        : channel === "whatsapp"
          ? `https://wa.me/${number.replace(/^\+/, "")}`
          : channel === "viber"
            ? `viber://chat?number=${encodeURIComponent(number)}`
            : `tel:${number}`;
    return [h("a", { key: channel, href, className: "adm-lead-contact__action", "data-private-contact-channel": channel }, `${valueText(copy, channel)}: ${value}`)];
  });
  if (!contact.name && !channels.length) return null;
  return h(
    "div",
    { className: "adm-lead-contact", "data-private-contact": "true" },
    contact.name ? h("strong", null, contact.name) : null,
    ...channels,
  );
}

function requestDetailsText(lead) {
  const details = lead.request_details || {};
  return [details.viewing_date, details.viewing_time, details.callback_time].filter(Boolean).join(" · ");
}

/* ============================================================
   CRM shell (ui_kits/crm/CrmKit — Sidebar, Topbar, Panel, StatTile)
   ============================================================ */

const STAT_TONES = {
  ink: { bg: "var(--ink-50)", fg: "var(--ink-800)" },
  sea: { bg: "var(--sea-50)", fg: "var(--sea-600)" },
  sun: { bg: "var(--sun-100)", fg: "var(--sun-600)" },
  brick: { bg: "var(--brick-50)", fg: "var(--brick-600)" },
  success: { bg: "var(--success-50)", fg: "var(--success-500)" },
  sand: { bg: "var(--stone-100)", fg: "var(--stone-500)" },
};

const PILL_TONES = {
  published: "success",
  approved: "sea",
  live: "success",
  draft: "sun",
  pending: "sun",
  stale: "brick",
  missing: "sand",
  blocked: "brick",
  ready: "success",
};

function StatusPill({ tone = "ink", children, ...attrs }) {
  const palette = STAT_TONES[tone] || STAT_TONES.ink;
  return h(
    "span",
    { className: "crm-pill", style: `color:${palette.fg};background:${palette.bg}`, ...attrs },
    h("span", { className: "crm-pill__dot", style: `background:${palette.fg}`, "aria-hidden": "true" }),
    children,
  );
}

function Panel({ title, action, children, ...attrs }) {
  return h(
    "section",
    { className: "crm-panel", ...attrs },
    title ? h("div", { className: "crm-panel__hd" }, h("h2", null, title), action || null) : null,
    children,
  );
}

function WorkbenchDisclosure({ summary, children, ...attrs }) {
  return h(
    "details",
    { className: "adm-workbench-disclosure", ...attrs },
    h(
      "summary",
      null,
      h(Icon, { name: "chevron-right", size: 17 }),
      h("span", null, summary),
    ),
    h("div", { className: "adm-workbench-disclosure__body" }, children),
  );
}

// Compact stat strip that stays a real <dl> so the markup remains data-legible.
// Metric tuples may still carry an icon and tone; the strip renders value and
// label only, so the icon box never competes with the number.
function StatGrid({ metrics }) {
  return h(
    "dl",
    { className: "adm-kpis" },
    ...metrics.map(([metricLabel, value]) =>
      h(
        "div",
        { key: metricLabel, className: "crm-stat", "data-stat": /\p{L}/u.test(String(value ?? "")) ? "text" : "number" },
        h("dt", { className: "crm-stat__label" }, metricLabel),
        h("dd", { className: "crm-stat__val" }, value),
      ),
    ),
  );
}

function PageHeader({ title, subtitle, children }) {
  return h(
    "div",
    { className: "crm-ph" },
    h("div", null, h("h1", null, title), subtitle ? h("p", null, subtitle) : null),
    children ? h("div", { className: "crm-ph__actions" }, children) : null,
  );
}

// Toolbar row under the page header: filters or tabs at the start and the
// screen's primary action (a disclosure with its form) at the end.
function PageToolbar({ children, ...attrs }) {
  return h("div", { className: "adm-toolbar", ...attrs }, children);
}

// Segmented client-side filter for a list (initAdminListFilters): every item
// carries data-list-item="<scope>" and data-filter-tags="a b"; the buttons
// toggle the hidden attribute and a data-list-empty="<scope>" note appears
// when nothing matches. Without JavaScript every item stays visible.
function ListFilterTabs({ scope, label: navLabel, options, selected = "all" }) {
  return h(
    "nav",
    { className: "crm-seg adm-list-filter", "aria-label": navLabel, "data-list-filter": scope },
    ...options.map((option) =>
      h(
        "button",
        {
          key: option.value,
          type: "button",
          "data-filter-value": option.value,
          "data-on": option.value === selected ? "1" : "0",
          "aria-pressed": option.value === selected ? "true" : "false",
        },
        option.label,
        option.count === undefined ? null : h("span", { className: "adm-seg-count" }, option.count),
      ),
    ),
  );
}

function ListEmptyNote({ scope, children }) {
  return h("p", { className: "adm-empty", role: "status", "data-list-empty": scope, hidden: true }, children);
}

// A control whose front end is designed and reachable but whose backend does
// not exist yet. It renders disabled, names itself as planned, and explains
// what it is waiting for, so the screen has no silent hole.
function PlannedNote({ children, ...attrs }) {
  return h("p", { className: "adm-planned-note", ...attrs }, children);
}

function PlannedBadge({ ui }) {
  return h("span", { className: "adm-planned-badge" }, ui.comingSoon);
}

// Saved views and bulk actions are designed but have no backend yet, so they
// live in one closed strip above the queue: discoverable and honest, never
// competing with the leads themselves.
function LeadListTools({ ui }) {
  return h(
    "details",
    { className: "adm-list-tools", "data-planned-control": "lead_list_tools" },
    h(
      "summary",
      { className: "adm-list-tools__summary adm-disclosure-chevron" },
      h(Icon, { name: "sliders-horizontal", size: 15 }),
      h("span", null, ui.listTools),
      h(PlannedBadge, { ui }),
    ),
    h(
      "div",
      { className: "adm-list-tools__body" },
      h(
        "div",
        { className: "adm-planned", "data-planned-control": "saved_views" },
        h(
          "label",
          { className: "adm-planned__field", htmlFor: "saved-view-leads" },
          h("span", null, ui.savedViews),
          h(
            "select",
            { id: "saved-view-leads", name: "savedView", disabled: true, "aria-describedby": "saved-view-leads-note" },
            h("option", null, ui.savedViewsDefault),
          ),
        ),
        h(PlannedNote, { id: "saved-view-leads-note" }, ui.savedViewsNote),
      ),
      h(
        "div",
        { className: "adm-planned", "data-planned-control": "lead_bulk_actions" },
        h(
          "fieldset",
          { className: "adm-planned__group", disabled: true, "aria-describedby": "lead-bulk-note" },
          h("legend", null, ui.bulkActions),
          h(
            "label",
            { className: "adm-check" },
            h("input", { type: "checkbox", name: "selectAllLeads" }),
            h("span", null, ui.selectAllLeads),
          ),
          h("button", { type: "button", className: "mk-btn mk-btn--secondary mk-btn--sm" }, ui.bulkAssign),
          h("button", { type: "button", className: "mk-btn mk-btn--ghost mk-btn--sm" }, ui.snooze),
        ),
        h(PlannedNote, { id: "lead-bulk-note" }, ui.bulkActionsNote),
      ),
    ),
  );
}

function EmptyState({ icon = "inbox", children, ...attrs }) {
  return h("p", { className: "adm-empty adm-empty--icon", ...attrs }, h(Icon, { name: icon, size: 18 }), h("span", null, children));
}

// The screen's primary action: a native disclosure whose summary reads as the
// primary button at the end of the toolbar and whose body opens as a panel on
// its own row. Works without JavaScript.
function ActionDisclosure({ summary, icon = "plus", tone = "primary", className = "", children, ...attrs }) {
  return h(
    "details",
    { className: ["adm-action-disclosure", className].filter(Boolean).join(" "), ...attrs },
    h(
      "summary",
      { className: `mk-btn mk-btn--${tone} mk-btn--sm adm-action-disclosure__summary` },
      h(Icon, { name: icon, size: 16 }),
      h("span", null, summary),
    ),
    h("div", { className: "adm-action-disclosure__body" }, children),
  );
}

const NAV_ROUTES = [
  { id: "today", module: "crm", path: "/admin/today", icon: "layout-dashboard", kind: "admin_today", capability: "operations:read" },
  { id: "lead_inbox", module: "crm", path: "/admin/leads", icon: "inbox", kind: "admin_lead_inbox", capability: "operations:read" },
  { id: "contacts", module: "crm", path: "/admin/contacts", icon: "users", kind: "admin_contacts", capability: "operations:read" },
  { id: "consents", module: "crm", path: "/admin/consents", icon: "shield-check", kind: "admin_consents", capability: "operations:read" },
  { id: "documents", module: "crm", path: "/admin/documents", icon: "file-check", kind: "admin_document_checklists", capability: "operations:read" },
  { id: "realty_cases", module: "crm", path: "/admin/cases", icon: "kanban-square", kind: "admin_realty_cases", capability: "cases:read" },
  { id: "lead_pipeline", module: "crm", path: "/admin/pipeline", icon: "kanban-square", kind: "admin_lead_pipeline", capability: "operations:read" },
  { id: "requests", module: "crm", path: "/admin/requests", icon: "bell", kind: "admin_requests", capability: "operations:read" },
  { id: "viewings", module: "crm", path: "/admin/viewings", icon: "calendar-days", kind: "admin_viewings", capability: "operations:read" },
  { id: "reports", module: "crm", path: "/admin/reports", icon: "bar-chart-3", kind: "admin_operations_reports", capability: "operations:read" },
  { id: "activity", module: "crm", path: "/admin/activity", icon: "list", kind: "admin_activity", capability: "activity:read" },
  { id: "listing_manager", module: "cms", path: "/admin/listings", icon: "building-2", kind: "admin_listing_manager", capability: "content:read" },
  { id: "translation_queue", module: "cms", path: "/admin/translations", icon: "languages", kind: "admin_translation_queue", capability: "translations:read" },
  { id: "migration_review", module: "launch", path: "/admin/migration/review", icon: "file-check", kind: "admin_migration_review", capability: "administration:read" },
];

function adminNavigationGroups(page) {
  const copy = adminCopy(page);
  const modules = page.workspace?.modules || [];
  const screenLabel = (moduleId, screenId, fallback) => {
    const module = modules.find((entry) => entry.id === moduleId);
    return module?.screens?.find((screen) => screen.id === screenId)?.label || fallback;
  };
  const route = (id) => NAV_ROUTES.find((entry) => entry.id === id);
  const groups = [
    {
      label: modules.find((module) => module.id === "crm")?.label || "CRM",
      items: [
        {
          ...route("today"),
          label: screenLabel("crm", "today", "Today"),
        },
        {
          ...route("lead_inbox"),
          label: screenLabel("crm", "lead_inbox", "Lead inbox"),
          badge: page.kind === "admin_lead_inbox" ? page.summary?.leads : undefined,
        },
        { ...route("contacts"), label: screenLabel("crm", "contacts", "Contacts and accounts") },
        { ...route("consents"), label: screenLabel("crm", "consents", "Consent and preferences") },
        { ...route("documents"), label: screenLabel("crm", "documents", "Documents and process") },
        {
          ...route("realty_cases"),
          label: caseCopy(page).title,
          badge: page.realtyCaseQueue?.summary?.open,
        },
        {
          ...route("lead_pipeline"),
          label: screenLabel("crm", "lead_pipeline", "Buyers and renters"),
          badge: page.leadPipelineQueue?.summary?.open,
        },
        {
          ...route("requests"),
          label: screenLabel("crm", "requests", "Requests and alerts"),
          badge: page.publicRequestQueue?.summary?.open,
        },
        { ...route("viewings"), label: screenLabel("crm", "viewings", "Viewings") },
        { ...route("reports"), label: screenLabel("crm", "reports", workbenchCopy(page).operationsReports) },
        { ...route("activity"), label: screenLabel("crm", "activity", "Activity") },
      ],
    },
    {
      label: modules.find((module) => module.id === "cms")?.label || "CMS",
      items: [
        { ...route("listing_manager"), label: screenLabel("cms", "listing_manager", "Listings") },
        { ...route("translation_queue"), label: screenLabel("cms", "translation_queue", "Translation review") },
      ],
    },
    {
      label: label(copy, "launchEvidence", "Launch"),
      items: [{ ...route("migration_review"), label: label(copy, "migrationReview", "Migration review") }],
    },
  ];
  return groups
    .map((group) => ({
      ...group,
      items: group.items.filter(
        (item) => pageCan(page, item.capability) &&
          (page.runtime_data_mode !== "durable_only" || DURABLE_ONLY_NAV_IDS.has(item.id)),
      ),
    }))
    .filter((group) => group.items.length);
}

function Sidebar({ page }) {
  const visibleGroups = adminNavigationGroups(page);
  return h(
    "aside",
    { className: "crm-sb" },
    h(
      "div",
      { className: "crm-sb__brand" },
      h(
        "a",
        { href: adminHref(adminHomeForPage(page), page), "aria-label": "MS Realty" },
        h("img", { src: LOGO_URL_REVERSED, alt: "MS Realty", height: 30, width: Math.round(30 * LOGO_ASPECT) }),
      ),
    ),
    h(
      "nav",
      { className: "crm-sb__nav", "aria-label": page.workspace?.title || "Admin" },
      ...visibleGroups.flatMap((group) => [
        h("div", { key: `group-${group.label}`, className: "crm-sb__group" }, group.label),
        ...group.items.map((item) =>
          h(
            "a",
            {
              key: item.id,
              className: `crm-nav${page.kind === item.kind ? " crm-nav--on" : ""}`,
              href: adminHref(item.path, page),
              "aria-current": page.kind === item.kind ? "page" : undefined,
            },
            h(Icon, { name: item.icon, size: 18 }),
            h("span", null, item.label),
            item.badge ? h("span", { className: "crm-nav__badge" }, item.badge) : null,
          ),
        ),
      ]),
    ),
    h(
      "div",
      { className: "crm-sb__me" },
      h("div", { style: "min-width:0" }, h("b", null, page.workspace?.title || "MS Realty"), h("span", null, (page.workspace?.locale || "en").toUpperCase())),
    ),
  );
}

function MobileNavigation({ page }) {
  const copy = adminCopy(page);
  const ui = workbenchCopy(page);
  const menuLabel = ui.workspaceNavigation;
  const visibleGroups = adminNavigationGroups(page);
  const menuId = `admin-mobile-navigation-${page.workspace?.locale || "en"}`;
  return h(
    "details",
    { className: "adm-mobile-nav", "data-admin-mobile-nav": "true" },
    h(
      "summary",
      {
        className: "adm-mobile-nav__summary",
        "aria-label": menuLabel,
        "aria-controls": menuId,
        "aria-expanded": "false",
        title: menuLabel,
      },
      h(Icon, { name: "menu", size: 20 }),
    ),
    h(
      "div",
      {
        id: menuId,
        className: "adm-mobile-nav__panel",
        role: "dialog",
        "aria-modal": "true",
        "aria-label": menuLabel,
      },
      h(
        "div",
        { className: "adm-mobile-nav__panel-head" },
        h("strong", { className: "adm-mobile-nav__panel-title" }, menuLabel),
        h(
          "button",
          {
            type: "button",
            className: "adm-mobile-nav__close",
            "data-admin-mobile-nav-close": "true",
            "aria-label": label(copy, "closeNavigation", "Close navigation"),
          },
          h(Icon, { name: "x", size: 18 }),
        ),
      ),
      h(
        "nav",
        { className: "adm-mobile-nav__links", "aria-label": menuLabel },
        ...visibleGroups.flatMap((group) => [
          h("div", { key: `mobile-group-${group.label}`, className: "adm-mobile-nav__group" }, group.label),
          ...group.items.map((item) =>
            h(
              "a",
              {
                key: `mobile-${item.id}`,
                className: `adm-mobile-nav__link${page.kind === item.kind ? " adm-mobile-nav__link--on" : ""}`,
                href: adminHref(item.path, page),
                "aria-current": page.kind === item.kind ? "page" : undefined,
              },
              h(Icon, { name: item.icon, size: 18 }),
              h("span", null, item.label),
              item.badge ? h("span", { className: "crm-nav__badge" }, item.badge) : null,
            ),
          ),
        ]),
      ),
    ),
  );
}

function Topbar({ page, title }) {
  const copy = adminCopy(page);
  const locales = page.workspace?.interface_locales || [];
  return h(
    "header",
    { className: "crm-top" },
    h(
      "div",
      { style: "min-width:0" },
      h("div", { className: "crm-top__title" }, title),
      h("div", { className: "crm-top__sub" }, page.workspace?.title || ""),
    ),
    h(MobileNavigation, { page }),
    h(
      "nav",
      { className: "crm-seg adm-locales", "aria-label": label(copy, "language", "Language") },
      ...locales.map((code) =>
        h(
          "a",
          {
            key: code,
            href: adminLocaleHref(page, code),
            "data-on": code === page.workspace?.locale ? "1" : "0",
            "aria-current": code === page.workspace?.locale ? "page" : undefined,
          },
          code.toUpperCase(),
        ),
      ),
    ),
  );
}

function adminShell(page, { title, mainAttrs, children }) {
  const ui = workbenchCopy(page);
  return [
    h("a", { key: "skip", className: "skip-link", href: "#main" }, ui.skipToContent),
    h(
      "div",
      { key: "app", className: "crm-app" },
      h(Sidebar, { page }),
      h(
        "div",
        { className: "crm-main" },
        h(Topbar, { page, title }),
        h("main", { id: "main", className: "crm-scroll", ...mainAttrs }, h("div", { className: "crm-wrap" }, ...children)),
      ),
    ),
  ];
}

function leadQueueState(page) {
  const leadSlaById = new Map((page.leadSla?.rows || []).map((row) => [row.lead_id, row]));
  const deliveryByLeadId = new Map((page.replyDeliveryQueue?.states || []).map((row) => [row.lead_id, row]));
  const repliedLeadIds = new Set(
    (page.replyDeliveryQueue?.states || []).filter((row) => row.status === "sent").map((row) => row.lead_id),
  );
  const priority = (lead) => {
    const delivery = deliveryByLeadId.get(lead.lead_id);
    if (repliedLeadIds.has(lead.lead_id)) return 5;
    if (delivery?.status === "failed") return 0;
    const status = leadSlaById.get(lead.lead_id)?.status || "pending";
    if (status === "manager_escalation_required") return 1;
    if (delivery?.status === "queued") return 2;
    if (status === "reminder_required") return 3;
    return 4;
  };
  return {
    leadSlaById,
    deliveryByLeadId,
    repliedLeadIds,
    pending: [...(page.leads || [])]
      .filter((lead) => !repliedLeadIds.has(lead.lead_id))
      .sort((left, right) => priority(left) - priority(right)),
  };
}

function queueTone(status) {
  if (status === "ok") return "success";
  if (status?.includes("escalation")) return "brick";
  return "sun";
}

function TodayReadinessRail({ page, copy, ui, queue, openTasks, overdueTasks, inboxHref }) {
  const readinessItems = [
    {
      href: inboxHref,
      label: label(copy, "needsReply", "Needs reply"),
      note: label(copy, "priorityLeads", "Priority leads"),
      value: queue.pending.length,
      tone: queue.pending.length ? "sun" : "success",
    },
    {
      href: adminHref("/admin/viewings", page),
      label: label(copy, "openFollowUps", "Open follow-ups"),
      note: label(copy, "viewingsWorkspace", "Viewings and follow-ups"),
      value: page.summary?.viewingFollowUpsOpen || 0,
      tone: overdueTasks ? "brick" : "sea",
    },
    {
      href: adminHref("/admin/pipeline", page),
      label: label(copy, "openTasks", "Open tasks"),
      note: label(copy, "pipelineWorkspace", "Buyers and renters"),
      value: openTasks,
      tone: openTasks ? "ink" : "success",
    },
    {
      href: adminHref("/admin/requests", page),
      label: label(copy, "publicRequests", "Website requests"),
      note: label(copy, "requestsWorkspace", "Requests and alerts"),
      value: page.summary?.publicRequestsOpen || 0,
      tone: page.summary?.publicRequestsOpen ? "sun" : "success",
    },
  ];
  return h(
    "aside",
    { className: "adm-workbench-rail", "data-readiness-rail": "true" },
    h(Panel, { title: label(copy, "today", "Today"), "data-today-snapshot": "true" }, h(StatGrid, {
      metrics: [
        [label(copy, "needsReply", "Needs reply"), queue.pending.length, "messages-square", "sea"],
        [label(copy, "managerEscalations", "Manager escalations"), page.summary?.leadSlaManagerEscalations || 0, "triangle-alert", "brick"],
        [label(copy, "overdueFollowUps", "Overdue follow-ups"), overdueTasks, "bell", "sun"],
        [label(copy, "openTasks", "Open tasks"), openTasks, "check-circle-2", "success"],
      ],
    })),
    h(
      Panel,
      { title: ui.launchReadiness, "data-readiness-work": "true" },
      h(
        "ul",
        { className: "adm-readiness-list" },
        ...readinessItems.map((item) =>
          h(
            "li",
            { key: item.label },
            h(
              "a",
              { className: "adm-readiness-link", href: item.href },
              h("span", { className: "adm-readiness-copy" }, h("strong", null, item.label), h("small", null, item.note)),
              h("span", { className: "adm-readiness-value" }, h(StatusPill, { tone: item.tone }, item.value)),
            ),
          ),
        ),
      ),
    ),
    h(
      Panel,
      {
        title: label(copy, "activity", "Activity"),
        action: h("a", { className: "mk-btn mk-btn--ghost mk-btn--sm", href: adminHref("/admin/activity", page) }, label(copy, "viewHistory", "History")),
        "data-today-activity-link": "true",
      },
      h(
        "div",
        { className: "adm-rail-actions" },
        h("a", { className: "mk-btn mk-btn--secondary mk-btn--sm", href: adminHref("/admin/leads", page) }, h(Icon, { name: "inbox", size: 16 }), label(copy, "viewLeadInbox", "Open lead inbox")),
        h("a", { className: "mk-btn mk-btn--ghost mk-btn--sm", href: adminHref("/admin/reports", page) }, h(Icon, { name: "bar-chart-3", size: 16 }), ui.operationsReports),
      ),
    ),
  );
}

function TodayBody({ page }) {
  const copy = adminCopy(page);
  const ui = workbenchCopy(page);
  const queue = leadQueueState(page);
  const openTasks =
    (page.summary?.viewingFollowUpsOpen || 0) +
    (page.summary?.sellerPipelineOpen || 0) +
    (page.summary?.publicRequestsOpen || 0) +
    (page.summary?.buyerPipelineOpen || 0) +
    (page.summary?.renterPipelineOpen || 0);
  const overdueTasks =
    (page.summary?.viewingFollowUpsOverdue || 0) +
    (page.summary?.sellerPipelineOverdue || 0) +
    (page.summary?.publicRequestsOverdue || 0) +
    (page.summary?.leadPipelineOverdue || 0);
  const title = label(copy, "today", "Today");
  const inboxHref = adminHref("/admin/leads", page);
  return adminShell(page, {
    title,
    mainAttrs: {
      "data-kind": "admin-today",
      "data-react-admin-ui": "today",
      "data-admin-workbench": "crm",
      "data-task-led": "true",
      "data-admin-locale": page.workspace.locale,
    },
    children: [
      h(
        PageHeader,
        { title, subtitle: page.metadata?.description },
        h("a", { className: "mk-btn mk-btn--secondary mk-btn--sm", href: inboxHref }, h(Icon, { name: "inbox", size: 16 }), h("span", null, label(copy, "viewLeadInbox", "Open lead inbox"))),
      ),
      h(
        "div",
        { className: "adm-workbench-shell adm-workbench-shell--today", "data-today-layout": "action-rail" },
        h(
          "div",
          { className: "adm-workbench-main" },
          h(
            Panel,
            { title: label(copy, "priorityLeads", "Priority leads"), "data-priority-leads": "true" },
            queue.pending.length
              ? h(
                  "ul",
                  { className: "adm-task-list" },
                  ...queue.pending.map((lead) => {
                    const sla = queue.leadSlaById.get(lead.lead_id);
                    const status = sla?.status || "pending";
                    return h(
                      "li",
                      { key: lead.lead_id, "data-priority-lead": lead.lead_id },
                      h(
                        "div",
                        { className: "adm-task-list__body" },
                        leadContactActions(lead, ui),
                        h("strong", null, [lead.listing_reference, lead.property?.location].filter(Boolean).join(" · ") || valueText(ui, lead.source)),
                        requestDetailsText(lead) ? h("small", { className: "adm-lead-context" }, requestDetailsText(lead)) : null,
                        h("code", { className: "crm-mono adm-task-list__reference" }, lead.lead_id),
                      ),
                      h(
                        "div",
                        { className: "adm-task-list__actions" },
                        h(StatusPill, { tone: queueTone(status) }, statusText(ui, status)),
                        h("a", { className: "mk-btn mk-btn--primary mk-btn--sm", href: `${inboxHref}#lead-${encodeURIComponent(lead.lead_id)}` }, label(copy, "openAndReply", "Open and reply")),
                      ),
                    );
                  }),
                )
              : h("p", { className: "adm-empty" }, label(copy, "noPriorityLeads", "No leads are waiting for a reply.")),
          ),
          h(
            Panel,
            {
              title: label(copy, "pipelineWorkspace", "Buyers and renters"),
              action: h("a", { className: "mk-btn mk-btn--secondary mk-btn--sm", href: adminHref("/admin/pipeline", page) }, label(copy, "openPipeline", "Open opportunities")),
              "data-lead-pipeline-preview": "true",
            },
            page.leadPipelineQueue?.rows?.length
              ? h(
                  "ul",
                  { className: "adm-task-list" },
                  ...page.leadPipelineQueue.rows.slice(0, 3).map((state) =>
                    h(
                      "li",
                      { key: state.lead_id, "data-pipeline-preview-row": state.lead_id },
                      h(
                        "div",
                        { className: "adm-task-list__body" },
                        h("code", { className: "crm-mono" }, state.lead_id),
                        h("strong", null, `${statusText(ui, state.lead_type)} · ${statusText(ui, state.stage)}`),
                        h("small", { className: "adm-lead-context" }, state.next_action ? statusText(ui, state.next_action) : ""),
                      ),
                      h(
                        "div",
                        { className: "adm-task-list__actions" },
                        h(StatusPill, { tone: state.overdue ? "brick" : "sea" }, state.overdue ? statusText(ui, "overdue") : statusText(ui, state.status)),
                        h("a", { className: "mk-btn mk-btn--primary mk-btn--sm", href: adminHref("/admin/pipeline", page) }, statusText(ui, "open")),
                      ),
                    ),
                  ),
                )
              : h("p", { className: "adm-empty" }, label(copy, "noOpenPipeline", "No open buyer or renter opportunities.")),
          ),
          h(ViewingFollowUpQueue, { page, copy, ui }),
          h(SellerPipelineQueue, { page, copy, ui }),
          h(
            Panel,
            {
              title: label(copy, "publicRequests", "Website requests"),
              action: h("a", { className: "mk-btn mk-btn--secondary mk-btn--sm", href: adminHref("/admin/requests", page) }, label(copy, "requestsWorkspace", "Requests and alerts")),
              "data-public-request-preview": "true",
            },
            page.publicRequestQueue?.rows?.length
              ? h(
                  "ul",
                  { className: "adm-task-list" },
                  ...page.publicRequestQueue.rows.slice(0, 3).map((row) =>
                    h(
                      "li",
                      { key: `${row.request_type}:${row.request_id}` },
                      h(
                        "div",
                        { className: "adm-task-list__body" },
                        h("code", { className: "crm-mono" }, row.request_id),
                        h("strong", null, row.request_type === "saved_search" ? label(copy, "savedSearchRequest", "Saved search") : label(copy, "languageRequest", "Language request")),
                      ),
                      h(
                        "div",
                        { className: "adm-task-list__actions" },
                        h(StatusPill, { tone: row.overdue ? "brick" : "sea" }, row.overdue ? statusText(ui, "overdue") : statusText(ui, row.status)),
                      ),
                    ),
                  ),
                )
              : h("p", { className: "adm-empty" }, label(copy, "noOpenRequests", "No open website requests.")),
          ),
        ),
        h(TodayReadinessRail, { page, copy, ui, queue, openTasks, overdueTasks, inboxHref }),
      ),
    ],
  });
}

function ViewingsBody({ page }) {
  const copy = adminCopy(page);
  const ui = workbenchCopy(page);
  const title = label(copy, "viewingsWorkspace", "Viewings and follow-ups");
  const viewings = [...(page.viewings || [])].sort((left, right) => Date.parse(left.starts_at) - Date.parse(right.starts_at));
  const metrics = [
    [label(copy, "viewings", "Viewings"), page.summary?.viewings || 0, "calendar-days", "sea"],
    [label(copy, "openFollowUps", "Open follow-ups"), page.summary?.viewingFollowUpsOpen || 0, "calendar-check", "sun"],
    [label(copy, "overdueFollowUps", "Overdue follow-ups"), page.summary?.viewingFollowUpsOverdue || 0, "triangle-alert", "brick"],
    [statusText(ui, "completed"), page.viewingFollowUpQueue?.summary?.completed || 0, "check-circle-2", "success"],
  ];
  return adminShell(page, {
    title,
    mainAttrs: {
      "data-kind": "admin-viewings",
      "data-react-admin-ui": "viewings",
      "data-admin-workbench": "crm",
      "data-admin-locale": page.workspace.locale,
    },
    children: [
      h(
        PageHeader,
        { title, subtitle: page.metadata?.description },
        h(
          "div",
          { className: "adm-planned adm-planned--inline", "data-planned-control": "viewing_week_view" },
          h(
            "div",
            { className: "crm-seg", role: "group", "aria-label": ui.viewingLayout },
            h("button", { type: "button", "data-on": "1", "aria-pressed": "true" }, ui.listView),
            h("button", { type: "button", "data-on": "0", disabled: true, "aria-describedby": "viewing-week-note", title: ui.weekViewNote }, ui.weekView, h(PlannedBadge, { ui })),
          ),
          h(PlannedNote, { id: "viewing-week-note", className: "adm-planned-note adm-visually-hidden" }, ui.weekViewNote),
        ),
        h("a", { className: "mk-btn mk-btn--secondary mk-btn--sm", href: "/api/admin/viewings.ics", download: true }, h(Icon, { name: "download", size: 16 }), h("span", null, label(copy, "downloadCalendar", "Download calendar"))),
      ),
      h(StatGrid, { metrics }),
      h(
        Panel,
        { title: label(copy, "upcomingViewings", "Upcoming viewings"), "data-viewing-schedule": "true" },
        viewings.length
          ? h(
              "ul",
              { className: "adm-task-list" },
              ...viewings.map((viewing) =>
                h(
                  "li",
                  { key: viewing.id, "data-viewing-schedule-row": viewing.id },
                  h(
                    "div",
                    { className: "adm-task-list__body" },
                    h("strong", null, viewing.listing_reference || viewing.lead_id),
                    h(
                      "span",
                      { className: "adm-viewing-list__meta" },
                      h("span", null, `${label(copy, "broker", "Broker")}: ${viewing.broker}`),
                      viewing.channel ? h("span", null, valueText(ui, viewing.channel)) : null,
                      h("code", { className: "crm-mono" }, viewing.id),
                    ),
                  ),
                  h(
                    "div",
                    { className: "adm-task-list__actions" },
                    h(StatusPill, { tone: viewing.status === "booked" ? "sea" : "success" }, statusText(ui, viewing.status)),
                    h("time", { dateTime: viewing.starts_at, title: viewing.starts_at }, formatAdminDateTime(viewing.starts_at, page.workspace.locale)),
                  ),
                ),
              ),
            )
          : h(EmptyState, { icon: "calendar-days" }, label(copy, "noUpcomingViewings", "No upcoming viewings.")),
      ),
      h(ViewingFollowUpQueue, { page, copy, ui }),
    ],
  });
}


function publicRequestCriteria(row) {
  const filters = Object.entries(row.filters || {})
    .filter(([, value]) => value !== null && value !== undefined && value !== "" && value !== false)
    .map(([key, value]) => `${key.replaceAll("_", " ")}: ${Array.isArray(value) ? value.join(", ") : value}`);
  return [row.query ? `“${row.query}”` : null, ...filters].filter(Boolean).join(" · ");
}

function publicRequestTone(row) {
  if (row.overdue) return "brick";
  if (row.status === "contacted") return "sea";
  if (row.status === "completed") return "success";
  if (row.status === "closed") return "sand";
  return "sun";
}

function PublicRequestOutcomeForm({ page, row, copy, terminal = false }) {
  const formAttrs = {
    method: "post",
    action: "/api/admin/public-requests/outcome",
    className: "adm-form adm-public-request-form",
    "data-public-request-outcome-form": "true",
    "data-public-request-saving": label(copy, "publicRequestSaving", "Recording request outcome…"),
    "data-public-request-success": label(copy, "publicRequestSaved", "Request outcome recorded."),
    "data-public-request-failure": label(copy, "publicRequestSaveFailed", "Could not record request outcome."),
  };
  return h(
    "form",
    formAttrs,
    h("input", { type: "hidden", name: "requestType", value: row.request_type }),
    h("input", { type: "hidden", name: "requestId", value: row.request_id }),
    h("input", { type: "hidden", name: "actor", value: currentOperatorId(page, row.owner) }),
    h(
      "label",
      null,
      label(copy, "nextFollowUp", "Next follow-up"),
      h("input", { type: "datetime-local", name: "nextFollowUpAt", min: datetimeLocalValue(new Date().toISOString()) }),
    ),
    terminal
      ? null
      : h(
          "label",
          null,
          label(copy, "publicRequestNote", "Outcome note"),
          h("textarea", { name: "note", rows: 3, maxLength: 2000, required: true }),
        ),
    h(
      "div",
      { className: "adm-form__actions" },
      terminal
        ? h("button", { type: "submit", name: "action", value: "reopen", formNoValidate: true, className: "mk-btn mk-btn--secondary mk-btn--sm" }, label(copy, "reopenRequest", "Reopen request"))
        : [
            h("button", { key: "contacted", type: "submit", name: "action", value: "contacted", formNoValidate: true, className: "mk-btn mk-btn--primary mk-btn--sm" }, label(copy, "markContacted", "Mark contacted")),
            h("button", { key: "complete", type: "submit", name: "action", value: "complete", className: "mk-btn mk-btn--secondary mk-btn--sm" }, label(copy, "complete", "Complete")),
            h("button", { key: "close", type: "submit", name: "action", value: "close", className: "mk-btn mk-btn--secondary mk-btn--sm" }, label(copy, "closeRequest", "Close request")),
            h("button", { key: "note", type: "submit", name: "action", value: "note", className: "mk-btn mk-btn--ghost mk-btn--sm" }, label(copy, "noteOnly", "Note only")),
          ],
    ),
    h("p", { className: "adm-reply-status", role: "status", "aria-live": "polite", "data-public-request-status": "true" }),
  );
}

function PublicRequestCard({ page, row, copy, ui, terminal = false, filterScope = null }) {
  const requestType =
    row.request_type === "saved_search"
      ? label(copy, "savedSearchRequest", "Saved search")
      : label(copy, "languageRequest", "Language request");
  const contact = leadContactActions(row, ui);
  const unavailable =
    row.contact_state === "locked"
      ? label(copy, "contactVaultLocked", "The contact vault could not be unlocked. Check the environment key.")
      : label(copy, "noPrivateContact", "No private contact is available for this request.");
  return h(
    "li",
    {
      className: "adm-public-request",
      "data-public-request": row.request_id,
      "data-public-request-type": row.request_type,
      "data-public-request-status": row.status,
      "data-overdue": row.overdue ? "true" : "false",
      "data-list-item": filterScope || undefined,
      "data-filter-tags": filterScope ? [row.request_type, row.overdue ? "overdue" : ""].filter(Boolean).join(" ") : undefined,
    },
    h(
      "div",
      { className: "adm-public-request__summary" },
      h(
        "div",
        { className: "adm-public-request__heading" },
        h("div", null, h("h3", null, requestType), h("code", { className: "crm-mono" }, row.request_id)),
        h(StatusPill, { tone: publicRequestTone(row) }, row.overdue ? statusText(ui, "overdue") : statusText(ui, row.status)),
      ),
      h(
        "dl",
        { className: "adm-public-request__facts" },
        h("div", null, h("dt", null, label(copy, "requestedLocale", "Requested locale")), h("dd", null, row.requested_locale || row.locale ? String(row.requested_locale || row.locale).toUpperCase() : ui.notSet)),
        row.request_type === "saved_search"
          ? h("div", null, h("dt", null, label(copy, "searchCriteria", "Search criteria")), h("dd", null, publicRequestCriteria(row) || ui.notSet))
          : h("div", null, h("dt", null, label(copy, "requestedPath", "Requested page")), h("dd", { className: "crm-mono" }, row.requested_path || ui.notSet)),
        row.request_type === "saved_search"
          ? h("div", null, h("dt", null, label(copy, "alertFrequency", "Alert frequency")), h("dd", null, row.alert_frequency ? statusText(ui, row.alert_frequency) : ui.notSet))
          : null,
        row.request_type === "saved_search"
          ? h("div", null, h("dt", null, label(copy, "matches", "Matches")), h("dd", null, row.match_count ?? 0))
          : null,
        h(
          "div",
          null,
          h("dt", null, ui.received),
          h("dd", null, row.created_at ? h("time", { dateTime: row.created_at }, formatAdminDateTime(row.created_at, page.workspace.locale)) : ui.notSet),
        ),
        h(
          "div",
          null,
          h("dt", null, label(copy, "nextFollowUp", "Next follow-up")),
          h("dd", null, row.next_follow_up_at ? h("time", { dateTime: row.next_follow_up_at }, formatAdminDateTime(row.next_follow_up_at, page.workspace.locale)) : ui.notSet),
        ),
      ),
      h(
        "div",
        { className: "adm-public-request__contact", "data-private-request-contact": "true" },
        h("strong", null, label(copy, "customerContact", "Customer contact")),
        contact || h("p", { className: "adm-empty" }, unavailable),
        row.message
          ? h("div", { className: "adm-public-request__message", "data-private-request-message": "true" }, h("small", null, label(copy, "privateMessage", "Private message")), h("p", null, row.message))
          : null,
      ),
    ),
    h(
      "details",
      { className: "adm-public-request__outcome" },
      h("summary", { className: "mk-btn mk-btn--secondary mk-btn--sm" }, h(Icon, { name: terminal ? "arrow-left" : "check-circle-2", size: 16 }), label(copy, terminal ? "reopenRequest" : "recordRequestOutcome", terminal ? "Reopen request" : "Record outcome")),
      h(PublicRequestOutcomeForm, { page, row, copy, terminal }),
    ),
  );
}

function PublicRequestsBody({ page }) {
  const copy = adminCopy(page);
  const ui = workbenchCopy(page);
  const queue = page.publicRequestQueue || { rows: [], states: [], summary: {} };
  const terminal = (queue.states || []).filter((row) => row.status === "completed" || row.status === "closed").toReversed();
  const title = label(copy, "requestsWorkspace", "Requests and alerts");
  const metrics = [
    [label(copy, "openTasks", "Open tasks"), queue.summary?.open || 0, "bell", "sun"],
    [statusText(ui, "overdue"), queue.summary?.overdue || 0, "triangle-alert", "brick"],
    [label(copy, "savedSearches", "Saved searches"), queue.summary?.saved_search_open || 0, "star", "sea"],
    [label(copy, "languageRequests", "Language requests"), queue.summary?.language_request_open || 0, "languages", "sand"],
  ];
  const filterOptions = [
    { value: "all", label: label(copy, "all", "All"), count: queue.rows.length },
    { value: "saved_search", label: label(copy, "savedSearches", "Saved searches"), count: queue.rows.filter((row) => row.request_type === "saved_search").length },
    { value: "language_request", label: label(copy, "languageRequests", "Language requests"), count: queue.rows.filter((row) => row.request_type === "language_request").length },
    { value: "overdue", label: statusText(ui, "overdue"), count: queue.rows.filter((row) => row.overdue).length },
  ];
  return adminShell(page, {
    title,
    mainAttrs: {
      "data-kind": "admin-requests",
      "data-react-admin-ui": "requests",
      "data-admin-workbench": "crm",
      "data-private-contact-vault": queue.contact_vault_status || "not_configured",
      "data-admin-locale": page.workspace.locale,
      "data-task-led": "true",
    },
    children: [
      h(PageHeader, { title, subtitle: page.metadata?.description }),
      h(StatGrid, { metrics }),
      queue.contact_vault_status === "locked"
        ? h("p", { className: "adm-inline-alert", role: "alert" }, label(copy, "contactVaultLocked", "The contact vault could not be unlocked. Check the environment key."))
        : null,
      queue.rows.length ? h(PageToolbar, null, h(ListFilterTabs, { scope: "requests", label: label(copy, "publicRequests", "Website requests"), options: filterOptions })) : null,
      h(
        Panel,
        { title: label(copy, "publicRequests", "Website requests"), "data-public-request-queue": "true" },
        queue.rows.length
          ? [
              h(ListEmptyNote, { key: "empty", scope: "requests" }, ui.noFilterMatches),
              h("ul", { key: "list", className: "adm-public-request-list" }, ...queue.rows.map((row) => h(PublicRequestCard, { key: `${row.request_type}:${row.request_id}`, page, row, copy, ui, filterScope: "requests" }))),
            ]
          : h(EmptyState, { icon: "bell" }, label(copy, "noOpenRequests", "No open website requests.")),
      ),
      terminal.length
        ? h(
            "details",
            { className: "crm-panel adm-request-history", "data-public-request-history": "true" },
            h("summary", { className: "adm-disclosure-chevron" }, h(Icon, { name: "check-circle-2", size: 16 }), h("span", null, ui.completedRequests), h("span", { className: "adm-seg-count" }, terminal.length)),
            h("ul", { className: "adm-public-request-list" }, ...terminal.slice(0, 20).map((row) => h(PublicRequestCard, { key: `${row.request_type}:${row.request_id}`, page, row, copy, ui, terminal: true }))),
          )
        : null,
    ],
  });
}


function auditMetadataValue(value, ui) {
  if (value === null || value === undefined || value === "") return ui.notSet;
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function ActivityBody({ page }) {
  const copy = adminCopy(page);
  const ui = workbenchCopy(page);
  const title = label(copy, "activity", "Activity history");
  const metrics = [
    [label(copy, "totalActions", "Recorded actions"), page.summary?.totalActions || 0, "list", "ink"],
    [label(copy, "activeOperators", "Active operators"), page.summary?.activeOperators || 0, "users", "sea"],
    [label(copy, "object", "Object"), page.summary?.objectTypes || 0, "table-properties", "sand"],
  ];
  return adminShell(page, {
    title,
    mainAttrs: {
      "data-kind": "admin-activity",
      "data-react-admin-ui": "activity",
      "data-admin-workbench": "crm",
      "data-privacy-safe": "true",
      "data-admin-locale": page.workspace.locale,
    },
    children: [
      h(PageHeader, { title, subtitle: page.metadata?.description }),
      h(StatGrid, { metrics }),
      h(
        "form",
        { method: "get", action: "/admin/activity", className: "adm-filterbar", role: "search", "data-activity-filters": "true" },
        filterLocaleInput(page),
        h("label", null, label(copy, "leadReference", "Lead ID"), h("input", { name: "leadId", defaultValue: page.filters?.leadId, placeholder: "lead-…" })),
        h("label", null, label(copy, "listingReference", "Listing ID"), h("input", { name: "listingId", defaultValue: page.filters?.listingId, placeholder: "MS-CRAWL-0001" })),
        h("label", null, label(copy, "actor", "Operator"), h("input", { name: "actor", defaultValue: page.filters?.actor })),
        h("label", null, label(copy, "action", "Action"), h("input", { name: "action", defaultValue: page.filters?.action })),
        h("button", { type: "submit", className: "mk-btn mk-btn--primary mk-btn--md" }, h(Icon, { name: "filter", size: 16 }), label(copy, "filter", "Filter")),
        h("a", { className: "mk-btn mk-btn--ghost mk-btn--md", href: adminHref("/admin/activity", page) }, label(copy, "resetFilters", "Reset filters")),
      ),
      h(
        Panel,
        { title: label(copy, "activityLog", "Action log"), "data-audit-log": "true" },
        page.auditLog.length
          ? h(
              "ol",
              { className: "adm-activity" },
              ...page.auditLog.map((row, index) =>
                h(
                  "li",
                  { key: `${row.recorded_at}-${row.action}-${row.object_id}-${index}`, "data-audit-action": row.action },
                  h("span", { className: "adm-activity__icon", "aria-hidden": "true" }, h(Icon, { name: "check", size: 16 })),
                  h(
                    "div",
                    { className: "adm-activity__body" },
                    h("strong", null, ui.auditActions?.[row.action] || valueText(ui, row.action)),
                    h(
                      "div",
                      { className: "adm-activity__meta" },
                      h("span", null, `${label(copy, "actor", "Operator")}: ${row.actor}`),
                      h("span", null, `${label(copy, "object", "Object")}: ${valueText(ui, row.object_type)} · ${row.object_id}`),
                      row.locale ? h("span", { className: "crm-lang" }, row.locale.toUpperCase()) : null,
                      h("time", { dateTime: row.recorded_at, title: row.recorded_at }, formatAdminDateTime(row.recorded_at, page.workspace.locale)),
                    ),
                    Object.keys(row.metadata || {}).length
                      ? h(
                          "details",
                          { className: "adm-activity__details" },
                          h("summary", null, label(copy, "details", "Details")),
                          h(
                            "dl",
                            null,
                            ...Object.entries(row.metadata).flatMap(([key, value]) => [
                              h("dt", { key: `${key}-term` }, valueText(ui, key)),
                              h("dd", { key: `${key}-value` }, auditMetadataValue(value, ui)),
                            ]),
                          ),
                        )
                      : null,
                  ),
                ),
              ),
            )
          : h("p", { className: "adm-empty" }, label(copy, "noActivity", "No actions have been recorded yet.")),
      ),
      h(Pagination, { page, path: "/admin/activity" }),
    ],
  });
}

function ReportBars({ rows = [], ui, keyLabel = (row) => valueText(ui, row.key), valueKey = "count" }) {
  if (!rows.length) return h("p", { className: "adm-empty" }, ui.noReportData);
  const max = Math.max(1, ...rows.map((row) => Number(row[valueKey] || 0)));
  return h(
    "ol",
    { className: "adm-report-bars" },
    ...rows.map((row) => {
      const value = Number(row[valueKey] || 0);
      return h(
        "li",
        { key: row.key || row.stage },
        h("span", { className: "adm-report-bars__label" }, keyLabel(row)),
        h("span", { className: "adm-report-bars__track", "aria-hidden": "true" }, h("span", { style: `width:${Math.max(value ? 4 : 0, (value / max) * 100)}%` })),
        h("strong", null, value),
      );
    }),
  );
}

function ReportPipelineCard({ title, pipeline, ui }) {
  const rows = (pipeline.stages || []).map((row) => ({
    key: row.stage || row.key,
    count: row.reached ?? row.count ?? 0,
  }));
  return h(
    "article",
    { className: "adm-report-card" },
    h(
      "header",
      null,
      h("div", null, h("h3", null, title), h("small", null, `${ui.open}: ${pipeline.open || 0}`)),
      h("strong", null, pipeline.total || 0),
    ),
    h(ReportBars, { rows, ui, keyLabel: (row) => statusText(ui, row.key) }),
  );
}

function OperationsReportsBody({ page }) {
  const copy = adminCopy(page);
  const ui = workbenchCopy(page);
  const report = page.report;
  const title = label(copy, "operationsReports", ui.operationsReports);
  const minuteValue = (value) => (value === null || value === undefined ? ui.noData : `${value} ${ui.minutesShort}`);
  const metrics = [
    [label(copy, "leads", "Leads"), report.summary.leads, "users", "ink"],
    [ui.responseRate, `${report.summary.response_rate_pct}%`, "send", "sea"],
    [ui.medianResponse, minuteValue(report.summary.median_response_minutes), "clock", "sun"],
    [ui.overdueWork, report.summary.overdue_tasks, "triangle-alert", report.summary.overdue_tasks ? "brick" : "success"],
  ];
  return adminShell(page, {
    title,
    mainAttrs: {
      "data-kind": "admin-operations-reports",
      "data-react-admin-ui": "operations-reports",
      "data-admin-workbench": "crm",
      "data-privacy-safe": "true",
      "data-admin-locale": page.workspace.locale,
      "data-report-generated-at": report.generated_at,
    },
    children: [
      h(
        PageHeader,
        { title, subtitle: page.metadata?.description },
        h("a", { className: "mk-btn mk-btn--secondary mk-btn--sm", href: "/api/admin/reports/export" }, h(Icon, { name: "download", size: 16 }), ui.downloadSourceReport),
      ),
      h("p", { className: "adm-report-privacy" }, h(Icon, { name: "shield-check", size: 17 }), ui.privacySafeReport),
      h(StatGrid, { metrics }),
      h(
        Panel,
        { title: ui.websiteFunnel, "data-report-section": "website-funnel" },
        h(
          "div",
          { className: "adm-report-grid adm-report-grid--two" },
          h("section", { className: "adm-report-card" }, h(ReportBars, {
            rows: report.website_funnel.stages,
            ui,
            keyLabel: (row) => ({ page_view: ui.pageViews, search: ui.searchEvents, cta_click: ui.ctaClicks, lead: ui.funnelLeads })[row.key] || row.key,
          })),
          h(
            "dl",
            { className: "adm-report-facts" },
            h("div", null, h("dt", null, ui.searchesPer100Views), h("dd", null, report.website_funnel.searches_per_100_views)),
            h("div", null, h("dt", null, ui.ctaClickRate), h("dd", null, `${report.website_funnel.cta_click_rate_pct}%`)),
            h("div", null, h("dt", null, ui.leadConversion), h("dd", null, `${report.website_funnel.lead_conversion_pct}%`)),
            h("div", null, h("dt", null, ui.durableWebsiteLeads), h("dd", null, report.website_funnel.durable_website_leads)),
            h("div", null, h("dt", null, ui.leadTrackingGap), h("dd", { "data-funnel-tracking-status": report.website_funnel.lead_tracking_status }, report.website_funnel.lead_tracking_gap)),
          ),
        ),
      ),
      h(
        Panel,
        { title: ui.leadVolume, "data-report-section": "lead-volume" },
        h(
          "div",
          { className: "adm-report-grid adm-report-grid--three" },
          h("section", { className: "adm-report-card" }, h("h3", null, ui.bySource), h(ReportBars, { rows: report.lead_volume.by_source, ui })),
          h("section", { className: "adm-report-card" }, h("h3", null, ui.byLanguage), h(ReportBars, { rows: report.lead_volume.by_language, ui, keyLabel: (row) => row.key.toUpperCase() })),
          h("section", { className: "adm-report-card" }, h("h3", null, ui.byType), h(ReportBars, { rows: report.lead_volume.by_type, ui, keyLabel: (row) => statusText(ui, row.key) })),
        ),
      ),
      h(
        Panel,
        { title: ui.sourceQuality, "data-report-section": "source-quality" },
        report.source_quality.length
          ? h(
              "div",
              { className: "adm-report-source-grid" },
              ...report.source_quality.map((row) =>
                h(
                  "article",
                  { key: row.source, className: "adm-report-source", "data-report-source": row.source },
                  h("header", null, h("h3", null, valueText(ui, row.source)), h("strong", null, row.leads)),
                  h(
                    "dl",
                    null,
                    h("div", null, h("dt", null, ui.actualResponses), h("dd", null, `${row.replies_sent} · ${row.response_rate_pct}%`)),
                    h("div", null, h("dt", null, ui.qualified), h("dd", null, row.qualified)),
                    h("div", null, h("dt", null, ui.viewingLeads), h("dd", null, row.viewing_leads)),
                    h("div", null, h("dt", null, ui.closedDeals), h("dd", null, row.closed_deals)),
                    h("div", null, h("dt", null, ui.conversion), h("dd", null, `${row.deal_conversion_pct}%`)),
                  ),
                ),
              ),
            )
          : h("p", { className: "adm-empty" }, ui.noReportData),
      ),
      h(
        "div",
        { className: "adm-report-grid adm-report-grid--two" },
        h(
          Panel,
          { title: ui.responseTime, "data-report-section": "response-time" },
          h(
            "dl",
            { className: "adm-report-facts" },
            h("div", null, h("dt", null, ui.actualResponses), h("dd", null, report.response_time.sent)),
            h("div", null, h("dt", null, ui.average), h("dd", null, minuteValue(report.response_time.average_minutes))),
            h("div", null, h("dt", null, ui.medianResponse), h("dd", null, minuteValue(report.response_time.median_minutes))),
            h("div", null, h("dt", null, ui.p90), h("dd", null, minuteValue(report.response_time.p90_minutes))),
            h("div", null, h("dt", null, ui.withinSla), h("dd", null, `${report.response_time.within_sla_rate_pct}%`)),
          ),
        ),
        h(
          Panel,
          { title: ui.searchSignals, "data-report-section": "search" },
          h(
            "dl",
            { className: "adm-report-facts" },
            h("div", null, h("dt", null, ui.searchEvents), h("dd", null, report.search.search_events || 0)),
            h("div", null, h("dt", null, ui.zeroResults), h("dd", null, report.search.zero_result_events || 0)),
            h("div", null, h("dt", null, ui.popularFilters), h("dd", null, (report.search.popular_filters || []).slice(0, 3).map((row) => `${row.key} (${row.count})`).join(" · ") || ui.noData)),
          ),
        ),
      ),
      h(
        Panel,
        { title: ui.pipelines, "data-report-section": "pipelines" },
        h(
          "div",
          { className: "adm-report-grid adm-report-grid--three" },
          h(ReportPipelineCard, { title: label(copy, "buyerPipeline", statusText(ui, "buyer")), pipeline: report.pipelines.buyer, ui }),
          h(ReportPipelineCard, { title: label(copy, "renterPipeline", statusText(ui, "renter")), pipeline: report.pipelines.renter, ui }),
          h(ReportPipelineCard, { title: label(copy, "sellerPipeline", statusText(ui, "seller")), pipeline: report.pipelines.seller, ui }),
        ),
      ),
      h(
        Panel,
        { title: ui.workQueueHealth, "data-report-section": "task-health" },
        h(
          "ul",
          { className: "adm-report-queues" },
          ...report.task_health.rows.map((row) =>
            h(
              "li",
              { key: row.queue, "data-report-queue": row.queue, "data-overdue": row.overdue ? "true" : "false" },
              h("strong", null, valueText(ui, row.queue)),
              h("span", null, `${ui.open}: ${row.open}`),
              h("span", null, `${ui.overdue}: ${row.overdue}`),
              h("span", null, `${ui.blocked}: ${row.blocked}`),
            ),
          ),
        ),
      ),
      h(
        Panel,
        { title: ui.listingInventory, "data-report-section": "listing-inventory" },
        h(
          "div",
          { className: "adm-report-inventory" },
          h("dl", { className: "adm-report-facts" }, h("div", null, h("dt", null, ui.activeListings), h("dd", null, `${report.listing_inventory.active} / ${report.listing_inventory.total}`)), h("div", null, h("dt", null, ui.reviewRequired), h("dd", null, report.listing_inventory.review_required)), h("div", null, h("dt", null, ui.translationReview), h("dd", null, report.listing_inventory.translation_review))),
          h("section", { className: "adm-report-card" }, h("h3", null, label(copy, "qualityStatus", "Status")), h(ReportBars, { rows: report.listing_inventory.by_status, ui, keyLabel: (row) => statusText(ui, row.key) })),
          h("section", { className: "adm-report-card" }, h("h3", null, label(copy, "language", "Language")), h(ReportBars, { rows: report.listing_inventory.by_source_locale, ui, keyLabel: (row) => row.key.toUpperCase() })),
        ),
      ),
    ],
  });
}

/* ============================================================
   Lead inbox (ui_kits/crm Dashboard + Messages patterns)
   ============================================================ */

function ReplyDeliveryForm({ page, lead, reply, delivery, copy, ui }) {
  const failed = delivery?.status === "failed";
  const status = delivery?.status || "queued";
  const operator = currentOperatorId(page, reply.reviewer);
  const canSendViaGoogle = Boolean(page.providerConnections?.google?.connected && lead?.contact?.email);
  const canSendViaWhatsApp = Boolean(
    page.providerConnections?.whatsapp?.connected && (lead?.contact?.whatsapp || lead?.contact?.phone),
  );
  const canSendViaViber = Boolean(page.providerConnections?.viber?.connected && lead?.contact?.viber_user_id);
  return h(
    "details",
    { className: "adm-delivery", open: failed, "data-reply-delivery": status },
    h(
      "summary",
      { className: `mk-btn ${failed ? "mk-btn--accent" : "mk-btn--primary"} mk-btn--sm` },
      h(Icon, { name: failed ? "triangle-alert" : "send", size: 16 }),
      h("span", null, failed ? statusText(ui, "failed") : label(copy, "queuedForManualSend", "Ready for manual sending")),
    ),
    h(
      "form",
      {
        method: "post",
        action: "/api/admin/replies/delivery",
        className: "adm-delivery-form",
        "data-reply-delivery-form": "true",
        "data-reply-delivery-saving": label(copy, "replyDeliverySaving", "Recording reply delivery…"),
        "data-reply-delivery-success": label(copy, "replyDeliverySaved", "Reply delivery status recorded."),
        "data-reply-delivery-failure": label(copy, "replyDeliverySaveFailed", "Could not record reply delivery status."),
      },
      h("input", { type: "hidden", name: "replyId", value: reply.id }),
      h("input", { type: "hidden", name: "actor", value: operator }),
      h(
        "div",
        { className: "adm-delivery-form__meta" },
        h(StatusPill, { tone: failed ? "brick" : "sun" }, statusText(ui, status)),
        h("span", null, `${label(copy, "reviewer", "Reviewer")}: ${reply.reviewer}`),
        h("time", { dateTime: reply.reviewed_at, title: reply.reviewed_at }, formatAdminDateTime(reply.reviewed_at, page.workspace?.locale)),
      ),
      h(
        "label",
        null,
        label(copy, "reviewedReply", "Reviewed reply"),
        h("textarea", {
          rows: 5,
          readOnly: true,
          defaultValue: reply.reviewed_reply,
          "data-approved-reply": "true",
        }),
      ),
      h(
        "label",
        null,
        label(copy, "deliveryChannel", "Delivery channel"),
        h(
          "select",
          { name: "channel", required: !failed },
          h("option", { value: "" }, ui.chooseOption),
          ...["email", "phone", "whatsapp", "viber", "sms", "other"].map((channel) =>
            h("option", { key: channel, value: channel, selected: delivery?.delivery_channel === channel }, valueText(ui, channel)),
          ),
        ),
      ),
      h(
        "label",
        null,
        label(copy, "deliveryNote", "Delivery note"),
        h("textarea", { name: "note", rows: 3, maxLength: 2000, required: failed }),
      ),
      h(
        "div",
        { className: "adm-delivery-form__actions" },
        failed
          ? h(
              "button",
              { type: "submit", name: "action", value: "requeue", formNoValidate: true, className: "mk-btn mk-btn--secondary mk-btn--sm" },
              label(copy, "requeueReply", "Return to queue"),
            )
          : [
              canSendViaGoogle
                ? h(
                    "button",
                    {
                      key: "gmail-send",
                      type: "submit",
                      name: "provider",
                      value: "google",
                      formNoValidate: true,
                      className: "mk-btn mk-btn--primary mk-btn--sm",
                    },
                    label(copy, "sendWithGmail", "Send with Gmail"),
                  )
                : null,
              canSendViaWhatsApp
                ? h(
                    "button",
                    {
                      key: "whatsapp-send",
                      type: "submit",
                      name: "provider",
                      value: "whatsapp",
                      formNoValidate: true,
                      className: "mk-btn mk-btn--primary mk-btn--sm",
                    },
                    label(copy, "sendWithWhatsApp", "Send with WhatsApp"),
                  )
                : null,
              canSendViaViber
                ? h(
                    "button",
                    {
                      key: "viber-send",
                      type: "submit",
                      name: "provider",
                      value: "viber",
                      formNoValidate: true,
                      className: "mk-btn mk-btn--primary mk-btn--sm",
                    },
                    label(copy, "sendWithViber", "Send with Viber"),
                  )
                : null,
              h("button", { key: "sent", type: "submit", name: "action", value: "sent", className: "mk-btn mk-btn--primary mk-btn--sm" }, label(copy, "markSent", "Mark sent")),
              h("button", { key: "failed", type: "submit", name: "action", value: "failed", className: "mk-btn mk-btn--secondary mk-btn--sm" }, label(copy, "recordDeliveryFailure", "Record delivery failure")),
            ],
      ),
      h("p", { className: "adm-reply-status", role: "status", "aria-live": "polite", "data-reply-delivery-status": "true" }),
    ),
  );
}

function DirectProviderReplyForm({ page, lead, copy, ui }) {
  const providers = [
    page.providerConnections?.google?.connected && lead?.contact?.email ? ["google", "Gmail"] : null,
    page.providerConnections?.whatsapp?.connected && (lead?.contact?.whatsapp || lead?.contact?.phone)
      ? ["whatsapp", "WhatsApp"]
      : null,
    page.providerConnections?.viber?.connected && lead?.contact?.viber_user_id ? ["viber", "Viber"] : null,
  ].filter(Boolean);
  if (!providers.length) {
    return h(
      "p",
      { className: "adm-reply-status", role: "status" },
      label(copy, "providerReplyUnavailable", "No connected provider can reach this lead. "),
      h("a", { href: "/admin/connect" }, label(copy, "openConnectionCenter", "Open Connection Center")),
    );
  }
  return h(
    "details",
    { className: "adm-reply", "data-direct-provider-reply": "true" },
    h(
      "summary",
      { className: "mk-btn mk-btn--primary mk-btn--sm" },
      h(Icon, { name: "send", size: 16 }),
      h("span", null, label(copy, "approveAndSend", "Approve and send")),
    ),
    h(
      "form",
      {
        method: "post",
        action: "/api/admin/replies/delivery",
        className: "adm-reply-form",
        "data-reply-delivery-form": "true",
        "data-reply-delivery-saving": label(copy, "providerReplySending", "Sending approved reply…"),
        "data-reply-delivery-success": label(copy, "providerReplySent", "Provider confirmed the reply."),
        "data-reply-delivery-failure": label(copy, "providerReplyFailed", "The provider did not confirm the reply."),
      },
      h("input", { type: "hidden", name: "leadId", value: lead.lead_id }),
      h("input", { type: "hidden", name: "approved", value: "true" }),
      h("input", { type: "hidden", name: "idempotencyKey", value: `provider:${randomUUID()}` }),
      h(CommunicationTemplateSelect, { templates: page.communicationTemplates?.[lead.lead_id] || [], copy, ui }),
      h(
        "label",
        null,
        label(copy, "reviewedReply", "Reviewed reply"),
        h("textarea", { name: "reviewedReply", rows: 6, maxLength: 4096, required: true }),
      ),
      h(
        "label",
        null,
        label(copy, "deliveryProvider", "Delivery provider"),
        h(
          "select",
          { name: "provider", required: true },
          ...providers.map(([value, text]) => h("option", { key: value, value }, text)),
        ),
      ),
      h(
        "button",
        { type: "submit", className: "mk-btn mk-btn--primary mk-btn--sm" },
        label(copy, "approveAndSend", "Approve and send"),
      ),
      h(
        "small",
        { className: "adm-lead-context" },
        label(copy, "providerApprovalNotice", "Sending records your operator identity and the exact approved text in an encrypted receipt."),
      ),
      h("p", { className: "adm-reply-status", role: "status", "aria-live": "polite", "data-reply-delivery-status": "true" }),
    ),
  );
}

function PipelineOutcomeForm({ page, state, action, submitLabel, children, noteRequired = false, variant = "primary" }) {
  const copy = adminCopy(page);
  return h(
    "form",
    {
      method: "post",
      action: "/api/admin/lead-pipeline/outcome",
      className: "adm-form adm-pipeline-form",
      "data-admin-mutation-form": "lead-pipeline",
      "data-admin-mutation-saving": label(copy, "pipelineSaving", "Recording pipeline action…"),
      "data-admin-mutation-success": label(copy, "pipelineSaved", "Pipeline action recorded."),
      "data-admin-mutation-failure": label(copy, "pipelineSaveFailed", "Could not record pipeline action."),
    },
    h("input", { type: "hidden", name: "leadId", defaultValue: state.lead_id }),
    h("input", { type: "hidden", name: "actor", defaultValue: currentOperatorId(page, state.assigned_broker) }),
    h("input", { type: "hidden", name: "action", defaultValue: action }),
    children,
    action === "note" || action === "lost"
      ? h(
          "label",
          null,
          label(copy, "pipelineNote", "Internal note"),
          h("textarea", { name: "note", required: noteRequired, maxLength: "2000", rows: "3" }),
        )
      : null,
    h(
      "div",
      { className: "adm-form__actions" },
      h("p", { className: "crm-tbl__muted", role: "status", "aria-live": "polite", "data-admin-mutation-status": "true" }),
      h("button", { type: "submit", className: `mk-btn mk-btn--${variant} mk-btn--sm` }, submitLabel),
    ),
  );
}

function PipelinePrimaryAction({ page, state }) {
  const copy = adminCopy(page);
  const ui = workbenchCopy(page);
  const next = state.next_action;
  const intake = state.intake_requirements || {};
  if (!next) return null;
  if (next === "qualify") {
    return h(
      "details",
      { className: "adm-pipeline-action" },
      h("summary", null, label(copy, "qualification", "Qualification")),
      h(
        PipelineOutcomeForm,
        { page, state, action: "qualify", submitLabel: label(copy, "qualifyLead", "Qualify lead") },
        h(
          "div",
          { className: "adm-pipeline-fields adm-pipeline-fields--two" },
          h("label", null, label(copy, "budgetMin", "Minimum budget (€)"), h("input", { name: "budgetMinEur", type: "number", min: "0", step: "1", defaultValue: intake.budget_min_eur ?? "" })),
          h("label", null, label(copy, "budgetMax", "Maximum budget (€)"), h("input", { name: "budgetMaxEur", type: "number", min: "1", step: "1", required: true, defaultValue: intake.budget_max_eur ?? "" })),
          h("label", null, label(copy, "locations", "Locations"), h("input", { name: "locations", required: true, placeholder: "Sandanski", defaultValue: (intake.locations || []).join(", ") })),
          h(PropertyFamilyChecks, { ui, name: "propertyTypes", selected: intake.property_types, legend: label(copy, "propertyTypes", "Property types") }),
          h("label", null, label(copy, "bedroomsMin", "Minimum bedrooms"), h("input", { name: "bedroomsMin", type: "number", min: "0", max: "20", step: "1", defaultValue: intake.bedrooms_min ?? "" })),
          h(
            "label",
            null,
            label(copy, "financeStatus", "Finance status"),
            h(
              "select",
              { name: "financeStatus", defaultValue: intake.finance_status || (state.pipeline === "renter" ? "not_applicable" : "unknown") },
              ...["unknown", "cash", "mortgage", "preapproved", "not_applicable"].map((value) => h("option", { key: value, value }, statusText(ui, value))),
            ),
          ),
          h("label", null, label(copy, "timeline", "Decision timeline"), h("input", { name: "timeline", required: true, defaultValue: intake.timeline || "" })),
          h("label", null, label(copy, "nextFollowUp", "Next follow-up"), h("input", { name: "nextFollowUpAt", type: "datetime-local", required: true })),
        ),
      ),
    );
  }
  if (next === "book_viewing") {
    return h(
      "details",
      { className: "adm-pipeline-action" },
      h("summary", null, label(copy, "bookViewing", "Book viewing")),
      h(
        "form",
        {
          method: "post",
          action: "/api/admin/viewings",
          className: "adm-form adm-pipeline-form",
          "data-admin-mutation-form": "viewing",
          "data-admin-mutation-saving": label(copy, "viewingBookingSaving", "Booking viewing…"),
          "data-admin-mutation-success": label(copy, "viewingBookingSaved", "Viewing booked."),
          "data-admin-mutation-failure": label(copy, "viewingBookingSaveFailed", "Could not book viewing."),
        },
        h("input", { type: "hidden", name: "leadId", defaultValue: state.lead_id }),
        h("input", { type: "hidden", name: "broker", defaultValue: currentOperatorId(page, state.assigned_broker) }),
        h(
          "div",
          { className: "adm-pipeline-fields adm-pipeline-fields--two" },
          h("label", null, label(copy, "listingReference", "Listing reference"), h("input", { name: "listingReference", required: true, defaultValue: state.listing_reference || "" })),
          h("label", null, label(copy, "viewingStartsAt", "Viewing date and time"), h("input", { name: "startsAt", type: "datetime-local", required: true })),
        ),
        h(
          "div",
          { className: "adm-form__actions" },
          h("p", { className: "crm-tbl__muted", role: "status", "aria-live": "polite", "data-admin-mutation-status": "true" }),
          h("button", { type: "submit", className: "mk-btn mk-btn--primary mk-btn--sm" }, label(copy, "bookViewing", "Book viewing")),
        ),
      ),
    );
  }
  if (next === "complete_viewing") {
    return h(
      "a",
      { className: "mk-btn mk-btn--primary mk-btn--sm", href: adminHref("/admin/viewings", page) },
      h(Icon, { name: "calendar-check", size: 16 }),
      h("span", null, statusText(ui, next)),
    );
  }
  if (next === "close_deal") {
    return h(
      "details",
      { className: "adm-pipeline-action" },
      h("summary", null, statusText(ui, next)),
      h(
        "form",
        {
          method: "post",
          action: "/api/admin/deals/close",
          className: "adm-form adm-pipeline-form",
          "data-admin-mutation-form": "deal",
          "data-admin-mutation-saving": label(copy, "dealClosing", "Closing deal…"),
          "data-admin-mutation-success": label(copy, "dealClosed", "Deal closed."),
          "data-admin-mutation-failure": label(copy, "dealCloseFailed", "Could not close deal."),
        },
        h("input", { type: "hidden", name: "leadId", defaultValue: state.lead_id }),
        h("input", { type: "hidden", name: "broker", defaultValue: currentOperatorId(page, state.assigned_broker) }),
        h("label", null, label(copy, "listingReference", "Listing reference"), h("input", { name: "listingReference", required: true, defaultValue: state.listing_reference || "" })),
        h(
          "div",
          { className: "adm-form__actions" },
          h("p", { className: "crm-tbl__muted", role: "status", "aria-live": "polite", "data-admin-mutation-status": "true" }),
          h("button", { type: "submit", className: "mk-btn mk-btn--primary mk-btn--sm" }, statusText(ui, next)),
        ),
      ),
    );
  }
  const actions = {
    record_offer: ["offer_submitted", label(copy, "recordOffer", "Record offer")],
    start_due_diligence: ["due_diligence_started", label(copy, "startDueDiligence", "Start due diligence")],
    sign_contract: ["contract_signed", label(copy, "signContract", "Record contract")],
    record_application: ["application_submitted", label(copy, "recordApplication", "Record application")],
    sign_lease: ["lease_signed", label(copy, "signLease", "Record lease")],
  };
  const [action, submitLabel] = actions[next] || [];
  if (!action) return null;
  return h(
    "details",
    { className: "adm-pipeline-action" },
    h("summary", null, submitLabel),
    h(
      PipelineOutcomeForm,
      { page, state, action, submitLabel },
      next === "record_offer"
        ? h("label", null, label(copy, "offerAmount", "Offer amount (€)"), h("input", { name: "offerAmountEur", type: "number", min: "1", step: "1", required: true }))
        : null,
      h("label", null, label(copy, "nextFollowUp", "Next follow-up"), h("input", { name: "nextFollowUpAt", type: "datetime-local" })),
    ),
  );
}

function PipelineCard({ page, state, lead }) {
  const copy = adminCopy(page);
  const ui = workbenchCopy(page);
  const requirements = state.requirements;
  const intake = state.intake_requirements;
  const inventoryMatch = (page.leadMatching?.rows || []).find((row) => row.lead_id === state.lead_id);
  const stageTone = state.status === "lost" ? "brick" : state.status === "closed" ? "success" : state.overdue ? "brick" : "sea";
  const contactName = lead?.contact?.name;
  return h(
    "article",
    {
      className: "adm-pipeline-card",
      "data-pipeline-card": "true",
      "data-pipeline-kind": state.pipeline,
      "data-pipeline-status": state.status,
      "data-overdue": state.overdue ? "true" : "false",
    },
    h(
      "header",
      { className: "adm-pipeline-card__header" },
      h(
        "div",
        null,
        contactName ? h("small", { className: "t-eyebrow" }, statusText(ui, state.lead_type)) : null,
        h("h3", null, contactName || statusText(ui, state.lead_type)),
        h("code", { className: "crm-mono" }, state.lead_id),
      ),
      h(
        "div",
        { className: "adm-pipeline-card__status" },
        h(StatusPill, { tone: stageTone }, statusText(ui, state.stage)),
        h("a", { className: "mk-btn mk-btn--ghost mk-btn--sm", href: adminHref(`/admin/activity?leadId=${encodeURIComponent(state.lead_id)}`, page) }, h(Icon, { name: "list", size: 15 }), label(copy, "viewHistory", "History")),
      ),
    ),
    leadContactActions(lead || {}, ui),
    h(
      "dl",
      { className: "adm-pipeline-facts" },
      h("div", null, h("dt", null, label(copy, "listing", "Listing")), h("dd", null, state.listing_reference || ui.notSet)),
      h("div", null, h("dt", null, label(copy, "nextAction", "Next action")), h("dd", null, state.next_action ? statusText(ui, state.next_action) : ui.notSet)),
      h("div", null, h("dt", null, label(copy, "nextFollowUp", "Next follow-up")), h("dd", null, formatAdminDateTime(state.next_follow_up_at, page.workspace.locale) || ui.notSet)),
      h("div", null, h("dt", null, label(copy, "broker", "Broker")), h("dd", null, state.assigned_broker || ui.notSet)),
    ),
    requirements
      ? h(
          "div",
          { className: "adm-pipeline-requirements" },
          h("strong", null, label(copy, "qualification", "Qualification")),
          h("span", null, `€${Number(requirements.budget_min_eur || 0).toLocaleString("en")} ${ui.rangeTo} €${Number(requirements.budget_max_eur || 0).toLocaleString("en")}`),
          h("span", null, requirements.locations.join(", ")),
          requirements.property_types.length ? h("span", null, requirements.property_types.map((value) => statusText(ui, value)).join(", ")) : null,
          requirements.bedrooms_min !== null ? h("span", null, `${label(copy, "bedroomsMin", "Minimum bedrooms")}: ${requirements.bedrooms_min}`) : null,
          h("span", null, requirements.timeline),
          h("span", null, statusText(ui, requirements.finance_status)),
        )
      : null,
    !requirements && intake && (intake.captured_fields?.length || Object.values(intake).some((value) => (Array.isArray(value) ? value.length : value !== null && value !== undefined && value !== "")))
      ? h(
          "div",
          { className: "adm-pipeline-requirements", "data-intake-requirements": "true" },
          h("strong", null, label(copy, "intakeIncomplete", "Qualification details missing")),
          intake.budget_max_eur !== null && intake.budget_max_eur !== undefined ? h("span", null, `≤ €${intake.budget_max_eur}`) : null,
          intake.locations?.length ? h("span", null, intake.locations.join(", ")) : null,
          intake.property_types?.length ? h("span", null, intake.property_types.map((value) => statusText(ui, value)).join(", ")) : null,
          intake.timeline ? h("span", null, intake.timeline) : null,
        )
      : null,
    inventoryMatch
      ? h(
          "details",
          { className: "adm-pipeline-inventory", "data-inventory-matching": "true", "data-match-count": inventoryMatch.match_count },
          h(
            "summary",
            { className: "adm-disclosure-chevron" },
            h(Icon, { name: "building-2", size: 15 }),
            h("span", null, label(copy, "matchingInventory", "Matching inventory")),
            h("span", { className: "adm-seg-count", title: label(copy, "matches", "Matches") }, inventoryMatch.match_count),
          ),
          inventoryMatch.matches.length
            ? h(
                "ul",
                { className: "adm-task-list" },
                ...inventoryMatch.matches.map((match) =>
                  h(
                    "li",
                    { key: match.listing_id, "data-inventory-match": match.listing_id },
                    h(
                      "div",
                      { className: "adm-task-list__body" },
                      h("strong", null, match.title),
                      h("small", null, [match.location, statusText(ui, match.property_type), match.price_on_request ? label(copy, "priceOnRequest", "Price on request") : match.price_eur ? `€${Number(match.price_eur).toLocaleString("en")}` : null].filter(Boolean).join(" · ")),
                    ),
                    h(
                      "div",
                      { className: "adm-task-list__actions" },
                      h("a", { className: "mk-btn mk-btn--secondary mk-btn--sm", href: match.path, target: "_blank", rel: "noopener" }, h(Icon, { name: "external-link", size: 15 }), label(copy, "openListing", "Open listing")),
                      h("a", { className: "mk-btn mk-btn--ghost mk-btn--sm", href: payloadAdminListingHref(match.listing_id, page) }, label(copy, "propertyEditor", "Edit")),
                    ),
                  ),
                ),
              )
            : h("p", { className: "adm-empty" }, label(copy, "noInventoryMatches", "No reviewed listings match these requirements yet.")),
        )
      : null,
    state.status === "open" ? h("div", { className: "adm-pipeline-card__primary" }, h(PipelinePrimaryAction, { page, state })) : null,
    h(
      "details",
      { className: "adm-pipeline-secondary" },
      h("summary", null, label(copy, "moreActions", "More actions")),
      state.status === "lost"
        ? h(PipelineOutcomeForm, { page, state, action: "reopen", submitLabel: label(copy, "reopenLead", "Reopen lead"), variant: "secondary" })
        : null,
      state.status === "open"
        ? h(PipelineOutcomeForm, { page, state, action: "lost", submitLabel: label(copy, "markLeadLost", "Mark lost"), noteRequired: true, variant: "secondary" })
        : null,
      state.status !== "closed"
        ? h(PipelineOutcomeForm, { page, state, action: "note", submitLabel: label(copy, "recordNote", "Record note"), noteRequired: true, variant: "ghost" })
        : null,
    ),
  );
}


const REALTY_CASE_COPY = Object.freeze({
  bg: {
    title: "Сделки",
    subtitle: "Единен процес за ръчно и автономно изпълнение",
    create: "Нова сделка",
    open: "Отворени",
    manual: "Ръчни",
    autonomous: "Автономни",
    frozen: "Замразени",
    blocked: "Блокирани",
    progress: "Напредък",
    next: "Следващи стъпки",
    evidence: "Референция към доказателство",
    complete: "Завърши стъпката",
    notApplicable: "Не е приложимо",
    authority: "Референция към пълномощие/инструкция",
    reason: "Код на причината",
    close: "Затвори сделката",
    freeze: "Замрази",
    resume: "Продължи",
    empty: "Няма отворени сделки.",
    conditions: "Условия",
    addCondition: "Ново условие",
    conditionId: "Идентификатор на условието",
    conditionType: "Тип условие",
    dueAt: "Срок",
    requiredEvidence: "Изисквани източници на доказателства (JSON масив)",
    evidenceJson: "Доказателства (JSON масив)",
    satisfy: "Отбележи като изпълнено",
    expire: "Отбележи като изтекло",
    waive: "Отмени условието",
    reopen: "Отвори отново",
    conditionsEmpty: "Няма активни условия.",
    caseId: "Идентификатор на сделката",
    clientRef: "Референция на клиента",
    propertyRef: "Референция на имота",
    jurisdiction: "Юрисдикция",
    caseType: "Тип сделка",
    assetKind: "Вид актив",
    executionMode: "Режим на изпълнение",
    mandateRef: "Референция на пълномощното",
    mandateGrantor: "Референция на упълномощителя",
    mandateSignedAt: "Пълномощното е подписано на",
    mandateEvidence: "Референция към подписаното пълномощно",
    assuranceRef: "Референция за гаранция на агента (автономен режим)",
    jurisdictions: { BG: "България", GR: "Гърция" },
    caseTypes: {
      buyer_purchase: "Покупка",
      seller_sale: "Продажба",
      tenant_rental: "Наемане",
      landlord_rental: "Отдаване под наем",
      short_term_rental: "Краткосрочен наем",
      property_management: "Управление на имот",
    },
    assetKinds: { residential: "Жилищен", commercial: "Търговски", land: "Земя", new_build: "Ново строителство", mixed_use: "Смесено предназначение" },
    allStepsResolved: "Всички стъпки са приключени.",
    saving: "Записване на сделката…",
    failed: "Действието по сделката не беше записано.",
    opened: "Сделката е отворена. Презареди страницата, за да я видиш в опашката.",
    stepCompleted: "Стъпката е завършена. Презареди страницата за новото състояние.",
    stepNotApplicable: "Стъпката е отбелязана като неприложима. Презареди страницата за новото състояние.",
    statusUpdated: "Статусът на сделката е променен. Презареди страницата за новото състояние.",
    closed: "Сделката е затворена.",
    conditionSaving: "Записване на условието…",
    conditionFailed: "Действието по условието не беше записано.",
    conditionOpened: "Условието е отворено. Презареди страницата за новото състояние.",
    conditionUpdated: "Условието е обновено. Презареди страницата за новото състояние.",
  },
  ru: {
    title: "Сделки",
    subtitle: "Единый процесс для ручного и автономного исполнения",
    create: "Новая сделка",
    open: "Открытые",
    manual: "Ручные",
    autonomous: "Автономные",
    frozen: "Замороженные",
    blocked: "Заблокированные",
    progress: "Прогресс",
    next: "Следующие шаги",
    evidence: "Ссылка на доказательство",
    complete: "Завершить шаг",
    notApplicable: "Не применимо",
    authority: "Ссылка на полномочие/инструкцию",
    reason: "Код причины",
    close: "Закрыть сделку",
    freeze: "Заморозить",
    resume: "Продолжить",
    empty: "Нет открытых сделок.",
    conditions: "Условия",
    addCondition: "Новое условие",
    conditionId: "Идентификатор условия",
    conditionType: "Тип условия",
    dueAt: "Срок",
    requiredEvidence: "Требуемые источники доказательств (массив JSON)",
    evidenceJson: "Доказательства (массив JSON)",
    satisfy: "Отметить выполненным",
    expire: "Отметить истекшим",
    waive: "Отменить условие",
    reopen: "Открыть снова",
    conditionsEmpty: "Нет активных условий.",
    caseId: "Идентификатор сделки",
    clientRef: "Ссылка на клиента",
    propertyRef: "Ссылка на объект",
    jurisdiction: "Юрисдикция",
    caseType: "Тип сделки",
    assetKind: "Вид актива",
    executionMode: "Режим исполнения",
    mandateRef: "Ссылка на доверенность",
    mandateGrantor: "Ссылка на доверителя",
    mandateSignedAt: "Доверенность подписана",
    mandateEvidence: "Ссылка на подписанную доверенность",
    assuranceRef: "Ссылка на гарантию агента (автономный режим)",
    jurisdictions: { BG: "Болгария", GR: "Греция" },
    caseTypes: {
      buyer_purchase: "Покупка",
      seller_sale: "Продажа",
      tenant_rental: "Аренда для арендатора",
      landlord_rental: "Сдача в аренду",
      short_term_rental: "Краткосрочная аренда",
      property_management: "Управление недвижимостью",
    },
    assetKinds: { residential: "Жилая", commercial: "Коммерческая", land: "Земля", new_build: "Новостройка", mixed_use: "Смешанное назначение" },
    allStepsResolved: "Все шаги завершены.",
    saving: "Сохраняем сделку…",
    failed: "Действие по сделке не сохранено.",
    opened: "Сделка открыта. Обновите страницу, чтобы увидеть её в очереди.",
    stepCompleted: "Шаг завершён. Обновите страницу, чтобы увидеть новое состояние.",
    stepNotApplicable: "Шаг отмечен как неприменимый. Обновите страницу, чтобы увидеть новое состояние.",
    statusUpdated: "Статус сделки изменён. Обновите страницу, чтобы увидеть новое состояние.",
    closed: "Сделка закрыта.",
    conditionSaving: "Сохраняем условие…",
    conditionFailed: "Действие по условию не сохранено.",
    conditionOpened: "Условие открыто. Обновите страницу, чтобы увидеть новое состояние.",
    conditionUpdated: "Условие обновлено. Обновите страницу, чтобы увидеть новое состояние.",
  },
  en: {
    title: "Transaction cases",
    subtitle: "One evidence-gated process for manual and autonomous execution",
    create: "Open case",
    open: "Open",
    manual: "Manual",
    autonomous: "Autonomous",
    frozen: "Frozen",
    blocked: "Blocked",
    progress: "Progress",
    next: "Next steps",
    evidence: "Evidence reference",
    complete: "Complete step",
    notApplicable: "Not applicable",
    authority: "Authority or instruction reference",
    reason: "Reason code",
    close: "Close case",
    freeze: "Freeze",
    resume: "Resume",
    empty: "No open transaction cases.",
    conditions: "Conditions",
    addCondition: "Open condition",
    conditionId: "Condition ID",
    conditionType: "Condition type",
    dueAt: "Due at",
    requiredEvidence: "Required evidence producer references (JSON array)",
    evidenceJson: "Evidence references (JSON array)",
    satisfy: "Mark satisfied",
    expire: "Mark expired",
    waive: "Waive condition",
    reopen: "Reopen",
    conditionsEmpty: "No open, blocked, or expired conditions.",
    caseId: "Case ID",
    clientRef: "Client reference",
    propertyRef: "Property reference",
    jurisdiction: "Jurisdiction",
    caseType: "Case type",
    assetKind: "Asset kind",
    executionMode: "Execution mode",
    mandateRef: "Mandate reference",
    mandateGrantor: "Mandate grantor reference",
    mandateSignedAt: "Mandate signed at",
    mandateEvidence: "Signed mandate evidence reference",
    assuranceRef: "Agent assurance reference (autonomous mode)",
    jurisdictions: { BG: "Bulgaria", GR: "Greece" },
    caseTypes: {
      buyer_purchase: "Buyer purchase",
      seller_sale: "Seller sale",
      tenant_rental: "Tenant rental",
      landlord_rental: "Landlord rental",
      short_term_rental: "Short-term rental",
      property_management: "Property management",
    },
    assetKinds: { residential: "Residential", commercial: "Commercial", land: "Land", new_build: "New build", mixed_use: "Mixed use" },
    allStepsResolved: "All workflow steps are resolved.",
    saving: "Saving transaction case…",
    failed: "The transaction case action failed.",
    opened: "Transaction case opened. Reload the page to see it in the queue.",
    stepCompleted: "Step completed. Reload the page to see the new case state.",
    stepNotApplicable: "Step marked not applicable. Reload the page to see the new case state.",
    statusUpdated: "Case status updated. Reload the page to see the new case state.",
    closed: "Case closed.",
    conditionSaving: "Saving condition…",
    conditionFailed: "The condition action failed.",
    conditionOpened: "Condition opened. Reload the page to see the new case state.",
    conditionUpdated: "Condition updated. Reload the page to see the new case state.",
  },
});

function caseCopy(page) {
  return REALTY_CASE_COPY[page?.workspace?.locale] || REALTY_CASE_COPY.en;
}

function caseMutationAttrs(page, kind, successKey) {
  const copy = caseCopy(page);
  return {
    method: "post",
    action: kind === "open" ? "/api/admin/cases" : "/api/admin/cases/actions",
    className: "adm-form",
    "data-admin-mutation-form": `realty-case-${kind}`,
    "data-admin-mutation-saving": copy.saving,
    "data-admin-mutation-success": copy[successKey],
    "data-admin-mutation-failure": copy.failed,
  };
}

// Every case and condition form reports its own saving, success, and failure
// state on one live status line next to its submit control.
function caseMutationStatus() {
  return h("p", { role: "status", "aria-live": "polite", "data-admin-mutation-status": "true" });
}

function caseVocabulary(copy, group, value) {
  return copy[group]?.[value] || String(value || "").replaceAll("_", " ");
}

function caseActionEventId(caseRecord, action, stepKey = "") {
  const source = [caseRecord.id, caseRecord.last_event_id || caseRecord.last_recorded_at, action, stepKey].join("\u0000");
  return `realty-case-action-${createHash("sha256").update(source).digest("hex").slice(0, 48)}`;
}

function conditionMutationAttrs(page, action, successKey) {
  const copy = caseCopy(page);
  return {
    method: "post",
    action: action === "condition_opened" ? "/api/admin/cases/conditions" : "/api/admin/cases/conditions/actions",
    className: "adm-form",
    "data-admin-mutation-form": `realty-case-condition-${action}`,
    "data-admin-mutation-saving": copy.conditionSaving,
    "data-admin-mutation-success": copy[successKey],
    "data-admin-mutation-failure": copy.conditionFailed,
  };
}

function conditionActionEventId(condition, action) {
  const source = [condition.case_id, condition.id, condition.last_recorded_at, condition.last_action, action].join("\u0000");
  return `realty-case-condition-action-${createHash("sha256").update(source).digest("hex").slice(0, 48)}`;
}

function canManageCaseConditions(page) {
  return pageCan(page, "cases:write") && !page.workspace?.operator_roles?.includes("agent");
}

function conditionTone(condition) {
  return condition.status === "blocked" || condition.overdue ? "brick" : "sea";
}

function RealtyCaseConditionAction({ page, condition, action, submit, children = [] }) {
  const actor = page.workspace?.operator_id || "admin";
  const fields = Array.isArray(children) ? children : [children];
  return h(
    "details",
    { className: "adm-pipeline-secondary" },
    h("summary", null, submit),
    h(
      "form",
      conditionMutationAttrs(page, action, "conditionUpdated"),
      h("input", { type: "hidden", name: "caseId", value: condition.case_id }),
      h("input", { type: "hidden", name: "conditionId", value: condition.id }),
      h("input", { type: "hidden", name: "action", value: action }),
      h("input", { type: "hidden", name: "eventId", value: conditionActionEventId(condition, action) }),
      h("input", { type: "hidden", name: "actor", value: actor }),
      ...fields,
      h("button", { type: "submit", className: "mk-btn mk-btn--secondary mk-btn--sm" }, submit),
      caseMutationStatus(),
    ),
  );
}

function RealtyCaseConditionCard({ page, condition, caseIsActive }) {
  const copy = caseCopy(page);
  const canManage = canManageCaseConditions(page) && caseIsActive;
  const canSatisfy = ["open", "blocked"].includes(condition.status);
  const canExpire = condition.status !== "expired" && condition.overdue;
  const canWaive = !["satisfied", "waived"].includes(condition.status);
  const canReopen = condition.status !== "open";
  const dueMin = datetimeLocalValue(page.realtyCaseConditionQueue?.generated_at);
  return h(
    "article",
    {
      className: "adm-pipeline-card",
      "data-realty-case-condition": condition.id,
      "data-condition-status": condition.status,
      "data-condition-case": condition.case_id,
    },
    h(
      "header",
      { className: "adm-pipeline-card__header" },
      h("div", null, h("h2", null, condition.id), h("small", null, `${condition.case_id} · ${valueText(workbenchCopy(page), condition.type)}`)),
      h(StatusPill, { tone: conditionTone(condition) }, statusText(workbenchCopy(page), condition.status)),
    ),
    h(
      "div",
      { className: "adm-pipeline-requirements" },
      h("span", null, `${copy.dueAt}: ${formatAdminDateTime(condition.due_at, page.workspace?.locale)}`),
      h("span", null, `${copy.requiredEvidence}: ${condition.required_evidence_producer_refs.join(", ")}`),
    ),
    canManage
      ? h(
          "div",
          { className: "adm-task-list__actions" },
          canSatisfy
            ? h(RealtyCaseConditionAction, {
                page,
                condition,
                action: "condition_satisfied",
                submit: copy.satisfy,
                children: [
                  h(
                    "label",
                    null,
                    copy.evidenceJson,
                    h("textarea", {
                      name: "evidenceRefsJson",
                      required: true,
                      rows: 3,
                      maxLength: 6000,
                      placeholder: '[{"ref":"evidence://…","producerRef":"lawyer://…"}]',
                    }),
                  ),
                ],
              })
            : null,
          condition.status === "open"
            ? h(RealtyCaseConditionAction, {
                page,
                condition,
                action: "condition_blocked",
                submit: copy.blocked,
                children: [
                  h("label", null, copy.reason, h("input", { name: "reasonCode", required: true, maxLength: 120, pattern: "[a-z][a-z0-9_:-]*" })),
                ],
              })
            : null,
          canExpire
            ? h(RealtyCaseConditionAction, { page, condition, action: "condition_expired", submit: copy.expire })
            : null,
          canWaive
            ? h(RealtyCaseConditionAction, {
                page,
                condition,
                action: "condition_waived",
                submit: copy.waive,
                children: [
                  h("label", null, copy.authority, h("input", { name: "authorityRef", required: true, maxLength: 240, pattern: "[A-Za-z0-9][A-Za-z0-9._:/-]*" })),
                  h("label", null, copy.reason, h("input", { name: "reasonCode", required: true, maxLength: 120, pattern: "[a-z][a-z0-9_:-]*" })),
                ],
              })
            : null,
          canReopen
            ? h(RealtyCaseConditionAction, {
                page,
                condition,
                action: "condition_reopened",
                submit: copy.reopen,
                children: [
                  h("label", null, copy.authority, h("input", { name: "authorityRef", required: true, maxLength: 240, pattern: "[A-Za-z0-9][A-Za-z0-9._:/-]*" })),
                  h("label", null, copy.reason, h("input", { name: "reasonCode", required: true, maxLength: 120, pattern: "[a-z][a-z0-9_:-]*" })),
                  h("label", null, copy.dueAt, h("input", { name: "dueAt", type: "datetime-local", required: true, min: dueMin })),
                ],
              })
            : null,
        )
      : null,
  );
}

function RealtyCaseConditionCreateForm({ page, cases }) {
  const copy = caseCopy(page);
  if (!canManageCaseConditions(page) || !cases.length) return null;
  const actor = page.workspace?.operator_id || "admin";
  return h(
    WorkbenchDisclosure,
    { summary: copy.addCondition, "data-realty-case-condition-create": "true" },
    h(
      "form",
      conditionMutationAttrs(page, "condition_opened", "conditionOpened"),
      h("input", { type: "hidden", name: "actor", value: actor }),
      h(
        "label",
        null,
        copy.caseId,
        h(
          "select",
          { name: "caseId", required: true },
          ...cases.map((caseRecord) => h("option", { key: caseRecord.id, value: caseRecord.id }, caseRecord.id)),
        ),
      ),
      h("label", null, copy.conditionId, h("input", { name: "conditionId", required: true, maxLength: 160, pattern: "[A-Za-z0-9][A-Za-z0-9._:/-]*" })),
      h("label", null, copy.conditionType, h("input", { name: "conditionType", required: true, maxLength: 120, pattern: "[a-z][a-z0-9_:-]*" })),
      h("label", null, copy.dueAt, h("input", { name: "dueAt", type: "datetime-local", required: true, min: datetimeLocalValue(page.realtyCaseConditionQueue?.generated_at) })),
      h(
        "label",
        null,
        copy.requiredEvidence,
        h("textarea", { name: "requiredEvidenceProducerRefsJson", required: true, rows: 2, maxLength: 6000, placeholder: '["lawyer://title-review"]' }),
      ),
      h(
        "div",
        { className: "adm-form__actions" },
        caseMutationStatus(),
        h("button", { type: "submit", className: "mk-btn mk-btn--primary mk-btn--md" }, copy.addCondition),
      ),
    ),
  );
}

function RealtyCaseConditions({ page, caseQueue }) {
  const copy = caseCopy(page);
  const queue = page.realtyCaseConditionQueue || { rows: [] };
  const activeCases = (caseQueue.rows || []).filter((caseRecord) => caseRecord.status === "active");
  const activeCaseIds = new Set(activeCases.map((caseRecord) => caseRecord.id));
  return h(
    Panel,
    { title: copy.conditions, "data-realty-case-condition-workbench": "true" },
    h(RealtyCaseConditionCreateForm, { page, cases: activeCases }),
    queue.rows.length
      ? h(
          "section",
          { className: "adm-pipeline-grid", "data-realty-case-condition-queue": "true" },
          ...queue.rows.map((condition) =>
            h(RealtyCaseConditionCard, {
              key: `${condition.case_id}-${condition.id}`,
              page,
              condition,
              caseIsActive: activeCaseIds.has(condition.case_id),
            }),
          ),
        )
      : h("p", { className: "adm-empty" }, copy.conditionsEmpty),
  );
}

function RealtyCaseStep({ page, caseRecord, step }) {
  const copy = caseCopy(page);
  const ui = workbenchCopy(page);
  const actor = page.workspace?.operator_id || "admin";
  const producer = step.evidence_producers[0];
  const agent = page.workspace?.operator_roles?.includes("agent");
  return h(
    "li",
    { key: step.key, "data-case-step": step.key, "data-step-status": step.status },
    h(
      "div",
      null,
      h("strong", null, step.label),
      h("small", null, `${valueText(ui, step.phase)} · ${step.optional ? copy.notApplicable : statusText(ui, step.status)}`),
    ),
    pageCan(page, "cases:write") && caseRecord.status === "active"
      ? h(
          "div",
          { className: "adm-task-list__actions" },
          h(
            "form",
            caseMutationAttrs(page, "step", "stepCompleted"),
            h("input", { type: "hidden", name: "caseId", value: caseRecord.id }),
            h("input", { type: "hidden", name: "action", value: "step_completed" }),
            h("input", { type: "hidden", name: "stepKey", value: step.key }),
            h("input", { type: "hidden", name: "id", value: caseActionEventId(caseRecord, "step_completed", step.key) }),
            h("input", { type: "hidden", name: "actor", value: actor }),
            h("input", { type: "hidden", name: "evidenceType", value: `${step.key}_record` }),
            h("input", { type: "hidden", name: "evidenceProducerKind", value: producer }),
            h("label", null, copy.evidence, h("input", { name: "evidenceRef", required: true, maxLength: 240 })),
            h("button", { type: "submit", className: "mk-btn mk-btn--primary mk-btn--sm" }, copy.complete),
            caseMutationStatus(),
          ),
          step.optional && !agent
            ? h(
                "form",
                caseMutationAttrs(page, "not-applicable", "stepNotApplicable"),
                h("input", { type: "hidden", name: "caseId", value: caseRecord.id }),
                h("input", { type: "hidden", name: "action", value: "step_not_applicable" }),
                h("input", { type: "hidden", name: "stepKey", value: step.key }),
                h("input", { type: "hidden", name: "id", value: caseActionEventId(caseRecord, "step_not_applicable", step.key) }),
                h("input", { type: "hidden", name: "actor", value: actor }),
                h("label", null, copy.authority, h("input", { name: "authorityRef", required: true, maxLength: 240 })),
                h("label", null, copy.reason, h("input", { name: "reasonCode", required: true, maxLength: 120 })),
                h("button", { type: "submit", className: "mk-btn mk-btn--secondary mk-btn--sm" }, copy.notApplicable),
                caseMutationStatus(),
              )
            : null,
        )
      : null,
  );
}

function RealtyCaseCard({ page, caseRecord }) {
  const copy = caseCopy(page);
  const ui = workbenchCopy(page);
  const actor = page.workspace?.operator_id || "admin";
  const modeTone = caseRecord.execution_mode === "autonomous" ? "success" : "ink";
  const statusAction = caseRecord.status === "frozen" ? "case_resumed" : "case_frozen";
  const agent = page.workspace?.operator_roles?.includes("agent");
  return h(
    "article",
    {
      className: "adm-pipeline-card",
      "data-realty-case": caseRecord.id,
      "data-execution-mode": caseRecord.execution_mode,
      "data-case-status": caseRecord.status,
      "data-list-item": "cases",
      "data-filter-tags": [caseRecord.execution_mode, caseRecord.status].join(" "),
    },
    h(
      "header",
      { className: "adm-pipeline-card__header" },
      h(
        "div",
        null,
        h("h2", null, caseRecord.id),
        h(
          "small",
          null,
          `${caseVocabulary(copy, "jurisdictions", caseRecord.jurisdiction)} · ${caseVocabulary(copy, "caseTypes", caseRecord.case_type)} · ${caseVocabulary(copy, "assetKinds", caseRecord.asset_kind)}`,
        ),
      ),
      h(StatusPill, { tone: modeTone }, caseRecord.execution_mode === "autonomous" ? copy.autonomous : copy.manual),
    ),
    h(
      "div",
      { className: "adm-pipeline-requirements" },
      h("strong", null, `${copy.progress}: ${caseRecord.progress_percent}%`),
      h("span", null, valueText(ui, caseRecord.current_phase)),
      h("span", null, `${copy.blocked}: ${caseRecord.blockers.length}`),
    ),
    h(
      Panel,
      { title: copy.next },
      caseRecord.next_steps.length
        ? h("ul", { className: "adm-task-list" }, ...caseRecord.next_steps.map((step) => h(RealtyCaseStep, { page, caseRecord, step })))
        : h("p", { className: "adm-empty" }, copy.allStepsResolved),
    ),
    pageCan(page, "cases:write") && !agent
      ? h(
          "details",
          { className: "adm-pipeline-secondary" },
          h("summary", null, caseRecord.status === "frozen" ? copy.resume : copy.freeze),
          h(
            "form",
            caseMutationAttrs(page, "status", "statusUpdated"),
            h("input", { type: "hidden", name: "caseId", value: caseRecord.id }),
            h("input", { type: "hidden", name: "action", value: statusAction }),
            h("input", { type: "hidden", name: "id", value: caseActionEventId(caseRecord, statusAction) }),
            h("input", { type: "hidden", name: "actor", value: actor }),
            h("label", null, copy.authority, h("input", { name: "authorityRef", required: true, maxLength: 240 })),
            statusAction === "case_frozen"
              ? h("label", null, copy.reason, h("input", { name: "reasonCode", required: true, maxLength: 120 }))
              : null,
            h("button", { type: "submit", className: "mk-btn mk-btn--secondary mk-btn--sm" }, caseRecord.status === "frozen" ? copy.resume : copy.freeze),
            caseMutationStatus(),
          ),
        )
      : null,
    pageCan(page, "cases:write") && !agent && caseRecord.progress_percent === 100 && caseRecord.status === "active"
      ? h(
          "form",
          caseMutationAttrs(page, "close", "closed"),
          h("input", { type: "hidden", name: "caseId", value: caseRecord.id }),
          h("input", { type: "hidden", name: "action", value: "case_closed" }),
          h("input", { type: "hidden", name: "id", value: caseActionEventId(caseRecord, "case_closed") }),
          h("input", { type: "hidden", name: "actor", value: actor }),
          h("button", { type: "submit", className: "mk-btn mk-btn--primary mk-btn--sm" }, copy.close),
          caseMutationStatus(),
        )
      : null,
  );
}

function RealtyCaseCreateForm({ page }) {
  const copy = caseCopy(page);
  if (!pageCan(page, "cases:write") || page.workspace?.operator_roles?.includes("agent")) return null;
  const actor = page.workspace?.operator_id || "admin";
  return h(
    ActionDisclosure,
    { summary: copy.create, icon: "plus", "data-realty-case-create": "true" },
    h(
      "form",
      caseMutationAttrs(page, "open", "opened"),
      h("input", { type: "hidden", name: "actor", value: actor }),
      h("label", null, copy.caseId, h("input", { name: "id", required: true, maxLength: 160 })),
      h("label", null, copy.clientRef, h("input", { name: "clientRef", required: true, maxLength: 160 })),
      h("label", null, copy.propertyRef, h("input", { name: "propertyRef", maxLength: 160 })),
      h(
        "label",
        null,
        copy.jurisdiction,
        h(
          "select",
          { name: "jurisdiction", required: true },
          ...["BG", "GR"].map((value) => h("option", { key: value, value }, caseVocabulary(copy, "jurisdictions", value))),
        ),
      ),
      h(
        "label",
        null,
        copy.caseType,
        h(
          "select",
          { name: "caseType", required: true },
          ...["buyer_purchase", "seller_sale", "tenant_rental", "landlord_rental", "short_term_rental", "property_management"].map((value) =>
            h("option", { key: value, value }, caseVocabulary(copy, "caseTypes", value)),
          ),
        ),
      ),
      h(
        "label",
        null,
        copy.assetKind,
        h(
          "select",
          { name: "assetKind", required: true },
          ...["residential", "commercial", "land", "new_build", "mixed_use"].map((value) => h("option", { key: value, value }, caseVocabulary(copy, "assetKinds", value))),
        ),
      ),
      h("label", null, copy.executionMode, h("select", { name: "executionMode", required: true }, h("option", { value: "manual" }, copy.manual), h("option", { value: "autonomous" }, copy.autonomous))),
      h("label", null, copy.mandateRef, h("input", { name: "mandateRef", required: true, maxLength: 160 })),
      h("label", null, copy.mandateGrantor, h("input", { name: "mandateGrantedByRef", required: true, maxLength: 160 })),
      h("label", null, copy.mandateSignedAt, h("input", { name: "mandateSignedAt", type: "datetime-local", required: true })),
      h("label", null, copy.mandateEvidence, h("input", { name: "mandateSignedEvidenceRef", required: true, maxLength: 240 })),
      h("input", { type: "hidden", name: "mandateCapabilities", value: "case:*" }),
      h("label", null, copy.assuranceRef, h("input", { name: "assuranceRef", maxLength: 240 })),
      h(
        "div",
        { className: "adm-form__actions" },
        caseMutationStatus(),
        h("button", { type: "submit", className: "mk-btn mk-btn--primary mk-btn--md" }, copy.create),
      ),
    ),
  );
}

function RealtyCasesBody({ page }) {
  const copy = caseCopy(page);
  const ui = workbenchCopy(page);
  const queue = page.realtyCaseQueue || { rows: [], summary: {} };
  const metrics = [
    [copy.open, queue.summary.open || 0, "kanban-square", "sea"],
    [copy.manual, queue.summary.manual || 0, "user", "ink"],
    [copy.autonomous, queue.summary.autonomous || 0, "sparkles", "success"],
    [copy.frozen, queue.summary.frozen || 0, "circle-alert", "brick"],
  ];
  const filterOptions = [
    { value: "all", label: label(adminCopy(page), "all", "All"), count: queue.rows.length },
    { value: "manual", label: copy.manual, count: queue.rows.filter((row) => row.execution_mode === "manual").length },
    { value: "autonomous", label: copy.autonomous, count: queue.rows.filter((row) => row.execution_mode === "autonomous").length },
    { value: "frozen", label: copy.frozen, count: queue.rows.filter((row) => row.status === "frozen").length },
  ];
  return adminShell(page, {
    title: copy.title,
    mainAttrs: {
      "data-kind": "admin-realty-cases",
      "data-react-admin-ui": "realty-cases",
      "data-admin-workbench": "crm",
      "data-task-led": "true",
      "data-admin-locale": page.workspace.locale,
    },
    children: [
      h(PageHeader, { title: copy.title, subtitle: copy.subtitle }),
      h(StatGrid, { metrics }),
      h(
        PageToolbar,
        null,
        queue.rows.length ? h(ListFilterTabs, { key: "tabs", scope: "cases", label: copy.open, options: filterOptions }) : null,
        h(RealtyCaseCreateForm, { key: "new", page }),
      ),
      h(RealtyCaseConditions, { page, caseQueue: queue }),
      queue.rows.length
        ? [
            h(ListEmptyNote, { key: "empty", scope: "cases" }, ui.noFilterMatches),
            h("section", { key: "grid", className: "adm-pipeline-grid", "data-realty-case-grid": "true" }, ...queue.rows.map((caseRecord) => h(RealtyCaseCard, { key: caseRecord.id, page, caseRecord }))),
          ]
        : h(Panel, { title: copy.open }, h(EmptyState, { icon: "kanban-square" }, copy.empty)),
    ],
  });
}


// Stage board columns: buyer and renter stages collapse into four working
// stages plus one column for closed and lost opportunities.
const PIPELINE_STAGE_GROUPS = [
  { id: "inquiry", stages: ["new", "inquiry"], labelKey: "stageInquiry" },
  { id: "qualified", stages: ["qualified"], labelKey: "stageQualified" },
  { id: "viewing", stages: ["viewing_booked", "viewed", "viewing"], labelKey: "stageViewing" },
  { id: "offer", stages: ["offer", "due_diligence", "contract", "application", "lease"], labelKey: "stageOffer" },
  { id: "closed", stages: ["closed", "lost"], labelKey: "stageClosed" },
];

function pipelineStageGroup(state) {
  if (state.status === "lost" || state.status === "closed") return "closed";
  const group = PIPELINE_STAGE_GROUPS.find((candidate) => candidate.stages.includes(state.stage));
  return group ? group.id : "inquiry";
}

function LeadPipelineBody({ page }) {
  const copy = adminCopy(page);
  const ui = workbenchCopy(page);
  const queue = page.leadPipelineQueue || { rows: [], states: [], summary: {} };
  const leads = new Map((page.leads || []).map((lead) => [lead.lead_id, lead]));
  const openById = new Map((queue.rows || []).map((state) => [state.lead_id, state]));
  const states = (queue.states || []).map((state) => openById.get(state.lead_id) || state);
  const title = label(copy, "pipelineWorkspace", "Buyers and renters");
  const metrics = [
    [label(copy, "openPipeline", "Open opportunities"), queue.summary?.open || 0, "kanban-square", "sea"],
    [label(copy, "buyerPipeline", "Buyers"), queue.summary?.buyers_open || 0, "users", "ink"],
    [label(copy, "renterPipeline", "Renters"), queue.summary?.renters_open || 0, "key", "sand"],
    [statusText(ui, "overdue"), queue.summary?.overdue || 0, "triangle-alert", "brick"],
  ];
  const count = (predicate) => states.filter(predicate).length;
  return adminShell(page, {
    title,
    mainAttrs: {
      "data-kind": "admin-lead-pipeline",
      "data-react-admin-ui": "lead-pipeline",
      "data-admin-workbench": "crm",
      "data-task-led": "true",
      "data-admin-locale": page.workspace.locale,
    },
    children: [
      h(PageHeader, { title, subtitle: page.metadata?.description }),
      h(StatGrid, { metrics }),
      h(
        PageToolbar,
        null,
        h(
          "nav",
          { className: "crm-seg adm-pipeline-tabs", "aria-label": title, "data-pipeline-tabs": "true" },
          h("button", { type: "button", "data-pipeline-filter": "open", "data-on": "1" }, statusText(ui, "open"), h("span", { className: "adm-seg-count" }, count((state) => state.status === "open"))),
          h("button", { type: "button", "data-pipeline-filter": "buyer", "data-on": "0" }, label(copy, "buyerPipeline", "Buyers"), h("span", { className: "adm-seg-count" }, count((state) => state.pipeline === "buyer"))),
          h("button", { type: "button", "data-pipeline-filter": "renter", "data-on": "0" }, label(copy, "renterPipeline", "Renters"), h("span", { className: "adm-seg-count" }, count((state) => state.pipeline === "renter"))),
          h("button", { type: "button", "data-pipeline-filter": "lost", "data-on": "0" }, statusText(ui, "lost"), h("span", { className: "adm-seg-count" }, count((state) => state.status === "lost"))),
          h("button", { type: "button", "data-pipeline-filter": "closed", "data-on": "0" }, statusText(ui, "closed"), h("span", { className: "adm-seg-count" }, count((state) => state.status === "closed"))),
        ),
      ),
      states.length
        ? h(
            "section",
            { className: "adm-board", "data-pipeline-grid": "true", "aria-label": label(copy, "openPipeline", "Open opportunities") },
            ...PIPELINE_STAGE_GROUPS.map((group) => {
              const cards = states.filter((state) => pipelineStageGroup(state) === group.id);
              const initial = group.id === "closed" ? cards.length : cards.filter((state) => state.status === "open").length;
              return h(
                "section",
                { key: group.id, className: "adm-board__col", "data-stage-group": group.id, "aria-label": ui[group.labelKey] },
                h("h2", { className: "adm-board__title" }, h("span", null, ui[group.labelKey]), h("span", { className: "adm-board__count", "data-board-count": "true" }, initial)),
                h("div", { className: "adm-board__cards" }, ...cards.map((state) => h(PipelineCard, { key: state.lead_id, page, state, lead: leads.get(state.lead_id) }))),
                h("p", { className: "adm-board__empty" }, ui.noCardsInStage),
              );
            }),
          )
        : h(Panel, { title: label(copy, "openPipeline", "Open opportunities") }, h(EmptyState, { icon: "kanban-square" }, label(copy, "noOpenPipeline", "No open buyer or renter opportunities."))),
      states.length
        ? h(
            "div",
            { className: "crm-panel", "data-pipeline-empty": "true", hidden: true },
            h("p", { className: "adm-empty", role: "status" }, ui.noPipelineMatches),
          )
        : null,
    ],
  });
}


function LeadAssignmentControl({ page, lead, copy }) {
  const brokerId = lead.broker_assignment?.broker_id || lead.assigned_broker || "";
  const canAssign = pageCan(page, "operations:write");
  return h(
    "details",
    { className: "adm-lead-assignment", "data-lead-assignment-control": lead.lead_id },
    h(
      "summary",
      null,
      h(Icon, { name: "users", size: 15 }),
      h("span", null, `${label(copy, "assignedBroker", "Assigned broker")}: ${brokerId || workbenchCopy(page).notSet}`),
    ),
    canAssign
      ? h(
          "form",
          {
            method: "post",
            action: "/api/admin/leads/assign",
            className: "adm-form adm-lead-assignment__form",
            "data-admin-mutation-form": "lead-assignment",
            "data-admin-mutation-saving": label(copy, "assignmentSaving", "Saving assignment…"),
            "data-admin-mutation-success": label(copy, "assignmentSaved", "Assignment saved. Refresh to see the new owner."),
            "data-admin-mutation-failure": label(copy, "assignmentSaveFailed", "Could not save assignment."),
          },
          h("input", { type: "hidden", name: "leadId", defaultValue: lead.lead_id }),
          h(
            "label",
            null,
            label(copy, "assignedBroker", "Assigned broker"),
            h(
              "select",
              { name: "brokerId", defaultValue: brokerId, required: true },
              ...(page.brokerProfiles || []).map((profile) =>
                h("option", { key: profile.id, value: profile.id, selected: profile.id === brokerId ? true : undefined }, profile.id.replaceAll("_", " ")),
              ),
            ),
          ),
          h("label", null, label(copy, "assignmentReason", "Reassignment reason"), h("textarea", { name: "reason", rows: 2, required: true })),
          h("label", null, label(copy, "reviewer", "Actor"), h("input", { name: "actor", required: true, defaultValue: currentOperatorId(page, brokerId), readOnly: Boolean(page.workspace?.operator_id) })),
          h(
            "label",
            { className: "adm-check" },
            h("input", { type: "checkbox", name: "assignmentConfirmed", required: true }),
            ` ${label(copy, "confirmAssignment", "I confirm this manual lead reassignment.")}`,
          ),
          h("p", { role: "status", "aria-live": "polite", "data-admin-mutation-status": "true" }),
          h("button", { type: "submit", className: "mk-btn mk-btn--secondary mk-btn--sm" }, h(Icon, { name: "users", size: 15 }), h("span", null, label(copy, "saveAssignment", "Save assignment"))),
        )
      : h("p", { className: "adm-note", "data-read-only-role": "true" }, label(copy, "readOnlyAccess", "Read-only access.")),
  );
}

function communicationEventLabel(copy, type) {
  const labels = {
    inbound_request: label(copy, "inboundRequest", "Inbound request"),
    reply_approved: label(copy, "approvedReply", "Approved reply"),
    delivery_sent: label(copy, "deliverySent", "Sent"),
    delivery_failed: label(copy, "deliveryFailed", "Delivery failed"),
    delivery_requeue: label(copy, "deliveryRequeue", "Returned to queue"),
  };
  return labels[type] || type.replaceAll("_", " ");
}

function CommunicationThread({ page, thread, copy, ui }) {
  // A lead with no recorded message still shows the section, so the operator
  // can see that nothing has been exchanged rather than an absent control.
  if (!thread || !thread.events?.length) {
    return h(
      "p",
      { className: "adm-empty adm-empty--icon", "data-communication-thread-empty": "true" },
      h(Icon, { name: "messages-square", size: 16 }),
      h("span", null, ui.noCommunicationYet),
    );
  }
  return h(
    "details",
    { className: "adm-communication", "data-communication-thread": thread.lead_id },
    h(
      "summary",
      null,
      h(Icon, { name: "messages-square", size: 16 }),
      h("span", null, label(copy, "communicationHistory", "Communication history")),
      h("small", null, `${thread.event_count} ${label(copy, "communicationEvents", "events")}`),
    ),
    h(
      "ol",
      { className: "adm-communication__timeline" },
      ...thread.events.map((event) =>
        h(
          "li",
          { key: event.id, "data-communication-event": event.type },
          h(
            "div",
            { className: "adm-communication__event-head" },
            h("strong", null, communicationEventLabel(copy, event.type)),
            event.channel ? h(StatusPill, { tone: event.type === "delivery_failed" ? "brick" : "sea" }, valueText(ui, event.channel)) : null,
            event.occurred_at
              ? h("time", { dateTime: event.occurred_at, title: event.occurred_at }, formatAdminDateTime(event.occurred_at, page.workspace?.locale))
              : null,
          ),
          event.actor ? h("small", null, event.actor) : null,
          h("p", null, event.body || label(copy, "noMessageBody", "No message body was provided.")),
        ),
      ),
    ),
  );
}

function CommunicationTemplateSelect({ templates = [], copy, ui }) {
  if (!templates.length) return null;
  return h(
    "div",
    { className: "adm-template-picker", "data-communication-template-picker": "true" },
    h(
      "label",
      null,
      label(copy, "replyTemplate", "Reply template"),
      h(
        "select",
        { name: "replyTemplate", "data-communication-template-select": "true" },
        h("option", { value: "" }, label(copy, "chooseReplyTemplate", "Choose a reviewable starting template")),
        ...templates.map((template) =>
          h(
            "option",
            {
              key: template.id,
              value: template.id,
              "data-template-body": template.body,
              "data-template-locale": template.locale,
              "data-template-channel": template.preferred_channel,
            },
            `${valueText(ui, template.kind)} · ${template.locale.toUpperCase()} · ${valueText(ui, template.preferred_channel)}`,
          ),
        ),
      ),
    ),
    h("small", null, label(copy, "templateReviewNotice", "Templates are a starting point only. Check the facts and edit the text before approval.")),
  );
}

function AccountCreateForm({ page, copy }) {
  if (!pageCan(page, "operations:write")) return null;
  return h(
    "form",
    {
      method: "post",
      action: "/api/admin/accounts",
      className: "adm-account-form",
      "data-admin-mutation-form": "true",
      "data-admin-mutation-saving": label(copy, "accountSaving", "Saving…"),
      "data-admin-mutation-success": label(copy, "accountSaved", "Account saved."),
      "data-admin-mutation-failure": label(copy, "accountFailed", "Could not save the account."),
      "data-account-create-form": "true",
    },
    page.workspace?.operator_id
      ? h("input", { type: "hidden", name: "actor", value: currentOperatorId(page) })
      : h("label", null, label(copy, "reviewer", "Operator"), h("input", { name: "actor", required: true, autoComplete: "name" })),
    h(
      "label",
      null,
      label(copy, "accountType", "Account type"),
      h(
        "select",
        { name: "accountType", required: true },
        h("option", { value: "family" }, label(copy, "family", "Family")),
        h("option", { value: "company" }, label(copy, "company", "Company")),
      ),
    ),
    h("label", null, label(copy, "accountLabel", "Internal account label"), h("input", { name: "label", required: true, maxLength: 120 })),
    h("label", null, label(copy, "accountNote", "Internal note (optional)"), h("textarea", { name: "note", rows: 2, maxLength: 1000 })),
    h(
      "label",
      { className: "adm-check" },
      h("input", { type: "checkbox", name: "humanConfirmed", required: true }),
      h("span", null, label(copy, "humanConfirmAccount", "I confirm this account has been reviewed and should be created.")),
    ),
    h("p", { role: "status", "aria-live": "polite", "data-admin-mutation-status": "true" }),
    h("button", { type: "submit", className: "mk-btn mk-btn--primary mk-btn--sm" }, h(Icon, { name: "plus", size: 15 }), h("span", null, label(copy, "createAccount", "Create account"))),
  );
}

function AccountLinkForm({ page, contact, copy }) {
  if (!pageCan(page, "operations:write") || contact.account_id || !page.accounts?.length) return null;
  return h(
    "details",
    { className: "adm-account-link", "data-account-link-control": contact.id },
    h("summary", null, h(Icon, { name: "link", size: 15 }), h("span", null, label(copy, "linkToAccount", "Link to account"))),
    h(
      "form",
      {
        method: "post",
        action: "/api/admin/accounts/link",
        "data-admin-mutation-form": "true",
        "data-admin-mutation-saving": label(copy, "accountSaving", "Saving…"),
        "data-admin-mutation-success": label(copy, "accountLinkSaved", "Contact linked to the account."),
        "data-admin-mutation-failure": label(copy, "accountLinkFailed", "Could not link the contact."),
      },
      h("input", { type: "hidden", name: "contactId", value: contact.id }),
      page.workspace?.operator_id
        ? h("input", { type: "hidden", name: "actor", value: currentOperatorId(page) })
        : h("label", null, label(copy, "reviewer", "Operator"), h("input", { name: "actor", required: true, autoComplete: "name" })),
      h(
        "label",
        null,
        label(copy, "accounts", "Accounts"),
        h(
          "select",
          { name: "accountId", required: true },
          h("option", { value: "" }, workbenchCopy(page).chooseOption),
          ...page.accounts.map((account) => h("option", { key: account.id, value: account.id }, `${account.label} · ${label(copy, account.type, account.type)}`)),
        ),
      ),
      h("label", null, label(copy, "linkReason", "Reason for linking"), h("textarea", { name: "reason", rows: 2, maxLength: 1000, required: true })),
      h(
        "label",
        { className: "adm-check" },
        h("input", { type: "checkbox", name: "linkConfirmed", required: true }),
        h("span", null, label(copy, "humanConfirmLink", "I confirm this contact belongs to the selected account.")),
      ),
      h("p", { role: "status", "aria-live": "polite", "data-admin-mutation-status": "true" }),
      h("button", { type: "submit", className: "mk-btn mk-btn--secondary mk-btn--sm" }, label(copy, "saveAccountLink", "Save account link")),
    ),
  );
}

function documentStatusLabel(copy, status) {
  if (status === "complete") return label(copy, "complete", "Complete");
  if (status === "not_applicable") return label(copy, "notApplicable", "Not applicable");
  if (status === "blocked") return label(copy, "blocked", "Blocked");
  return label(copy, "open", "Open");
}

function DocumentOutcomeForm({ page, checklist, item, copy }) {
  if (item.complete) return null;
  if (!pageCan(page, "operations:write")) {
    return h("p", { className: "adm-note", role: "note", "data-read-only-role": "true" }, workbenchCopy(page).readOnlyAccess);
  }
  return h(
    "details",
    { className: "adm-document-outcome", open: item.blocked, "data-document-outcome-control": item.id },
    h("summary", null, h(Icon, { name: item.blocked ? "triangle-alert" : "check-circle-2", size: 15 }), h("span", null, label(copy, "saveDocumentOutcome", "Record outcome"))),
    h(
      "form",
      {
        method: "post",
        action: "/api/admin/documents/outcome",
        "data-admin-mutation-form": "true",
        "data-admin-mutation-saving": label(copy, "documentSaving", "Saving…"),
        "data-admin-mutation-success": label(copy, "documentSaved", "Outcome saved."),
        "data-admin-mutation-failure": label(copy, "documentFailed", "Could not save the outcome."),
      },
      h("input", { type: "hidden", name: "leadId", value: checklist.lead_id }),
      h("input", { type: "hidden", name: "itemKey", value: item.key }),
      page.workspace?.operator_id
        ? h("input", { type: "hidden", name: "actor", value: currentOperatorId(page) })
        : h("label", null, label(copy, "reviewer", "Operator"), h("input", { name: "actor", required: true, autoComplete: "name" })),
      h(
        "label",
        null,
        label(copy, "documentStatus", "Outcome"),
        h(
          "select",
          { name: "status", required: true },
          h("option", { value: "complete" }, label(copy, "complete", "Complete")),
          h("option", { value: "blocked" }, label(copy, "blocked", "Blocked")),
          h("option", { value: "not_applicable" }, label(copy, "notApplicable", "Not applicable")),
        ),
      ),
      h("label", null, label(copy, "documentReference", "Internal reference (optional)"), h("input", { name: "reference", maxLength: 160 })),
      h("label", null, label(copy, "documentNote", "Review note"), h("textarea", { name: "note", rows: 2, maxLength: 1000, required: true })),
      h(
        "label",
        { className: "adm-check" },
        h("input", { type: "checkbox", name: "humanConfirmed", required: true }),
        h("span", null, label(copy, "confirmDocumentOutcome", "I confirm this outcome was reviewed and is not an automatic legal approval.")),
      ),
      h("p", { role: "status", "aria-live": "polite", "data-admin-mutation-status": "true" }),
      h("button", { type: "submit", className: "mk-btn mk-btn--primary mk-btn--sm" }, label(copy, "saveDocumentOutcome", "Save outcome")),
    ),
  );
}

function DocumentChecklistItem({ page, checklist, item, copy }) {
  return h(
    "li",
    { key: item.id, "data-document-item": item.key, "data-document-status": item.status },
    h(
      "div",
      { className: "adm-checklist-item__head" },
      h("span", { className: "adm-checklist-item__ordinal" }, item.ordinal),
      h("strong", null, item.label),
      h(StatusPill, { tone: item.blocked ? "brick" : item.complete ? "success" : "sun" }, documentStatusLabel(copy, item.status)),
    ),
    item.outcome
      ? h("small", null, `${item.outcome.actor} · ${formatAdminDateTime(item.outcome.recorded_at, page.workspace?.locale)}${item.outcome.reference ? ` · ${item.outcome.reference}` : ""}`)
      : null,
    h(DocumentOutcomeForm, { page, checklist, item, copy }),
  );
}

function ConsentWithdrawalForm({ page, row, copy }) {
  if (!row.withdrawable || !row.subject_id) return null;
  if (!pageCan(page, "operations:write")) {
    return h("p", { className: "adm-note", role: "note", "data-read-only-role": "true" }, workbenchCopy(page).readOnlyAccess);
  }
  return h(
    "details",
    { className: "adm-consent-action", "data-consent-withdrawal-control": row.id },
    h("summary", { className: "mk-btn mk-btn--secondary mk-btn--sm" }, h(Icon, { name: "x", size: 15 }), h("span", null, label(copy, "withdrawConsent", "Record withdrawal"))),
    h(
      "form",
      {
        method: "post",
        action: "/api/admin/consents/withdraw",
        className: "adm-form",
        "data-admin-mutation-form": "consent",
        "data-admin-mutation-saving": label(copy, "consentSaving", "Recording withdrawal…"),
        "data-admin-mutation-success": label(copy, "consentSaved", "Withdrawal recorded."),
        "data-admin-mutation-failure": label(copy, "consentFailed", "Could not record the withdrawal."),
      },
      h("input", { type: "hidden", name: "subjectId", value: row.subject_id }),
      h("input", { type: "hidden", name: "consentType", value: row.consent_type }),
      page.workspace?.operator_id ? h("input", { type: "hidden", name: "actor", value: currentOperatorId(page) }) : null,
      h(
        "label",
        null,
        label(copy, "withdrawalReason", "Withdrawal reason"),
        h(
          "select",
          { name: "reasonCode", required: true },
          h("option", { value: "customer_request" }, label(copy, "customerRequest", "Customer request")),
          h("option", { value: "broker_recorded_request" }, label(copy, "brokerRecordedRequest", "Request recorded by broker")),
          h("option", { value: "data_correction" }, label(copy, "dataCorrection", "Data correction")),
        ),
      ),
      h(
        "label",
        { className: "adm-check" },
        h("input", { type: "checkbox", name: "humanConfirmed", required: true }),
        h("span", null, label(copy, "confirmConsentWithdrawal", "I confirm the customer asked for this purpose to stop.")),
      ),
      h("p", { role: "status", "aria-live": "polite", "data-admin-mutation-status": "true" }),
      h("button", { type: "submit", className: "mk-btn mk-btn--primary mk-btn--sm" }, label(copy, "withdrawConsent", "Record withdrawal")),
    ),
  );
}

function ConsentsBody({ page }) {
  const copy = adminCopy(page);
  const ui = workbenchCopy(page);
  const columns = {
    subject: label(copy, "consentSubject", "Enquiry or subscription"),
    purpose: label(copy, "consentPurpose", "Purpose"),
    state: label(copy, "consentState", "State"),
    recordedAt: label(copy, "consentRecordedAt", "Recorded"),
    action: label(copy, "action", "Action"),
  };
  const metrics = [
    [label(copy, "consentGranted", "Active permissions"), page.summary.granted, "shield-check", "success"],
    [label(copy, "consentWithdrawn", "Withdrawn"), page.summary.withdrawn, "x", "brick"],
    [label(copy, "marketingOptIns", "Marketing opt-ins"), page.summary.marketing_opt_in, "mail", "sand"],
  ];
  const title = label(copy, "consentsWorkspace", "Consent and preferences");
  const rows = page.consentStates;
  const filterOptions = [
    { value: "all", label: label(copy, "all", "All"), count: rows.length },
    { value: "active", label: label(copy, "consentActive", "Active"), count: rows.filter((row) => row.granted).length },
    { value: "withdrawn", label: label(copy, "consentStopped", "Withdrawn"), count: rows.filter((row) => !row.granted).length },
    { value: "marketing", label: label(copy, "marketingOptIns", "Marketing opt-ins"), count: rows.filter((row) => row.marketing_opt_in).length },
  ];
  return adminShell(page, {
    title,
    mainAttrs: {
      "data-kind": "admin-consents",
      "data-react-admin-ui": "consents",
      "data-privacy-safe": "true",
      "data-consent-state-count": page.summary.records,
    },
    children: [
      h(PageHeader, { title, subtitle: page.metadata.description }),
      h("p", { className: "adm-inline-alert", "data-consent-guardrail": "true" }, label(copy, "consentGuardrail", "Withdrawal stops this purpose. New consent requires a new explicit customer action.")),
      h(StatGrid, { metrics }),
      rows.length ? h(PageToolbar, null, h(ListFilterTabs, { scope: "consents", label: title, options: filterOptions })) : null,
      h(
        Panel,
        { title },
        rows.length
          ? [
              h(ListEmptyNote, { key: "empty", scope: "consents" }, ui.noFilterMatches),
              h(
                "div",
                { key: "table", className: "crm-tbl-wrap" },
                h(
                  "table",
                  { className: "crm-tbl" },
                  h(
                    "thead",
                    null,
                    h(
                      "tr",
                      null,
                      h("th", { scope: "col" }, columns.subject),
                      h("th", { scope: "col" }, columns.purpose),
                      h("th", { scope: "col" }, columns.state),
                      h("th", { scope: "col" }, columns.recordedAt),
                      h("th", { scope: "col" }, columns.action),
                    ),
                  ),
                  h(
                    "tbody",
                    null,
                    ...rows.map((row) =>
                      h(
                        "tr",
                        {
                          key: row.id,
                          "data-consent-row": "true",
                          "data-consent-state": row.granted ? "granted" : "withdrawn",
                          "data-list-item": "consents",
                          "data-filter-tags": [row.granted ? "active" : "withdrawn", row.marketing_opt_in ? "marketing" : ""].filter(Boolean).join(" "),
                        },
                        h("td", { "data-consent-column": "subject", "data-label": columns.subject }, h("code", { className: "crm-mono" }, row.subject_id || row.contact_reference || ui.notSet), h("small", { className: "adm-lead-context" }, row.locale.toUpperCase())),
                        h("td", { "data-consent-column": "purpose", "data-label": columns.purpose }, h("strong", null, label(copy, row.consent_type, row.consent_type)), h("small", { className: "adm-lead-context" }, label(copy, row.legal_basis, row.legal_basis))),
                        h("td", { "data-consent-column": "state", "data-label": columns.state }, h(StatusPill, { tone: row.granted ? "success" : "brick" }, row.granted ? label(copy, "consentActive", "Active") : label(copy, "consentStopped", "Withdrawn"))),
                        h("td", { className: "crm-tbl__muted", "data-consent-column": "recorded_at", "data-label": columns.recordedAt }, h("time", { dateTime: row.recorded_at, title: row.recorded_at }, formatAdminDateTime(row.recorded_at, page.workspace?.locale))),
                        h("td", { "data-consent-column": "action", "data-label": columns.action }, h(ConsentWithdrawalForm, { page, row, copy })),
                      ),
                    ),
                  ),
                ),
              ),
            ]
          : h(EmptyState, { icon: "shield-check" }, label(copy, "noConsentRecords", "No consent records yet.")),
      ),
    ],
  });
}

function DocumentChecklistsBody({ page }) {
  const copy = adminCopy(page);
  const ui = workbenchCopy(page);
  const queue = page.documentChecklistQueue;
  const title = label(copy, "documentsWorkspace", "Documents and process");
  const metrics = [
    [label(copy, "openChecklists", "Open checklists"), queue.summary.open, "file-check", "sea"],
    [label(copy, "blockedChecklists", "Blocked checklists"), queue.summary.blocked, "triangle-alert", "brick"],
    [label(copy, "completedChecklists", "Completed checklists"), queue.summary.complete, "check-circle-2", "success"],
    [label(copy, "completedItems", "Completed steps"), `${queue.summary.items_complete}/${queue.summary.items}`, "list", "sand"],
  ];
  const checklistState = (checklist) => (checklist.blocked_count ? "blocked" : checklist.open_count ? "open" : "complete");
  const filterOptions = [
    { value: "all", label: label(copy, "all", "All"), count: queue.rows.length },
    { value: "open", label: label(copy, "open", "Open"), count: queue.rows.filter((row) => checklistState(row) === "open").length },
    { value: "blocked", label: label(copy, "blocked", "Blocked"), count: queue.rows.filter((row) => checklistState(row) === "blocked").length },
    { value: "complete", label: label(copy, "complete", "Complete"), count: queue.rows.filter((row) => checklistState(row) === "complete").length },
  ];
  return adminShell(page, {
    title,
    mainAttrs: {
      "data-kind": "admin-document-checklists",
      "data-react-admin-ui": "document-checklists",
      "data-checklist-count": queue.summary.checklists,
      "data-task-led": "true",
    },
    children: [
      h(PageHeader, { title, subtitle: page.metadata.description }),
      h("p", { className: "adm-inline-alert", "data-process-guardrail": "true" }, label(copy, "processGuardrail", "The checklist tracks responsibility and evidence. It does not replace professional review.")),
      h(StatGrid, { metrics }),
      queue.rows.length ? h(PageToolbar, null, h(ListFilterTabs, { scope: "documents", label: title, options: filterOptions })) : null,
      queue.rows.length
        ? h(ListEmptyNote, { scope: "documents" }, ui.noFilterMatches)
        : h(Panel, { title }, h("p", { className: "adm-empty", "data-empty-checklists": "true" }, ui.noChecklists)),
      h(
        "div",
        { className: "adm-checklist-grid", hidden: queue.rows.length ? undefined : true },
        ...queue.rows.map((checklist) => {
          const nextItem = checklist.next_item
            ? checklist.items.find((item) => item.id === checklist.next_item.id || item.key === checklist.next_item.key)
            : null;
          const remainingItems = nextItem ? checklist.items.filter((item) => item.id !== nextItem.id) : checklist.items;
          return h(
            "article",
            {
              key: checklist.id,
              className: "adm-checklist-card",
              "data-document-checklist": checklist.lead_id,
              "data-checklist-blocked": checklist.blocked_count ? "true" : "false",
              "data-list-item": "documents",
              "data-filter-tags": checklistState(checklist),
            },
            h(
              "header",
              null,
              h("div", null, h("h2", null, checklist.title), h("a", { href: adminHref(`/admin/leads#lead-${encodeURIComponent(checklist.lead_id)}`, page), className: "crm-mono" }, checklist.lead_id)),
              h(StatusPill, { tone: checklist.blocked_count ? "brick" : checklist.open_count ? "sun" : "success" }, `${checklist.progress_percent}%`),
            ),
            h(
              "div",
              { className: "adm-checklist-progress" },
              h("progress", { value: checklist.completed_count, max: checklist.item_count, "aria-label": checklist.title }),
              h("span", null, `${checklist.completed_count}/${checklist.item_count}`),
            ),
            checklist.next_item
              ? h("p", { className: "adm-checklist-next" }, h("strong", null, `${label(copy, "nextDocumentStep", "Next step")}: `), checklist.next_item.label)
              : null,
            nextItem
              ? h(
                  "ol",
                  { className: "adm-checklist-items adm-checklist-items--next" },
                  h(DocumentChecklistItem, { page, checklist, item: nextItem, copy }),
                )
              : null,
            remainingItems.length
              ? h(
                  "details",
                  { className: "adm-checklist-more" },
                  h(
                    "summary",
                    null,
                    h(Icon, { name: "list", size: 16 }),
                    h("span", null, `${label(copy, "allDocumentSteps", "All steps")} · ${checklist.completed_count}/${checklist.item_count}`),
                  ),
                  h(
                    "ol",
                    { className: "adm-checklist-items" },
                    ...remainingItems.map((item) => h(DocumentChecklistItem, { key: item.id, page, checklist, item, copy })),
                  ),
                )
              : null,
          );
        }),
      ),
    ],
  });
}

function contactTitle(contact, ui) {
  if (contact.display_name && contact.display_name !== contact.id) return contact.display_name;
  const types = (contact.lead_types || []).map((type) => statusText(ui, type)).filter(Boolean);
  return types.length ? types.join(", ") : contact.id;
}

function ContactsBody({ page }) {
  const copy = adminCopy(page);
  const ui = workbenchCopy(page);
  const title = label(copy, "contactsWorkspace", "Contacts and accounts");
  const metrics = [
    [label(copy, "contactRecords", "Customer contacts"), page.summary.contacts, "users", "sea"],
    [label(copy, "accounts", "Accounts"), page.summary.accounts, "building-2", "sand"],
    [label(copy, "duplicateEnquiries", "Linked repeat enquiries"), page.summary.duplicate_leads, "link", "sun"],
    [label(copy, "communicationEvents", "Communication events"), page.summary.communication_events, "messages-square", "sea"],
  ];
  const withAccount = page.contacts.filter((contact) => contact.account_id).length;
  const filterOptions = [
    { value: "all", label: label(copy, "all", "All"), count: page.contacts.length },
    { value: "no_account", label: ui.withoutAccount, count: page.contacts.length - withAccount },
    { value: "with_account", label: ui.withAccount, count: withAccount },
  ];
  return adminShell(page, {
    title,
    mainAttrs: {
      "data-kind": "admin-contacts",
      "data-react-admin-ui": "contacts",
      "data-contact-count": page.summary.contacts,
      "data-account-count": page.summary.accounts,
      "data-task-led": "true",
    },
    children: [
      h(PageHeader, { title, subtitle: page.metadata.description }),
      h(StatGrid, { metrics }),
      h(
        PageToolbar,
        null,
        h(ListFilterTabs, { key: "tabs", scope: "contacts", label: label(copy, "contactRecords", "Customer contacts"), options: filterOptions }),
        pageCan(page, "operations:write")
          ? h(ActionDisclosure, { key: "new", summary: ui.newAccountAction, icon: "plus", "data-account-create": "true" }, h(AccountCreateForm, { page, copy }))
          : null,
      ),
      h(
        "div",
        { className: "adm-contact-layout" },
        h(
          Panel,
          { title: label(copy, "accounts", "Accounts") },
          page.accounts.length
            ? h(
                "ul",
                { className: "adm-account-list" },
                ...page.accounts.map((account) =>
                  h(
                    "li",
                    { key: account.id, "data-account-record": account.id },
                    h("div", null, h("strong", null, account.label), h("code", { className: "crm-mono" }, account.id)),
                    h(StatusPill, { tone: account.type === "company" ? "sea" : "sand" }, label(copy, account.type, account.type)),
                    h("span", null, `${account.contact_count} ${label(copy, "contactRecords", "contacts")}`),
                  ),
                ),
              )
            : h(EmptyState, { icon: "building-2" }, label(copy, "noAccounts", "No family or company accounts yet.")),
        ),
        h(
          Panel,
          { title: label(copy, "contactRecords", "Customer contacts") },
          page.contacts.length ? h(ListEmptyNote, { scope: "contacts" }, ui.noFilterMatches) : h("p", { className: "adm-empty", "data-empty-contacts": "true" }, ui.noContacts),
          h(
            "div",
            { className: "adm-contact-grid", hidden: page.contacts.length ? undefined : true },
            ...page.contacts.map((contact) =>
              h(
                "article",
                {
                  key: contact.id,
                  className: "adm-contact-card",
                  "data-contact-record": contact.id,
                  "data-list-item": "contacts",
                  "data-filter-tags": contact.account_id ? "with_account" : "no_account",
                },
                h(
                  "header",
                  null,
                  h("div", null, h("h3", null, contactTitle(contact, ui)), h("code", { className: "crm-mono adm-contact-card__id" }, contact.id)),
                  contact.account_id
                    ? h(StatusPill, { tone: "sand" }, `${contact.account_label} · ${label(copy, contact.account_type, contact.account_type)}`)
                    : h(StatusPill, { tone: "sun" }, label(copy, "ungroupedContacts", "No account")),
                ),
                leadContactActions({ contact: contact.contact, contact_preference: contact.preferred_channel }, ui),
                h(
                  "dl",
                  { className: "adm-contact-facts" },
                  h("div", null, h("dt", null, label(copy, "leads", "Enquiries")), h("dd", null, contact.lead_count)),
                  h("div", null, h("dt", null, label(copy, "duplicateEnquiries", "Linked repeats")), h("dd", null, contact.duplicate_leads)),
                  h("div", null, h("dt", null, label(copy, "owners", "Owners")), h("dd", null, contact.assigned_brokers.join(", ") || ui.notSet)),
                  h("div", null, h("dt", null, label(copy, "language", "Language")), h("dd", null, contact.languages.join(", ").toUpperCase() || ui.notSet)),
                  h("div", null, h("dt", null, label(copy, "communicationEvents", "Communication events")), h("dd", null, contact.communication_event_count)),
                  h("div", null, h("dt", null, label(copy, "latestEnquiry", "Latest enquiry")), h("dd", null, contact.latest_received_at ? formatAdminDateTime(contact.latest_received_at, page.workspace?.locale) : ui.notSet)),
                ),
                h(
                  "div",
                  { className: "adm-contact-card__leads" },
                  ...contact.lead_ids.map((leadId) => h("a", { key: leadId, href: adminHref(`/admin/leads?locale=${page.workspace.locale}#lead-${encodeURIComponent(leadId)}`, page) }, leadId)),
                ),
                h(AccountLinkForm, { page, contact, copy }),
              ),
            ),
          ),
        ),
      ),
    ],
  });
}


function ManualLeadForm({ page }) {
  const copy = adminCopy(page);
  const ui = workbenchCopy(page);
  const sources = ["broker_phone", "broker_viber", "broker_whatsapp", "broker_email", "broker_walk_in", "partner_referral"];
  const leadTypes = ["buyer", "foreign_buyer", "investor", "renter", "seller", "landlord", "partner_referral", "general"];
  const languages = ["bg", "en", "de", "nl", "ru", "el", "he"];
  return h(
    ActionDisclosure,
    { summary: label(copy, "newLead", "New enquiry"), icon: "plus", className: "adm-manual-lead", "data-manual-lead-entry": "true" },
    h(
      "form",
      {
        method: "post",
        action: "/api/admin/leads",
        className: "adm-form adm-pipeline-form adm-manual-lead__form",
        "data-admin-mutation-form": "lead",
        "data-admin-mutation-saving": label(copy, "leadSaving", "Creating enquiry…"),
        "data-admin-mutation-success": label(copy, "leadSaved", "Enquiry created and assigned."),
        "data-admin-mutation-failure": label(copy, "leadSaveFailed", "Could not create the enquiry."),
      },
      h("p", { className: "crm-tbl__muted adm-manual-lead__intro" }, label(copy, "manualLeadDescription", "Record a broker-originated enquiry.")),
      h(
        "div",
        { className: "adm-pipeline-fields adm-pipeline-fields--two" },
        h(
          "label",
          null,
          label(copy, "leadSource", "Source"),
          h("select", { name: "source", defaultValue: "broker_phone", required: true }, ...sources.map((source) => h("option", { key: source, value: source }, valueText(ui, source)))),
        ),
        h(
          "label",
          null,
          label(copy, "leadType", "Customer type"),
          h("select", { name: "leadType", defaultValue: "buyer", required: true }, ...leadTypes.map((type) => h("option", { key: type, value: type }, statusText(ui, type)))),
        ),
        h(
          "label",
          null,
          label(copy, "language", "Language"),
          h("select", { name: "language", defaultValue: page.workspace?.locale || "bg", required: true }, ...languages.map((language) => h("option", { key: language, value: language }, language.toUpperCase()))),
        ),
        h("label", null, label(copy, "contactName", "Contact name"), h("input", { name: "contact.name", required: true, autoComplete: "name", maxLength: 160 })),
        h("label", null, label(copy, "contactPhone", "Phone"), h("input", { name: "contact.phone", type: "tel", inputMode: "tel", autoComplete: "tel", maxLength: 80 })),
        h("label", null, label(copy, "contactEmail", "Email"), h("input", { name: "contact.email", type: "email", inputMode: "email", autoComplete: "email", maxLength: 240 })),
        h(
          "label",
          null,
          label(copy, "preferredChannel", "Preferred channel"),
          h("select", { name: "contact_preference", defaultValue: "phone" }, ...["phone", "viber", "whatsapp", "email"].map((channel) => h("option", { key: channel, value: channel }, valueText(ui, channel)))),
        ),
        h("label", null, label(copy, "listingReference", "Listing reference"), h("input", { name: "listingReference", maxLength: 120 })),
        h("label", null, label(copy, "locations", "Locations"), h("input", { name: "requirements.locations", placeholder: "Sandanski", maxLength: 600 })),
        h(PropertyFamilyChecks, { ui, name: "requirements.property_types", legend: label(copy, "propertyTypes", "Property types") }),
        h("label", null, label(copy, "budgetMax", "Maximum budget (€)"), h("input", { name: "requirements.budget_max_eur", type: "number", min: 0, step: 1 })),
        h("label", null, label(copy, "timeline", "Decision timeline"), h("input", { name: "requirements.timeline", maxLength: 200 })),
        h("label", null, label(copy, "message", "Message"), h("textarea", { name: "message", maxLength: 2000, rows: 3 })),
      ),
      h(
        "label",
        { className: "adm-check" },
        h("input", { type: "checkbox", name: "humanConfirmed", required: true }),
        h("span", null, label(copy, "humanConfirmLead", "I confirm these details came from a real enquiry and have been checked.")),
      ),
      h(
        "div",
        { className: "adm-form__actions" },
        h("p", { className: "crm-tbl__muted", role: "status", "aria-live": "polite", "data-admin-mutation-status": "true" }),
        h("button", { type: "submit", className: "mk-btn mk-btn--primary mk-btn--sm" }, h(Icon, { name: "users", size: 15 }), label(copy, "createLead", "Create enquiry")),
      ),
    ),
  );
}


function qualificationFieldLabel(field, copy, ui) {
  if (field === "budget_max_eur") return label(copy, "budgetMax", "Maximum budget (€)");
  if (field === "timeline") return label(copy, "timeline", "Decision timeline");
  return fieldText(ui, field);
}

function LeadBrief({ brief, intake, copy, ui, locale, open = false }) {
  if (!brief) return null;
  const tone = brief.priority === "critical" ? "brick" : brief.priority === "urgent" ? "sun" : brief.readiness_band === "ready" ? "success" : "sea";
  const readinessLabel = label(copy, `readiness_${brief.readiness_band}`, brief.readiness_band);
  const actionLabel = label(copy, brief.next_action.code, statusText(ui, brief.next_action.code));
  const missingFields = (intake?.missing_fields || []).map((field) => qualificationFieldLabel(field, copy, ui));
  return h(
    "details",
    {
      className: "adm-lead-brief",
      "data-lead-brief": brief.lead_id,
      "data-readiness-band": brief.readiness_band,
      "data-next-best-action": brief.next_action.code,
      "data-decision-source": brief.decision_source,
      open,
    },
    h(
      "summary",
      { className: "adm-lead-brief__summary" },
      h(
        "span",
        { className: "adm-lead-brief__next" },
        h("small", null, label(copy, "nextBestAction", "Next best action")),
        h("strong", null, actionLabel),
      ),
      h(
        "span",
        { className: "adm-lead-brief__readiness" },
        h("strong", null, `${brief.readiness_score}%`),
        h(StatusPill, { tone }, readinessLabel),
      ),
    ),
    h(
      "div",
      { className: "adm-lead-brief__body" },
      h(
        "div",
        { className: "adm-lead-brief__score" },
        h("span", null, label(copy, "leadReadiness", "Readiness")),
        h("strong", null, `${brief.readiness_score}%`),
        h("progress", { value: brief.readiness_score, max: 100, "aria-label": `${label(copy, "leadReadiness", "Readiness")}: ${brief.readiness_score}%` }),
        missingFields.length ? h("small", null, `${label(copy, "missingFields", "Missing fields")}: ${missingFields.join(", ")}`) : null,
      ),
      h(
        "div",
        { className: "adm-lead-brief__action" },
        h("span", null, label(copy, "qualificationDetails", "Qualification evidence")),
        brief.next_action.due_at ? h("time", { dateTime: brief.next_action.due_at }, formatAdminDateTime(brief.next_action.due_at, locale)) : null,
        brief.match_count ? h("small", null, `${brief.match_count} ${label(copy, "inventoryMatches", "matching properties")}`) : null,
      ),
      h("small", { className: "adm-lead-brief__guardrail" }, label(copy, "deterministicDecision", "Calculated from workflow evidence; Hermes may only suggest a draft.")),
    ),
  );
}

// Compact "2 h" / "3 d" age for the inbox list; the detail pane shows the
// full localized timestamp. Uses the SLA report time as "now" when present,
// so the rendered page stays deterministic for fixtures.
function formatRelativeAge(value, ui, now = Date.now()) {
  const time = Date.parse(value || "");
  if (Number.isNaN(time)) return "";
  const minutes = Math.max(0, Math.round((now - time) / 60000));
  if (minutes < 1) return ui.justNow;
  if (minutes < 60) return ui.ageMinutes.replace("{n}", String(minutes));
  const hours = Math.round(minutes / 60);
  if (hours < 48) return ui.ageHours.replace("{n}", String(hours));
  return ui.ageDays.replace("{n}", String(Math.round(hours / 24)));
}

function leadTitle(lead, ui) {
  return lead.contact?.name || statusText(ui, lead.lead_type);
}

function leadSlaTone(status) {
  if (status === "ok") return "success";
  if (status?.includes("escalation")) return "brick";
  return "sun";
}

// Private contact channels as compact buttons (tel, WhatsApp, Viber, mail).
function LeadContactChannels({ lead, ui }) {
  const contact = lead.contact || {};
  const channels = ["phone", "whatsapp", "viber", "email"].flatMap((channel) => {
    const value = String(contact[channel] || "").trim();
    if (!value) return [];
    const number = value.replace(/[^\d+]/g, "");
    const href =
      channel === "email"
        ? `mailto:${value}`
        : channel === "whatsapp"
          ? `https://wa.me/${number.replace(/^\+/, "")}`
          : channel === "viber"
            ? `viber://chat?number=${encodeURIComponent(number)}`
            : `tel:${number}`;
    const icon = channel === "email" ? "mail" : channel === "phone" ? "phone" : "message-circle";
    return [
      h(
        "a",
        { key: channel, href, className: "mk-btn mk-btn--secondary mk-btn--sm", "data-private-contact-channel": channel },
        h(Icon, { name: icon, size: 15 }),
        h("span", null, `${valueText(ui, channel)}: ${value}`),
      ),
    ];
  });
  if (!channels.length) return null;
  return h("div", { className: "adm-lead-detail__channels", "data-private-contact": "true" }, ...channels);
}

// List pane row: who, context, SLA and age. The link targets the detail
// article, so selection works through the URL fragment without JavaScript.
function LeadInboxRow({ row, ui, locale }) {
  const { lead, slaStatus, delivery, delivered, brokerId, leadContext, requestDetails, age } = row;
  return h(
    "li",
    {
      "data-lead-row": "true",
      "data-lead-id": lead.lead_id,
      "data-lead-type": lead.lead_type,
      "data-lead-replied": delivered ? "true" : "false",
      hidden: delivered,
    },
    h(
      "a",
      { className: "adm-inbox__row", href: `#lead-${encodeURIComponent(lead.lead_id)}`, "data-lead-link": lead.lead_id },
      h("span", { className: "adm-inbox__title" }, leadTitle(lead, ui)),
      age ? h("time", { className: "adm-inbox__age", dateTime: lead.received_at, title: formatAdminDateTime(lead.received_at, locale) }, age) : null,
      leadContext ? h("small", { className: "adm-inbox__context", "data-lead-context": "true" }, leadContext) : null,
      requestDetails ? h("small", { className: "adm-inbox__context", "data-lead-request-details": "true" }, requestDetails) : null,
      h(
        "span",
        { className: "adm-inbox__tags" },
        h(StatusPill, { tone: leadSlaTone(slaStatus), "data-sla-status": slaStatus }, statusText(ui, slaStatus)),
        delivery && !delivered ? h(StatusPill, { tone: delivery.status === "failed" ? "brick" : "sun" }, statusText(ui, delivery.status)) : null,
        h("span", { className: "adm-inbox__broker" }, brokerId || ui.notSet),
      ),
    ),
  );
}

// Detail pane: brief, facts, reply composer, assignment and thread. Keeps the
// lead id as the element id so Today, contacts and documents can deep-link.
function LeadDetail({ page, row, copy, ui, locale, leadColumns }) {
  const { lead, leadSla, slaStatus, queuedReply, delivery, delivered, brokerId, leadContext, requestDetails, intake, brief, thread } = row;
  const replyOpen = queuedReply && delivery && !delivered;
  return h(
    "article",
    {
      id: `lead-${lead.lead_id}`,
      className: "adm-lead-detail",
      "data-lead-row": "true",
      "data-lead-id": lead.lead_id,
      "data-lead-type": lead.lead_type,
      "data-original-language": lead.original_language,
      "data-admin-locale": lead.admin_locale,
      "data-contact-preference": lead.contact_preference,
      "data-broker-assignment": brokerId,
      "data-lead-replied": delivered ? "true" : "false",
      "data-reply-queue-status": delivery && !delivered ? delivery.status : undefined,
      hidden: delivered,
    },
    h("a", { className: "mk-btn mk-btn--ghost mk-btn--sm adm-lead-detail__back", href: "#lead-inbox" }, h(Icon, { name: "arrow-left", size: 16 }), h("span", null, ui.backToList)),
    h(
      "div",
      { className: "adm-lead-detail__head" },
      h(
        "div",
        null,
        h("h2", null, leadTitle(lead, ui)),
        h(
          "div",
          { className: "adm-lead-detail__meta" },
          lead.contact?.name ? h(StatusPill, { tone: lead.lead_type === "seller" ? "sand" : "sea" }, statusText(ui, lead.lead_type)) : null,
          h("span", { className: "adm-lead-meta__source" }, valueText(ui, lead.source)),
          h("span", { className: "crm-lang" }, `${lead.original_language} → ${lead.admin_locale}`),
          h("span", { className: "adm-lead-meta__contact" }, valueText(ui, lead.contact_preference)),
        ),
      ),
      h(
        "div",
        { className: "adm-lead-detail__actions" },
        h(
          "a",
          { className: "mk-btn mk-btn--ghost mk-btn--sm", href: adminHref(`/admin/activity?leadId=${encodeURIComponent(lead.lead_id)}`, page), "data-lead-history": lead.lead_id },
          h(Icon, { name: "list", size: 15 }),
          h("span", null, label(copy, "viewHistory", "History")),
        ),
        h(
          "button",
          {
            type: "button",
            className: "mk-btn mk-btn--ghost mk-btn--sm",
            disabled: true,
            "data-planned-control": "lead_snooze",
            "aria-describedby": `snooze-note-${lead.lead_id}`,
            title: ui.snoozeNote,
          },
          h(Icon, { name: "clock", size: 15 }),
          h("span", null, ui.snooze),
          h(PlannedBadge, { ui }),
        ),
        h(PlannedNote, { id: `snooze-note-${lead.lead_id}`, className: "adm-planned-note adm-visually-hidden" }, ui.snoozeNote),
      ),
      h(LeadContactChannels, { lead, ui }),
    ),
    h(
      "div",
      { className: "adm-lead-detail__section" },
      h(
        "dl",
        { className: "adm-lead-detail__facts" },
        h("div", null, h("dt", null, leadColumns.sla), h("dd", { "data-sla-status": slaStatus }, h(StatusPill, { tone: leadSlaTone(slaStatus) }, statusText(ui, slaStatus)))),
        h(
          "div",
          null,
          h("dt", null, leadColumns.escalationDue),
          h(
            "dd",
            { "data-lead-column": "escalation_due" },
            leadSla?.manager_escalation_due_at
              ? h("time", { dateTime: leadSla.manager_escalation_due_at, title: leadSla.manager_escalation_due_at }, formatAdminDateTime(leadSla.manager_escalation_due_at, locale))
              : ui.notSet,
          ),
        ),
        h("div", null, h("dt", null, ui.received), h("dd", null, lead.received_at ? h("time", { dateTime: lead.received_at }, formatAdminDateTime(lead.received_at, locale)) : ui.notSet)),
        h("div", null, h("dt", null, label(copy, "listing", "Listing")), h("dd", null, leadContext || ui.notSet)),
        requestDetails ? h("div", null, h("dt", null, label(copy, "details", "Details")), h("dd", null, requestDetails)) : null,
        h("div", null, h("dt", null, label(copy, "assignedBroker", "Assigned broker")), h("dd", null, brokerId || ui.notSet)),
      ),
      h(LeadBrief, { brief, intake, copy, ui, locale, open: true }),
      lead.duplicate_status === "possible_duplicate"
        ? h(
            "a",
            { className: "adm-lead-duplicate", href: `#lead-${encodeURIComponent(lead.possible_duplicate_of)}`, "data-possible-duplicate-of": lead.possible_duplicate_of },
            h(Icon, { name: "triangle-alert", size: 15 }),
            h("span", null, `${label(copy, "possibleDuplicate", "Possible duplicate contact")}: ${lead.possible_duplicate_of}`),
          )
        : null,
    ),
    h(
      "div",
      { className: "adm-lead-detail__section adm-reply-cell", "data-lead-column": "reply", "data-label": leadColumns.reply },
      h("h3", null, leadColumns.reply),
      replyOpen ? h(ReplyDeliveryForm, { page, lead, reply: queuedReply, delivery, copy, ui }) : null,
      page.leadSourceDurable && !replyOpen && pageCan(page, "operations:write") ? h(DirectProviderReplyForm, { page, lead, copy, ui }) : null,
      h(
        "div",
        { className: "adm-reply-cell__row" },
        h(
          "form",
          {
            method: "post",
            action: "/api/admin/replies/draft",
            className: "adm-draft-form",
            "data-hermes-draft-request": "true",
            "data-hermes-draft-endpoint": "/api/admin/replies/draft",
            "data-original-language": lead.original_language,
            "data-reply-draft-pending": label(copy, "replyDraftPending", "Preparing broker-only draft…"),
            "data-reply-draft-success": label(copy, "replyDraftReady", "Draft ready for broker review."),
            "data-reply-draft-failure": label(copy, "replyDraftFailed", "Could not prepare a broker draft."),
            "data-reply-draft-unavailable": label(
              copy,
              "replyDraftUnavailable",
              "Hermes is not configured in this environment. Use an approved template or write the reply manually.",
            ),
            hidden: page.leadSourceDurable || undefined,
          },
          h("input", { type: "hidden", name: "leadId", defaultValue: lead.lead_id }),
          h("input", { type: "hidden", name: "language", defaultValue: lead.original_language }),
          h(
            "button",
            { type: "submit", className: "mk-btn mk-btn--secondary mk-btn--sm" },
            h(Icon, { name: "sparkles", size: 16 }),
            h("span", null, label(copy, "draftWithHermes", "Draft with Hermes")),
          ),
        ),
        h(
          "details",
          { className: "adm-reply", hidden: page.leadSourceDurable || undefined },
          h("summary", { className: "mk-btn mk-btn--primary mk-btn--sm" }, h(Icon, { name: "send", size: 16 }), h("span", null, label(copy, "queueReply", "Queue reply"))),
          h(
            "form",
            {
              method: "post",
              action: "/api/admin/replies",
              className: "adm-reply-form",
              "data-reply-approval-required": "true",
              "data-hermes-reply-draft": "broker_review_required",
              "data-original-language": lead.original_language,
              "data-reply-queue-pending": label(copy, "replyQueuePending", "Queueing broker-approved reply…"),
              "data-reply-queue-success": label(copy, "replyQueueReady", "Reply queued for manual sending."),
              "data-reply-queue-failure": label(copy, "replyQueueFailed", "Could not queue the reviewed reply."),
            },
            h("input", { type: "hidden", name: "leadId", defaultValue: lead.lead_id }),
            h("input", { type: "hidden", name: "language", defaultValue: lead.original_language }),
            h("input", { type: "hidden", name: "approved", defaultValue: "true" }),
            h(CommunicationTemplateSelect, { templates: page.communicationTemplates?.[lead.lead_id] || [], copy, ui }),
            h(
              "label",
              { className: "adm-check", "data-show-original-toggle": "true" },
              h("input", { type: "checkbox", name: "showOriginal" }),
              ` ${label(copy, "showOriginal", "Show original")}`,
            ),
            h("label", null, label(copy, "hermesDraftText", "Hermes draft text"), h("textarea", { name: "hermesDraftText" })),
            h(
              "label",
              null,
              label(copy, "reviewer", "Reviewer"),
              h("input", {
                name: "reviewer",
                required: true,
                autoComplete: "name",
                defaultValue: currentOperatorId(page, brokerId),
                readOnly: Boolean(page.workspace?.operator_id),
              }),
            ),
            h("label", null, label(copy, "reviewedReply", "Reviewed reply"), h("textarea", { name: "reviewedReply", required: true })),
            h(
              "button",
              { type: "submit", className: "mk-btn mk-btn--primary mk-btn--sm" },
              h("span", null, label(copy, "queueReply", "Queue reply")),
            ),
          ),
        ),
      ),
      h(
        "p",
        { className: "adm-planned-note adm-hermes-note", "data-hermes-unavailable-note": "true" },
        h(Icon, { name: "info", size: 15 }),
        h("span", null, label(copy, "replyDraftUnavailable", "Hermes is not configured in this environment. Use an approved template or write the reply manually.")),
      ),
      h("p", { className: "adm-reply-status", role: "status", "aria-live": "polite", "data-reply-status": "true" }),
    ),
    h(
      "div",
      { className: "adm-lead-detail__section" },
      h(LeadAssignmentControl, { page, lead, copy }),
      h(CommunicationThread, { page, thread, copy, ui }),
      h(
        "details",
        { className: "adm-lead-more" },
        h("summary", null, h(Icon, { name: "list", size: 16 }), h("span", null, label(copy, "leadDetails", "Lead details"))),
        h(
          "div",
          { className: "adm-lead-more__body" },
          h(
            "dl",
            { className: "adm-lead-detail__facts" },
            h("div", null, h("dt", null, label(copy, "leadReference", "Internal lead reference")), h("dd", null, h("code", { className: "crm-mono" }, lead.lead_id))),
            h("div", null, h("dt", null, ui.replyDue), h("dd", null, lead.sla_due_at ? h("time", { dateTime: lead.sla_due_at }, formatAdminDateTime(lead.sla_due_at, locale)) : ui.notSet)),
            h("div", null, h("dt", null, ui.customerConfirmation), h("dd", null, lead.confirmation_status ? statusText(ui, lead.confirmation_status) : ui.notSet)),
            h("div", null, h("dt", null, label(copy, "language", "Language")), h("dd", null, String(lead.original_language || "").toUpperCase() || ui.notSet)),
          ),
        ),
      ),
    ),
  );
}

function LeadInboxBody({ page }) {
  const ui = workbenchCopy(page);
  const copy = { ...ui, ...adminCopy(page) };
  const locale = page.workspace?.locale;
  const leadSlaById = new Map((page.leadSla?.rows || []).map((row) => [row.lead_id, row]));
  const replyByLeadId = new Map((page.replies || []).map((reply) => [reply.lead_id || reply.leadId, reply]));
  const deliveryByReplyId = new Map((page.replyDeliveryQueue?.states || []).map((row) => [row.reply_id, row]));
  const communicationByLeadId = new Map((page.communicationThreads || []).map((thread) => [thread.lead_id, thread]));
  const briefByLeadId = new Map((page.leadBriefs?.rows || []).map((brief) => [brief.lead_id, brief]));
  const briefOrder = new Map((page.leadBriefs?.rows || []).map((brief, index) => [brief.lead_id, index]));
  const repliedLeadIds = new Set(
    (page.replyDeliveryQueue?.states || []).filter((row) => row.status === "sent").map((row) => row.lead_id),
  );
  const leadPriority = (lead) => {
    const reply = replyByLeadId.get(lead.lead_id);
    const delivery = reply ? deliveryByReplyId.get(reply.id) : null;
    if (repliedLeadIds.has(lead.lead_id)) return 5;
    if (delivery?.status === "failed") return 0;
    const status = leadSlaById.get(lead.lead_id)?.status || "pending";
    if (status === "manager_escalation_required") return 1;
    if (delivery?.status === "queued") return 2;
    if (status === "reminder_required") return 3;
    return 4;
  };
  const leads = [...page.leads].sort((left, right) => {
    const briefDifference = (briefOrder.get(left.lead_id) ?? Number.MAX_SAFE_INTEGER) - (briefOrder.get(right.lead_id) ?? Number.MAX_SAFE_INTEGER);
    return briefDifference || leadPriority(left) - leadPriority(right);
  });
  const needsReply = leads.filter((lead) => !repliedLeadIds.has(lead.lead_id));
  const now = Date.parse(page.leadSla?.generated_at || "") || Date.now();
  const rows = leads.map((lead) => {
    const leadSla = leadSlaById.get(lead.lead_id);
    const queuedReply = replyByLeadId.get(lead.lead_id);
    const delivery = queuedReply ? deliveryByReplyId.get(queuedReply.id) : null;
    return {
      lead,
      leadSla,
      slaStatus: leadSla?.status || "pending",
      queuedReply,
      delivery,
      delivered: delivery?.status === "sent",
      brokerId: lead.broker_assignment?.broker_id || lead.assigned_broker || "",
      leadContext: [lead.listing_reference, lead.property?.location].filter(Boolean).join(" / "),
      requestDetails: requestDetailsText(lead),
      intake: lead.intake_completion || { complete: false, missing_fields: [] },
      brief: briefByLeadId.get(lead.lead_id),
      thread: communicationByLeadId.get(lead.lead_id),
      age: formatRelativeAge(lead.received_at, ui, now),
    };
  });
  const slaCount = rows.filter((row) => row.slaStatus === "reminder_required" || row.slaStatus === "manager_escalation_required").length;
  const metrics = [
    [label(copy, "needsReply", "Needs reply"), needsReply.length, "messages-square", "sea"],
    [label(copy, "repliesQueued", "Replies queued"), page.summary.repliesQueued, "send", "sun"],
    [statusText(ui, "failed"), page.summary.repliesFailed, "triangle-alert", "brick"],
    [label(copy, "managerEscalations", "Manager escalations"), page.summary.leadSlaManagerEscalations, "triangle-alert", "brick"],
  ];
  const title = label(copy, "leadInbox", "Lead inbox");
  const leadColumns = {
    lead: label(copy, "lead", "Lead"),
    sla: label(copy, "sla", "SLA"),
    escalationDue: label(copy, "escalationDue", "Escalation due"),
    reply: label(copy, "reply", "Reply"),
  };
  return adminShell(page, {
    title,
    mainAttrs: {
      "data-kind": "admin-lead-inbox",
      "data-react-admin-ui": "lead-inbox",
      "data-admin-workbench": "crm",
      "data-inbox-layout": "two-pane",
      "data-lead-count": page.summary.leads,
      "data-sla-reminders": page.summary.leadSlaReminders,
      "data-admin-locale": page.workspace.locale,
      "data-interface-locales": page.workspace.interface_locales.join(","),
      "data-task-led": "true",
    },
    children: [
      h(PageHeader, { title, subtitle: page.metadata?.description }),
      h(StatGrid, { metrics }),
      h(
        PageToolbar,
        null,
        h(
          "nav",
          { key: "tabs", className: "crm-seg adm-lead-tabs", "aria-label": label(copy, "leadQueues", "Lead queues"), "data-lead-queue-tabs": "true" },
          h("button", { type: "button", "data-lead-filter": "all", "data-on": "0" }, label(copy, "all", "All"), h("span", { className: "adm-seg-count" }, leads.length)),
          h("button", { type: "button", "data-lead-filter": "needs_reply", "data-on": "1" }, label(copy, "needsReply", "Needs reply"), h("span", { className: "adm-seg-count" }, needsReply.length)),
          h("button", { type: "button", "data-lead-filter": "sla", "data-on": "0" }, label(copy, "sla", "SLA"), h("span", { className: "adm-seg-count" }, slaCount)),
        ),
        h(ManualLeadForm, { key: "new", page }),
      ),
      h(
        "section",
        { className: "adm-inbox", id: "lead-inbox", "data-inbox-panes": "true", "aria-label": label(copy, "crmLeads", "CRM leads") },
        h(
          "div",
          { className: "adm-inbox__list" },
          leads.length ? h(LeadListTools, { ui }) : null,
          leads.length ? null : h("p", { className: "adm-empty", "data-empty-leads": "true" }, ui.noLeads),
          leads.length ? h("p", { className: "adm-empty", "data-lead-queue-empty": "true", role: "status", hidden: true }, ui.noQueueMatches) : null,
          leads.length ? h("ol", { className: "adm-inbox__rows" }, ...rows.map((row) => h(LeadInboxRow, { key: row.lead.lead_id, row, ui, locale }))) : null,
        ),
        h(
          "div",
          { className: "adm-inbox__detail" },
          ...rows.map((row) => h(LeadDetail, { key: row.lead.lead_id, page, row, copy, ui, locale, leadColumns })),
          h("p", { className: "adm-inbox__hint" }, ui.selectLead),
        ),
      ),
      h(ViewingFollowUpQueue, { page, copy, ui }),
      h(SellerPipelineQueue, { page, copy, ui }),
    ],
  });
}


function viewingFollowUpTone(row) {
  if (row.overdue) return "brick";
  if (row.viewing_status === "no_show") return "sun";
  if (row.viewing_status === "rescheduled") return "sea";
  return "success";
}

function datetimeLocalValue(value) {
  if (!value || Number.isNaN(Date.parse(value))) return "";
  return new Date(value).toISOString().slice(0, 16);
}

function ViewingFollowUpQueue({ page, copy, ui }) {
  const queue = page.viewingFollowUpQueue || { rows: [] };
  const writable = page.viewingFollowUpWritable !== false;
  const columns = {
    viewing: label(copy, "viewings", "Viewings"),
    task: label(copy, "task", "Task"),
    status: label(copy, "viewingStatus", "Viewing status"),
    dueAt: label(copy, "dueAt", "Due at"),
    action: label(copy, "recordOutcome", "Record"),
  };
  return h(
    Panel,
    { title: label(copy, "viewingFollowUpQueue", "Post-viewing follow-ups"), "data-viewing-follow-up-queue": "true" },
    queue.rows.length
      ? h(
          "div",
          { className: "adm-scroll-x" },
          h(
            "table",
            { className: "crm-tbl", "data-viewing-follow-up-table": "true" },
            h(
              "thead",
              null,
              h(
                "tr",
                null,
                h("th", { scope: "col" }, columns.viewing),
                h("th", { scope: "col" }, columns.task),
                h("th", { scope: "col" }, columns.status),
                h("th", { scope: "col" }, columns.dueAt),
                h("th", { scope: "col" }, columns.action),
              ),
            ),
            h(
              "tbody",
              null,
              ...queue.rows.map((row) =>
                h(
                  "tr",
                  {
                    key: `${row.viewing_id}-${row.task}`,
                    "data-viewing-follow-up-row": "true",
                    "data-viewing-id": row.viewing_id,
                    "data-viewing-task": row.task,
                    "data-overdue": row.overdue ? "true" : "false",
                  },
                  h(
                    "td",
                    { "data-viewing-column": "viewing", "data-label": columns.viewing },
                    h("div", { className: "adm-lead-identity" }, h("code", { className: "crm-mono" }, row.viewing_id), h("small", { className: "adm-lead-context" }, row.listing_reference || row.lead_id)),
                  ),
                  h("td", { "data-viewing-column": "task", "data-label": columns.task }, row.task === "feedback" ? label(copy, "feedback", "Feedback") : label(copy, "followUp", "Follow-up")),
                  h(
                    "td",
                    { "data-viewing-column": "status", "data-label": columns.status },
                    h(StatusPill, { tone: viewingFollowUpTone(row) }, `${statusText(ui, row.viewing_status)} · ${statusText(ui, row.task_status)}`),
                  ),
                  h(
                    "td",
                    { className: "crm-tbl__muted", "data-viewing-column": "due_at", "data-label": columns.dueAt },
                    row.due_at ? h("time", { dateTime: row.due_at, title: row.due_at }, formatAdminDateTime(row.due_at, page.workspace?.locale)) : ui.notSet,
                    row.overdue ? h("small", { className: "adm-lead-context", "data-viewing-overdue": "true" }, statusText(ui, "overdue")) : null,
                  ),
                  h(
                    "td",
                    { "data-viewing-column": "action", "data-label": columns.action },
                    writable
                      ? h(
                      "details",
                      { className: "adm-reply", "data-viewing-follow-up-actions": "true" },
                      h("summary", { className: "mk-btn mk-btn--secondary mk-btn--sm" }, h(Icon, { name: "calendar-check", size: 16 }), h("span", null, label(copy, "recordOutcome", "Record"))),
                      h(
                        "form",
                        {
                          method: "post",
                          action: "/api/admin/viewings/follow-up",
                          className: "adm-form",
                          "data-viewing-follow-up-form": "true",
                          "data-viewing-id": row.viewing_id,
                          "data-viewing-task": row.task,
                          "data-viewing-follow-up-saving": label(copy, "viewingFollowUpSaving", "Recording follow-up…"),
                          "data-viewing-follow-up-success": label(copy, "viewingFollowUpSaved", "Follow-up recorded."),
                          "data-viewing-follow-up-failure": label(copy, "viewingFollowUpSaveFailed", "Could not record follow-up."),
                        },
                        h("input", { type: "hidden", name: "viewingId", defaultValue: row.viewing_id }),
                        h("input", { type: "hidden", name: "task", defaultValue: row.task }),
                        h("label", null, label(copy, "broker", "Broker"), h("input", { name: "actor", required: true, autoComplete: "name", defaultValue: currentOperatorId(page, row.broker), readOnly: Boolean(page.workspace?.operator_id) })),
                        row.task === "follow_up"
                          ? h("label", null, label(copy, "nextViewingAt", "New viewing time"), h("input", { name: "startsAt", type: "datetime-local", defaultValue: datetimeLocalValue(row.starts_at) }))
                          : null,
                        row.task === "follow_up"
                          ? h("label", null, label(copy, "dueAt", "Due at"), h("input", { name: "dueAt", type: "datetime-local", defaultValue: datetimeLocalValue(row.due_at) }))
                          : null,
                        h("label", null, label(copy, "followUpNote", "Follow-up note"), h("textarea", { name: "note", maxLength: 2000 })),
                        h(
                          "div",
                          { className: "adm-form__actions" },
                          h("p", { className: "crm-tbl__muted", role: "status", "aria-live": "polite", "data-viewing-follow-up-status": "true" }),
                          h("button", { type: "submit", name: "action", value: "complete", className: "mk-btn mk-btn--primary mk-btn--sm" }, label(copy, "complete", "Complete")),
                          row.task === "follow_up"
                            ? h("button", { type: "submit", name: "action", value: "reschedule", className: "mk-btn mk-btn--secondary mk-btn--sm" }, label(copy, "reschedule", "Reschedule"))
                            : null,
                          row.task === "follow_up"
                            ? h("button", { type: "submit", name: "action", value: "no_show", className: "mk-btn mk-btn--secondary mk-btn--sm" }, label(copy, "noShow", "No-show"))
                            : null,
                          h("button", { type: "submit", name: "action", value: "note", className: "mk-btn mk-btn--ghost mk-btn--sm" }, label(copy, "addNote", "Add note")),
                        ),
                      ),
                        )
                      : h("p", { className: "adm-note", role: "note", "data-viewing-follow-up-read-only": "true" }, ui.viewingFollowUpReadOnly),
                  ),
                ),
              ),
            ),
          ),
        )
      : h("p", { className: "crm-tbl__muted", "data-empty-viewing-follow-ups": "true" }, label(copy, "noOpenFollowUps", "No open viewing follow-ups.")),
  );
}

function sellerPipelineTone(row) {
  if (row.overdue) return "brick";
  if (row.task === "seller_callback" || row.task === "callback") return "sun";
  if (row.stage === "appraisal_scheduled") return "sea";
  return "success";
}

function sellerPipelinePrimaryAction(row, copy) {
  const isAppraisal = row.task === "appraisal" || row.task === "seller_appraisal";
  if (row.task === "seller_callback" || row.task === "callback") {
    return ["callback_completed", label(copy, "callbackCompleted", "Complete callback")];
  }
  if (isAppraisal) {
    return row.stage === "appraisal_scheduled"
      ? ["appraisal_completed", label(copy, "appraisalCompleted", "Complete appraisal")]
      : ["appraisal_scheduled", label(copy, "scheduleAppraisal", "Schedule appraisal")];
  }
  if (row.task === "mandate" || row.task === "seller_mandate") {
    return ["mandate_signed", label(copy, "mandateSigned", "Record mandate")];
  }
  if (row.task === "listing_draft" || row.task === "seller_listing_draft") {
    return ["listing_draft_started", label(copy, "startListingDraft", "Start listing draft")];
  }
  if (row.task === "listing_publish") {
    return ["listing_published", label(copy, "publishSellerListing", "Record listing publication")];
  }
  if (row.task === "listing_offer") {
    return ["offer_received", label(copy, "recordSellerOffer", "Record offer")];
  }
  if (row.task === "seller_close") {
    return ["sale_completed", label(copy, "completeSellerSale", "Complete sale")];
  }
  return null;
}

function SellerPipelineQueue({ page, copy, ui }) {
  const queue = page.sellerPipelineQueue || { rows: [] };
  const columns = {
    seller: label(copy, "sellerRequest", "Seller request"),
    task: label(copy, "task", "Task"),
    stage: label(copy, "sellerStage", "Stage"),
    dueAt: label(copy, "dueAt", "Due at"),
    action: label(copy, "recordOutcome", "Record"),
  };
  return h(
    Panel,
    { title: label(copy, "sellerPipelineQueue", "Seller valuation queue"), "data-seller-pipeline-queue": "true" },
    queue.rows.length
      ? h(
          "div",
          { className: "adm-scroll-x" },
          h(
            "table",
            { className: "crm-tbl", "data-seller-pipeline-table": "true" },
            h(
              "thead",
              null,
              h(
                "tr",
                null,
                h("th", { scope: "col" }, columns.seller),
                h("th", { scope: "col" }, columns.task),
                h("th", { scope: "col" }, columns.stage),
                h("th", { scope: "col" }, columns.dueAt),
                h("th", { scope: "col" }, columns.action),
              ),
            ),
            h(
              "tbody",
              null,
              ...queue.rows.map((row) => {
                const isAppraisal = row.task === "appraisal" || row.task === "seller_appraisal";
                const needsAppraisalSchedule = isAppraisal && row.stage !== "appraisal_scheduled";
                const primary = sellerPipelinePrimaryAction(row, copy);
                const primaryAction = primary?.[0] || null;
                return h(
                  "tr",
                  {
                    key: `${row.seller_pipeline_id}-${row.task}`,
                    "data-seller-pipeline-row": "true",
                    "data-seller-pipeline-id": row.seller_pipeline_id,
                    "data-seller-pipeline-task": row.task,
                    "data-overdue": row.overdue ? "true" : "false",
                  },
                  h(
                    "td",
                    { "data-seller-pipeline-column": "seller", "data-label": columns.seller },
                    h("div", { className: "adm-lead-identity" }, h("code", { className: "crm-mono" }, row.seller_pipeline_id), h("small", { className: "adm-lead-context" }, row.property?.location || row.lead_id)),
                  ),
                  h("td", { "data-seller-pipeline-column": "task", "data-label": columns.task }, statusText(ui, row.task)),
                  h(
                    "td",
                    { "data-seller-pipeline-column": "stage", "data-label": columns.stage },
                    h(StatusPill, { tone: sellerPipelineTone(row) }, `${statusText(ui, row.stage)} · ${statusText(ui, row.task_status)}`),
                  ),
                  h(
                    "td",
                    { className: "crm-tbl__muted", "data-seller-pipeline-column": "due_at", "data-label": columns.dueAt },
                    row.due_at ? h("time", { dateTime: row.due_at, title: row.due_at }, formatAdminDateTime(row.due_at, page.workspace?.locale)) : ui.notSet,
                    row.overdue ? h("small", { className: "adm-lead-context", "data-seller-pipeline-overdue": "true" }, statusText(ui, "overdue")) : null,
                  ),
                  h(
                    "td",
                    { "data-seller-pipeline-column": "action", "data-label": columns.action },
                    h(
                      "details",
                      { className: "adm-reply", "data-seller-pipeline-actions": "true" },
                      h("summary", { className: "mk-btn mk-btn--secondary mk-btn--sm" }, h(Icon, { name: "landmark", size: 16 }), h("span", null, label(copy, "recordOutcome", "Record"))),
                      h(
                        "form",
                        {
                          method: "post",
                          action: "/api/admin/seller-pipeline/outcome",
                          className: "adm-form",
                          "data-seller-pipeline-outcome-form": "true",
                          "data-seller-pipeline-id": row.seller_pipeline_id,
                          "data-seller-pipeline-saving": label(copy, "sellerPipelineSaving", "Recording seller outcome…"),
                          "data-seller-pipeline-success": label(copy, "sellerPipelineSaved", "Seller outcome recorded."),
                          "data-seller-pipeline-failure": label(copy, "sellerPipelineSaveFailed", "Could not record seller outcome."),
                        },
                        h("input", { type: "hidden", name: "sellerPipelineId", defaultValue: row.seller_pipeline_id }),
                        h("label", null, label(copy, "broker", "Broker"), h("input", { name: "actor", required: true, autoComplete: "name", defaultValue: currentOperatorId(page, row.owner), readOnly: Boolean(page.workspace?.operator_id) })),
                        isAppraisal
                          ? h("label", null, label(copy, "appraisalAt", "Appraisal time"), h("input", { name: "appraisalAt", type: "datetime-local", required: true, defaultValue: datetimeLocalValue(row.appraisal_at || row.due_at) }))
                          : null,
                        ["listing_draft_started", "listing_published"].includes(primaryAction)
                          ? h("label", null, label(copy, "listingReference", "Listing reference"), h("input", { name: "listingReference", required: true, maxLength: 120, defaultValue: row.listing_reference || "" }))
                          : null,
                        primaryAction === "listing_published"
                          ? h("label", null, label(copy, "sellerPublicPath", "Public listing path"), h("input", { name: "publicPath", required: true, maxLength: 500, placeholder: "/bg/properties/MS-…", defaultValue: row.public_path || "" }))
                          : null,
                        primaryAction === "offer_received"
                          ? h("label", null, label(copy, "sellerOfferAmount", "Offer amount (€)"), h("input", { name: "offerAmountEur", type: "number", min: 1, step: 1, required: true }))
                          : null,
                        primaryAction === "sale_completed"
                          ? h(
                              "div",
                              { className: "adm-pipeline-fields adm-pipeline-fields--two" },
                              h("label", null, label(copy, "sellerSalePrice", "Sale price (€)"), h("input", { name: "salePriceEur", type: "number", min: 1, step: 1, required: true })),
                              pageCan(page, "financials:write")
                                ? h("label", null, label(copy, "sellerCommission", "Commission (€)"), h("input", { name: "commissionEur", type: "number", min: 0, step: 1 }))
                                : null,
                            )
                          : null,
                        h("label", null, label(copy, "sellerPipelineNote", "Seller pipeline note"), h("textarea", { name: "note", maxLength: 2000 })),
                        h(
                          "div",
                          { className: "adm-form__actions" },
                          h("p", { className: "crm-tbl__muted", role: "status", "aria-live": "polite", "data-seller-pipeline-status": "true" }),
                          primary ? h("button", { type: "submit", name: "action", value: primary[0], formNoValidate: isAppraisal && !needsAppraisalSchedule ? true : undefined, className: "mk-btn mk-btn--primary mk-btn--sm" }, primary[1]) : null,
                          isAppraisal && !needsAppraisalSchedule
                            ? h("button", { type: "submit", name: "action", value: "appraisal_scheduled", className: "mk-btn mk-btn--secondary mk-btn--sm" }, label(copy, "reschedule", "Reschedule"))
                            : null,
                          h("button", { type: "submit", name: "action", value: "closed_lost", formNoValidate: true, className: "mk-btn mk-btn--secondary mk-btn--sm" }, label(copy, "closeLost", "Close lost")),
                          h("button", { type: "submit", name: "action", value: "note", formNoValidate: true, className: "mk-btn mk-btn--ghost mk-btn--sm" }, label(copy, "addNote", "Add note")),
                        ),
                      ),
                    ),
                  ),
                );
              }),
            ),
          ),
        )
      : h("p", { className: "crm-tbl__muted", "data-empty-seller-pipeline": "true" }, label(copy, "noOpenSellerTasks", "No open seller valuation tasks.")),
  );
}

/* ============================================================
   Listing editor (ui_kits/crm Listings/LeadDetail patterns)
   ============================================================ */

function adminPageHref(page, path, targetPage) {
  const url = new URL(path, "http://ms-realty.local");
  for (const [key, value] of Object.entries(page.filters || {})) {
    if (value) url.searchParams.set(key, value);
  }
  if (page.workspace?.locale && page.workspace.locale !== "en") url.searchParams.set("locale", page.workspace.locale);
  url.searchParams.set("page", String(targetPage));
  return `${url.pathname}${url.search}`;
}

function Pagination({ page, path }) {
  if ((page.pagination?.totalPages || 1) <= 1) return null;
  const current = page.pagination.page;
  return h(
    "nav",
    { className: "adm-pagination", "aria-label": label(adminCopy(page), "page", "Page") },
    current > 1
      ? h("a", { className: "mk-btn mk-btn--secondary mk-btn--sm", href: adminPageHref(page, path, current - 1) }, h(Icon, { name: "chevron-left", size: 16 }), label(adminCopy(page), "previousPage", "Previous"))
      : h("span", null),
    h("span", { className: "adm-pagination__status" }, `${label(adminCopy(page), "page", "Page")} ${current} / ${page.pagination.totalPages}`),
    current < page.pagination.totalPages
      ? h("a", { className: "mk-btn mk-btn--secondary mk-btn--sm", href: adminPageHref(page, path, current + 1) }, label(adminCopy(page), "nextPage", "Next"), h(Icon, { name: "chevron-right", size: 16 }))
      : h("span", null),
  );
}

function filterLocaleInput(page) {
  return page.workspace.locale !== "en" ? h("input", { type: "hidden", name: "locale", defaultValue: page.workspace.locale }) : null;
}

function PublicationSchedulePanel({ page }) {
  const ui = workbenchCopy(page);
  const queue = page.publicationSchedules || { open: [], summary: { due: 0 } };
  return h(
    Panel,
    {
      title: ui.publicationSchedule,
      action: h(StatusPill, { tone: queue.summary.due ? "brick" : queue.open.length ? "sun" : "sand" }, `${queue.open.length} ${statusText(ui, "open")}`),
      "data-publication-schedule-panel": "true",
    },
    h(
      "details",
      { className: "adm-publication-disclosure", open: queue.summary.due > 0 },
      h(
        "summary",
        { className: "adm-publication-disclosure__summary" },
        h(Icon, { name: "clock", size: 17 }),
        h("span", null, ui.schedulePublication),
      ),
      h("p", { className: "adm-note" }, ui.publicationScheduleHint),
      h(
        "div",
        { className: "adm-report-grid adm-report-grid--two adm-publication-disclosure__body" },
        h(
          "form",
          {
            method: "post",
            action: "/api/admin/listings/publication-schedules",
            className: "adm-form adm-report-card",
            "data-admin-mutation-form": "publication-schedule",
            "data-admin-mutation-saving": ui.publicationSaving,
            "data-admin-mutation-success": ui.publicationSaved,
            "data-admin-mutation-failure": ui.publicationFailed,
          },
          h("input", { type: "hidden", name: "actor", value: currentOperatorId(page, "listing_editor") }),
          h(
            "label",
            null,
            ui.listing,
            h("input", { name: "listingId", required: true, list: "publication-listings", placeholder: "MS-CRAWL-0001", autoComplete: "off" }),
            h(
              "datalist",
              { id: "publication-listings" },
              ...page.listings.map((row) => h("option", { key: row.id, value: row.id }, row.title)),
            ),
          ),
          h(
            "label",
            null,
            ui.publicationAction,
            h(
              "select",
              { name: "action", required: true },
              h("option", { value: "publish" }, ui.publishListing),
              h("option", { value: "unpublish" }, ui.unpublishListing),
            ),
          ),
          h("label", null, ui.publicationTime, h("input", { type: "datetime-local", name: "scheduledAt", required: true })),
          h(
            "label",
            null,
            ui.publishStatus,
            h(
              "select",
              { name: "targetStatus" },
              h("option", { value: "available" }, statusText(ui, "available")),
              h("option", { value: "reserved" }, statusText(ui, "reserved")),
            ),
          ),
          h("label", null, ui.sellerPipelineNote, h("textarea", { name: "note", maxLength: 500, rows: 3 })),
          h(
            "div",
            { className: "adm-form__actions" },
            h("p", { role: "status", "aria-live": "polite", "data-admin-mutation-status": "true" }),
            h("button", { type: "submit", className: "mk-btn mk-btn--primary mk-btn--sm" }, h(Icon, { name: "clock", size: 16 }), ui.schedulePublication),
          ),
        ),
        h(
          "section",
          { className: "adm-report-card", "aria-label": ui.scheduledPublications },
          h(
            "header",
            null,
            h("div", null, h("h3", null, ui.scheduledPublications), h("small", null, `${queue.open.length} · ${statusText(ui, "open")}`)),
            h(
              "form",
              {
                method: "post",
                action: "/api/admin/listings/publication-schedules/run-due",
                "data-admin-mutation-form": "publication-run-due",
                "data-admin-mutation-saving": ui.publicationSaving,
                "data-admin-mutation-success": ui.publicationSaved,
                "data-admin-mutation-failure": ui.publicationFailed,
              },
              h("button", { type: "submit", className: "mk-btn mk-btn--secondary mk-btn--sm", disabled: !queue.summary.due }, `${ui.runDuePublications} · ${queue.summary.due}`),
              h("span", { role: "status", "aria-live": "polite", "data-admin-mutation-status": "true" }),
            ),
          ),
          queue.open.length
            ? h(
                "ul",
                { className: "adm-task-list" },
                ...queue.open.map((row) =>
                  h(
                    "li",
                    { key: row.id, "data-publication-schedule-row": row.id, "data-due": row.due ? "true" : "false" },
                    h("div", null, h("strong", null, row.listing_title), h("small", { className: "crm-mono" }, row.listing_id), h("small", null, `${row.action === "publish" ? ui.publishListing : ui.unpublishListing} · ${formatAdminDateTime(row.scheduled_at, page.workspace.locale)}`)),
                    h(
                      "form",
                      {
                        method: "post",
                        action: "/api/admin/listings/publication-schedules/cancel",
                        className: "adm-inline-form",
                        "data-admin-mutation-form": "publication-cancel",
                        "data-admin-mutation-saving": ui.publicationSaving,
                        "data-admin-mutation-success": ui.publicationSaved,
                        "data-admin-mutation-failure": ui.publicationFailed,
                      },
                      h("input", { type: "hidden", name: "scheduleId", value: row.id }),
                      h("input", { type: "hidden", name: "actor", value: currentOperatorId(page, "listing_editor") }),
                      h("label", null, ui.cancellationReason, h("input", { name: "reason", required: true, maxLength: 500 })),
                      h("button", { type: "submit", className: "mk-btn mk-btn--ghost mk-btn--sm" }, ui.cancelSchedule),
                      h("span", { role: "status", "aria-live": "polite", "data-admin-mutation-status": "true" }),
                    ),
                  ),
                ),
              )
            : h("p", { className: "adm-empty" }, ui.noScheduledPublications),
        ),
      ),
    ),
  );
}

function ListingManagerBody({ page }) {
  const copy = adminCopy(page);
  const ui = workbenchCopy(page);
  const canEditContent = pageCan(page, "content:write");
  const activeFilters = [
    page.filters.q ? `${label(copy, "searchListings", "Search listings")}: ${page.filters.q}` : null,
    page.filters.status ? `${label(copy, "qualityStatus", "Status")}: ${statusText(ui, page.filters.status)}` : null,
    page.filters.propertyFamily ? `${ui.propertyFamily}: ${statusText(ui, page.filters.propertyFamily)}` : null,
    page.filters.sourceLocale ? `${label(copy, "language", "Language")}: ${String(page.filters.sourceLocale).toUpperCase()}` : null,
  ].filter(Boolean);
  const title = label(copy, "listingManager", "Listings");
  const metrics = [
    [label(copy, "listingManager", "Listings"), page.summary.total, "building-2", "ink"],
    [ui.reviewRequired, page.summary.reviewRequired, "eye", "sun"],
    [statusText(ui, "price_on_request"), page.summary.priceOnRequest, "banknote", "sea"],
    [label(copy, "translationQueue", "Translation review"), page.summary.translationReviewRequired, "languages", "brick"],
  ];
  const columns = {
    select: ui.selectListings,
    listing: ui.listing,
    location: ui.location,
    propertyFamily: ui.propertyFamily,
    status: label(copy, "qualityStatus", "Status"),
    locale: label(copy, "language", "Language"),
    quality: ui.listingChecks,
    action: label(copy, "openEditor", "Open editor"),
  };
  return adminShell(page, {
    title,
    mainAttrs: {
      "data-kind": "admin-listing-manager",
      "data-react-admin-ui": "listing-manager",
      "data-admin-workbench": "cms",
      "data-admin-locale": page.workspace.locale,
      "data-listing-count": page.summary.total,
    },
    children: [
      h(PageHeader, { title, subtitle: page.metadata?.description }),
      h(StatGrid, { metrics }),
      h(
        "form",
        { method: "get", action: "/admin/listings", className: "adm-filterbar", role: "search", "data-listing-filters": "true" },
        filterLocaleInput(page),
        h(
          "div",
          { className: "adm-filterbar__summary", "data-listing-filter-summary": "true" },
          h("strong", null, `${page.summary.visible} / ${page.summary.total}`),
          activeFilters.length
            ? h("div", { className: "adm-filterbar__chips" }, ...activeFilters.map((value) => h("span", { key: value, className: "adm-filter-chip" }, value)))
            : h("small", null, `${label(copy, "results", "Results")} · ${page.pagination.totalRows}`),
        ),
        h("label", null, label(copy, "searchListings", "Search listings"), h("input", { type: "search", name: "q", defaultValue: page.filters.q, placeholder: "MS-CRAWL-0114" })),
        h(
          "label",
          null,
          label(copy, "qualityStatus", "Status"),
          h("select", { name: "status" }, h("option", { value: "" }, label(copy, "all", "All")), ...(page.filterOptions.statuses || []).map((value) => h("option", { key: value, value, selected: page.filters.status === value }, statusText(ui, value)))),
        ),
        h(
          "label",
          null,
          ui.propertyFamily,
          h("select", { name: "propertyFamily" }, h("option", { value: "" }, label(copy, "all", "All")), ...(page.filterOptions.propertyFamilies || CANONICAL_PROPERTY_FAMILIES).map((value) => h("option", { key: value, value, selected: page.filters.propertyFamily === value }, statusText(ui, value)))),
        ),
        h(
          "label",
          null,
          label(copy, "language", "Language"),
          h("select", { name: "sourceLocale" }, h("option", { value: "" }, label(copy, "all", "All")), ...(page.filterOptions.sourceLocales || []).map((value) => h("option", { key: value, value, selected: page.filters.sourceLocale === value }, value.toUpperCase()))),
        ),
        h("button", { type: "submit", className: "mk-btn mk-btn--primary mk-btn--md" }, h(Icon, { name: "filter", size: 16 }), label(copy, "filter", "Filter")),
        h("a", { className: "mk-btn mk-btn--ghost mk-btn--md", href: adminHref("/admin/listings", page) }, label(copy, "resetFilters", "Reset filters")),
      ),
      h(
        Panel,
        { title: `${label(copy, "results", "Results")} · ${page.pagination.totalRows}`, "data-listing-manager": "true" },
        page.listings.length
          ? h(
              "form",
              {
                method: "post",
                action: "/api/admin/listings/status",
                className: "adm-listing-bulk",
                "data-listing-bulk-form": "true",
                "data-admin-mutation-form": canEditContent ? "listing-status" : undefined,
                "data-admin-mutation-saving": ui.bulkStatusSaving,
                "data-admin-mutation-success": ui.bulkStatusSaved,
                "data-admin-mutation-failure": ui.bulkStatusFailed,
                "data-listing-selected-label": ui.selectedListings,
                "data-listing-select-all-label": ui.selectAllVisible,
                "data-listing-clear-label": ui.clearSelection,
              },
              h("input", { type: "hidden", name: "editor", value: currentOperatorId(page, "listing_manager_editor") }),
              h(
                "div",
                { className: "adm-listing-bulk__bar", "data-listing-bulk-bar": "true" },
                h(
                  "div",
                  { className: "adm-listing-bulk__summary" },
                  h("strong", null, ui.bulkStatus),
                  h("small", null, ui.bulkStatusHint),
                ),
                h("button", { type: "button", className: "mk-btn mk-btn--ghost mk-btn--sm", disabled: !canEditContent, "data-listing-select-all": "true" }, ui.selectAllVisible),
                h("span", { className: "adm-listing-bulk__count", "data-listing-selection-count": "true", "aria-live": "polite" }, ui.selectedListings.replace("{count}", "0")),
                h(
                  "label",
                  null,
                  h("span", { className: "adm-visually-hidden" }, ui.bulkStatus),
                  h(
                    "select",
                    { name: "targetStatus", required: true, disabled: !canEditContent },
                    h("option", { value: "" }, ui.chooseOption),
                    ...["available", "reserved", "sold", "rented", "archived"].map((status) => h("option", { key: status, value: status }, statusText(ui, status))),
                  ),
                ),
                h("button", { type: "submit", className: "mk-btn mk-btn--primary mk-btn--sm", disabled: !canEditContent }, h(Icon, { name: "check", size: 16 }), ui.updateSelected),
                !canEditContent ? h("small", { className: "adm-note", "data-read-only-role": "true" }, ui.readOnlyAccess) : null,
                h("p", { className: "adm-listing-bulk__status", role: "status", "aria-live": "polite", "data-admin-mutation-status": "true" }),
              ),
              h(
                "div",
                { className: "adm-scroll-x" },
              h(
                "table",
                { className: "crm-tbl crm-tbl--dense adm-listing-table" },
                h("thead", null, h("tr", null, ...Object.values(columns).map((column) => h("th", { key: column, scope: "col" }, column)))),
                h(
                  "tbody",
                  null,
                  ...page.listings.map((row) =>
                    h(
                      "tr",
                      { key: row.id, "data-listing-manager-row": row.id },
                      h(
                        "td",
                        { "data-label": columns.select, "data-listing-column": "select", className: "adm-listing-bulk__select" },
                        h(
                          "label",
                          { className: "adm-listing-select-hit" },
                          h("input", { type: "checkbox", name: "listingIds", value: row.id, disabled: !canEditContent, "aria-label": `${ui.selectListings}: ${row.id}`, "data-listing-select": "true" }),
                        ),
                      ),
                      h("td", { "data-label": columns.listing, "data-listing-column": "listing" }, h("div", { className: "adm-lead-identity" }, h("code", { className: "crm-mono" }, row.id), h("strong", null, row.title), h("small", { className: "adm-lead-context" }, row.price_on_request ? statusText(ui, "price_on_request") : row.price_eur ? `€${Number(row.price_eur).toLocaleString("en")}` : ui.notSet))),
                      h("td", { "data-label": columns.location, "data-listing-column": "location" }, row.location || ui.notSet),
                      h("td", { "data-label": columns.propertyFamily, "data-listing-column": "property-family" }, row.property_family ? statusText(ui, row.property_family) : ui.notSet),
                      h("td", { "data-label": columns.status, "data-listing-column": "status" }, h(StatusPill, { tone: PILL_TONES[row.listing_status] || (row.review_required ? "sun" : "success") }, statusText(ui, row.listing_status))),
                      h("td", { "data-label": columns.locale, "data-listing-column": "locale" }, h("span", { className: "crm-lang" }, row.source_locale.toUpperCase()), h("small", { className: "adm-lead-context" }, row.translation_locales.map((locale) => locale.toUpperCase()).join(" · "))),
                      h("td", { "data-label": columns.quality, "data-listing-column": "quality" }, h("span", null, `${row.metadata_gaps} ${(row.metadata_gaps === 1 ? ui.issue : ui.issues).toLocaleLowerCase()}`), h("small", { className: "adm-lead-context" }, `${row.public_gallery_assets} ${(row.public_gallery_assets === 1 ? ui.publicPhoto : ui.publicPhotos).toLocaleLowerCase()}`)),
                      h(
                        "td",
                        { "data-label": columns.action, "data-listing-column": "action" },
                        h(
                          "div",
                          { className: "adm-task-list__actions" },
                          h("a", { className: "mk-btn mk-btn--secondary mk-btn--sm", href: payloadAdminListingHref(row.id, page) }, h(Icon, { name: "pencil", size: 16 }), label(copy, "openEditor", "Open editor")),
                          page.runtime_data_mode === "durable_only"
                            ? null
                            : h("a", { className: "mk-btn mk-btn--ghost mk-btn--sm", href: adminHref(`/admin/activity?listingId=${encodeURIComponent(row.id)}`, page) }, h(Icon, { name: "list", size: 15 }), label(copy, "viewHistory", "History")),
                        ),
                      ),
                    ),
                  ),
                ),
              ),
              ),
            )
          : h("p", { className: "adm-empty" }, label(copy, "noResults", "No results.")),
      ),
      h(Pagination, { page, path: "/admin/listings" }),
      canEditContent && durableRuntimeMutationAvailable(page, "/api/admin/listings/publication-schedules")
        ? h(PublicationSchedulePanel, { page })
        : null,
    ],
  });
}

function TranslationQueueBody({ page }) {
  const copy = adminCopy(page);
  const ui = workbenchCopy(page);
  const title = label(copy, "translationQueue", "Translation review");
  const metrics = [
    [label(copy, "openTasks", "Open tasks"), page.summary.open_translation_tasks, "languages", "ink"],
    [label(copy, "missingTranslations", "Missing translations"), page.summary.missing_translation_tasks, "circle-alert", "brick"],
    [label(copy, "staleTranslations", "Stale translations"), page.summary.stale_translation_tasks, "clock", "sun"],
    [label(copy, "results", "Results"), page.pagination.totalRows, "filter", "sea"],
  ];
  const columns = {
    listing: ui.listing,
    target: label(copy, "targetLocale", "Target locale"),
    status: label(copy, "translationState", "Translation state"),
    owner: label(copy, "reviewer", "Reviewer"),
    action: label(copy, "reviewTranslation", "Review translation"),
  };
  return adminShell(page, {
    title,
    mainAttrs: {
      "data-kind": "admin-translation-queue",
      "data-react-admin-ui": "translation-queue",
      "data-admin-workbench": "cms",
      "data-human-approval-required": "true",
      "data-admin-locale": page.workspace.locale,
    },
    children: [
      h(PageHeader, { title, subtitle: page.metadata?.description }),
      h(StatGrid, { metrics }),
      h(
        "form",
        { method: "get", action: "/admin/translations", className: "adm-filterbar", role: "search", "data-translation-filters": "true" },
        filterLocaleInput(page),
        h("label", null, label(copy, "searchTranslations", "Search translations"), h("input", { type: "search", name: "q", defaultValue: page.filters.q })),
        h("label", null, label(copy, "targetLocale", "Target locale"), h("select", { name: "targetLocale" }, h("option", { value: "" }, label(copy, "all", "All")), ...(page.filterOptions.targetLocales || []).map((value) => h("option", { key: value, value, selected: page.filters.targetLocale === value }, value.toUpperCase())))),
        h("label", null, label(copy, "taskType", "Task type"), h("select", { name: "taskType" }, h("option", { value: "" }, label(copy, "all", "All")), ...(page.filterOptions.taskTypes || []).map((value) => h("option", { key: value, value, selected: page.filters.taskType === value }, statusText(ui, value))))),
        h("button", { type: "submit", className: "mk-btn mk-btn--primary mk-btn--md" }, h(Icon, { name: "filter", size: 16 }), label(copy, "filter", "Filter")),
        h("a", { className: "mk-btn mk-btn--ghost mk-btn--md", href: adminHref("/admin/translations", page) }, label(copy, "resetFilters", "Reset filters")),
      ),
      h(
        Panel,
        { title: `${label(copy, "results", "Results")} · ${page.pagination.totalRows}`, "data-translation-queue": "true" },
        page.translationTasks.length ? null : h("p", { className: "adm-empty", "data-empty-translation-tasks": "true" }, ui.noTranslationTasks),
        h(
          "div",
          { className: "adm-scroll-x", hidden: page.translationTasks.length ? undefined : true },
          h(
            "table",
            { className: "crm-tbl" },
            h("thead", null, h("tr", null, ...Object.values(columns).map((column) => h("th", { key: column, scope: "col" }, column)))),
            h(
              "tbody",
              null,
              ...page.translationTasks.map((row) => {
                const task = row.existing_task;
                const canApprove =
                  pageCan(page, "translations:write") &&
                  task &&
                  ["hermes_drafted", "human_edited"].includes(task.status) &&
                  task.validated_output;
                const canPublish = pageCan(page, "translations:publish") && task?.status === "approved" && task.human_approved;
                const canEnterHumanDraft =
                  pageCan(page, "translations:write") && !task && ["human", "external_import"].includes(row.provider_mode);
                return h(
                  "tr",
                  { key: `${row.listing_id}-${row.target_locale}`, "data-translation-task-row": row.task.id, "data-translation-status": task?.status || row.current_status },
                  h("td", { "data-label": columns.listing, "data-translation-column": "listing" }, h("div", { className: "adm-lead-identity" }, h("code", { className: "crm-mono" }, row.listing_id), h("strong", null, row.listing_title), h("small", { className: "adm-lead-context" }, row.listing_location))),
                  h("td", { "data-label": columns.target, "data-translation-column": "target" }, h("span", { className: "crm-lang" }, `${row.source_locale.toUpperCase()} → ${row.target_locale.toUpperCase()}`)),
                  h("td", { "data-label": columns.status, "data-translation-column": "status" }, h(StatusPill, { tone: row.current_status === "stale" ? "brick" : task ? "sun" : "sand" }, statusText(ui, task?.status || row.current_status)), h("small", { className: "adm-lead-context" }, statusText(ui, row.task_type))),
                  h("td", { "data-label": columns.owner, "data-translation-column": "owner" }, row.reviewer_role),
                  h(
                    "td",
                    { "data-label": columns.action, "data-translation-column": "action", className: "adm-translation-actions" },
                    canApprove
                      ? h(
                          "form",
                          { method: "post", action: "/api/admin/translations/approve", "data-translation-workflow-form": "approve", "data-success-message": label(copy, "approveTranslation", "Translation approved"), "data-failure-message": label(copy, "translationSaveFailed", "Could not update translation") },
                          h("input", { type: "hidden", name: "taskId", defaultValue: task.id }),
                          h("input", { type: "hidden", name: "reviewer", defaultValue: currentOperatorId(page, row.reviewer_role) }),
                          h("button", { type: "submit", className: "mk-btn mk-btn--primary mk-btn--sm" }, label(copy, "approveForReview", "Approve translation")),
                          h("span", { role: "status", "aria-live": "polite", "data-translation-workflow-status": "true" }),
                        )
                      : canPublish
                        ? h(
                            "form",
                            { method: "post", action: "/api/admin/translations/publish", "data-translation-workflow-form": "publish", "data-success-message": label(copy, "publishTranslation", "Translation published"), "data-failure-message": label(copy, "translationSaveFailed", "Could not update translation") },
                            h("input", { type: "hidden", name: "taskId", defaultValue: task.id }),
                            h("button", { type: "submit", className: "mk-btn mk-btn--primary mk-btn--sm" }, label(copy, "publishApproved", "Publish approved translation")),
                            h("span", { role: "status", "aria-live": "polite", "data-translation-workflow-status": "true" }),
                          )
                        : canEnterHumanDraft
                          ? h(
                              "details",
                              { className: "adm-reply" },
                              h("summary", { className: "mk-btn mk-btn--secondary mk-btn--sm" }, label(copy, "enterHumanTranslation", "Enter human translation")),
                              h(
                                "form",
                                {
                                  method: "post",
                                  action: "/api/admin/translations/draft",
                                  className: "adm-human-translation",
                                  "data-translation-workflow-form": "human",
                                  "data-success-message": label(copy, "translationDraftSaved", "Translation draft saved."),
                                  "data-failure-message": label(copy, "translationSaveFailed", "Could not save translation."),
                                },
                                h("input", { type: "hidden", name: "draftSource", defaultValue: "human" }),
                                h("input", { type: "hidden", name: "targetLocale", defaultValue: row.target_locale }),
                                h("input", { type: "hidden", name: "sourceLocale", defaultValue: row.source_locale }),
                                h("input", { type: "hidden", name: "objectType", defaultValue: "listing" }),
                                h("input", { type: "hidden", name: "objectId", defaultValue: row.listing_id }),
                                h("input", { type: "hidden", name: "sourceTitle", defaultValue: row.source_title }),
                                h("input", { type: "hidden", name: "sourceDescription", defaultValue: row.source_description }),
                                h("input", { type: "hidden", name: "propertyFactsJson", defaultValue: JSON.stringify(row.property_facts) }),
                                h("input", { type: "hidden", name: "reviewer", defaultValue: currentOperatorId(page, row.reviewer_role) }),
                                h("p", { className: "adm-human-translation__source" }, row.source_title),
                                h("label", null, label(copy, "translatedTitle", "Translated title"), h("input", { name: "translatedTitle", required: true })),
                                h("label", null, label(copy, "translatedBody", "Translated description"), h("textarea", { name: "translatedBody", required: true, rows: 5 })),
                                h("label", null, label(copy, "translatedSeoTitle", "SEO title"), h("input", { name: "translatedSeoTitle", required: true, maxLength: 80 })),
                                h("label", null, label(copy, "translatedMetaDescription", "Meta description"), h("textarea", { name: "translatedMetaDescription", required: true, rows: 3, maxLength: 220 })),
                                h("button", { type: "submit", className: "mk-btn mk-btn--primary mk-btn--sm" }, label(copy, "saveDraft", "Save draft")),
                                h("span", { role: "status", "aria-live": "polite", "data-translation-workflow-status": "true" }),
                              ),
                            )
                          : h("span", { className: "crm-tbl__muted" }, task ? label(copy, "awaitingHermesDraft", "Awaiting Hermes draft") : statusText(ui, row.task_type)),
                    h("a", { className: "mk-btn mk-btn--ghost mk-btn--sm", href: payloadAdminListingHref(row.listing_id, page) }, label(copy, "openEditor", "Open editor")),
                  ),
                );
              }),
            ),
          ),
        ),
      ),
      h(Pagination, { page, path: "/admin/translations" }),
    ],
  });
}

function editorDateTimeValue(value) {
  if (!value || Number.isNaN(new Date(value).getTime())) return "";
  const date = new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function editorSelect(field, value, disabled, options) {
  return h(
    "select",
    { name: field, disabled, "data-editor-field": field },
    ...options.map(([optionValue, optionLabel]) =>
      h("option", { key: optionValue, value: optionValue, selected: String(value ?? "") === optionValue ? true : undefined }, optionLabel),
    ),
  );
}

function editorInputFor(ui, field, value, disabled = false) {
  const shared = { name: field, defaultValue: value, disabled, "data-editor-field": field };
  if (["description", "seo_description", "seo_og_description"].includes(field)) return h("textarea", { ...shared, rows: field === "description" ? 6 : 3 });
  if (["price_eur", "area_sqm", "land_area_sqm"].includes(field)) return h("input", { ...shared, type: "number", min: "0", step: "any", inputMode: "decimal" });
  if (["bedrooms", "floor", "total_floors"].includes(field)) return h("input", { ...shared, type: "number", min: "0", step: "1", inputMode: "numeric" });
  if (["bedrooms_not_applicable", "price_on_request", "publish_approved", "seo_review_confirmed"].includes(field)) {
    return editorSelect(field, value === true ? "true" : "false", disabled, [
      ["false", fieldText(ui, "option_no")],
      ["true", fieldText(ui, "option_yes")],
    ]);
  }
  if (field === "listing_status") {
    return editorSelect(field, value || "available", disabled, ["available", "reserved", "sold", "rented", "archived"].map((status) => [status, statusText(ui, status)]));
  }
  if (field === "property_type") {
    const options = propertyTypeSelectOptions(value);
    return editorSelect(field, options.selected, disabled, options.values.map((type) => [type, statusText(ui, type)]));
  }
  if (field === "offer_type") {
    return editorSelect(field, value || "sale", disabled, ["sale", "rent"].map((type) => [type, statusText(ui, type)]));
  }
  if (field === "location_precision") {
    return editorSelect(field, value || "approximate", disabled, ["area_only", "approximate", "exact"].map((precision) => [precision, fieldText(ui, `option_${precision}`)]));
  }
  if (field === "seo_robots") {
    return editorSelect(field, value || "index,follow", disabled, [
      ["index,follow", "index,follow"],
      ["noindex,follow", "noindex,follow"],
    ]);
  }
  if (field === "availability_verified_at") return h("input", { ...shared, defaultValue: editorDateTimeValue(value), type: "datetime-local" });
  if (field === "seo_canonical") return h("input", { ...shared, inputMode: "url", placeholder: "/bg/imoti/MS-CRAWL-0001" });
  return h("input", shared);
}

function editorField(copy, ui, field, value, disabled = false) {
  return h("label", { key: field }, fieldText(ui, field), editorInputFor(ui, field, value, disabled));
}

function editorFieldGroup(copy, ui, title, fields, facts, disabled = false) {
  if (!fields.length) return null;
  return h(
    "fieldset",
    { className: "adm-form__group" },
    h("legend", null, title),
    ...fields.map((field) => editorField(copy, ui, field, facts[field] ?? "", disabled)),
  );
}

function editorFieldDisclosure(copy, ui, title, fields, facts, disabled = false, { open = false, section = "facts" } = {}) {
  if (!fields.length) return null;
  return h(
    "details",
    { className: "adm-editor-section", open, "data-editor-section": section },
    h(
      "summary",
      { className: "adm-editor-section__summary" },
      h("span", null, title),
      h("small", null, `${fields.length}`),
    ),
    editorFieldGroup(copy, ui, title, fields, facts, disabled),
  );
}

function ListingEditorBody({ page }) {
  const copy = adminCopy(page);
  const ui = workbenchCopy(page);
  const facts = page.listing.facts || {};
  const workflow = page.listing.workflow || {};
  const qualityReview = page.qualityReview;
  const seo = page.listing.seo || {};
  const editorValues = {
    ...facts,
    availability_verified_at: workflow.availability_verified_at || "",
    seo_title: seo.title || "",
    seo_description: seo.description || "",
    seo_canonical: seo.canonical_override || "",
    seo_og_title: seo.og_title || "",
    seo_og_description: seo.og_description || "",
    seo_robots: seo.robots || "index,follow",
  };
  const tour = page.listing.tour || {};
  const tourProvider = tour.provider === "supersplat-viewer" ? "supersplat-viewer" : "photo-sphere-viewer";
  const tourPublished = tour.is_public === true;
  const tourStatus = tourPublished ? "approved" : tour.review_status || "review_required";
  const fallbackGalleryCount = (tour.fallback_gallery || []).length;
  const reviewableMedia = (page.listing.media || [])
    .filter((item) => ["photo", "floor_plan", "video"].includes(item.kind))
    .slice(0, 50);
  const staleTranslations = page.translationTasks.filter((task) => task.status === "stale");
  const title = label(copy, "propertyEditor", "Property editor");
  const family = propertyFamilyFor(facts);
  const contentFields = page.editableFields.filter((field) => ["title", "h1", "description"].includes(field));
  const termsFields = page.editableFields.filter((field) => ["price_eur", "price_on_request"].includes(field));
  const workflowFields = page.editableFields.filter((field) => ["availability_verified_at"].includes(field));
  const seoFields = page.editableFields.filter((field) => field.startsWith("seo_"));
  const detailFields = page.editableFields.filter(
    (field) =>
      !contentFields.includes(field) &&
      !termsFields.includes(field) &&
      !workflowFields.includes(field) &&
      !seoFields.includes(field) &&
      listingEditorFieldApplicable(family, field),
  );
  const canEditContent = pageCan(page, "content:write");
  return adminShell(page, {
    title,
    mainAttrs: {
      "data-kind": "admin-listing-editor",
      "data-react-admin-ui": "listing-editor",
      "data-admin-workbench": "cms",
      "data-editor-layout": "split-rail",
      "data-cms-status": page.listing.cms_status,
      "data-schema-ready": page.listing.seo?.schema_present ? "true" : "false",
      "data-publish-approved": workflow.publish_approved ? "true" : "false",
      "data-availability-verified": workflow.availability_verified_at ? "true" : "false",
      "data-stale-translation-count": staleTranslations.length,
      "data-listing-id": page.listing.id,
      "data-admin-locale": page.workspace.locale,
    },
    children: [
      h(
        PageHeader,
        {
          title,
          subtitle: `${page.listing.source_domain} · ${page.listing.source_locale} · ${page.listing.id}`,
        },
        h("a", { className: "mk-btn mk-btn--secondary mk-btn--sm", href: adminHref("/admin/listings", page) }, h(Icon, { name: "arrow-left", size: 16 }), h("span", null, label(copy, "listingManager", "Listings"))),
        page.runtime_data_mode === "durable_only"
          ? null
          : h("a", { className: "mk-btn mk-btn--ghost mk-btn--sm", href: adminHref(`/admin/activity?listingId=${encodeURIComponent(page.listing.id)}`, page) }, h(Icon, { name: "list", size: 16 }), h("span", null, label(copy, "viewHistory", "History"))),
      ),
      h(
        "nav",
        { className: "mk-tabs mk-tabs--underline adm-editor-tabs", "aria-label": label(copy, "editorSections", "Editor sections"), "data-editor-tabs": "true" },
        h("a", { className: "mk-tab", href: "#listing-facts", "data-editor-tab": "facts", "aria-label": label(copy, "facts", "Facts"), title: label(copy, "facts", "Facts") }, h(Icon, { name: "pencil", size: 16 }), h("span", { className: "adm-editor-tab__label" }, label(copy, "facts", "Facts"))),
        h("a", { className: "mk-tab", href: "#listing-translations", "data-editor-tab": "translations", "aria-label": label(copy, "translations", "Translations"), title: label(copy, "translations", "Translations") }, h(Icon, { name: "languages", size: 16 }), h("span", { className: "adm-editor-tab__label" }, label(copy, "translations", "Translations"))),
        h("a", { className: "mk-tab", href: "#listing-media", "data-editor-tab": "media", "aria-label": label(copy, "media", "Media"), title: label(copy, "media", "Media") }, h(Icon, { name: "camera", size: 16 }), h("span", { className: "adm-editor-tab__label" }, label(copy, "media", "Media"))),
        h("a", { className: "mk-tab", href: "#listing-seo", "data-editor-tab": "seo", "aria-label": ui.seoSettings, title: ui.seoSettings }, h(Icon, { name: "search", size: 16 }), h("span", { className: "adm-editor-tab__label" }, ui.seoSettings)),
        h("a", { className: "mk-tab", href: "#listing-quality", "data-editor-tab": "quality", "aria-label": label(copy, "quality", "Quality"), title: label(copy, "quality", "Quality") }, h(Icon, { name: "shield-check", size: 16 }), h("span", { className: "adm-editor-tab__label" }, label(copy, "quality", "Quality"))),
      ),
      h(
        "div",
        { className: "adm-editor-shell", "data-editor-shell": "true" },
        h(
          "div",
          { className: "adm-editor-main" },
          h(
            Panel,
            { title: label(copy, "facts", "Facts"), "data-editor-primary-panel": "true" },
            h(
              "form",
              {
                id: "listing-facts",
                method: "post",
                action: "/api/admin/listings/edit",
                className: "adm-form",
                "data-admin-mutation-form": "listing",
                "data-editor-form": "listing",
                "data-editor-panel": "facts",
                "data-editor-clean-message": label(copy, "saved", "All changes saved."),
                "data-editor-dirty-message": label(copy, "unsavedChanges", "Unsaved changes"),
              },
              h("input", { type: "hidden", name: "listingId", defaultValue: page.listing.id }),
              h(
                "fieldset",
                { className: "adm-form__group adm-form__group--editor" },
                h("legend", null, label(copy, "editor", "Editor")),
                h(
                  "label",
                  null,
                  label(copy, "editor", "Editor"),
                  h("input", {
                    name: "editor",
                    required: true,
                    readOnly: true,
                    defaultValue: currentOperatorId(page, ""),
                    autoComplete: "off",
                    "data-editor-name": "true",
                  }),
                ),
              ),
              editorFieldDisclosure(copy, ui, label(copy, "sourceContent", "Source content"), contentFields, editorValues, !canEditContent, { open: true, section: "content" }),
              editorFieldDisclosure(copy, ui, label(copy, "propertyDetails", "Property details"), detailFields, editorValues, !canEditContent, { open: detailFields.length <= 4, section: "details" }),
              editorFieldDisclosure(copy, ui, label(copy, "commercialTerms", "Commercial terms"), termsFields, editorValues, !canEditContent, { open: true, section: "terms" }),
              editorFieldDisclosure(copy, ui, ui.listingWorkflow, workflowFields, editorValues, !canEditContent, { open: false, section: "workflow" }),
              h(
                "section",
                { id: "listing-seo", className: "adm-form__section adm-editor-anchor", "data-seo-panel": "true", "aria-label": ui.seoSettings },
                editorFieldDisclosure(copy, ui, ui.seoSettings, seoFields, editorValues, !canEditContent, { open: true, section: "seo" }),
              ),
              canEditContent
                ? h(
                    "div",
                    {
                      className: "adm-form__actions adm-editor-savebar",
                      "data-editor-savebar": "true",
                      "data-dirty": "false",
                    },
                    h(
                      "div",
                      { className: "adm-editor-savebar__meta" },
                      h("strong", { "data-editor-dirty-note": "true" }, label(copy, "saved", "All changes saved.")),
                      h("p", { className: "adm-form__status", role: "status", "aria-live": "polite", "data-admin-mutation-status": "true" }),
                    ),
                    h(
                      "div",
                      { className: "adm-editor-savebar__controls" },
                      h("button", { type: "button", className: "mk-btn mk-btn--ghost mk-btn--md", "data-editor-reset": "true", disabled: true }, label(copy, "discardChanges", ui.discardChanges)),
                      h("button", { type: "submit", className: "mk-btn mk-btn--primary mk-btn--md", disabled: true }, h("span", null, label(copy, "saveSourceEdit", "Save source edit"))),
                    ),
                  )
                : h("p", { className: "adm-note", role: "note", "data-read-only-role": "true" }, ui.readOnlyAccess),
            ),
          ),
        ),
        h(
          "aside",
          { className: "adm-editor-rail", "data-editor-readiness-rail": "true" },
          h(
            Panel,
            {
              title: label(copy, "qualityStatus", "Quality"),
              id: "listing-quality",
              "aria-label": label(copy, "qualityStatus", "Quality"),
              "data-quality-panel": "true",
            },
            qualityReview
              ? h(
                  "div",
                  {
                    className: "adm-evidence",
                    "data-listing-quality-issues": qualityReview.issues.length,
                    "data-listing-quality-required-fields": qualityReview.required_editor_fields.join(","),
                  },
                  ...qualityReview.issues.map((issue) =>
                    h(StatusPill, { key: issue, tone: "brick", "data-quality-issue": issue }, listingQualityIssueText(ui, issue)),
                  ),
                )
              : h("p", { className: "adm-note", "data-listing-quality-issues": "0" }, `${ui.issues}: 0 · ${ui.reviewRequired}`),
            qualityReview?.required_editor_fields?.length
              ? h(
                  "p",
                  { className: "adm-note" },
                  `${ui.reviewRequired}: ${qualityReview.required_editor_fields.map((field) => fieldText(ui, field)).join(", ")}`,
                )
              : null,
            h(StatGrid, {
              metrics: [
                [label(copy, "qualityStatus", "CMS status"), statusText(ui, page.listing.cms_status), "file-check", PILL_TONES[page.listing.cms_status] || "ink"],
                [ui.schema, statusText(ui, page.listing.seo?.schema_present ? "present" : "missing"), "check-circle-2", page.listing.seo?.schema_present ? "success" : "brick"],
                [ui.availabilityVerification, workflow.availability_verified_at ? formatAdminDateTime(workflow.availability_verified_at, page.workspace.locale) : ui.notVerified, "calendar-check", workflow.availability_verified_at ? "success" : "sun"],
                [ui.publishApproval, workflow.publish_approved ? ui.approvedForPublishing : ui.notApprovedForPublishing, "shield-check", workflow.publish_approved ? "success" : "sun"],
              ],
            }),
          ),
          h(
            Panel,
            { title: label(copy, "translationState", "Translation state"), id: "listing-translations", "aria-label": label(copy, "translationState", "Translation state"), "data-translation-panel": "true" },
        h(
          "ul",
          { className: "adm-translations" },
          ...(page.listing.translations || []).map((translation) =>
            h(
              "li",
              { key: `${translation.locale}-${translation.status}`, "data-translation-locale": translation.locale, "data-translation-status": translation.status },
              h("span", { className: "crm-lang" }, translation.locale),
              h(StatusPill, { tone: PILL_TONES[translation.status] || "sand" }, statusText(ui, translation.status)),
            ),
          ),
          ...staleTranslations.map((task) => {
            const locale = task.target_locale || task.locale;
            return h(
              "li",
              { key: `${locale}-stale`, "data-translation-locale": locale, "data-translation-status": "stale" },
              h("span", { className: "crm-lang" }, locale),
              h(StatusPill, { tone: "brick" }, statusText(ui, "stale")),
            );
          }),
        ),
          ),
          h(
            Panel,
            {
              title: label(copy, "mediaReview", "Media review"),
              id: "listing-media",
              "aria-label": label(copy, "mediaReview", "Media review"),
              "data-media-review-panel": "true",
              "data-tour-review-status": tourPublished ? "available" : tourStatus,
            },
            h(StatGrid, {
              metrics: [
                [label(copy, "media", "Media"), (page.listing.media || []).length, "camera", "ink"],
                [
                  ui.tourStatus,
                  statusText(ui, tourStatus),
                  "globe",
                  tourPublished ? "success" : "sun",
                ],
                [ui.tourFallbackGallery, fallbackGalleryCount, "camera", fallbackGalleryCount ? "sea" : "brick"],
              ],
            }),
            h("p", { className: "adm-note" }, ui.mediaManagerHint),
            h(
              "section",
              { className: "adm-media-manager", "aria-label": ui.mediaManager, "data-media-manager": "true" },
              reviewableMedia.length
                ? reviewableMedia.map((item) => {
                    const sourceUrl = item.asset_url || item.url || "";
                    const published = item.is_public === true;
                    return h(
                      "article",
                      {
                        key: item.asset_id,
                        className: "mk-card mk-card--sunken mk-card--pad-md adm-media-asset",
                        "data-media-asset": item.asset_id,
                        "data-media-kind": item.kind,
                        "data-media-public": published ? "true" : "false",
                      },
                      h(
                        "header",
                        { className: "adm-media-asset__header" },
                        h("div", null, h("strong", null, fieldText(ui, `media_kind_${item.kind}`)), h("small", { className: "crm-mono" }, item.asset_id)),
                        h(StatusPill, { tone: published ? "success" : "sun" }, statusText(ui, item.review_status)),
                      ),
                      sourceUrl
                        ? h("a", { href: sourceUrl, target: "_blank", rel: "noreferrer", className: "adm-media-asset__source" }, h(Icon, { name: "external-link", size: 15 }), ` ${ui.sourceAsset}`)
                        : null,
                      canEditContent && durableRuntimeMutationAvailable(page, "/api/admin/media/reviews")
                        ? h(
                            "details",
                            { className: "adm-media-review", "data-media-review-disclosure": item.asset_id },
                            h(
                              "summary",
                              null,
                              h(Icon, { name: "shield-check", size: 16 }),
                              h("span", null, ui.reviewMediaAsset),
                            ),
                            h(
                              "form",
                              {
                                method: "post",
                                action: "/api/admin/media/reviews",
                                className: "adm-form adm-media-review-form",
                                "data-admin-mutation-form": "media-review",
                                "data-admin-mutation-saving": ui.mediaReviewSaving,
                                "data-admin-mutation-success": ui.mediaReviewSaved,
                                "data-admin-mutation-failure": ui.mediaReviewFailed,
                              },
                                h("input", { type: "hidden", name: "listingId", defaultValue: page.listing.id }),
                                h("input", { type: "hidden", name: "assetId", defaultValue: item.asset_id }),
                                h(
                                  "label",
                                  null,
                                  ui.mediaDecision,
                                  h(
                                    "select",
                                    { name: "decision", defaultValue: published ? "publish" : "keep_private" },
                                    h("option", { value: "keep_private", selected: published ? undefined : true }, ui.keepMediaPrivate),
                                    h("option", { value: "publish", selected: published ? true : undefined }, ui.publishMedia),
                                  ),
                                ),
                                h(
                                  "label",
                                  null,
                                  ui.mediaKind,
                                  h(
                                    "select",
                                    { name: "kind", defaultValue: item.kind },
                                    ...["photo", "floor_plan", "video"].map((kind) =>
                                      h("option", { key: kind, value: kind, selected: item.kind === kind ? true : undefined }, fieldText(ui, `media_kind_${kind}`)),
                                    ),
                                  ),
                                ),
                                h("label", null, ui.mediaAlt, h("textarea", { name: "alt", rows: 2, defaultValue: item.alt || "" })),
                                h("label", null, ui.replacementUrl, h("input", { type: "url", name: "replacementUrl", inputMode: "url", placeholder: "https://cdn.example.test/listing/asset.webp" })),
                                h("label", null, label(copy, "reviewer", "Reviewer"), h("input", { name: "reviewer", required: true, defaultValue: currentOperatorId(page, "") })),
                                h(
                                  "label",
                                  { className: "adm-check" },
                                  h("input", { type: "checkbox", name: "reviewConfirmed", required: true }),
                                  ` ${ui.mediaReviewConfirmation}`,
                                ),
                                h("p", { className: "adm-form__status", role: "status", "aria-live": "polite", "data-admin-mutation-status": "true" }),
                                h("button", { type: "submit", className: "mk-btn mk-btn--secondary mk-btn--sm" }, h(Icon, { name: "shield-check", size: 16 }), h("span", null, ui.saveMediaReview)),
                            ),
                          )
                        : h("p", { className: "adm-note", role: "note", "data-read-only-role": "true" }, ui.readOnlyAccess),
                    );
                  })
                : h("p", { className: "adm-note", "data-media-empty": "true" }, ui.noReviewableMedia),
            ),
            canEditContent && durableRuntimeMutationAvailable(page, "/api/admin/tours/approve")
              ? h(
                  "form",
          {
            method: "post",
            action: "/api/admin/tours/approve",
            className: "adm-tour-form",
            "aria-describedby": "listing-tour-approval-note",
            "data-tour-editor-form": "true",
            "data-tour-approval-endpoint": "/api/admin/tours/approve",
            "data-listing-id": page.listing.id,
            "data-tour-save-pending": ui.tourSaving,
            "data-tour-save-success": ui.tourSaved,
            "data-tour-save-failure": ui.tourSaveFailed,
          },
          h("input", { type: "hidden", name: "listingId", defaultValue: page.listing.id }),
          h(
            "p",
            { id: "listing-tour-approval-note", className: "adm-tour-form__note", role: "note" },
            ui.tourApprovalNotice,
          ),
          h(
            "label",
            { className: "adm-tour-form__field" },
            ui.tourProvider,
            h(
              "select",
              { name: "provider", defaultValue: tourProvider, "data-tour-provider": "true" },
              h("option", { value: "photo-sphere-viewer" }, "Photo Sphere Viewer"),
              h("option", { value: "supersplat-viewer" }, "Supersplat Viewer"),
            ),
          ),
          h(
            "label",
            { className: "adm-tour-form__field", hidden: tourProvider === "supersplat-viewer", "data-tour-panorama-field": "true" },
            ui.tourPanoramaUrl,
            h("input", {
              type: "url",
              name: "panoramaUrl",
              required: tourProvider !== "supersplat-viewer",
              disabled: tourProvider === "supersplat-viewer",
              inputMode: "url",
              autoComplete: "url",
              pattern: "https://.*",
              placeholder: "https://makler-realty.com/tours/listing/panorama.jpg",
              defaultValue: tour.panorama_url || "",
              "data-tour-panorama-url": "true",
            }),
          ),
          h(
            "label",
            { className: "adm-tour-form__field", hidden: tourProvider !== "supersplat-viewer", "data-tour-viewer-field": "true" },
            ui.tourViewerUrl,
            h("input", {
              type: "url",
              name: "viewerUrl",
              required: tourProvider === "supersplat-viewer",
              disabled: tourProvider !== "supersplat-viewer",
              inputMode: "url",
              autoComplete: "url",
              pattern: "https://.*",
              placeholder: "https://makler-realty.com/tours/listing/index.html",
              defaultValue: tour.viewer_url || "",
              "data-tour-viewer-url": "true",
            }),
          ),
          h(
            "label",
            { className: "adm-tour-form__field" },
            ui.tourThumbnailUrl,
            h("input", {
              type: "url",
              name: "thumbnailUrl",
              inputMode: "url",
              autoComplete: "url",
              pattern: "https://.*",
              placeholder: "https://makler-realty.com/tours/listing/panorama-thumb.jpg",
              defaultValue: tour.thumbnail_url || "",
              "data-tour-thumbnail-url": "true",
            }),
          ),
          h(
            "label",
            { className: "adm-tour-form__field" },
            ui.tourReviewer,
            h("input", { name: "reviewer", required: true, autoComplete: "name", "data-tour-reviewer": "true" }),
          ),
          h(
            "label",
            { className: "adm-tour-form__field adm-tour-form__field--caption" },
            ui.tourAccessibilityCaption,
            h("textarea", {
              name: "accessibilityCaption",
              rows: "3",
              required: true,
              defaultValue: tour.accessibility_caption || "",
              "data-tour-accessibility-caption": "true",
            }),
          ),
          h(
            "label",
            { className: "adm-check adm-tour-form__confirmation" },
            h("input", { type: "checkbox", name: "reviewConfirmed", required: true, "data-tour-review-confirmation": "true" }),
            ` ${ui.tourApprovalConfirmation}`,
          ),
          h(
            "div",
            { className: "adm-tour-form__actions" },
            h("p", { className: "adm-tour-form__status", role: "status", "aria-live": "polite", "data-tour-save-status": "true" }),
              h(
                "button",
                { type: "submit", className: "mk-btn mk-btn--primary mk-btn--md" },
                h(Icon, { name: "globe", size: 16 }),
                h("span", null, ui.tourApprovePublish),
              ),
            ),
          )
              : h("p", { className: "adm-note", role: "note", "data-read-only-role": "true" }, ui.readOnlyAccess),
          ),
        ),
      ),
    ],
  });
}

/* ============================================================
   Migration review (launch workbench)
   ============================================================ */

function migrationRoutePageHref(page, targetPage) {
  const url = new URL("/admin/migration/review", "http://ms-realty.local");
  if (page.workspace?.locale && page.workspace.locale !== "en") url.searchParams.set("locale", page.workspace.locale);
  if (page.routeMap?.filters?.q) url.searchParams.set("q", page.routeMap.filters.q);
  if (page.routeMap?.filters?.type) url.searchParams.set("routeType", page.routeMap.filters.type);
  if (page.routeMap?.filters?.domain) url.searchParams.set("routeDomain", page.routeMap.filters.domain);
  url.searchParams.set("routePage", String(targetPage));
  return `${url.pathname}${url.search}`;
}

function readableLegacyUrl(value) {
  try {
    return decodeURI(value);
  } catch {
    return value;
  }
}

function MigrationRoutePagination({ page }) {
  const pagination = page.routeMap?.pendingPagination;
  if (!pagination || pagination.totalPages <= 1) return null;
  const copy = adminCopy(page);
  return h(
    "nav",
    { className: "adm-pagination", "aria-label": label(copy, "page", "Page") },
    pagination.page > 1
      ? h(
          "a",
          { className: "mk-btn mk-btn--secondary mk-btn--sm", href: migrationRoutePageHref(page, pagination.page - 1) },
          h(Icon, { name: "chevron-left", size: 16 }),
          label(copy, "previousPage", "Previous"),
        )
      : h("span", null),
    h(
      "span",
      { className: "adm-pagination__status" },
      `${label(copy, "page", "Page")} ${pagination.page} / ${pagination.totalPages}`,
    ),
    pagination.page < pagination.totalPages
      ? h(
          "a",
          { className: "mk-btn mk-btn--secondary mk-btn--sm", href: migrationRoutePageHref(page, pagination.page + 1) },
          label(copy, "nextPage", "Next"),
          h(Icon, { name: "chevron-right", size: 16 }),
        )
      : h("span", null),
  );
}

function RuntimeEvidenceImport({ action, kind, statusHref, summary, templateLinks = [], sourceOptions = [], ui }) {
  return h(
    "details",
    { className: "adm-runtime-evidence", "data-admin-runtime-evidence": kind },
    h(
      "summary",
      null,
      h(Icon, { name: "upload", size: 17 }),
      h("span", null, summary),
      h(Icon, { name: "chevron-down", size: 16, className: "adm-runtime-evidence__chevron" }),
    ),
    h(
      "div",
      { className: "adm-runtime-evidence__body" },
      h("p", { className: "adm-runtime-evidence__hint" }, ui.runtimeEvidenceHint),
      h(
        "div",
        { className: "adm-runtime-evidence__links" },
        statusHref
          ? h(
              "a",
              { className: "mk-btn mk-btn--subtle mk-btn--sm", href: statusHref },
              h(Icon, { name: "external-link", size: 16 }),
              h("span", null, ui.openStatus),
            )
          : null,
        ...templateLinks.map(([href, text]) =>
          h(
            "a",
            { key: href, className: "mk-btn mk-btn--subtle mk-btn--sm", href },
            h(Icon, { name: "download", size: 16 }),
            h("span", null, text || ui.downloadTemplate),
          ),
        ),
      ),
      h(
        "form",
        {
          method: "post",
          action,
          className: "adm-runtime-evidence__form",
          "data-admin-mutation-form": "true",
          "data-admin-runtime-evidence-form": kind,
          "data-admin-mutation-saving": ui.reportSaving,
          "data-admin-mutation-success": ui.reportSaved,
          "data-admin-mutation-failure": ui.reportFailed,
        },
        sourceOptions.length
          ? h(
              "label",
              null,
              ui.reportSource,
              h(
                "select",
                { name: "source", required: true },
                ...sourceOptions.map(([value, text]) => h("option", { key: value, value }, text)),
              ),
            )
          : null,
        h(
          "label",
          null,
          ui.redactedJsonReport,
          h("textarea", {
            name: "report",
            rows: 8,
            required: true,
            spellCheck: "false",
            autoCapitalize: "none",
            autoCorrect: "off",
            autoComplete: "off",
            placeholder: "{\n  \"schema_version\": 1\n}",
          }),
        ),
        h(
          "div",
          { className: "adm-runtime-evidence__actions" },
          h("p", { role: "status", "aria-live": "polite", "data-admin-mutation-status": "true" }),
          h(
            "button",
            { type: "submit", className: "mk-btn mk-btn--primary mk-btn--sm" },
            h(Icon, { name: "upload", size: 16 }),
            h("span", null, ui.importReport),
          ),
        ),
      ),
    ),
  );
}

function PendingLegacyRouteDecision({ page, route, ui, defaultOpen = false }) {
  const operatorId = currentOperatorId(page, "seo_editor");
  const evidence = route.source_evidence || {};
  return h(
    "li",
    {
      className: "adm-route-decision",
      "data-pending-route-decision": "true",
      "data-route-type": route.url_type,
      "data-source-domain": route.source_domain,
    },
    h(
      "details",
      { className: "adm-route-decision__disclosure", open: defaultOpen ? true : undefined },
      h(
        "summary",
        { className: "adm-route-decision__header" },
        h(
          "span",
          { className: "adm-route-decision__summary" },
          h("code", { className: "crm-mono", title: route.old_url }, readableLegacyUrl(route.old_url)),
          evidence.title ? h("small", null, evidence.title) : null,
        ),
        h(
          "span",
          { className: "adm-route-decision__meta" },
          h(StatusPill, { tone: "sun" }, route.url_type),
          h("span", null, route.source_domain),
        ),
      ),
      h(
        "section",
        {
          className: "adm-route-evidence",
          "aria-label": ui.sourceEvidence,
          "data-source-evidence": "true",
          "data-source-title": evidence.title || "",
        },
        h(
          "dl",
          { className: "adm-route-evidence__facts" },
          evidence.title
            ? h("div", null, h("dt", null, ui.sourceTitle), h("dd", null, evidence.title))
            : null,
          evidence.h1 && evidence.h1 !== evidence.title
            ? h("div", null, h("dt", null, ui.sourceHeading), h("dd", null, evidence.h1))
            : null,
          evidence.canonical
            ? h(
                "div",
                null,
                h("dt", null, ui.sourceCanonical),
                h("dd", null, h("code", { className: "crm-mono" }, evidence.canonical)),
              )
            : null,
          h(
            "div",
            null,
            h("dt", null, ui.sourceMetrics),
            h(
              "dd",
              null,
              `${evidence.word_count || 0} ${ui.sourceWords} · ${evidence.image_count || 0} ${ui.sourceImages} · ${evidence.internal_link_count || 0} ${ui.sourceLinks}`,
            ),
          ),
          evidence.review_owner
            ? h("div", null, h("dt", null, ui.reviewOwner), h("dd", null, evidence.review_owner))
            : null,
          evidence.action_required
            ? h("div", null, h("dt", null, ui.requiredAction), h("dd", null, evidence.action_required))
            : null,
        ),
        h(
          "a",
          {
            className: "mk-btn mk-btn--subtle mk-btn--sm adm-route-evidence__open",
            href: route.old_url,
            target: "_blank",
            rel: "noreferrer",
          },
          h(Icon, { name: "external-link", size: 16 }),
          h("span", null, ui.openLegacyPage),
        ),
      ),
      h(
        "form",
        {
          method: "post",
          action: "/api/admin/redirect-approvals",
          className: "adm-route-decision__form",
          "data-route-decision-form": "true",
          "data-admin-mutation-form": "true",
          "data-admin-mutation-saving": ui.routeDecisionSaving,
          "data-admin-mutation-success": ui.routeDecisionSaved,
          "data-admin-mutation-failure": ui.routeDecisionFailed,
        },
          h("input", { type: "hidden", name: "oldUrl", value: route.old_url }),
          h(
            "label",
            null,
            ui.decision,
            h(
              "select",
              { name: "decision", required: true, "data-route-decision-select": "true" },
              h("option", { value: "" }, ui.chooseDecision),
              h("option", { value: "redirect_301" }, ui.redirect301),
              h("option", { value: "retain_200" }, ui.retain200),
              h("option", { value: "approved_410" }, ui.approved410),
            ),
          ),
          h(
            "label",
            null,
            ui.targetPath,
            h("input", {
              type: "text",
              name: "targetPath",
              defaultValue: route.target_path || "",
              placeholder: "/bg/imoti/...",
              autoComplete: "off",
              list: "legacy-route-targets",
              "data-route-decision-target": "true",
            }),
            h(
              "a",
              {
                className: "adm-route-target-preview",
                href: route.target_path || "#",
                target: "_blank",
                rel: "noreferrer",
                hidden: route.target_path ? undefined : true,
                "data-route-decision-target-preview": "true",
              },
              h(Icon, { name: "external-link", size: 14 }),
              h("span", null, ui.openTargetPage),
            ),
          ),
          h(
            "label",
            null,
            ui.reviewer,
            h("input", { name: "reviewer", defaultValue: operatorId, required: true, autoComplete: "name" }),
          ),
          h(
            "label",
            { className: "adm-route-decision__reason" },
            ui.reason,
            h("textarea", { name: "reason", rows: 2, required: true }),
          ),
          h(
            "label",
            { className: "adm-route-decision__equivalence" },
            h("input", {
              type: "checkbox",
              name: "equivalentContent",
              value: "true",
              "data-route-decision-equivalence": "true",
            }),
            h("span", null, ui.equivalentContent),
          ),
          h(
            "div",
            { className: "adm-route-decision__actions" },
            h("p", { role: "status", "aria-live": "polite", "data-admin-mutation-status": "true" }),
            h(
              "button",
              { type: "submit", className: "mk-btn mk-btn--primary mk-btn--sm" },
              h(Icon, { name: "circle-check", size: 16 }),
              h("span", null, ui.saveDecision),
            ),
          ),
      ),
    ),
  );
}

const LISTING_FACT_REVIEW_FIELDS = new Set(["price_eur", "area_sqm", "bedrooms", "location", "description"]);
const LISTING_MEDIA_REVIEW_FIELDS = new Set(["media_review", "media_alt_text", "public_gallery", "tour_review"]);

function ListingQualityReviewDecision({ page, row, ui }) {
  const copy = adminCopy(page);
  const operatorId = currentOperatorId(page, "listing_quality_editor");
  const factFields = row.required_editor_fields.filter((field) => LISTING_FACT_REVIEW_FIELDS.has(field));
  const mediaFields = row.required_editor_fields.filter((field) => LISTING_MEDIA_REVIEW_FIELDS.has(field));
  const snapshots = {
    listing_id: row.listing_id,
    editor_path: row.editor_path,
    review_status: row.review_status,
    issues: row.issues,
    required_editor_fields: row.required_editor_fields,
    public_gallery_assets: row.public_gallery_assets,
    public_gallery_sample: row.public_gallery_sample,
    missing_alt_text_assets: row.missing_alt_text_assets,
  };
  return h(
    "li",
    { className: "adm-route-decision", "data-quality-listing": "true", "data-quality-listing-id": row.listing_id },
    h(
      "details",
      { className: "adm-route-decision__disclosure" },
      h(
        "summary",
        { className: "adm-route-decision__header" },
        h(
          "span",
          { className: "adm-route-decision__summary" },
          h("code", { className: "crm-mono" }, row.listing_id),
          h("small", null, row.title),
        ),
        h(
          "span",
          { className: "adm-route-decision__meta" },
          h(StatusPill, { tone: "sun" }, row.source_locale.toUpperCase()),
          h("span", null, `${row.issues.length} ${ui.issues.toLocaleLowerCase()}`),
        ),
      ),
      h(
        "section",
        { className: "adm-route-evidence", "aria-label": ui.reviewListing },
        h(
          "dl",
          { className: "adm-route-evidence__facts" },
          h("div", null, h("dt", null, ui.location), h("dd", null, row.location || statusText(ui, "missing"))),
          h("div", null, h("dt", null, ui.publicPhotos), h("dd", null, row.public_gallery_assets)),
          h("div", null, h("dt", null, ui.missingAlt), h("dd", null, row.missing_alt_text_assets)),
          h(
            "div",
            null,
            h("dt", null, ui.issues),
            h("dd", null, row.issues.map((issue) => listingQualityIssueText(ui, issue)).join(", ")),
          ),
        ),
        h(
          "a",
          { className: "mk-btn mk-btn--subtle mk-btn--sm adm-route-evidence__open", href: payloadAdminListingHref(row.listing_id, page) },
          h(Icon, { name: "pencil", size: 16 }),
          h("span", null, label(copy, "editListing", "Edit listing")),
        ),
      ),
      h(
        "form",
        {
          method: "post",
          action: page.listingQualityImportEndpoint,
          className: "adm-route-decision__form",
          "data-listing-quality-review-form": "true",
          "data-admin-mutation-form": "true",
          "data-admin-mutation-saving": ui.listingReviewSaving,
          "data-admin-mutation-success": ui.listingReviewSaved,
          "data-admin-mutation-failure": ui.listingReviewFailed,
        },
        ...Object.entries(snapshots).map(([name, value]) =>
          h("input", { key: name, type: "hidden", name, value: Array.isArray(value) ? value.join("|") : value }),
        ),
        ...factFields.map((field) =>
          h(
            "label",
            { key: field, className: field === "description" ? "adm-route-decision__reason" : undefined },
            fieldText(ui, field),
            field === "description"
              ? h("textarea", { name: field, rows: 3, defaultValue: row[field] || "", required: true })
              : h("input", {
                  name: field,
                  type: ["price_eur", "area_sqm", "bedrooms"].includes(field) ? "number" : "text",
                  min: ["price_eur", "area_sqm"].includes(field) ? "0.01" : field === "bedrooms" ? "0" : undefined,
                  step: field === "bedrooms" ? "1" : ["price_eur", "area_sqm"].includes(field) ? "0.01" : undefined,
                  inputMode: field === "bedrooms" ? "numeric" : ["price_eur", "area_sqm"].includes(field) ? "decimal" : undefined,
                  defaultValue: row[field] ?? "",
                  required: true,
                }),
          ),
        ),
        factFields.length
          ? h("label", null, ui.factsReviewer, h("input", { name: "facts_reviewer", defaultValue: operatorId, required: true, autoComplete: "name" }))
          : null,
        mediaFields.length
          ? h("label", null, ui.mediaReviewer, h("input", { name: "media_reviewer", defaultValue: operatorId, required: true, autoComplete: "name" }))
          : null,
        h(
          "label",
          { className: "adm-route-decision__reason" },
          ui.reviewNotes,
          h("textarea", { name: "review_notes", rows: 3, required: true, placeholder: ui.reviewNotesHint }),
        ),
        h(
          "div",
          { className: "adm-route-decision__actions" },
          h("p", { role: "status", "aria-live": "polite", "data-admin-mutation-status": "true" }),
          h(
            "button",
            { type: "submit", className: "mk-btn mk-btn--primary mk-btn--sm" },
            h(Icon, { name: "circle-check", size: 16 }),
            h("span", null, ui.saveListingReview),
          ),
        ),
      ),
    ),
  );
}

function MigrationReviewBody({ page }) {
  const copy = adminCopy(page);
  const ui = workbenchCopy(page);
  const gaps = page.dashboard.metadata_gaps || {};
  const metrics = [
    [ui.urls, page.routeMap.total, "link", "ink"],
    [ui.reviewRequired, page.routeMap.reviewRequired, "eye", "sun"],
    [ui.mappedListings, page.routeMap.mappedListings, "building-2", "sea"],
    [ui.reviewedDecisions, page.routeMap.terminalDecisionsReviewed, "circle-check", "success"],
    [ui.missingDescriptions, gaps.missing_description, "file-text", "brick"],
    [ui.mediaRows, page.dashboard.media_reconciliation?.media_rows, "camera", "sand"],
  ];
  const seoSources = ["search_console", "yandex_webmaster", "backlinks"];
  const launchBlockers = page.launchBlockers?.blockers || [];
  const launchStatus = page.launchBlockers?.status || "unknown";
  const agencyQueue = page.agencyReviewQueue || { status: "complete", summary: { open_tasks: 0 }, lanes: [] };
  const launchActionCount = (page.launchBlockers?.blocked_gates || []).reduce(
    (count, gate) => count + (gate.next_actions || []).length,
    0,
  );
  const title = label(copy, "migrationReview", "Migration review");
  const liveReportSources = [
    ["postgres_search_sync", "Postgres search projection"],
    ["postgres_search_query", "Postgres search query"],
    ["hermes_draft_worker", "Hermes draft worker"],
  ];
  const evidenceLinks = [
    [page.launchReadinessEndpoint, ui.launchReadiness],
    [page.launchInputChecklistEndpoint, ui.launchInputChecklist],
    [page.preflightReportsEndpoint, ui.preflightReports],
    [page.seoPreflightEndpoint, ui.seoPreflight],
    [page.liveServicesEndpoint, ui.liveServices],
    [page.liveServiceProvisioningEndpoint, ui.liveProvisioning],
    [page.payloadRuntimeEndpoint, ui.payloadRuntime],
    [page.payloadRuntimeBootstrapEndpoint, ui.payloadBootstrap],
    [page.productionRecoveryEndpoint, ui.productionRecovery],
    [page.cmsCollectionsEndpoint, ui.cmsContracts],
    [page.payloadCollectionsEndpoint, ui.payloadCollections],
    [page.listingQualityEndpoint, ui.listingQuality],
  ];

  return adminShell(page, {
    title,
    mainAttrs: {
      "data-kind": "admin-migration-review",
      "data-react-admin-ui": "migration-review",
      "data-admin-workbench": "migration",
      "data-admin-locale": page.workspace.locale,
      "data-review-required": page.routeMap.reviewRequired,
      "data-launch-status": launchStatus,
      "data-launch-blockers": launchBlockers.join(","),
      "data-launch-action-count": launchActionCount,
      "data-launch-readiness-endpoint": page.launchReadinessEndpoint,
      "data-agency-review-status": agencyQueue.status,
      "data-agency-review-open-tasks": agencyQueue.summary.open_tasks,
      "data-launch-readiness-export-endpoint": page.launchReadinessExportEndpoint,
      "data-launch-input-checklist-endpoint": page.launchInputChecklistEndpoint,
      "data-preflight-reports-endpoint": page.preflightReportsEndpoint,
      "data-seo-preflight-endpoint": page.seoPreflightEndpoint,
      "data-live-services-endpoint": page.liveServicesEndpoint,
      "data-live-service-provisioning-endpoint": page.liveServiceProvisioningEndpoint,
      "data-live-service-provisioning-import-endpoint": page.liveServiceProvisioningImportEndpoint,
      "data-live-service-report-template-endpoint": page.liveServiceReportTemplateEndpoint,
      "data-live-service-report-import-endpoint": page.liveServiceReportImportEndpoint,
      "data-payload-runtime-endpoint": page.payloadRuntimeEndpoint,
      "data-payload-runtime-bootstrap-endpoint": page.payloadRuntimeBootstrapEndpoint,
      "data-payload-runtime-import-endpoint": page.payloadRuntimeImportEndpoint,
      "data-production-recovery-endpoint": page.productionRecoveryEndpoint,
      "data-production-recovery-template-endpoint": page.productionRecoveryTemplateEndpoint,
      "data-production-recovery-import-endpoint": page.productionRecoveryImportEndpoint,
      "data-cms-collections-endpoint": page.cmsCollectionsEndpoint,
      "data-payload-collections-endpoint": page.payloadCollectionsEndpoint,
      "data-listing-quality-endpoint": page.listingQualityEndpoint,
    },
    children: [
      h(PageHeader, { title, subtitle: ui.migrationSubtitle }),
      h(
        "div",
        { className: `mk-alert ${launchStatus === "ready" ? "mk-alert--success" : "mk-alert--warning"}`, role: launchStatus === "ready" ? "status" : "alert" },
        h("span", { className: "mk-alert__icon" }, h(Icon, { name: launchStatus === "ready" ? "circle-check" : "triangle-alert", size: 18 })),
        h(
          "div",
          { className: "mk-alert__body" },
          h("div", { className: "mk-alert__title" }, `${ui.launch}: ${statusText(ui, launchStatus)}`),
          h(
            "div",
            { className: "mk-alert__text" },
            launchBlockers.length
              ? `${launchBlockers.map((gate) => ui.launchGates[gate] || valueText(ui, gate)).join(", ")} · ${launchActionCount} ${ui.nextActions}`
              : ui.noLaunchBlockers,
          ),
        ),
      ),
      h(StatGrid, { metrics }),
      h(
        Panel,
        {
          title: ui.agencyDecisionQueue,
          action: h(StatusPill, { tone: agencyQueue.status === "complete" ? "success" : "sun" }, agencyQueue.summary.open_tasks),
          "data-agency-review-queue": "true",
        },
        h(
          "p",
          { className: "adm-note" },
          ui.agencyDecisionQueueNote,
        ),
        h(
          "div",
          { className: "adm-scroll-x" },
          h(
            "table",
            { className: "crm-tbl" },
            h("thead", null, h("tr", null, h("th", null, ui.queue), h("th", null, ui.open), h("th", null, ui.reviewOwner), h("th", null, ui.agencySafetyBoundary), h("th", null, ui.requiredAction))),
            h(
              "tbody",
              null,
              ...agencyQueue.lanes.map((laneItem) =>
                h(
                  "tr",
                  { key: laneItem.id, "data-agency-review-lane": laneItem.id },
                  h("td", { "data-label": ui.queue }, ui.agencyReviewLanes?.[laneItem.id]?.title || laneItem.title),
                  h("td", { "data-label": ui.open }, h(StatusPill, { tone: laneItem.priority === "high" ? "brick" : "sun" }, laneItem.count)),
                  h("td", { "data-label": ui.reviewOwner }, ui.agencyReviewOwners?.[laneItem.owner] || valueText(ui, laneItem.owner)),
                  h("td", { "data-label": ui.agencySafetyBoundary }, ui.agencyReviewLanes?.[laneItem.id]?.guardrail || laneItem.guardrail),
                  h("td", { "data-label": ui.requiredAction }, h("a", { className: "mk-btn mk-btn--subtle mk-btn--sm", href: adminHref(laneItem.admin_path, page) }, ui.reviewAction)),
                ),
              ),
            ),
          ),
        ),
      ),
      h(
        Panel,
        { title: label(copy, "launchEvidence", "Launch evidence") },
        h(
          WorkbenchDisclosure,
          { summary: ui.openLaunchEvidence, "data-launch-evidence-disclosure": "true" },
        h(
          "nav",
          { className: "adm-evidence", "aria-label": label(copy, "launchEvidence", "Launch evidence") },
          ...evidenceLinks.map(([href, text]) =>
            h("a", { key: href, className: "mk-btn mk-btn--subtle mk-btn--sm", href }, h(Icon, { name: "file-text", size: 16 }), h("span", null, text)),
          ),
        ),
        h(
          "form",
          { method: "post", action: page.launchReadinessExportEndpoint, className: "adm-inline-form" },
          h("button", { type: "submit", className: "mk-btn mk-btn--primary mk-btn--sm" }, h(Icon, { name: "download", size: 16 }), h("span", null, ui.exportLaunchReadiness)),
        ),
        h(
          "section",
          { className: "adm-runtime-evidence-list", "aria-label": ui.runtimeEvidenceImports },
          h("h3", null, ui.runtimeEvidenceImports),
          h(RuntimeEvidenceImport, {
            action: page.liveServiceProvisioningImportEndpoint,
            kind: "live-service-provisioning",
            statusHref: page.liveServiceProvisioningEndpoint,
            summary: ui.liveProvisioning,
            ui,
          }),
          h(RuntimeEvidenceImport, {
            action: page.liveServiceReportImportEndpoint,
            kind: "live-service-reports",
            statusHref: page.liveServicesEndpoint,
            summary: ui.liveServiceReports,
            sourceOptions: liveReportSources,
            templateLinks: liveReportSources.map(([source, text]) => [
              `${page.liveServiceReportTemplateEndpoint}?source=${encodeURIComponent(source)}`,
              text,
            ]),
            ui,
          }),
          h(RuntimeEvidenceImport, {
            action: page.payloadRuntimeImportEndpoint,
            kind: "payload-runtime",
            statusHref: page.payloadRuntimeEndpoint,
            summary: ui.payloadRuntime,
            templateLinks: [[page.payloadRuntimeBootstrapEndpoint, ui.payloadBootstrap]],
            ui,
          }),
          h(RuntimeEvidenceImport, {
            action: page.productionRecoveryImportEndpoint,
            kind: "production-recovery",
            statusHref: page.productionRecoveryEndpoint,
            summary: ui.productionRecovery,
            templateLinks: [[page.productionRecoveryTemplateEndpoint, ui.downloadTemplate]],
            ui,
          }),
        ),
        ),
      ),
      h(
        Panel,
        {
          title: h(
            "span",
            null,
            `${ui.pendingLegacyDecisions} · `,
            h("span", { "data-filtered-route-value": "true" }, page.routeMap.pendingPagination.totalRows),
            "/",
            h("span", { "data-pending-route-value": "true" }, page.routeMap.reviewRequired),
          ),
          action: h(
            StatusPill,
            { tone: "success", "data-reviewed-route-progress": "true" },
            `${ui.reviewedDecisions}: `,
            h("span", { "data-reviewed-route-value": "true" }, page.routeMap.terminalDecisionsReviewed),
          ),
          "aria-label": ui.pendingLegacyDecisions,
          "data-pending-route-count": page.routeMap.reviewRequired,
          "data-filtered-route-count": page.routeMap.pendingPagination.totalRows,
          "data-reviewed-route-count": page.routeMap.terminalDecisionsReviewed,
        },
        h("p", { className: "adm-note" }, ui.pendingLegacyHint),
        h(
          "form",
          { method: "get", action: "/admin/migration/review", className: "adm-filterbar", role: "search", "data-route-filters": "true" },
          filterLocaleInput(page),
          h(
            "label",
            null,
            ui.search,
            h("input", { type: "search", name: "q", defaultValue: page.routeMap.filters?.q || "", autoComplete: "off" }),
          ),
          h(
            "label",
            null,
            ui.routeType,
            h(
              "select",
              { name: "routeType" },
              h("option", { value: "" }, label(copy, "all", "All")),
              ...(page.routeMap.filterOptions?.types || []).map((value) =>
                h("option", { key: value, value, selected: page.routeMap.filters?.type === value }, statusText(ui, value)),
              ),
            ),
          ),
          h(
            "label",
            null,
            label(copy, "source", "Source"),
            h(
              "select",
              { name: "routeDomain" },
              h("option", { value: "" }, label(copy, "all", "All")),
              ...(page.routeMap.filterOptions?.domains || []).map((value) =>
                h("option", { key: value, value, selected: page.routeMap.filters?.domain === value }, value),
              ),
            ),
          ),
          h("button", { type: "submit", className: "mk-btn mk-btn--primary mk-btn--md" }, h(Icon, { name: "filter", size: 16 }), label(copy, "filter", "Filter")),
          h("a", { className: "mk-btn mk-btn--ghost mk-btn--md", href: adminHref("/admin/migration/review", page) }, label(copy, "resetFilters", "Reset filters")),
        ),
        (page.routeMap.pendingSample || []).length
          ? h(
              "ol",
              { className: "adm-route-decisions" },
              ...(page.routeMap.pendingSample || []).map((route) =>
                h(PendingLegacyRouteDecision, { key: route.old_url, page, route, ui }),
              ),
            )
          : h("p", { className: "adm-empty", "data-empty-route-decisions": "true", tabIndex: "-1" }, ui.noPendingLegacyDecisions),
        h(
          "datalist",
          { id: "legacy-route-targets", "data-route-target-options": "true" },
          ...(page.routeMap.targetOptions || []).map((option) =>
            h("option", { key: option.path, value: option.path, label: `${option.locale.toUpperCase()} · ${statusText(ui, option.type)}` }),
          ),
        ),
        h(MigrationRoutePagination, { page }),
      ),
      (page.routeMap.approvableSample || []).length
        ? h(
            Panel,
            { title: ui.approvableRedirects, "aria-label": ui.approvableRedirects },
        h(
          "div",
          { className: "adm-scroll-x" },
          h(
            "table",
            { className: "crm-tbl" },
            h("thead", null, h("tr", null, h("th", null, ui.oldUrl), h("th", null, ui.target), h("th", null, ui.locale), h("th", null, ui.approval))),
            h(
              "tbody",
              null,
              ...(page.routeMap.approvableSample || []).map((route) =>
                h(
                  "tr",
                  { key: route.old_url, "data-approvable-listing": "true" },
                  h("td", null, h("code", { className: "crm-mono" }, route.old_url)),
                  h("td", null, h("code", { className: "crm-mono" }, route.target_path)),
                  h("td", null, h("span", { className: "crm-lang" }, route.target_locale)),
                  h(
                    "td",
                    null,
                    h(
                      "form",
                      { method: "post", action: "/api/admin/redirect-approvals", className: "adm-approve-form" },
                      h("input", { type: "hidden", name: "oldUrl", defaultValue: route.old_url }),
                      h("input", { type: "hidden", name: "equivalentContent", defaultValue: "true" }),
                      h("label", null, `${ui.reviewer} `, h("input", { name: "reviewer", required: true, autoComplete: "name" })),
                      h("label", null, `${ui.reason} `, h("input", { name: "reason", defaultValue: ui.reviewedSameContent })),
                      h("button", { type: "submit", className: "mk-btn mk-btn--primary mk-btn--sm" }, h("span", null, ui.approve301)),
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
          )
        : null,
      h(
        Panel,
        {
          title: ui.importRedirectCsv,
          "aria-label": ui.importRedirectCsv,
          "data-redirect-import-endpoint": page.redirectApprovalImport.endpoint,
          "data-redirect-export-endpoint": page.redirectApprovalImport.exportEndpoint,
          "data-redirect-workbook-endpoint": page.redirectApprovalImport.workbookEndpoint,
          "data-pending-redirect-workbook-endpoint": page.redirectApprovalImport.pendingWorkbookEndpoint,
        },
        h(
          WorkbenchDisclosure,
          { summary: ui.openCsvTools, "data-redirect-tools-disclosure": "true" },
        h(
          "p",
          { className: "adm-note" },
          h(
            "a",
            { className: "mk-btn mk-btn--subtle mk-btn--sm", href: page.redirectApprovalImport.pendingWorkbookEndpoint },
            h(Icon, { name: "download", size: 16 }),
            h("span", null, ui.downloadPendingWorkbook),
          ),
        ),
        h("p", { className: "adm-note" }, ui.redirectWorkbookHint),
        h(
          "form",
          { method: "post", action: page.redirectApprovalImport.endpoint, className: "adm-csv-form" },
          h("label", null, ui.csvContents, h("textarea", { name: "csv", rows: "5", required: true })),
          h("button", { type: "submit", className: "mk-btn mk-btn--primary mk-btn--sm" }, h(Icon, { name: "upload", size: 16 }), h("span", null, ui.importCsv)),
        ),
        h(
          "form",
          { method: "post", action: page.redirectApprovalImport.exportEndpoint, className: "adm-inline-form" },
          h("button", { type: "submit", className: "mk-btn mk-btn--secondary mk-btn--sm" }, h(Icon, { name: "download", size: 16 }), h("span", null, ui.exportRedirects)),
        ),
        ),
      ),
      h(
        Panel,
        {
          title: ui.externalSeoEvidence,
          "aria-label": ui.externalSeoEvidence,
          "data-seo-import-endpoint": page.seoEvidence.importEndpoint,
          "data-seo-template-endpoint": page.seoEvidence.templateEndpoint,
        },
        h(
          WorkbenchDisclosure,
          {
            summary: `${ui.openSeoImport} · ${page.seoEvidence.missingRequiredSources.length}`,
            "data-seo-tools-disclosure": "true",
          },
        h("p", { className: "adm-note" }, `${ui.missingRequiredSources}: ${page.seoEvidence.missingRequiredSources.join(", ") || "-"}`),
        h(
          "ul",
          { className: "adm-seo-sources" },
          ...seoSources.map((source) => {
            const status = page.seoEvidence.sources[source];
            return h(
              "li",
              { key: source },
              h(StatusPill, { tone: status.status === "imported" ? "success" : "sun" }, source),
              ` ${statusText(ui, status.status)} · ${status.matched_rows} / ${status.row_count} `,
              h(
                "a",
                { className: "mk-btn mk-btn--subtle mk-btn--sm", href: `${page.seoEvidence.templateEndpoint}?source=${source}` },
                h(Icon, { name: "download", size: 15 }),
                h("span", null, ui.csvTemplate),
              ),
            );
          }),
        ),
        h(
          "form",
          { method: "post", action: page.seoEvidence.importEndpoint, className: "adm-csv-form" },
          h(
            "label",
            null,
            `${ui.source} `,
            h(
              "select",
              { name: "source", required: true },
              h("option", { value: "search_console" }, "Search Console"),
              h("option", { value: "yandex_webmaster" }, "Yandex Webmaster"),
              h("option", { value: "backlinks" }, "Backlinks"),
            ),
          ),
          h("label", null, ui.csvContents, h("textarea", { name: "csv", rows: "5", required: true })),
          h("button", { type: "submit", className: "mk-btn mk-btn--primary mk-btn--sm" }, h(Icon, { name: "upload", size: 16 }), h("span", null, ui.importSeoCsv)),
        ),
        ),
      ),
      h(
        Panel,
        {
          title: ui.listingQualityQueue,
          "aria-label": ui.listingQualityQueue,
          "data-quality-workbook-endpoint": page.listingQualityWorkbookEndpoint,
          "data-quality-review-draft-endpoint": page.listingQualityReviewDraftEndpoint,
          "data-quality-import-endpoint": page.listingQualityImportEndpoint,
          "data-quality-affected-listings": page.listingQuality?.summary?.affected_listings || 0,
          "data-quality-reviewed-listings": page.listingQuality?.review_queue?.summary?.review_rows || 0,
          "data-quality-pending-listings": page.listingQuality?.review_queue?.summary?.pending_review_rows || 0,
        },
        h(
          WorkbenchDisclosure,
          {
            summary: `${ui.openQualityQueue} · ${page.listingQuality?.review_queue?.summary?.pending_review_rows ?? page.listingQuality?.summary?.affected_listings ?? 0}`,
            "data-quality-tools-disclosure": "true",
          },
        h(
          "nav",
          { className: "adm-evidence" },
          h("a", { className: "mk-btn mk-btn--subtle mk-btn--sm", href: page.listingQualityWorkbookEndpoint }, h(Icon, { name: "download", size: 16 }), h("span", null, ui.downloadQualityWorkbook)),
          h("a", { className: "mk-btn mk-btn--subtle mk-btn--sm", href: page.listingQualityReviewDraftEndpoint }, h(Icon, { name: "download", size: 16 }), h("span", null, ui.downloadQualityDraft)),
        ),
        h(
          "form",
          { method: "post", action: page.listingQualityImportEndpoint, className: "adm-csv-form" },
          h("label", null, ui.csvContents, h("textarea", { name: "csv", rows: "5", required: true })),
          h("button", { type: "submit", className: "mk-btn mk-btn--primary mk-btn--sm" }, h(Icon, { name: "upload", size: 16 }), h("span", null, ui.importQualityCsv)),
        ),
        page.listingQuality?.review_queue?.error
          ? h("p", { className: "adm-inline-alert", role: "alert" }, page.listingQuality.review_queue.error)
          : null,
        (page.listingQuality?.rows || []).length
          ? h(
              "ol",
              { className: "adm-route-decisions", "data-listing-quality-review-queue": "true" },
              ...page.listingQuality.rows.map((row) =>
                h(ListingQualityReviewDecision, { key: row.listing_id, page, row, ui }),
              ),
            )
          : h("p", { className: "adm-empty", "data-empty-listing-quality-review": "true" }, ui.noReportData),
        ),
      ),
      h(
        Panel,
        { title: ui.approvedRedirects, "aria-label": ui.approvedRedirects },
        h(
          "details",
          { className: "adm-archive-disclosure" },
          h(
            "summary",
            null,
            h(StatusPill, { tone: "success" }, page.redirectApprovals.length),
            h("span", null, ui.approvedRedirects),
          ),
          h(
            "ul",
            { className: "adm-redirects" },
            ...page.redirectApprovals.map((approval) =>
              h(
                "li",
                { key: approval.old_url },
                h("code", { className: "crm-mono" }, approval.old_url),
                " → ",
                h("code", { className: "crm-mono" }, approval.target_path),
              ),
            ),
          ),
        ),
      ),
    ],
  });
}

export function renderReactAdminBody(page) {
  if (page.kind === "admin_today") return renderStaticElement(h(TodayBody, { page }));
  if (page.kind === "admin_contacts") return renderStaticElement(h(ContactsBody, { page }));
  if (page.kind === "admin_consents") return renderStaticElement(h(ConsentsBody, { page }));
  if (page.kind === "admin_document_checklists") return renderStaticElement(h(DocumentChecklistsBody, { page }));
  if (page.kind === "admin_lead_inbox") return renderStaticElement(h(LeadInboxBody, { page }));
  if (page.kind === "admin_realty_cases") return renderStaticElement(h(RealtyCasesBody, { page }));
  if (page.kind === "admin_lead_pipeline") return renderStaticElement(h(LeadPipelineBody, { page }));
  if (page.kind === "admin_requests") return renderStaticElement(h(PublicRequestsBody, { page }));
  if (page.kind === "admin_viewings") return renderStaticElement(h(ViewingsBody, { page }));
  if (page.kind === "admin_operations_reports") return renderStaticElement(h(OperationsReportsBody, { page }));
  if (page.kind === "admin_activity") return renderStaticElement(h(ActivityBody, { page }));
  if (page.kind === "admin_listing_manager") return renderStaticElement(h(ListingManagerBody, { page }));
  if (page.kind === "admin_translation_queue") return renderStaticElement(h(TranslationQueueBody, { page }));
  if (page.kind === "admin_listing_editor") return renderStaticElement(h(ListingEditorBody, { page }));
  if (page.kind === "admin_migration_review") return renderStaticElement(h(MigrationReviewBody, { page }));
  return "";
}
