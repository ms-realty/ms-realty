import fs from "node:fs";
import { createHash } from "node:crypto";
import { h } from "./react-static-html.mjs";
import { renderAdminShellBody } from "./react-admin-site.mjs";
import { renderAdminWorkspace } from "./admin-workflows.mjs";
import { workspaceWithOperator } from "./admin-payloads.mjs";
import { canAdminAccess, canAdminMutate } from "./admin-auth.mjs";
import { fromRoot } from "./paths.mjs";

export const SITE_PAGE_ADMIN_PATH = "/admin/site-pages/seller";
export const SITE_PAGE_API_PATH = "/api/admin/site-pages/seller";
const CLIENT_HASH = createHash("sha256").update(fs.readFileSync(fromRoot("public", "vendor", "ms-realty-site-page-editor.js"))).digest("hex").slice(0, 12);
const LOCALES = { bg: "Български", en: "English", de: "Deutsch", nl: "Nederlands", ru: "Русский", el: "Ελληνικά", he: "עברית" };

const COPY = {
  en: {
    title: "Seller page", intro: "Edit the page text, preview the saved draft, then review it before the owner publishes.",
    back: "Website content", language: "Page language", open: "Open", copy: "Page text", titleField: "Search title", description: "Search description", h1: "Page heading", body: "Introduction",
    save: "Save draft", preview: "Preview saved draft", submit: "Send for review", approve: "Approve reviewed text", publish: "Publish page", evidence: "Sources checked during review",
    contentReviewed: "I checked the text and its factual claims against these sources.", translationReviewed: "I checked this translation against the current Bulgarian text.", confirm: "Publish this exact reviewed text on the website.",
    baseline: "The form starts with the current website text. Saving creates a private draft.", live: "Open published page", savedCopy: "Saved text for review", source: "Published Bulgarian source", sourceMissing: "Publish the Bulgarian page before preparing this translation.", sourceChanged: "The Bulgarian source changed. Save an updated translation before reviewing it again.",
    ownerOnly: "The agency owner publishes approved text.", readOnly: "Your account can preview this page. An editor or owner can change it.",
    saving: "Saving…", saved: "Saved and read back from storage.", dirty: "You have unsaved changes. Save them before review or publication.",
    verify: "Verify your session in a new tab", verification: "Your session needs verification. Your text is still here. Complete the security check in a new tab, then try again.", invalid: "Check the required fields and use plain text within the field limits.", forbidden: "Your account cannot make this change. Your text is still here.",
    session: "Your session expired. Your text is still here. Sign in in a new tab, then try again.", signIn: "Sign in in a new tab", conflict: "This page changed elsewhere. Your text is still here. Open the saved version and compare before saving again.", current: "Open current saved version", failure: "The change could not be confirmed. Your text is still here. Check the saved version before retrying.", unavailable: "Page editing is temporarily unavailable. Try again when storage is available.",
    draft: "Draft", in_review: "Awaiting review", approved: "Approved for publication", published: "Published", noDraft: "No draft yet", privatePreview: "Private draft preview", returnToEditor: "Return to editor",
  },
  bg: {
    title: "Страница за продавачи", intro: "Редактирайте текста, прегледайте запазената чернова и я одобрете, преди собственикът да я публикува.",
    back: "Съдържание на сайта", language: "Език на страницата", open: "Отвори", copy: "Текст на страницата", titleField: "Заглавие за търсачки", description: "Описание за търсачки", h1: "Заглавие на страницата", body: "Въведение",
    save: "Запази чернова", preview: "Преглед на запазената чернова", submit: "Изпрати за преглед", approve: "Одобри проверения текст", publish: "Публикувай страницата", evidence: "Източници, проверени при прегледа",
    contentReviewed: "Проверих текста и твърденията в него спрямо тези източници.", translationReviewed: "Проверих превода спрямо актуалния български текст.", confirm: "Публикувай точно този одобрен текст на сайта.",
    baseline: "Формата съдържа текущия текст на сайта. Запазването създава лична чернова.", live: "Отвори публикуваната страница", savedCopy: "Запазен текст за преглед", source: "Публикуван български източник", sourceMissing: "Публикувайте българската страница, преди да подготвите този превод.", sourceChanged: "Българският източник е променен. Запазете актуализиран превод, преди да го одобрите отново.",
    ownerOnly: "Собственикът на агенцията публикува одобрения текст.", readOnly: "Вашият профил позволява преглед. Редактор или собственик може да промени текста.",
    saving: "Запазване…", saved: "Запазено и потвърдено чрез повторно прочитане.", dirty: "Имате незапазени промени. Запазете ги преди преглед или публикуване.",
    verify: "Потвърди сесията в нов раздел", verification: "Сесията изисква потвърждение. Текстът остава тук. Преминете проверката за сигурност в нов раздел и опитайте отново.", invalid: "Проверете задължителните полета. Използвайте обикновен текст в указаните ограничения.", forbidden: "Вашият профил не позволява тази промяна. Текстът остава тук.",
    session: "Сесията ви изтече. Текстът остава тук. Влезте в нов раздел и опитайте отново.", signIn: "Вход в нов раздел", conflict: "Страницата е променена другаде. Текстът остава тук. Отворете запазената версия и сравнете преди ново запазване.", current: "Отвори актуалната запазена версия", failure: "Промяната не е потвърдена. Текстът остава тук. Проверете запазената версия, преди да опитате отново.", unavailable: "Редактирането временно не е достъпно. Опитайте отново, когато хранилището е достъпно.",
    draft: "Чернова", in_review: "Очаква преглед", approved: "Одобрено за публикуване", published: "Публикувано", noDraft: "Все още няма чернова", privatePreview: "Личен преглед на черновата", returnToEditor: "Обратно към редактора",
  },
  ru: {
    title: "Страница для продавцов", intro: "Измените текст, просмотрите сохранённый черновик и проверьте его перед публикацией владельцем.",
    back: "Содержание сайта", language: "Язык страницы", open: "Открыть", copy: "Текст страницы", titleField: "Заголовок для поиска", description: "Описание для поиска", h1: "Заголовок страницы", body: "Введение",
    save: "Сохранить черновик", preview: "Просмотреть сохранённый черновик", submit: "Отправить на проверку", approve: "Одобрить проверенный текст", publish: "Опубликовать страницу", evidence: "Источники, проверенные при просмотре",
    contentReviewed: "Я проверил текст и фактические утверждения по этим источникам.", translationReviewed: "Я проверил перевод по актуальному болгарскому тексту.", confirm: "Опубликовать именно этот одобренный текст на сайте.",
    baseline: "В форме указан текущий текст сайта. Сохранение создаёт приватный черновик.", live: "Открыть опубликованную страницу", savedCopy: "Сохранённый текст для проверки", source: "Опубликованный болгарский источник", sourceMissing: "Опубликуйте болгарскую страницу перед подготовкой перевода.", sourceChanged: "Болгарский источник изменился. Сохраните обновлённый перевод перед новой проверкой.",
    ownerOnly: "Владелец агентства публикует одобренный текст.", readOnly: "Ваш профиль позволяет просмотр. Редактор или владелец может изменить текст.",
    saving: "Сохранение…", saved: "Сохранено и подтверждено повторным чтением.", dirty: "Есть несохранённые изменения. Сохраните их перед проверкой или публикацией.",
    verify: "Подтвердить сессию в новой вкладке", verification: "Сессия требует подтверждения. Текст остался здесь. Пройдите проверку безопасности в новой вкладке и повторите попытку.", invalid: "Проверьте обязательные поля. Используйте обычный текст в пределах ограничений полей.", forbidden: "Ваш профиль не позволяет это изменение. Текст остался здесь.",
    session: "Сессия истекла. Текст остался здесь. Войдите в новой вкладке и повторите попытку.", signIn: "Войти в новой вкладке", conflict: "Страница изменена в другом месте. Текст остался здесь. Откройте сохранённую версию и сравните перед сохранением.", current: "Открыть текущую сохранённую версию", failure: "Изменение не подтверждено. Текст остался здесь. Проверьте сохранённую версию перед повторной попыткой.", unavailable: "Редактирование временно недоступно. Повторите попытку, когда хранилище будет доступно.",
    draft: "Черновик", in_review: "Ожидает проверки", approved: "Одобрено к публикации", published: "Опубликовано", noDraft: "Черновика ещё нет", privatePreview: "Приватный просмотр черновика", returnToEditor: "Вернуться в редактор",
  },
};

