export function offboardingCopy(locale: string) {
  const s = (bg: string, ru: string, en: string) =>
    locale === "bg" ? bg : locale === "ru" ? ru : en;
  return {
    person: s("Служител", "Сотрудник", "Staff member"),
    work: s("Записи за предаване", "Записи для передачи", "Records for handover"),
    workScope: s(
      "Показани са само записите, до които имате достъп. Прегледайте и предайте всеки поотделно; общият брой може да включва ограничени записи.",
      "Показаны только доступные вам записи. Проверьте и передайте каждую отдельно; общий счётчик может включать закрытые записи.",
      "Only records you can access are shown. Review and hand over each separately; totals may include restricted records.",
    ),
    noWork: s(
      "Няма достъпни записи на тази страница.",
      "На этой странице нет доступных записей.",
      "No accessible records on this page.",
    ),
    next: s("Следващи записи", "Следующие записи", "Next records"),
    previous: s("Предишни записи", "Предыдущие записи", "Previous records"),
    notApplied: s(
      "Достъпът не е променен от тази операция.",
      "Эта операция не изменила доступ.",
      "This operation did not change access.",
    ),
    reviewAgain: s(
      "Нов преглед преди действие",
      "Проверить заново перед действием",
      "Review again before acting",
    ),
    former: s(
      "Последни 50 бивши служители · предаване",
      "Последние 50 бывших сотрудников · передача",
      "Last 50 former staff · handover",
    ),
    title: s(
      "Прекратяване на служебен достъп",
      "Отключение доступа сотрудника",
      "End staff access",
    ),
    lead: s(
      "Прекратяват се членството, сесиите, ключовете за вход, правата и чакащите служебни покани. Връщането на физически ключове и предаването на работа са отделни действия.",
      "Прекращаются членство, сеансы, ключи входа, права и ожидающие приглашения сотрудника. Возврат физических ключей и передача работы выполняются отдельно.",
      "Ends membership, sessions, passkeys, grants and pending staff invitations. Physical key return and work handover are separate actions.",
    ),
    retained: s("Остава за предаване", "Остаётся передать", "Retained for handover"),
    warning: s(
      "Достъпът може да бъде спрян незабавно. Отворената работа влиза в дежурната опашка. Последният потвърден отговорник и държателят на ключове се запазват до отделно потвърдено предаване.",
      "Доступ можно отключить немедленно. Открытая работа попадает в очередь подхвата. Последний подтверждённый ответственный и держатель ключей сохраняются до отдельного подтверждения передачи.",
      "Access can end immediately. Open work enters agency coverage. The last accepted owner and physical key holder stay recorded until an individually confirmed handover.",
    ),
    keys: s(
      "Комплекти ключове при служителя",
      "Комплекты ключей у сотрудника",
      "Key sets still held",
    ),
    cases: s(
      "Отворени и спрени случаи",
      "Открытые и приостановленные дела",
      "Active and paused Cases",
    ),
    tasks: s("Неприключени задачи", "Незавершённые задачи", "Unfinished tasks"),
    inquiries: s("Неприключени запитвания", "Незавершённые заявки", "Unresolved inquiries"),
    reason: s(
      "Основание и план за предаване",
      "Основание и план передачи",
      "Reason and handover plan",
    ),
    reviewed: s(
      "Проверих самоличността, прекратяването на достъпа и оставащата работа",
      "Я проверил сотрудника, отключение доступа и оставшуюся работу",
      "I checked the person, access removal and retained work",
    ),
    ended: s(
      "Служебното членство е прекратено",
      "Членство сотрудника прекращено",
      "Staff membership ended",
    ),
    self: s(
      "Друг ръководител трябва да прекрати Вашия достъп",
      "Ваш доступ должен отключить другой руководитель",
      "Another manager must end your access",
    ),
    recorded: s("Прекратяването е записано", "Отключение записано", "Access removal recorded"),
    history: s("Записи за прекратяване", "Записи об отключении", "Access removal history"),
    reauth: s(
      "Потвърдете самоличността и прегледайте отново",
      "Подтвердите личность и проверьте заново",
      "Verify identity and review again",
    ),
    back: s("Екип и достъп", "Команда и доступ", "Team and access"),
  };
}
