const en = {
  title: "Translation proposal",
  reference: "Listing reference",
  target: "Target language",
  inspect: "Inspect approved source",
  manual: "Open translation workbench",
  boundary:
    "Only the approved Bulgarian title and description are translated. Protected facts stay attached unchanged. Accepting this proposal records a review; saving a translation and its human language approval are separate actions.",
  facts: "Protected source facts",
  sourceUrl: "Canonical source URL",
  excluded:
    "Private addresses, document references and contact records are excluded. Inspect the exact text and factual guardrails before requesting a proposal.",
  caseWorkflow: "case.assist — inquiry summary, reply and next-action proposals",
  localeWorkflow: "locale.draft — approved Bulgarian listing translation proposal",
  intakeWorkflow: "intake.extract — unavailable; use the manual source and facts workbench",
  workflows: "Available workflows",
  changed:
    "The approved source changed. Reopen the translation workbench before requesting a fresh proposal.",
};
type Copy = Record<keyof typeof en, string>;
const bg: Copy = {
  title: "Предложение за превод",
  reference: "Номер на обявата",
  target: "Език на превода",
  inspect: "Преглед на одобрения източник",
  manual: "Към редактора за превод",
  boundary:
    "Превеждат се само одобрените български заглавие и описание. Защитените факти се запазват. Приемането записва преглед; записът на превод и човешкото езиково одобрение са отделни действия.",
  facts: "Защитени факти от източника",
  sourceUrl: "Каноничен адрес на източника",
  excluded:
    "Частни адреси, препратки към документи и контакти са изключени. Проверете точния текст и защитените факти преди заявка.",
  caseWorkflow: "case.assist — обобщение на запитване, отговор и следващо действие",
  localeWorkflow: "locale.draft — предложение за превод на одобрена българска обява",
  intakeWorkflow: "intake.extract — недостъпно; използвайте ръчния преглед на източници и факти",
  workflows: "Налични работни потоци",
  changed: "Одобреният източник е променен. Отворете редактора за превод преди нова заявка.",
};
const ru: Copy = {
  title: "Предложение перевода",
  reference: "Номер объявления",
  target: "Язык перевода",
  inspect: "Проверить одобренный источник",
  manual: "Открыть редактор перевода",
  boundary:
    "Переводятся только одобренные болгарские заголовок и описание. Защищённые факты сохраняются. Принятие записывает проверку; сохранение перевода и языковое одобрение человеком — отдельные действия.",
  facts: "Защищённые факты источника",
  sourceUrl: "Канонический URL источника",
  excluded:
    "Частные адреса, ссылки на документы и контакты исключены. Проверьте точный текст и защищённые факты перед запросом.",
  caseWorkflow: "case.assist — обобщение запроса, ответ и следующее действие",
  localeWorkflow: "locale.draft — предложение перевода одобренного болгарского объявления",
  intakeWorkflow: "intake.extract — недоступно; используйте ручную проверку источников и фактов",
  workflows: "Доступные рабочие процессы",
  changed: "Одобренный источник изменился. Откройте редактор перевода перед новым запросом.",
};
export const localeAiCopy = (locale: string): Copy =>
  locale === "bg" ? bg : locale === "ru" ? ru : en;
