// O04 deals index copy. Private workspace copy; BG/RU drafts need human language review before
// catalog adoption, like the rest of src/features/deals.
import { workflowLabel } from "@/i18n/workflow-labels";
import { caseCopy } from "./copy";
import { inquiryLinkCopy } from "./inquiry-link-copy";

const en = {
  instruction: "Search by deal number or title, then open the deal to continue its work.",
  search: "Search",
  searchHint: "Deal number or title",
  apply: "Show",
  list: "Deal list",
  serviceIntake: "Service consultation",
  count: "Deals: {n}",
  bounded:
    "Showing the 50 most recently updated deals you can access. To find another deal, search by its number or title.",
  boundedSearch:
    "Showing the 50 most recently updated matches. Narrow the search to find another deal.",
  shortened: "Search uses up to {n} characters; the rest was left out.",
  empty: "No deals are available to you.",
  emptyDetail: "Deals you can access appear here. A new deal is created from an inquiry.",
  inquiries: "Open inquiries",
  noMatch: "No deal matches this search.",
  clear: "Clear the search",
  failed: "The deal list could not be loaded.",
  failedDetail: "This does not mean there are no deals. Try again in a moment.",
  retry: "Try again",
  // Same words as the staff rail item (messages/staff/*/workspace.json "moreTools").
  moreTools: "More tools",
};
type Copy = typeof en;

const bg: Copy = {
  instruction:
    "Потърсете сделка по номер или заглавие и я отворете, за да продължите работата по нея.",
  search: "Търсене",
  searchHint: "Номер или заглавие на сделката",
  apply: "Покажете",
  list: "Списък със сделки",
  serviceIntake: "Консултация за услуга",
  count: "Сделки: {n}",
  bounded:
    "Показани са 50-те най-скоро обновени сделки, до които имате достъп. За друга сделка потърсете по номер или заглавие.",
  boundedSearch:
    "Показани са 50-те най-скоро обновени съвпадения. Уточнете търсенето, за да намерите друга сделка.",
  shortened: "Търсенето използва до {n} знака; останалото е пропуснато.",
  empty: "Няма достъпни за Вас сделки.",
  emptyDetail:
    "Тук се показват сделките, до които имате достъп. Нова сделка се създава от запитване.",
  inquiries: "Към запитванията",
  noMatch: "Няма сделка, която съвпада с търсенето.",
  clear: "Изчистете търсенето",
  failed: "Списъкът със сделки не можа да се зареди.",
  failedDetail: "Това не означава, че няма сделки. Опитайте отново след малко.",
  retry: "Опитайте отново",
  moreTools: "Още инструменти",
};

const ru: Copy = {
  instruction: "Найдите сделку по номеру или названию и откройте её, чтобы продолжить работу.",
  search: "Поиск",
  searchHint: "Номер или название сделки",
  apply: "Показать",
  list: "Список сделок",
  serviceIntake: "Консультация по услуге",
  count: "Всего сделок: {n}",
  bounded:
    "Показаны 50 недавно обновлённых сделок, доступных Вам. Чтобы найти другую сделку, ищите по номеру или названию.",
  boundedSearch:
    "Показаны 50 недавно обновлённых совпадений. Уточните поиск, чтобы найти другую сделку.",
  shortened: "Поиск учитывает до {n} символов; остальное пропущено.",
  empty: "Нет доступных Вам сделок.",
  emptyDetail:
    "Здесь показаны сделки, к которым у Вас есть доступ. Новая сделка создаётся из запроса.",
  inquiries: "К запросам",
  noMatch: "Ни одна сделка не подходит под поиск.",
  clear: "Сбросить поиск",
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
