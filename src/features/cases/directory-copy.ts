// O04 deals index copy. Private workspace copy; BG/RU drafts need human language review before
// catalog adoption, like the rest of src/features/deals.
import { workflowLabel } from "@/i18n/workflow-labels";
import { caseCopy } from "./copy";
import { inquiryLinkCopy } from "./inquiry-link-copy";

const en = {
  instruction: "Find a deal, check its next action, and open it to continue the work.",
  search: "Search",
  searchHint: "Deal number, purpose or linked party",
  apply: "Show",
  list: "Deal list",
  serviceIntake: "Service consultation",
  count: "Deals: {n}",
  pageCount: "On this page: {n}",
  ordering: "Most recent accessible activity first. Private edits do not reorder restricted deals.",
  shortened: "Text filters use up to {n} characters; the rest was left out.",
  scope: "Deal scope",
  scopes: { all: "All", mine: "Mine", needs: "Needs action" },
  scopeHint: "Only deals you can access are included in the list and its count.",
  mineHint: "Deals where you are the accepted accountable broker.",
  needsHint:
    "Unanswered requirements, unscheduled or due next actions, and waiting or paused reviews that are due. Private work is included only when you can read it.",
  filters: "Filters",
  any: "Any",
  columns: {
    purpose: "Purpose",
    party: "Party",
    kind: "Type",
    stage: "Stage",
    disposition: "Disposition",
    owner: "Accountable broker",
    nextAction: "Next action",
  },
  dispositions: { active: "Active", paused: "Paused", closed: "Closed" },
  ownerMe: "Me",
  unassigned: "No accepted broker",
  selectedOwner: "Selected broker",
  nextActionState: "Next action status",
  actionStates: {
    none: "No active action",
    restricted: "Internal action unavailable",
    unscheduled: "Needs a due date",
    scheduled: "Scheduled",
    due: "Action due",
    waiting: "Waiting",
    review_due: "Review due",
  },
  attentionReasons: {
    requirements_unknown: "Requirements need clarification",
    next_action_unscheduled: "Next action needs a due date",
    next_action_due: "Next action is due",
    waiting_review_due: "Waiting condition needs review",
    paused_review_due: "Paused deal needs review",
  },
  noParty: "No linked party",
  noAction: "No next action recorded",
  waitingOn: "Waiting on",
  dueAt: "Due",
  reviewAt: "Review",
  rowsPerPage: "Deals per page",
  pagination: "Deal pages",
  nextPage: "Next page",
  firstPage: "Back to the first page",
  openWaiting: "Open a deal needing action on this page",
  partyScope: "Limited to the selected party relationship.",
  invalidChoice: "Unsupported choice",
  invalidFilters: "Some filters are not valid.",
  invalidFiltersDetail: "Choose supported values and show the list again, or clear the filters.",
  invalidPage: "This page link is no longer valid.",
  invalidPageDetail: "Return to the first page with the same scope and filters.",
  privateUnavailable: "These private filters are no longer available.",
  legacySearch: "Apply this search to continue.",
  legacySearchDetail:
    "The search is kept in the field. Select Show to apply it privately before using scopes and pages.",
  privateUnavailableDetail:
    "They belong to the session and browser where they were applied. Clear the filters and apply them again.",
  pageEmpty: "There are no deals left on this page.",
  pageEmptyDetail: "The list has changed. Return to the first page to see its current matches.",
  empty: "No deals are available to you.",
  emptyDetail: "Deals you can access appear here. A new deal is created from an inquiry.",
  inquiries: "Open inquiries",
  noMatch: "No deal matches these filters.",
  clear: "Clear filters",
  noMine: "No deals in this scope are assigned to you.",
  noNeeds: "No deals in this scope need action.",
  showAll: "Show all accessible deals",
  failed: "The deal list could not be loaded.",
  failedDetail: "This does not mean there are no deals. Try again in a moment.",
  retry: "Try again",
  // Same words as the staff rail item (messages/staff/*/workspace.json "moreTools").
  moreTools: "More tools",
};
type Copy = typeof en;

