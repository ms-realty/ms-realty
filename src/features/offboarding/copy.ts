export function offboardingCopy(locale: string) {
  const s = (bg: string, ru: string, en: string) =>
    locale === "bg" ? bg : locale === "ru" ? ru : en;
  return {
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
      "Достъпът може да бъде спрян незабавно. Тези записи остават при същия служител; не се приключват или прехвърлят автоматично.",
      "Доступ можно отключить немедленно. Эти записи остаются за сотрудником; они не закрываются и не передаются автоматически.",
      "Access can end immediately. These records stay assigned to this person; they are not completed or transferred automatically.",
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
