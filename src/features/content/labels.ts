import type { ApprovalKind, ApprovalState } from "@/domain/approval";
import type { OperationStatus } from "@/domain/operation-receipt";
import type { PublicationState } from "@/domain/publication";

type Label = readonly [string, string, string];
type LabelKey =
  | `review.${ApprovalKind}`
  | `state.${ApprovalState}`
  | `publication.${PublicationState}`
  | `operation.${OperationStatus}`;
const labels = {
  "review.factual": ["Преглед на фактите", "Fact review", "Проверка фактов"],
  "review.editorial": ["Редакционен преглед", "Editorial review", "Редакционная проверка"],
  "review.language": ["Езиков преглед", "Language review", "Языковая проверка"],
  "review.legal_process_claim": [
    "Квалифициран преглед на твърденията",
    "Qualified claim review",
    "Квалифицированная проверка утверждений",
  ],
  "review.owner_acknowledgment": [
    "Потвърждение от собственика",
    "Owner acknowledgment",
    "Подтверждение собственника",
  ],
  "review.publication": ["Решение за публикуване", "Publication decision", "Решение о публикации"],
  "review.message_send": [
    "Решение за изпращане",
    "Message sending decision",
    "Решение об отправке",
  ],
  "review.proposal_terms": ["Преглед на условията", "Terms review", "Проверка условий"],
  "review.locale_indexability": [
    "Решение за индексиране на езика",
    "Language indexing decision",
    "Решение об индексации языка",
  ],
  "review.import_apply": ["Решение за импорт", "Import decision", "Решение об импорте"],
  "review.legacy_source_as_is": [
    "Запазен източник от предишната система",
    "Source retained from the previous system",
    "Источник сохранён из прежней системы",
  ],
  "review.legacy_content_approval": [
    "Одобрение от предишната система",
    "Approval from the previous system",
    "Одобрение из прежней системы",
  ],
  "state.pending": ["Очаква решение", "Awaiting a decision", "Ожидает решения"],
  "state.approved": [
    "Одобрено за посочения обхват",
    "Approved for the stated scope",
    "Одобрено для указанной области",
  ],
  "state.rejected": ["Не е одобрено", "Not approved", "Не одобрено"],
  "state.invalidated": [
    "Одобрението е обезсилено",
    "Approval invalidated",
    "Одобрение аннулировано",
  ],
  "state.expired": ["Одобрението е изтекло", "Approval expired", "Срок одобрения истёк"],
  "state.withdrawn": ["Прегледът е оттеглен", "Review withdrawn", "Проверка отозвана"],
  "publication.never_published": ["Не е публикувано", "Never published", "Не публиковалось"],
  "publication.eligible": [
    "Допустимо за решение за публикуване",
    "Eligible for a publication decision",
    "Допустимо решение о публикации",
  ],
  "publication.active": ["Публикувано", "Published", "Опубликовано"],
  "publication.restricted": [
    "Публичният достъп е ограничен",
    "Public access restricted",
    "Публичный доступ ограничен",
  ],
  "publication.withdrawn": [
    "Публикацията е оттеглена",
    "Publication withdrawn",
    "Публикация отозвана",
  ],
  "operation.in_progress": [
    "Резултатът още се проверява",
    "Outcome is still being checked",
    "Результат ещё проверяется",
  ],
  "operation.accepted": [
    "Искането е прието за обработка",
    "Request accepted for processing",
    "Запрос принят в обработку",
  ],
  "operation.succeeded": ["Действието е записано", "Action recorded", "Действие записано"],
  "operation.failed": [
    "Действието не е приложено",
    "Action was not applied",
    "Действие не применено",
  ],
  "operation.outcome_unknown": [
    "Резултатът още не е потвърден",
    "Outcome is not yet confirmed",
    "Результат ещё не подтверждён",
  ],
} satisfies Record<LabelKey, Label>;

export function contentLabel(
  group: "review" | "state" | "publication" | "operation",
  value: string,
  locale: string,
): string {
  const key = `${group}.${value}`;
  const words: Label = Object.hasOwn(labels, key)
    ? labels[key as LabelKey]
    : ["Нужен е преглед", "Requires review", "Требуется проверка"];
  return words[locale === "bg" ? 0 : locale === "ru" ? 2 : 1];
}