export function sitePageAdminCopy(locale) { return COPY[locale] || COPY.bg; }
export function sitePageEditorUrl(interfaceLocale, contentLocale) {
  return `${SITE_PAGE_ADMIN_PATH}?${new URLSearchParams({ locale: interfaceLocale, contentLocale })}`;
}

export function sitePageAdminPayload({ registry, interfaceLocale, state, principal, content, source, publicPath, error = null, saved = false }) {
  const workspace = workspaceWithOperator(renderAdminWorkspace({ registry, requestedLocale: interfaceLocale }), principal);
  const ui = sitePageAdminCopy(workspace.locale);
  return { kind: "admin_site_page", status: error?.status || 200, locale: workspace.locale, lang: workspace.lang, dir: workspace.dir,
    path: SITE_PAGE_ADMIN_PATH, canonical: SITE_PAGE_ADMIN_PATH, indexable: false,
    metadata: { title: `${ui.title} | MS Realty`, description: ui.intro, robots: "noindex,nofollow" }, workspace,
    filters: { contentLocale: state.locale }, state, principal, content, source, publicPath, error, saved };
}

function hidden(name, value) { return h("input", { type: "hidden", name, value: value ?? "" }); }
function button(text, secondary = false, attrs = {}) { return h("button", { type: "submit", className: `mk-btn mk-btn--${secondary ? "secondary" : "primary"}`, ...attrs }, text); }
function field(name, text, value, max, textarea = false, locale) {
  const id = `site-page-${name}`;
  return h("label", { htmlFor: id }, h("span", null, text), h(textarea ? "textarea" : "input", { id, name, defaultValue: value,
    required: true, maxLength: max, ...(locale ? { lang: locale, dir: locale === "he" ? "rtl" : "ltr" } : {}), ...(textarea ? { rows: name === "intro" ? 7 : 3 } : { type: "text" }) }));
}

