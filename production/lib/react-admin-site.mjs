import { h, renderStaticElement } from "./react-static-html.mjs";
import { Icon } from "./ui/icons.mjs";
import { LOGO_ASPECT, LOGO_SRC_REVERSED } from "./ui/design-assets.mjs";

function adminCopy(page) {
  return page.workspace?.copy || {};
}

function label(copy, key, fallback) {
  return copy[key] || fallback;
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
    cmsContracts: "CMS договори",
    payloadCollections: "Payload колекции",
    listingQuality: "Качество на обявите",
    exportLaunchReadiness: "Изтегли готовността",
    approvableRedirects: "Пренасочвания за одобрение",
    oldUrl: "Стар URL",
    target: "Цел",
    locale: "Език",
    approval: "Одобрение",
    reviewer: "Проверяващ",
    reason: "Причина",
    approve301: "Одобри 301",
    reviewedSameContent: "Проверено пренасочване към същото съдържание.",
    importRedirectCsv: "Импортирай проверен CSV за пренасочвания",
    downloadPendingWorkbook: "Изтегли чакащата таблица",
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
    issues: "Проблеми",
    listing: "Обява",
    location: "Локация",
    publicPhotos: "Публични снимки",
    missingAlt: "Липсващ alt текст",
    reviewGatedMedia: "Медия за преглед",
    approvedRedirects: "Одобрени пренасочвания",
    source: "Източник",
    schema: "Схема",
    tour360: "360 обиколка",
    tourStatus: "Статус на обиколката",
    tourPanoramaUrl: "URL на панорамата",
    tourThumbnailUrl: "URL на миниатюрата",
    tourAccessibilityCaption: "Описание за достъпност",
    tourReviewer: "Проверяващ",
    tourFallbackGallery: "Резервна фотогалерия",
    tourApprovalNotice: "Одобряването публикува обиколката само след ръчен преглед.",
    tourApprovalConfirmation: "Потвърждавам, че панорамата, описанието и резервната галерия са прегледани.",
    tourApprovePublish: "Одобри и публикувай 360 обиколката",
    tourSaving: "Запазване...",
    tourSaved: "360 обиколката е одобрена.",
    tourSaveFailed: "360 обиколката не беше запазена.",
    skipToContent: "Към съдържанието",
    values: {
      website_listing_detail: "Запитване от обява", website_seller_valuation: "Заявка за оценка", website_viewing_request: "Заявка за оглед", website_contact_callback: "Заявка за обратно обаждане",
      email: "Имейл", phone: "Телефон", whatsapp: "WhatsApp", viber: "Viber",
    },
    statuses: {
      buyer: "Купувач", seller: "Продавач", pending: "В изчакване", ok: "В срок", ready: "Готово", blocked: "Блокирано", unknown: "Неизвестно",
      published: "Публикувано", approved: "Одобрено", stale: "Остаряло", missing: "Липсва", present: "Налично",
      available: "Налична", source_imported_review_required: "Внесена от източник - изисква преглед", review_required: "Изисква преглед", needs_panorama_upload: "Нужна е панорама",
      general: "Общо запитване", viewing: "Оглед", draft: "Чернова", ai_drafted: "AI чернова", human_edited: "Редактирано от човек", manager_escalation_required: "Нужна е ескалация към мениджър", reminder_required: "Напомняне за отговор", needs_reply: "Нужен отговор", open: "Отворено",
    },
    fields: { title: "Заглавие", h1: "Основно заглавие", description: "Описание", location: "Локация", property_type: "Тип имот", offer_type: "Тип оферта", price_eur: "Цена в EUR", bedrooms: "Спални" },
  },
  ru: {
    urls: "URL-адреса",
    reviewRequired: "Требует проверки",
    mappedListings: "Связанные объекты",
    deployablePreview: "Предпросмотр для публикации",
    missingDescriptions: "Нет описаний",
    mediaRows: "Строки медиа",
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
    cmsContracts: "Контракты CMS",
    payloadCollections: "Коллекции Payload",
    listingQuality: "Качество объектов",
    exportLaunchReadiness: "Скачать готовность",
    approvableRedirects: "Редиректы для одобрения",
    oldUrl: "Старый URL",
    target: "Цель",
    locale: "Язык",
    approval: "Одобрение",
    reviewer: "Проверяющий",
    reason: "Причина",
    approve301: "Одобрить 301",
    reviewedSameContent: "Проверенное перенаправление на тот же контент.",
    importRedirectCsv: "Импортировать проверенный CSV редиректов",
    downloadPendingWorkbook: "Скачать таблицу ожидания",
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
    issues: "Проблемы",
    listing: "Объект",
    location: "Локация",
    publicPhotos: "Публичные фото",
    missingAlt: "Нет alt-текста",
    reviewGatedMedia: "Медиа на проверке",
    approvedRedirects: "Одобренные редиректы",
    source: "Источник",
    schema: "Схема",
    tour360: "360 тур",
    tourStatus: "Статус тура",
    tourPanoramaUrl: "URL панорамы",
    tourThumbnailUrl: "URL миниатюры",
    tourAccessibilityCaption: "Описание для доступности",
    tourReviewer: "Проверяющий",
    tourFallbackGallery: "Резервная фотогалерея",
    tourApprovalNotice: "Одобрение публикует тур только после ручной проверки.",
    tourApprovalConfirmation: "Подтверждаю, что панорама, описание и резервная галерея проверены.",
    tourApprovePublish: "Одобрить и опубликовать 360 тур",
    tourSaving: "Сохранение...",
    tourSaved: "360 тур одобрен.",
    tourSaveFailed: "Не удалось сохранить 360 тур.",
    skipToContent: "К содержанию",
    values: {
      website_listing_detail: "Запрос со страницы объекта", website_seller_valuation: "Заявка на оценку", website_viewing_request: "Заявка на просмотр", website_contact_callback: "Заявка на обратный звонок",
      email: "Эл. почта", phone: "Телефон", whatsapp: "WhatsApp", viber: "Viber",
    },
    statuses: {
      buyer: "Покупатель", seller: "Продавец", pending: "Ожидание", ok: "В срок", ready: "Готово", blocked: "Заблокировано", unknown: "Неизвестно",
      published: "Опубликовано", approved: "Одобрено", stale: "Устарело", missing: "Отсутствует", present: "Есть",
      available: "Доступно", source_imported_review_required: "Импортировано из источника - нужна проверка", review_required: "Требует проверки", needs_panorama_upload: "Нужна панорама",
      general: "Общий запрос", viewing: "Просмотр", draft: "Черновик", ai_drafted: "Черновик AI", human_edited: "Отредактировано человеком", manager_escalation_required: "Нужна эскалация менеджеру", reminder_required: "Напоминание об ответе", needs_reply: "Нужен ответ", open: "Открыто",
    },
    fields: { title: "Название", h1: "Основной заголовок", description: "Описание", location: "Локация", property_type: "Тип объекта", offer_type: "Тип предложения", price_eur: "Цена в EUR", bedrooms: "Спальни" },
  },
  en: {
    urls: "URLs",
    reviewRequired: "Review required",
    mappedListings: "Mapped listings",
    deployablePreview: "Deployable preview",
    missingDescriptions: "Missing descriptions",
    mediaRows: "Media rows",
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
    cmsContracts: "CMS collection contracts",
    payloadCollections: "Payload collection configs",
    listingQuality: "Listing quality",
    exportLaunchReadiness: "Export launch readiness",
    approvableRedirects: "Approvable listing redirects",
    oldUrl: "Old URL",
    target: "Target",
    locale: "Locale",
    approval: "Approval",
    reviewer: "Reviewer",
    reason: "Reason",
    approve301: "Approve 301",
    reviewedSameContent: "Reviewed same-content route mapping.",
    importRedirectCsv: "Import reviewed redirect CSV",
    downloadPendingWorkbook: "Download pending workbook",
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
    issues: "Issues",
    listing: "Listing",
    location: "Location",
    publicPhotos: "Public photos",
    missingAlt: "Missing alt text",
    reviewGatedMedia: "Review-gated media",
    approvedRedirects: "Approved redirects",
    source: "Source",
    schema: "Schema",
    tour360: "360 tour",
    tourStatus: "Tour status",
    tourPanoramaUrl: "Panorama URL",
    tourThumbnailUrl: "Thumbnail URL",
    tourAccessibilityCaption: "Accessibility caption",
    tourReviewer: "Reviewer",
    tourFallbackGallery: "Fallback photo gallery",
    tourApprovalNotice: "Approval publishes this tour only after manual review.",
    tourApprovalConfirmation: "I confirm the panorama, caption, and fallback gallery have been reviewed.",
    tourApprovePublish: "Approve and publish 360 tour",
    tourSaving: "Saving...",
    tourSaved: "360 tour approved.",
    tourSaveFailed: "Could not save 360 tour.",
    skipToContent: "Skip to content",
    values: {
      website_listing_detail: "Listing inquiry", website_seller_valuation: "Seller valuation request", website_viewing_request: "Viewing request", website_contact_callback: "Callback request",
      email: "Email", phone: "Phone", whatsapp: "WhatsApp", viber: "Viber",
    },
    statuses: {
      buyer: "Buyer", seller: "Seller", pending: "Pending", ok: "On time", ready: "Ready", blocked: "Blocked", unknown: "Unknown",
      published: "Published", approved: "Approved", stale: "Stale", missing: "Missing", present: "Present",
      available: "Available", source_imported_review_required: "Imported from source - review required", review_required: "Review required", needs_panorama_upload: "Panorama required",
      general: "General inquiry", viewing: "Viewing", draft: "Draft", ai_drafted: "AI draft", human_edited: "Human edited", manager_escalation_required: "Manager escalation required", reminder_required: "Reply reminder", needs_reply: "Needs reply", open: "Open",
    },
    fields: { title: "Title", h1: "Primary heading", description: "Description", location: "Location", property_type: "Property type", offer_type: "Offer type", price_eur: "Price in EUR", bedrooms: "Bedrooms" },
  },
};