const bg: Copy = {
  instruction:
    "Намерете сделка, проверете следващото действие и я отворете, за да продължите работата.",
  search: "Търсене",
  searchHint: "Номер, цел на сделката или свързано лице",
  apply: "Покажете",
  list: "Списък със сделки",
  serviceIntake: "Консултация за услуга",
  count: "Сделки: {n}",
  pageCount: "На тази страница: {n}",
  ordering:
    "Първо е най-скорошната достъпна дейност. Поверителните промени не пренареждат сделките с ограничен достъп.",
  shortened: "Текстовите филтри използват до {n} знака; останалото е пропуснато.",
  scope: "Обхват на сделките",
  scopes: { all: "Всички", mine: "Моите", needs: "За действие" },
  scopeHint: "Списъкът и броят включват само сделките, до които имате достъп.",
  mineHint: "Сделки, по които сте приетият отговорен брокер.",
  needsHint:
    "Неуточнени изисквания, следващи действия без срок или с настъпил срок и изчакващи или паузирани сделки за преглед. Поверителната работа се включва само ако имате достъп до нея.",
  filters: "Филтри",
  any: "Всички",
  columns: {
    purpose: "Цел",
    party: "Лице",
    kind: "Вид",
    stage: "Етап",
    disposition: "Състояние",
    owner: "Отговорен брокер",
    nextAction: "Следващо действие",
  },
  dispositions: { active: "Активна", paused: "На пауза", closed: "Приключена" },
  ownerMe: "Аз",
  unassigned: "Без приет брокер",
  selectedOwner: "Избран брокер",
  nextActionState: "Статус на следващото действие",
  actionStates: {
    none: "Няма активно действие",
    restricted: "Вътрешното действие не е достъпно",
    unscheduled: "Нужен е срок",
    scheduled: "Със срок",
    due: "Настъпил срок за действие",
    waiting: "Изчакване",
    review_due: "Време за преглед",
  },
  attentionReasons: {
    requirements_unknown: "Изискванията се нуждаят от уточнение",
    next_action_unscheduled: "Следващото действие се нуждае от срок",
    next_action_due: "Срокът за следващото действие е настъпил",
    waiting_review_due: "Условието за изчакване се нуждае от преглед",
    paused_review_due: "Паузираната сделка се нуждае от преглед",
  },
  noParty: "Няма свързано лице",
  noAction: "Няма записано следващо действие",
  waitingOn: "Изчаква се",
  dueAt: "Срок",
  reviewAt: "Преглед",
  rowsPerPage: "Сделки на страница",
  pagination: "Страници със сделки",
  nextPage: "Следваща страница",
  firstPage: "Към първата страница",
  openWaiting: "Отворете сделка за действие от тази страница",
  partyScope: "Ограничено до връзката с избраното лице.",
  invalidChoice: "Неподдържан избор",
  invalidFilters: "Някои филтри са невалидни.",
  invalidFiltersDetail:
    "Изберете поддържани стойности и покажете списъка отново или изчистете филтрите.",
  invalidPage: "Тази връзка към страница вече е невалидна.",
  invalidPageDetail: "Върнете се на първата страница със същия обхват и филтри.",
  privateUnavailable: "Тези частни филтри вече не са достъпни.",
  legacySearch: "Приложете това търсене, за да продължите.",
  legacySearchDetail:
    "Търсенето е запазено в полето. Изберете „Покажете“, за да го приложите частно, преди да използвате обхватите и страниците.",
  privateUnavailableDetail:
    "Те принадлежат на сесията и браузъра, в които са приложени. Изчистете ги и ги приложете отново.",
  pageEmpty: "На тази страница вече няма сделки.",
  pageEmptyDetail: "Списъкът е променен. Върнете се на първата страница за текущите резултати.",
  empty: "Няма достъпни за Вас сделки.",
  emptyDetail:
    "Тук се показват сделките, до които имате достъп. Нова сделка се създава от запитване.",
  inquiries: "Към запитванията",
  noMatch: "Няма сделка, която съвпада с филтрите.",
  clear: "Изчистете филтрите",
  noMine: "Няма сделки в този обхват, възложени на Вас.",
  noNeeds: "Няма сделки в този обхват, които изискват действие.",
  showAll: "Покажете всички достъпни сделки",
  failed: "Списъкът със сделки не можа да се зареди.",
  failedDetail: "Това не означава, че няма сделки. Опитайте отново след малко.",
  retry: "Опитайте отново",
  moreTools: "Още инструменти",
};

