export function complaintCopy(locale: string) {
  const s = (bg: string, ru: string, en: string) =>
    locale === "bg" ? bg : locale === "ru" ? ru : en;
  return {
    title: s("Жалби", "Жалобы", "Complaints"),
    lead: s(
      "Вътрешен регистър. Отговорният служител определя срока и записва действителния резултат. Записът не изпраща отговор.",
      "Внутренний реестр. Ответственный назначает срок и фиксирует фактический исход. Запись не отправляет ответ.",
      "Private register. The responsible person sets the due date and records the actual outcome. Recording does not send a response.",
    ),
    create: s("Запис на жалба", "Записать жалобу", "Record complaint"),
    review: s("Запис на решение", "Записать решение", "Record review"),
    recordedBy: s("Решение от", "Решение записал", "Decision recorded by"),
    history: s("История на решенията", "История решений", "Decision history"),
    queue: s("Регистър", "Реестр", "Register"),
    empty: s(
      "Няма жалби за този филтър.",
      "По этому фильтру жалоб нет.",
      "No complaints match this filter.",
    ),
    all: s("Всички", "Все", "All"),
    more: s("Следващи записи", "Следующие записи", "Next records"),
    overdue: s("Просрочено", "Просрочено", "Overdue"),
    limited: s("Последните 50 решения.", "Последние 50 решений.", "Latest 50 decisions."),
    received: s("Получена жалба", "Жалоба получена", "Complaint received"),
    channel: s("Канал", "Канал", "Channel"),
    sourceReference: s(
      "Източник / външен номер",
      "Источник / внешний номер",
      "Source / external reference",
    ),
    description: s("Получено съдържание", "Полученное содержание", "Received description"),
    receivedAt: s(
      "Получена на · Europe/Sofia",
      "Получена · Europe/Sofia",
      "Received at · Europe/Sofia",
    ),
    dueAt: s("Срок · Europe/Sofia", "Срок · Europe/Sofia", "Due at · Europe/Sofia"),
    ownerId: s("Отговорен служител", "Ответственный", "Responsible staff member"),
    state: s("Състояние", "Состояние", "State"),
    note: s("Основание и следваща стъпка", "Основание и следующий шаг", "Reason and next step"),
    outcome: s(
      "Действителен резултат и външно потвърждение",
      "Фактический исход и внешнее подтверждение",
      "Actual outcome and external evidence",
    ),
    reviewed: s(
      "Проверих записа, отговорника, срока и резултата",
      "Я проверил запись, ответственного, срок и исход",
      "I reviewed the record, owner, due date and outcome",
    ),
    open: s("Отворена", "Открыта", "Open"),
    reviewing: s("В преглед", "На рассмотрении", "Reviewing"),
    waiting: s("В изчакване", "Ожидает", "Waiting"),
    resolved: s("Приключена", "Завершена", "Resolved"),
    email: s("Имейл", "Почта", "Email"),
    phone: s("Телефон", "Телефон", "Phone"),
    in_person: s("Лично", "Лично", "In person"),
    website: s("Уебсайт", "Сайт", "Website"),
    other: s("Друг", "Другой", "Other"),
  };
}