function workbenchCopy(page) {
  return ADMIN_UI_COPY[page.workspace?.locale] || ADMIN_UI_COPY.en;
}

function statusText(copy, value) {
  return copy.statuses[value] || valueText(copy, value);
}

function valueText(copy, value) {
  return copy.values?.[value] || String(value || "").replaceAll("_", " ");
}

function fieldText(copy, field) {
  return copy.fields[field] || String(field || "").replaceAll("_", " ");
}

function adminHref(path, page) {
  const locale = page.workspace?.locale;
  return locale && locale !== "en" ? `${path}?locale=${locale}` : path;
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

// Metric tiles that stay a real <dl> so the markup remains data-legible.
function StatGrid({ metrics }) {
  return h(
    "dl",
    { className: "adm-kpis" },
    ...metrics.map(([metricLabel, value, icon = "trending-up", tone = "ink"]) => {
      const palette = STAT_TONES[tone] || STAT_TONES.ink;
      return h(
        "div",
        { key: metricLabel, className: "crm-stat" },
        h(
          "div",
          { className: "crm-stat__top" },
          h("dt", { className: "crm-stat__label" }, metricLabel),
          h("span", { className: "crm-stat__ic", style: `background:${palette.bg};color:${palette.fg}` }, h(Icon, { name: icon, size: 19 })),
        ),
        h("dd", { className: "crm-stat__val" }, value),
      );
    }),
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

const NAV_ROUTES = [
  { id: "lead_inbox", module: "crm", path: "/admin/leads", icon: "inbox", kind: "admin_lead_inbox" },
  { id: "listing_editor", module: "cms", path: "/admin/listings/edit", icon: "building-2", kind: "admin_listing_editor" },
  { id: "migration_review", module: "launch", path: "/admin/migration/review", icon: "file-check", kind: "admin_migration_review" },
];

function Sidebar({ page }) {
  const copy = adminCopy(page);
  const modules = page.workspace?.modules || [];
  const screenLabel = (moduleId, screenId, fallback) => {
    const module = modules.find((entry) => entry.id === moduleId);
    return module?.screens?.find((screen) => screen.id === screenId)?.label || fallback;
  };
  const groups = [
    {
      label: modules.find((module) => module.id === "crm")?.label || "CRM",
      items: [
        {
          ...NAV_ROUTES[0],
          label: screenLabel("crm", "lead_inbox", "Lead inbox"),
          badge: page.kind === "admin_lead_inbox" ? page.summary?.leads : undefined,
        },
      ],
    },
    {
      label: modules.find((module) => module.id === "cms")?.label || "CMS",
      items: [{ ...NAV_ROUTES[1], label: screenLabel("cms", "listing_editor", "Listing editor") }],
    },
    {
      label: label(copy, "launchEvidence", "Launch"),
      items: [{ ...NAV_ROUTES[2], label: label(copy, "migrationReview", "Migration review") }],
    },
  ];
  return h(
    "aside",
    { className: "crm-sb" },
    h(
      "div",
      { className: "crm-sb__brand" },
      h(
        "a",
        { href: adminHref("/admin/leads", page), "aria-label": "MS Realty" },
        h("img", { src: LOGO_SRC_REVERSED, alt: "MS Realty", height: 30, width: Math.round(30 * LOGO_ASPECT) }),
      ),
    ),
    h(
      "nav",
      { className: "crm-sb__nav", "aria-label": page.workspace?.title || "Admin" },
      ...groups.flatMap((group) => [
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
    h(
      "nav",
      { className: "crm-seg adm-locales", "aria-label": label(copy, "language", "Language") },
      ...locales.map((code) =>
        h(
          "a",
          {
            key: code,
            href: code === "en" ? page.path : `${page.path}?locale=${code}`,
            "data-on": code === page.workspace?.locale ? "1" : "0",
            "aria-current": code === page.workspace?.locale ? "true" : undefined,
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

/* ============================================================
   Lead inbox (ui_kits/crm Dashboard + Messages patterns)
   ============================================================ */

function LeadInboxBody({ page }) {
  const copy = adminCopy(page);
  const ui = workbenchCopy(page);
  const leadSlaById = new Map((page.leadSla?.rows || []).map((row) => [row.lead_id, row]));
  const repliedLeadIds = new Set((page.replies || []).map((reply) => reply.lead_id || reply.leadId).filter(Boolean));
  const metrics = [
    [label(copy, "leads", "Leads"), page.summary.leads, "users", "sea"],
    [label(copy, "repliesQueued", "Replies queued"), page.summary.replies, "send", "ink"],
    [label(copy, "slaReminders", "SLA reminders"), page.summary.leadSlaReminders, "bell", "sun"],
    [label(copy, "managerEscalations", "Manager escalations"), page.summary.leadSlaManagerEscalations, "triangle-alert", "brick"],
    [label(copy, "languageRequests", "Language requests"), page.summary.languageRequests, "languages", "sand"],
    [label(copy, "viewings", "Viewings"), page.summary.viewings, "calendar-check", "success"],
    [label(copy, "savedSearches", "Saved searches"), page.summary.savedSearches, "star", "ink"],
    [label(copy, "sellerPipeline", "Seller pipeline"), page.summary.sellerPipeline, "landmark", "sand"],
  ];
  const title = page.workspace.modules.find((module) => module.id === "crm")?.primary_view || "Lead inbox";
  const leadColumns = {
    lead: label(copy, "lead", "Lead"),
    type: label(copy, "type", "Type"),
    source: label(copy, "source", "Source"),
    language: label(copy, "language", "Language"),
    contact: label(copy, "contact", "Contact"),
    sla: label(copy, "sla", "SLA"),
    escalationDue: label(copy, "escalationDue", "Escalation due"),
    reply: label(copy, "reply", "Reply"),
  };
  const slaTone = (status) => (status === "ok" ? "success" : status?.includes("escalation") ? "brick" : status === "pending" ? "sun" : "sun");
  return adminShell(page, {
    title,
    mainAttrs: {
      "data-kind": "admin-lead-inbox",
      "data-react-admin-ui": "lead-inbox",
      "data-admin-workbench": "crm",
      "data-inbox-layout": "list-detail-action",
      "data-lead-count": page.summary.leads,
      "data-sla-reminders": page.summary.leadSlaReminders,
      "data-admin-locale": page.workspace.locale,
      "data-interface-locales": page.workspace.interface_locales.join(","),
    },
    children: [
      h(PageHeader, { title, subtitle: page.metadata?.description }),
      h(StatGrid, { metrics }),
      h(
        "nav",
        { className: "crm-seg adm-lead-tabs", "aria-label": label(copy, "leadQueues", "Lead queues"), "data-lead-queue-tabs": "true" },
        h("button", { type: "button", "data-lead-filter": "all", "data-on": "1" }, label(copy, "all", "All")),
        h("button", { type: "button", "data-lead-filter": "needs_reply", "data-on": "0" }, label(copy, "needsReply", "Needs reply")),
        h("button", { type: "button", "data-lead-filter": "sla", "data-on": "0" }, label(copy, "sla", "SLA")),
      ),
      h(
        Panel,
        { title: label(copy, "crmLeads", "CRM leads"), "aria-label": label(copy, "crmLeads", "CRM leads") },
        h(
          "div",
          { className: "adm-scroll-x" },
          h(
            "table",
            { className: "crm-tbl" },
            h(
              "thead",
              null,
              h(
                "tr",
                null,
                h("th", { scope: "col" }, leadColumns.lead),
                h("th", { scope: "col" }, leadColumns.type),
                h("th", { scope: "col" }, leadColumns.source),
                h("th", { scope: "col" }, leadColumns.language),
                h("th", { scope: "col" }, leadColumns.contact),
                h("th", { scope: "col" }, leadColumns.sla),
                h("th", { scope: "col" }, leadColumns.escalationDue),
                h("th", { scope: "col" }, leadColumns.reply),
              ),
            ),
            h(
              "tbody",
              null,
              ...page.leads.map((lead) => {
                const leadSla = leadSlaById.get(lead.lead_id);
                const slaStatus = leadSla?.status || "pending";
                const brokerId = lead.broker_assignment?.broker_id || "";
                const leadContext = [lead.listing_reference, lead.property?.location].filter(Boolean).join(" / ");
                return h(
                  "tr",
                  {
                    key: lead.lead_id,
                    "data-lead-row": "true",
                    "data-lead-id": lead.lead_id,
                    "data-lead-type": lead.lead_type,
                    "data-original-language": lead.original_language,
                    "data-admin-locale": lead.admin_locale,
                    "data-contact-preference": lead.contact_preference,
                    "data-broker-assignment": brokerId,
                    "data-lead-replied": repliedLeadIds.has(lead.lead_id) ? "true" : "false",
                  },
                  h(
                    "td",
                    { "data-lead-column": "lead", "data-label": leadColumns.lead },
                    h(
                      "div",
                      { className: "adm-lead-identity" },
                      h("code", { className: "crm-mono" }, lead.lead_id),
                      leadContext ? h("small", { className: "adm-lead-context", "data-lead-context": "true" }, leadContext) : null,
                    ),
                  ),
                  h("td", { "data-lead-column": "type", "data-label": leadColumns.type }, h(StatusPill, { tone: lead.lead_type === "seller" ? "sand" : "sea" }, statusText(ui, lead.lead_type))),
                  h("td", { className: "crm-tbl__muted", "data-lead-column": "source", "data-label": leadColumns.source }, valueText(ui, lead.source)),
                  h("td", { "data-lead-column": "language", "data-label": leadColumns.language }, h("span", { className: "crm-lang" }, `${lead.original_language} -> ${lead.admin_locale}`)),
                  h("td", { className: "crm-tbl__muted", "data-lead-column": "contact", "data-label": leadColumns.contact }, valueText(ui, lead.contact_preference)),
                  h("td", { "data-sla-status": slaStatus, "data-lead-column": "sla", "data-label": leadColumns.sla }, h(StatusPill, { tone: slaTone(slaStatus) }, statusText(ui, slaStatus))),
                  h("td", { className: "crm-tbl__muted crm-mono", "data-lead-column": "escalation_due", "data-label": leadColumns.escalationDue }, leadSla?.manager_escalation_due_at || ""),
                  h(
                    "td",
                    { className: "adm-reply-cell", "data-lead-column": "reply", "data-label": leadColumns.reply },
                    h(
                      "form",
                      {
                        method: "post",
                        action: "/api/admin/replies/draft",
                        className: "adm-draft-form",
                        "data-hermes-draft-request": "true",
                        "data-hermes-draft-endpoint": "/api/admin/replies/draft",
                        "data-original-language": lead.original_language,
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
                      { className: "adm-reply" },
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
                        },
                        h("input", { type: "hidden", name: "leadId", defaultValue: lead.lead_id }),
                        h("input", { type: "hidden", name: "language", defaultValue: lead.original_language }),
                        h("input", { type: "hidden", name: "approved", defaultValue: "true" }),
                        h(
                          "label",
                          { className: "adm-check", "data-show-original-toggle": "true" },
                          h("input", { type: "checkbox", name: "showOriginal" }),
                          ` ${label(copy, "showOriginal", "Show original")}`,
                        ),
                        h("label", null, label(copy, "hermesDraftText", "Hermes draft text"), h("textarea", { name: "hermesDraftText" })),
                        h("label", null, label(copy, "reviewer", "Reviewer"), h("input", { name: "reviewer", required: true, autoComplete: "name" })),
                        h("label", null, label(copy, "reviewedReply", "Reviewed reply"), h("textarea", { name: "reviewedReply", required: true })),
                        h(
                          "button",
                          { type: "submit", className: "mk-btn mk-btn--primary mk-btn--sm" },
                          h("span", null, label(copy, "queueReply", "Queue reply")),
                        ),
                      ),
                    ),
                  ),
                );
              }),
            ),
          ),
        ),
      ),
      h(
        Panel,
        { title: label(copy, "languageRequests", "Language requests"), "aria-label": label(copy, "languageRequests", "Language requests") },
        h(
          "ul",
          { className: "adm-lang-requests" },
          ...page.languageRequests.map((request) =>
            h(
              "li",
              { key: `${request.requested_locale}-${request.fallback_locale}` },
              h(Icon, { name: "languages", size: 16 }),
              h("span", { className: "crm-lang" }, `${request.requested_locale} -> ${request.fallback_locale}`),
            ),
          ),
        ),
      ),
    ],
  });
}

/* ============================================================
   Listing editor (ui_kits/crm Listings/LeadDetail patterns)
   ============================================================ */

function editorInputFor(field, value) {
  const shared = { name: field, defaultValue: value, "data-editor-field": field };
  if (field === "description") return h("textarea", { ...shared, rows: 6 });
  if (field === "price_eur") return h("input", { ...shared, inputMode: "decimal" });
  if (field === "bedrooms") return h("input", { ...shared, inputMode: "numeric" });
  return h("input", shared);
}

function editorField(copy, ui, field, value) {
  return h("label", { key: field }, fieldText(ui, field), editorInputFor(field, value));
}

function editorFieldGroup(copy, ui, title, fields, facts) {
  return h(
    "fieldset",
    { className: "adm-form__group" },
    h("legend", null, title),
    ...fields.map((field) => editorField(copy, ui, field, facts[field] ?? "")),
  );
}

function ListingEditorBody({ page }) {
  const copy = adminCopy(page);
  const ui = workbenchCopy(page);
  const facts = page.listing.facts || {};
  const tour = page.listing.tour || {};
  const tourPublished = tour.is_public === true;
  const tourStatus = tourPublished ? "approved" : tour.review_status || "review_required";
  const fallbackGalleryCount = (tour.fallback_gallery || []).length;
  const staleTranslations = page.translationTasks.filter((task) => task.status === "stale");
  const title = label(copy, "propertyEditor", "Property editor");
  const contentFields = page.editableFields.filter((field) => ["title", "h1", "description"].includes(field));
  const termsFields = page.editableFields.filter((field) => ["price_eur", "price_on_request"].includes(field));
  const detailFields = page.editableFields.filter((field) => !contentFields.includes(field) && !termsFields.includes(field));
  return adminShell(page, {
    title,
    mainAttrs: {
      "data-kind": "admin-listing-editor",
      "data-react-admin-ui": "listing-editor",
      "data-admin-workbench": "cms",
      "data-editor-layout": "facts-translations-quality",
      "data-cms-status": page.listing.cms_status,
      "data-schema-ready": page.listing.seo?.schema_present ? "true" : "false",
      "data-stale-translation-count": staleTranslations.length,
      "data-listing-id": page.listing.id,
      "data-admin-locale": page.workspace.locale,
    },
    children: [
      h(PageHeader, {
        title,
        subtitle: `${page.listing.source_domain} · ${page.listing.source_locale} · ${page.listing.id}`,
      }),
      h(
        "nav",
        { className: "mk-tabs mk-tabs--underline adm-editor-tabs", "aria-label": label(copy, "editorSections", "Editor sections"), "data-editor-tabs": "true" },
        h("a", { className: "mk-tab", href: "#listing-facts", "data-editor-tab": "facts", "aria-label": label(copy, "facts", "Facts"), title: label(copy, "facts", "Facts") }, h(Icon, { name: "pencil", size: 16 }), h("span", { className: "adm-editor-tab__label" }, label(copy, "facts", "Facts"))),
        h("a", { className: "mk-tab", href: "#listing-translations", "data-editor-tab": "translations", "aria-label": label(copy, "translations", "Translations"), title: label(copy, "translations", "Translations") }, h(Icon, { name: "languages", size: 16 }), h("span", { className: "adm-editor-tab__label" }, label(copy, "translations", "Translations"))),
        h("a", { className: "mk-tab", href: "#listing-media", "data-editor-tab": "media", "aria-label": label(copy, "media", "Media"), title: label(copy, "media", "Media") }, h(Icon, { name: "camera", size: 16 }), h("span", { className: "adm-editor-tab__label" }, label(copy, "media", "Media"))),
        h("a", { className: "mk-tab", href: "#listing-quality", "data-editor-tab": "quality", "aria-label": label(copy, "quality", "Quality"), title: label(copy, "quality", "Quality") }, h(Icon, { name: "shield-check", size: 16 }), h("span", { className: "adm-editor-tab__label" }, label(copy, "quality", "Quality"))),
      ),
      h(
        Panel,
        { title: label(copy, "facts", "Facts") },
        h(
          "form",
          { id: "listing-facts", method: "post", action: "/api/admin/listings/edit", className: "adm-form", "data-editor-form": "listing", "data-editor-panel": "facts" },
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
                autoComplete: "name",
                placeholder: label(copy, "editorNamePlaceholder", "Editor name"),
                "data-editor-name": "true",
              }),
            ),
          ),
          editorFieldGroup(copy, ui, label(copy, "sourceContent", "Source content"), contentFields, facts),
          editorFieldGroup(copy, ui, label(copy, "propertyDetails", "Property details"), detailFields, facts),
          editorFieldGroup(copy, ui, label(copy, "commercialTerms", "Commercial terms"), termsFields, facts),
          h(
            "div",
            { className: "adm-form__actions" },
            h("button", { type: "submit", className: "mk-btn mk-btn--primary mk-btn--md" }, h("span", null, label(copy, "saveSourceEdit", "Save source edit"))),
          ),
        ),
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
        h(
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
            ui.tourPanoramaUrl,
            h("input", {
              type: "url",
              name: "panoramaUrl",
              required: true,
              inputMode: "url",
              autoComplete: "url",
              pattern: "https://.*",
              placeholder: "https://cdn.example.test/tours/panorama.jpg",
              defaultValue: tour.panorama_url || "",
              "data-tour-panorama-url": "true",
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
              placeholder: "https://cdn.example.test/tours/panorama-thumb.jpg",
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
        ),
      ),
      h(
        Panel,
        { title: label(copy, "qualityStatus", "Quality"), id: "listing-quality", "aria-label": label(copy, "qualityStatus", "Quality"), "data-quality-panel": "true" },
        h(StatGrid, {
          metrics: [
            [label(copy, "qualityStatus", "CMS status"), statusText(ui, page.listing.cms_status), "file-check", PILL_TONES[page.listing.cms_status] || "ink"],
            [ui.schema, statusText(ui, page.listing.seo?.schema_present ? "present" : "missing"), "check-circle-2", page.listing.seo?.schema_present ? "success" : "brick"],
          ],
        }),
      ),
    ],
  });
}

/* ============================================================
   Migration review (launch workbench)
   ============================================================ */

function MigrationReviewBody({ page }) {
  const copy = adminCopy(page);
  const ui = workbenchCopy(page);
  const gaps = page.dashboard.metadata_gaps || {};
  const metrics = [
    [ui.urls, page.routeMap.total, "link", "ink"],
    [ui.reviewRequired, page.routeMap.reviewRequired, "eye", "sun"],
    [ui.mappedListings, page.routeMap.mappedListings, "building-2", "sea"],
    [ui.deployablePreview, page.deployablePreview.length, "upload", "success"],
    [ui.missingDescriptions, gaps.missing_description, "file-text", "brick"],
    [ui.mediaRows, page.dashboard.media_reconciliation?.media_rows, "camera", "sand"],
  ];
  const seoSources = ["search_console", "yandex_webmaster", "backlinks"];
  const launchBlockers = page.launchBlockers?.blockers || [];
  const launchStatus = page.launchBlockers?.status || "unknown";
  const launchActionCount = (page.launchBlockers?.blocked_gates || []).reduce(
    (count, gate) => count + (gate.next_actions || []).length,
    0,
  );
  const title = label(copy, "migrationReview", "Migration review");
  const evidenceLinks = [
    [page.launchReadinessEndpoint, ui.launchReadiness],
    [page.launchInputChecklistEndpoint, ui.launchInputChecklist],
    [page.preflightReportsEndpoint, ui.preflightReports],
    [page.seoPreflightEndpoint, ui.seoPreflight],
    [page.liveServicesEndpoint, ui.liveServices],
    [page.liveServiceProvisioningEndpoint, ui.liveProvisioning],
    [page.payloadRuntimeEndpoint, ui.payloadRuntime],
    [page.payloadRuntimeBootstrapEndpoint, ui.payloadBootstrap],
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
      "data-launch-readiness-export-endpoint": page.launchReadinessExportEndpoint,
      "data-launch-input-checklist-endpoint": page.launchInputChecklistEndpoint,
      "data-preflight-reports-endpoint": page.preflightReportsEndpoint,
      "data-seo-preflight-endpoint": page.seoPreflightEndpoint,
      "data-live-services-endpoint": page.liveServicesEndpoint,
      "data-live-service-provisioning-endpoint": page.liveServiceProvisioningEndpoint,
      "data-live-service-provisioning-import-endpoint": page.liveServiceProvisioningImportEndpoint,
      "data-payload-runtime-endpoint": page.payloadRuntimeEndpoint,
      "data-payload-runtime-bootstrap-endpoint": page.payloadRuntimeBootstrapEndpoint,
      "data-cms-collections-endpoint": page.cmsCollectionsEndpoint,
      "data-payload-collections-endpoint": page.payloadCollectionsEndpoint,
      "data-listing-quality-endpoint": page.listingQualityEndpoint,
    },
    children: [
      h(PageHeader, { title, subtitle: page.metadata?.description }),
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
            launchBlockers.length ? `${launchBlockers.join(", ")} · ${launchActionCount} ${ui.nextActions}` : ui.noLaunchBlockers,
          ),
        ),
      ),
      h(StatGrid, { metrics }),
      h(
        Panel,
        { title: label(copy, "launchEvidence", "Launch evidence") },
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
      ),
      h(
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
      ),
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
          "p",
          { className: "adm-note" },
          h("a", { href: page.redirectApprovalImport.pendingWorkbookEndpoint }, ui.downloadPendingWorkbook),
        ),
        h(
          "form",
          { method: "post", action: page.redirectApprovalImport.endpoint, className: "adm-csv-form" },
          h("textarea", { name: "csv", rows: "5", required: true }),
          h("button", { type: "submit", className: "mk-btn mk-btn--primary mk-btn--sm" }, h(Icon, { name: "upload", size: 16 }), h("span", null, ui.importCsv)),
        ),
        h(
          "form",
          { method: "post", action: page.redirectApprovalImport.exportEndpoint, className: "adm-inline-form" },
          h("button", { type: "submit", className: "mk-btn mk-btn--secondary mk-btn--sm" }, h(Icon, { name: "download", size: 16 }), h("span", null, ui.exportRedirects)),
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
              ` ${status.status} · ${status.matched_rows} / ${status.row_count} `,
              h("a", { href: `${page.seoEvidence.templateEndpoint}?source=${source}` }, ui.csvTemplate),
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
          h("textarea", { name: "csv", rows: "5", required: true }),
          h("button", { type: "submit", className: "mk-btn mk-btn--primary mk-btn--sm" }, h(Icon, { name: "upload", size: 16 }), h("span", null, ui.importSeoCsv)),
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
          h("textarea", { name: "csv", rows: "5", required: true }),
          h("button", { type: "submit", className: "mk-btn mk-btn--primary mk-btn--sm" }, h(Icon, { name: "upload", size: 16 }), h("span", null, ui.importQualityCsv)),
        ),
        h("p", { className: "adm-note" }, `${ui.issues}: ${JSON.stringify(page.listingQuality?.summary?.issue_counts || {})}`),
        h(
          "div",
          { className: "adm-scroll-x" },
          h(
            "table",
            { className: "crm-tbl" },
            h(
              "thead",
              null,
              h(
                "tr",
                null,
                h("th", null, ui.listing),
                h("th", null, ui.locale),
                h("th", null, ui.location),
                h("th", null, ui.issues),
                h("th", null, ui.publicPhotos),
                h("th", null, ui.missingAlt),
                h("th", null, ui.reviewGatedMedia),
              ),
            ),
            h(
              "tbody",
              null,
              ...(page.listingQuality?.rows || []).map((row) =>
                h(
                  "tr",
                  { key: row.listing_id, "data-quality-listing": "true" },
                  h("td", null, h("a", { className: "crm-tbl__primary", href: row.editor_path }, row.listing_id)),
                  h("td", null, h("span", { className: "crm-lang" }, row.source_locale)),
                  h("td", { className: "crm-tbl__muted" }, row.location || statusText(ui, "missing")),
                  h("td", null, row.issues.join(", ")),
                  h("td", { className: "adm-num" }, row.public_gallery_assets),
                  h("td", { className: "adm-num" }, row.missing_alt_text_assets),
                  h("td", { className: "adm-num" }, row.review_gated_assets),
                ),
              ),
            ),
          ),
        ),
      ),
      h(
        Panel,
        { title: ui.approvedRedirects, "aria-label": ui.approvedRedirects },
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
    ],
  });
}

export function renderReactAdminBody(page) {
  if (page.kind === "admin_lead_inbox") return renderStaticElement(h(LeadInboxBody, { page }));
  if (page.kind === "admin_listing_editor") return renderStaticElement(h(ListingEditorBody, { page }));
  if (page.kind === "admin_migration_review") return renderStaticElement(h(MigrationReviewBody, { page }));
  return "";
}
