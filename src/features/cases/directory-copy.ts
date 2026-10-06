// O04 cases index copy. Private workspace copy; BG/RU drafts need human language review before
// catalog adoption, like the rest of src/features/cases.
import type { CaseStage } from "@/domain/case";
import { caseCopy } from "./copy";

type StageLabels = Record<CaseStage, string>;

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
  stages: {
    needs_agreed: "Requirements to agree",
    evaluating: "Selecting properties",
    viewing: "Viewings",
    proposal_preparation: "Preparing a proposal",
    proposal_active: "Proposal under discussion",
    coordination: "Coordinating the transaction",
    completed: "Completed",
    request_received: "Request received",
    scope_authority_review: "Checking scope and authority",
    assessment: "Assessment",
    instructions_agreed: "Instructions agreed",
    preparing: "Preparing the listing",
    marketing: "Marketing",
    proposal_coordination: "Coordinating proposals",
    completion_handover: "Completion and handover",
    consultation: "Consultation",
    concluded: "Consultation concluded",
  } satisfies StageLabels,
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
  stages: {
    needs_agreed: "Изисквания за уточнение",
    evaluating: "Подбор на имоти",
    viewing: "Огледи",
    proposal_preparation: "Подготовка на предложение",
    proposal_active: "Предложение в обсъждане",
    coordination: "Координиране на сделката",
    completed: "Завършен",
    request_received: "Получена заявка",
    scope_authority_review: "Проверка на обхвата и правомощията",
    assessment: "Оценка",
    instructions_agreed: "Договорено възлагане",
    preparing: "Подготовка на обявата",
    marketing: "Предлагане на пазара",
    proposal_coordination: "Координиране на предложения",
    completion_handover: "Сделка и предаване",
    consultation: "Консултация",
    concluded: "Консултацията е приключила",
  },
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
  stages: {
    needs_agreed: "Согласование требований",
    evaluating: "Подбор объектов",
    viewing: "Просмотры",
    proposal_preparation: "Подготовка предложения",
    proposal_active: "Предложение на обсуждении",
    coordination: "Координация сделки",
    completed: "Завершено",
    request_received: "Заявка получена",
    scope_authority_review: "Проверка объёма и полномочий",
    assessment: "Оценка",
    instructions_agreed: "Поручение согласовано",
    preparing: "Подготовка объявления",
    marketing: "Продвижение",
    proposal_coordination: "Работа с предложениями",
    completion_handover: "Завершение и передача",
    consultation: "Консультация",
    concluded: "Консультация завершена",
  },
};

export function directoryCopy(locale: string): Copy {
  return locale === "bg" ? bg : locale === "ru" ? ru : en;
}

/** Stage names come from the kind's pipeline; an unknown value is shown as recorded. */
export function caseStageLabel(stage: string, locale: string) {
  const stages: Record<string, string> = directoryCopy(locale).stages;
  return stages[stage] ?? stage.replaceAll("_", " ");
}

export function caseKindLabel(kind: string, locale: string) {
  if (kind === "service_intake") return directoryCopy(locale).serviceIntake;
  const c = caseCopy(locale);
  return kind === "buyer" || kind === "tenant" || kind === "seller" || kind === "landlord"
    ? c[kind]
    : kind.replaceAll("_", " ");
}
