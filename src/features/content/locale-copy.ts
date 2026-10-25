// Staff copy preparation. Language and professional acceptance remain separate human work.
const en = {
  editions: "Language editions",
  source: "Approved Bulgarian source",
  target: "Target language",
  sourceRevision: "Source revision",
  sourceHeld: "Approve and publish the current Bulgarian source before preparing this edition.",
  stale:
    "The Bulgarian source changed. Compare it with your draft, save a new edition and request fresh review.",
  sourceNote:
    "The source and target are reviewed separately. Language approval does not approve claims or publish content.",
  manual:
    "Write or paste the target text. The Bulgarian text is shown above for comparison. Saving creates a private draft.",
  request_review: "Request review of this edition",
  claims: "Record qualified review of this edition",
  language: "Approve this translation",
  editorial: "Approve this edition’s content",
  publish: "Publish this reviewed edition",
  reject: "Request changes to this translation",
  withdraw: "Withdraw this language edition",
  draft: "Draft",
  missing: "No edition yet",
  in_review: "Awaiting review",
  rejected: "Changes requested",
  approved: "Approved",
  withdrawn: "Withdrawn",
  staleState: "Source changed — review required",
  sourceLink: "Open the Bulgarian source",
  preview: "Private preview of this language edition",
  public: "Open this public language edition",
  currentSource: "Current Bulgarian source",
  boundSource: "Source used by this draft",
  sameHuman:
    "Each decision records the person and capability used. One person may make separate decisions when authorized.",
  noApprovals: "No human decision has been recorded for this revision.",
  saved: "Language edition action recorded",
  next: "Open this language edition to check its current review state and next permitted action.",
  conflict:
    "The source or edition changed. Your text is retained. Compare the current edition and reopen it before reviewing again.",
};
type Copy = typeof en;
const bg: Copy = {
  editions: "Езикови издания",
  source: "Одобрен български източник",
  target: "Език на изданието",
  sourceRevision: "Версия на източника",
  sourceHeld:
    "Одобрете и публикувайте текущия български източник, преди да подготвяте това издание.",
  stale:
    "Българският източник е променен. Сравнете го с черновата, запазете ново издание и поискайте нов преглед.",
  sourceNote:
    "Източникът и преводът се преглеждат отделно. Езиковото одобрение не одобрява твърдения и не публикува съдържание.",
  manual:
    "Напишете или поставете превода. Българският текст е показан по-горе за сравнение. Записването създава частна чернова.",
  request_review: "Изпращане на изданието за преглед",
  claims: "Запис на квалифициран преглед на изданието",
  language: "Одобряване на този превод",
  editorial: "Одобряване на съдържанието на изданието",
  publish: "Публикуване на прегледаното издание",
  reject: "Искане за промени в превода",
  withdraw: "Оттегляне на езиковото издание",
  draft: "Чернова",
  missing: "Все още няма издание",
  in_review: "Очаква преглед",
  rejected: "Поискани промени",
  approved: "Одобрено",
  withdrawn: "Оттеглено",
  staleState: "Променен източник — необходим е преглед",
  sourceLink: "Към българския източник",
  preview: "Частен преглед на езиковото издание",
  public: "Към публичното езиково издание",
  currentSource: "Текущ български източник",
  boundSource: "Източник на тази чернова",
  sameHuman:
    "Всяко решение записва човека и използваното право. Упълномощен човек може да взема отделните решения.",
  noApprovals: "За тази версия няма записано човешко решение.",
  saved: "Действието за езиковото издание е записано",
  next: "Отворете езиковото издание, за да проверите текущия преглед и следващото разрешено действие.",
  conflict:
    "Източникът или изданието е променено. Текстът ви е запазен. Сравнете текущото издание и го отворете отново преди нов преглед.",
};
const ru: Copy = {
  editions: "Языковые издания",
  source: "Одобренный болгарский источник",
  target: "Язык издания",
  sourceRevision: "Версия источника",
  sourceHeld: "Одобрите и опубликуйте текущий болгарский источник перед подготовкой этого издания.",
  stale:
    "Болгарский источник изменён. Сравните его с черновиком, сохраните новое издание и запросите новую проверку.",
  sourceNote:
    "Источник и перевод проверяются отдельно. Языковое одобрение не одобряет утверждения и не публикует контент.",
  manual:
    "Напишите или вставьте перевод. Болгарский текст показан выше для сравнения. Сохранение создаёт частный черновик.",
  request_review: "Запросить проверку этого издания",
  claims: "Записать квалифицированную проверку издания",
  language: "Одобрить этот перевод",
  editorial: "Одобрить содержание издания",
  publish: "Опубликовать проверенное издание",
  reject: "Запросить изменения в переводе",
  withdraw: "Отозвать языковое издание",
  draft: "Черновик",
  missing: "Издания пока нет",
  in_review: "Ожидает проверки",
  rejected: "Запрошены изменения",
  approved: "Одобрено",
  withdrawn: "Отозвано",
  staleState: "Источник изменён — нужна проверка",
  sourceLink: "Открыть болгарский источник",
  preview: "Частный просмотр языкового издания",
  public: "Открыть публичное языковое издание",
  currentSource: "Текущий болгарский источник",
  boundSource: "Источник этого черновика",
  sameHuman:
    "Каждое решение сохраняет человека и использованное полномочие. Уполномоченный человек может принимать отдельные решения.",
  noApprovals: "Для этой версии нет записанного решения человека.",
  saved: "Действие с языковым изданием записано",
  next: "Откройте языковое издание, чтобы проверить состояние и следующее разрешённое действие.",
  conflict:
    "Источник или издание изменено. Ваш текст сохранён. Сравните текущее издание и откройте его заново перед новой проверкой.",
};
export const contentLocaleCopy = (locale: string) =>
  locale === "bg" ? bg : locale === "ru" ? ru : en;
export function contentLocaleState(state: string, locale: string) {
  const copy = contentLocaleCopy(locale);
  return state === "stale"
    ? copy.staleState
    : state in copy
      ? copy[state as keyof Copy]
      : copy.missing;
}
