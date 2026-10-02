const en = {
  title: "Broker-note extraction proposal",
  boundary:
    "Select a saved private broker note. Butler proposes typed candidates with exact note quotes; accepting records review only. PDF/document extraction is unavailable. Facts, units, uncertainty and conflicts must be reviewed in the ordinary workbench.",
  manual: "Open inventory workbench",
  empty:
    "No bounded broker note is available. Save a private broker intake note and freeze the draft before selecting it here.",
  source: "Selected immutable broker note",
  excluded:
    "Known email, URL and international phone patterns are redacted without moving source positions. Inspect the remaining text; do not submit identity, financial or legal document material.",
  candidates: "Candidate facts — not approved facts",
  missing: "Missing evidence",
  provenance: "Source class: broker note",
  changed:
    "The selected source changed. Open the inventory workbench before requesting a fresh proposal.",
  inspect: "Inspect saved note",
  workflow: "intake.extract — selected broker-note candidates; PDF/document extraction unavailable",
};
type Copy = Record<keyof typeof en, string>;
const bg: Copy = {
  title: "Предложение за извличане от бележка",
  boundary:
    "Изберете запазена частна брокерска бележка. Butler предлага стойности с точни цитати; приемането записва само преглед. PDF/документи не се обработват. Факти, единици, несигурност и противоречия се преглеждат в обичайния редактор.",
  manual: "Към редактора на обявата",
  empty:
    "Няма подходяща запазена бележка. Запишете частна бележка и създайте неизменяема версия преди избор тук.",
  source: "Избрана неизменяема брокерска бележка",
  excluded:
    "Разпознатите имейли, URL и международни телефони са скрити без промяна на позициите. Проверете останалия текст; не изпращайте документи за самоличност, финанси или правни доказателства.",
  candidates: "Предложени стойности — неодобрени факти",
  missing: "Липсващи доказателства",
  provenance: "Вид източник: брокерска бележка",
  changed: "Избраният източник е променен. Отворете редактора преди нова заявка.",
  inspect: "Преглед на запазената бележка",
  workflow: "intake.extract — стойности от избрана брокерска бележка; PDF/документи недостъпни",
};
const ru: Copy = {
  title: "Предложение извлечения из заметки",
  boundary:
    "Выберите сохранённую частную заметку брокера. Butler предлагает значения с точными цитатами; принятие записывает только проверку. Обработка PDF/документов недоступна. Факты, единицы, неопределённость и противоречия проверяются в обычном редакторе.",
  manual: "Открыть редактор объявления",
  empty:
    "Нет подходящей сохранённой заметки. Сохраните частную заметку и создайте неизменяемую версию перед выбором здесь.",
  source: "Выбранная неизменяемая заметка брокера",
  excluded:
    "Известные форматы email, URL и международных телефонов скрыты без изменения позиций. Проверьте остальной текст; не отправляйте материалы о личности, финансах или юридические документы.",
  candidates: "Предложенные значения — не одобренные факты",
  missing: "Недостающие доказательства",
  provenance: "Класс источника: заметка брокера",
  changed: "Выбранный источник изменился. Откройте редактор перед новым запросом.",
  inspect: "Проверить сохранённую заметку",
  workflow: "intake.extract — значения из выбранной заметки брокера; PDF/документы недоступны",
};
export const intakeAiCopy = (locale: string): Copy =>
  locale === "bg" ? bg : locale === "ru" ? ru : en;