export function renderSitePageAdminBody(page) {
  const { state, principal, content } = page;
  const ui = sitePageAdminCopy(page.locale);
  const currentUrl = sitePageEditorUrl(page.locale, state.locale);
  const canEdit = !page.error?.blocked && canAdminMutate(principal) && canAdminAccess(principal, state.locale === "bg" ? "content:write" : "translations:write");
  const canReview = !page.error && canAdminMutate(principal) && canAdminAccess(principal, state.locale === "bg" ? "content:write" : "translations:publish");
  const canPublish = !page.error && canAdminMutate(principal) && canAdminAccess(principal, "administration:write");
  const sourceMissing = state.locale !== "bg" && !state.published_source_revision_id;
  const sourceChanged = state.draft && state.locale !== "bg" && state.draft.source_revision_id !== state.published_source_revision_id;
  const actionForm = (action, children) => h("form", { method: "POST", action: SITE_PAGE_API_PATH, className: "adm-form", "data-site-page-form": action },
    hidden("action", action), hidden("interfaceLocale", page.locale), hidden("contentLocale", state.locale), hidden("expectedVersion", state.version),
    hidden("revisionId", state.draft?.revision_id), hidden("contentHash", state.draft?.content_hash), ...children);
  const selection = state.draft ? new URLSearchParams({ locale: page.locale, contentLocale: state.locale, preview: "1", expectedVersion: String(state.version), revisionId: state.draft.revision_id, contentHash: state.draft.content_hash }) : null;
  const children = [
    h("header", { className: "crm-ph" }, h("div", null, h("h1", { className: "crm-ph__title" }, ui.title), h("p", { className: "crm-ph__sub" }, ui.intro)),
      h("a", { className: "mk-btn mk-btn--secondary", href: `/admin/approved-content?locale=${page.locale}` }, ui.back)),
    h("form", { method: "GET", action: SITE_PAGE_ADMIN_PATH, className: "adm-form" }, hidden("locale", page.locale),
      h("label", { htmlFor: "site-page-language" }, ui.language, h("select", { id: "site-page-language", name: "contentLocale" },
        ...Object.entries(LOCALES).map(([code, name]) => h("option", { key: code, value: code, selected: code === state.locale }, name)))), button(ui.open, true)),
    h("div", { role: "status", "aria-live": "polite", "data-site-page-feedback": "true", tabIndex: -1 },
      page.error ? page.error.message : page.saved ? ui.saved : state.draft ? ui[state.draft.status] : ui.noDraft),
    h("p", null, h("a", { href: "/admin/login", target: "_blank", rel: "noopener", hidden: true, "data-site-page-signin": "true" }, ui.signIn),
      h("a", { href: `/admin/settings?locale=${page.locale}#settings-security`, target: "_blank", rel: "noopener", hidden: true, "data-site-page-verify": "true" }, ui.verify),
      h("a", { href: currentUrl, target: "_blank", rel: "noopener", hidden: !page.error, "data-site-page-current": "true" }, ui.current)),
    h("p", { hidden: true, "data-site-page-dirty": "true" }, ui.dirty),
    sourceMissing || sourceChanged ? h("p", { role: "note" }, sourceMissing ? ui.sourceMissing : ui.sourceChanged) : null,
    !canEdit ? h("p", null, page.error?.unavailable ? ui.unavailable : ui.readOnly) : null,
    h("section", { className: "crm-panel" }, h("div", { className: "crm-panel__hd" }, h("h2", null, ui.copy)),
      actionForm("save", [hidden("sourceRevisionId", state.locale === "bg" ? "" : state.published_source_revision_id),
        h("fieldset", { className: "adm-form__group adm-form__group--editor", disabled: !canEdit || sourceMissing },
          h("legend", null, LOCALES[state.locale]), field("title", ui.titleField, content.title, 180, false, state.locale), field("description", ui.description, content.description, 320, true, state.locale),
          field("h1", ui.h1, content.h1, 180, false, state.locale), field("intro", ui.body, content.intro, 3000, true, state.locale)),
        !state.draft ? h("p", { className: "adm-form__lead" }, ui.baseline) : null,
        h("div", { className: "adm-form__actions" }, button(ui.save, false, { disabled: !canEdit || sourceMissing })),
      ])),
    state.draft ? h("section", { className: "crm-panel" }, h("div", { className: "crm-panel__hd" }, h("h2", null, ui.savedCopy),
      h("a", { className: "mk-btn mk-btn--secondary", href: `${SITE_PAGE_ADMIN_PATH}?${selection}`, target: "_blank", rel: "noopener" }, ui.preview)),
      h("p", { className: "adm-form__lead" }, ui[state.draft.status]),
      h("div", { className: "adm-form" },
        h("dl", { className: "adm-form__group adm-form__group--editor" }, ...["title", "description", "h1", "intro"].flatMap((name) => [h("dt", { key: `${name}-label` }, ui[{ title: "titleField", description: "description", h1: "h1", intro: "body" }[name]]), h("dd", { key: name, lang: state.locale, dir: state.locale === "he" ? "rtl" : "ltr" }, state.draft.content[name])]))),
      !sourceChanged && state.draft.status === "draft" && canEdit ? actionForm("submit", [h("div", { className: "adm-form__actions" }, button(ui.submit))]) : null,
      !sourceChanged && state.draft.status === "in_review" && canReview ? actionForm("approve", [
        h("fieldset", { className: "adm-form__group adm-form__group--editor" }, h("legend", null, ui.approve), field("evidenceRefs", ui.evidence, "", 5000, true),
          h("label", { className: "adm-check" }, h("input", { type: "checkbox", name: "contentReviewed", required: true }), h("span", null, ui.contentReviewed)),
          state.locale !== "bg" ? h("label", { className: "adm-check" }, h("input", { type: "checkbox", name: "translationReviewed", required: true }), h("span", null, ui.translationReviewed)) : null),
        h("div", { className: "adm-form__actions" }, button(ui.approve)),
      ]) : null,
      !sourceChanged && state.draft.status === "approved" && canPublish ? actionForm("publish", [
        h("label", { className: "adm-check" }, h("input", { type: "checkbox", name: "confirm", required: true }), h("span", null, ui.confirm)),
        h("div", { className: "adm-form__actions" }, button(ui.publish)),
      ]) : null,
      state.draft.status === "approved" && !canPublish ? h("p", { className: "adm-form__lead" }, ui.ownerOnly) : null,
    ) : null,
    page.source && state.locale !== "bg" ? h("details", { className: "adm-workbench-disclosure" }, h("summary", null, ui.source),
      h("dl", { className: "adm-workbench-disclosure__body" }, ...["title", "description", "h1", "intro"].flatMap((name) => [
        h("dt", { key: `${name}-label` }, ui[{ title: "titleField", description: "description", h1: "h1", intro: "body" }[name]]),
        h("dd", { key: name, lang: "bg" }, page.source.content[name]),
      ]))) : null,
    h("p", null, h("a", { href: page.publicPath, target: "_blank", rel: "noopener" }, ui.live)),
    h("script", { defer: true, src: `/vendor/ms-realty-site-page-editor.js?v=${CLIENT_HASH}` }),
  ];
  return renderAdminShellBody(page, { title: ui.title, mainAttrs: { "data-kind": "admin-site-page", "data-site-page-editor": "true", "data-page-version": state.version,
    "data-saving-message": ui.saving, "data-session-message": ui.session, "data-conflict-message": ui.conflict, "data-failure-message": ui.failure,
    "data-verification-message": ui.verification, "data-invalid-message": ui.invalid, "data-forbidden-message": ui.forbidden }, children });
}
