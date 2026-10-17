// O04 cases index copy. Private workspace copy; BG/RU drafts need human language review before
// catalog adoption, like the rest of src/features/cases.
import { workflowLabel } from "@/i18n/workflow-labels";
import { caseCopy } from "./copy";
import { inquiryLinkCopy } from "./inquiry-link-copy";

const en = {
  instruction: "Search by case number or title, then open the case to continue its work.",
  search: "Search",
  searchHint: "Case number or title",
  apply: "Show",
  list: "Case list",
  serviceIntake: "Service consultation",
  count: "Cases: {n}",
  bounded:
    "Showing the 50 most recently updated cases you can access. To find another case, search by its number or title.",
  boundedSearch:
    "Showing the 50 most recently updated matches. Narrow the search to find another case.",
  shortened: "Search uses up to {n} characters; the rest was left out.",
  empty: "No cases are available to you.",
  emptyDetail: "Cases you can access appear here. A new case is created from an inquiry.",
  inquiries: "Open inquiries",
  noMatch: "No case matches this search.",
  clear: "Clear the search",
  failed: "The case list could not be loaded.",
  failedDetail: "This does not mean there are no cases. Try again in a moment.",
  retry: "Try again",
  // Same words as the staff rail item (messages/staff/*/workspace.json "moreTools").
  moreTools: "More tools",
};
type Copy = typeof en;

const bg: Copy = {
  instruction:
    "Потърсете случай по номер или заглавие и го отворете, за да продължите работата по него.",
  search: "Търсене",
  searchHint: "Номер или заглавие на случая",
  apply: "Покажете",
  list: "Списък със случаи",
  serviceIntake: "Консултация за услуга",
  count: "Случаи: {n}",
  bounded:
    "Показани са 50-те най-скоро обновени случая, до които имате достъп. За друг случай потърсете по номер или заглавие.",
  boundedSearch:
    "Показани са 50-те най-скоро обновени съвпадения. Уточнете търсенето, за да намерите друг случай.",
  shortened: "Търсенето използва до {n} знака; останалото е пропуснато.",
  empty: "Няма достъпни за вас случаи.",
  emptyDetail:
    "Тук се показват случаите, до които имате достъп. Нов случай се създава от запитване.",
  inquiries: "Към запитванията",
  noMatch: "Няма случай, който съвпада с търсенето.",
  clear: "Изчистете търсенето",
  failed: "Списъкът със случаи не можа да се зареди.",
  failedDetail: "Това не означава, че няма случаи. Опитайте отново след малко.",
  retry: "Опитайте отново",
  moreTools: "Още инструменти",
};

const ru: Copy = {
  instruction: "Найдите дело по номеру или названию и откройте его, чтобы продолжить работу.",
  search: "Поиск",
  searchHint: "Номер или название дела",
  apply: "Показать",
  list: "Список дел",
  serviceIntake: "Консультация по услуге",
  count: "Всего дел: {n}",
  bounded:
    "Показаны 50 недавно обновлённых дел, доступных вам. Чтобы найти другое дело, ищите по номеру или названию.",
  boundedSearch:
    "Показаны 50 недавно обновлённых совпадений. Уточните поиск, чтобы найти другое дело.",
  shortened: "Поиск учитывает до {n} символов; остальное пропущено.",
  empty: "Нет доступных вам дел.",
  emptyDetail: "Здесь показаны дела, к которым у вас есть доступ. Новое дело создаётся из запроса.",
  inquiries: "К запросам",
  noMatch: "Ни одно дело не подходит под поиск.",
  clear: "Сбросить поиск",
  failed: "Не удалось загрузить список дел.",
  failedDetail: "Это не значит, что дел нет. Попробуйте ещё раз чуть позже.",
  retry: "Попробовать снова",
  moreTools: "Другие инструменты",
};

export function directoryCopy(locale: string): Copy {
  return locale === "bg" ? bg : locale === "ru" ? ru : en;
}

/** Stage names are O03's (inquiry-link-copy.ts), so a Case reads the same on O03 and O04; an
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