const ru: Copy = {
  instruction: "Найдите сделку, проверьте следующее действие и откройте её для продолжения работы.",
  search: "Поиск",
  searchHint: "Номер, цель сделки или связанное лицо",
  apply: "Показать",
  list: "Список сделок",
  serviceIntake: "Консультация по услуге",
  count: "Всего сделок: {n}",
  pageCount: "На этой странице: {n}",
  ordering:
    "Сначала последняя доступная активность. Закрытые для Вас изменения не меняют порядок сделок.",
  shortened: "Текстовые фильтры учитывают до {n} символов; остальное пропущено.",
  scope: "Область сделок",
  scopes: { all: "Все", mine: "Мои", needs: "Требуют действия" },
  scopeHint: "В список и его количество входят только доступные Вам сделки.",
  mineHint: "Сделки, где Вы — принявший ответственность брокер.",
  needsHint:
    "Неуточнённые требования, следующие действия без срока или с наступившим сроком и ожидающие или приостановленные сделки, требующие проверки. Внутренняя работа учитывается только при доступе к ней.",
  filters: "Фильтры",
  any: "Все",
  columns: {
    purpose: "Цель",
    party: "Лицо",
    kind: "Тип",
    stage: "Этап",
    disposition: "Состояние",
    owner: "Ответственный брокер",
    nextAction: "Следующее действие",
  },
  dispositions: { active: "Активна", paused: "Приостановлена", closed: "Закрыта" },
  ownerMe: "Я",
  unassigned: "Без принявшего ответственность брокера",
  selectedOwner: "Выбранный брокер",
  nextActionState: "Статус следующего действия",
  actionStates: {
    none: "Нет активного действия",
    restricted: "Внутреннее действие недоступно",
    unscheduled: "Нужен срок",
    scheduled: "Срок указан",
    due: "Наступил срок действия",
    waiting: "Ожидание",
    review_due: "Требуется проверка",
  },
  attentionReasons: {
    requirements_unknown: "Требования нужно уточнить",
    next_action_unscheduled: "Следующему действию нужен срок",
    next_action_due: "Наступил срок следующего действия",
    waiting_review_due: "Нужно проверить условие ожидания",
    paused_review_due: "Нужно проверить приостановленную сделку",
  },
  noParty: "Нет связанного лица",
  noAction: "Следующее действие не записано",
  waitingOn: "Ожидается",
  dueAt: "Срок",
  reviewAt: "Проверка",
  rowsPerPage: "Сделок на странице",
  pagination: "Страницы сделок",
  nextPage: "Следующая страница",
  firstPage: "К первой странице",
  openWaiting: "Открыть сделку на этой странице, требующую действия",
  partyScope: "Только связь с выбранным лицом.",
  invalidChoice: "Неподдерживаемый выбор",
  invalidFilters: "Некоторые фильтры недействительны.",
  invalidFiltersDetail:
    "Выберите допустимые значения и покажите список снова или сбросьте фильтры.",
  invalidPage: "Эта ссылка на страницу больше недействительна.",
  invalidPageDetail: "Вернитесь на первую страницу с той же областью и фильтрами.",
  privateUnavailable: "Эти личные фильтры больше недоступны.",
  legacySearch: "Примените этот поиск для продолжения.",
  legacySearchDetail:
    "Поиск сохранён в поле. Выберите «Показать», чтобы применить его приватно перед выбором области и страниц.",
  privateUnavailableDetail:
    "Они принадлежат сессии и браузеру, где были применены. Сбросьте фильтры и примените их снова.",
  pageEmpty: "На этой странице больше нет сделок.",
  pageEmptyDetail:
    "Список изменился. Вернитесь на первую страницу для просмотра текущих результатов.",
  empty: "Нет доступных Вам сделок.",
  emptyDetail:
    "Здесь показаны сделки, к которым у Вас есть доступ. Новая сделка создаётся из запроса.",
  inquiries: "К запросам",
  noMatch: "Ни одна сделка не подходит под фильтры.",
  clear: "Сбросить фильтры",
  noMine: "В этой области нет назначенных Вам сделок.",
  noNeeds: "В этой области нет сделок, требующих действия.",
  showAll: "Показать все доступные сделки",
  failed: "Не удалось загрузить список сделок.",
  failedDetail: "Это не значит, что сделок нет. Попробуйте ещё раз чуть позже.",
  retry: "Попробовать снова",
  moreTools: "Другие инструменты",
};

export function directoryCopy(locale: string): Copy {
  return locale === "bg" ? bg : locale === "ru" ? ru : en;
}

/** Stage names are O03's (inquiry-link-copy.ts), so a Deal reads the same on O03 and O04; an
 * unknown value is shown as recorded. */
export function caseStageLabel(stage: string, locale: string) {
  const stages: Record<string, string> = inquiryLinkCopy(locale).stages;
  return stages[stage] ?? workflowLabel(stage, locale);
}

export function caseKindLabel(kind: string, locale: string) {
  if (kind === "service_intake") return directoryCopy(locale).serviceIntake;
  const c = caseCopy(locale);
  return kind === "buyer" || kind === "tenant" || kind === "seller" || kind === "landlord"
    ? c[kind]
    : workflowLabel(kind, locale);
}
