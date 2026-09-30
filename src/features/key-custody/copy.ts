export function custodyCopy(locale: string) {
  const s = (bg: string, ru: string, en: string) =>
    locale === "bg" ? bg : locale === "ru" ? ru : en;
  return {
    title: s("Ключове", "Ключи", "Key custody"),
    returnDue: s("Връщане до", "Вернуть до", "Due back"),
    returnReminders: s(
      "Просрочено връщане на ключове",
      "Просроченные возвраты ключей",
      "Overdue key returns",
    ),
    reminderHint: s(
      "Показани са текущите просрочени комплекти, първо най-старите. Напомнянето не променя наличността или срока.",
      "Здесь показаны текущие просроченные комплекты, начиная с самых старых. Напоминание не меняет факт выдачи или срок.",
      "Current overdue sets are shown oldest first. A reminder changes neither custody nor the agreed deadline.",
    ),
    moreReminders: s(
      "Има още просрочени комплекти в регистъра.",
      "В реестре есть другие просроченные комплекты.",
      "More overdue sets are available in the register.",
    ),
    openOverdue: s(
      "Всички просрочени комплекти",
      "Все просроченные комплекты",
      "All overdue key sets",
    ),
    lead: s(
      "Записвайте действителното получаване и предаване. Срокът не потвърждава връщане. Не въвеждайте кодове за достъп.",
      "Фиксируйте фактический приём и передачу. Истечение срока не подтверждает возврат. Не вводите коды доступа.",
      "Record actual receipt and handover. A due date does not confirm return. Do not enter access codes.",
    ),
    receive: s("Запис на получени ключове", "Записать приём ключей", "Record keys received"),
    move: s("Запис на предаване", "Записать передачу", "Record custody change"),
    amend_deadline: s(
      "Промяна на срока за връщане",
      "Изменить срок возврата",
      "Change due-back time",
    ),
    deadlineChanged: s(
      "Срокът за връщане е променен",
      "Срок возврата изменён",
      "Due-back time changed",
    ),
    deadlineHelp: s(
      "Ключовете остават при същия служител. Запишете причината и потвърждението за новия срок; предишният срок остава в историята.",
      "Ключи остаются у того же сотрудника. Укажите причину и подтверждение нового срока; прежний срок сохранится в истории.",
      "Keys remain with the same staff holder. Record the reason and agreement for the new deadline; the previous deadline stays in history.",
    ),
    deadlineNote: s(
      "Причина и потвърждение на срока",
      "Причина и подтверждение срока",
      "Deadline reason and agreement",
    ),
    deadlineReviewed: s(
      "Проверих притежателя на ключовете и потвърждението за новия срок",
      "Я проверил держателя ключей и подтверждение нового срока",
      "I checked the current holder and agreement for the new deadline",
    ),
    propertyReference: s("Номер на имота", "Номер объекта", "Property reference"),
    keyTag: s("Етикет на комплекта", "Бирка комплекта", "Key set tag"),
    quantity: s("Брой ключове", "Количество ключей", "Number of keys"),
    sourceReference: s(
      "Протокол за получаване / разрешение",
      "Акт приёма / основание",
      "Receipt / authority reference",
    ),
    storageLabel: s("Място за съхранение", "Метка места хранения", "Storage label"),
    holderId: s("Служител, получил ключовете", "Сотрудник, получивший ключи", "Staff holder"),
    dueAt: s("Връщане до · Europe/Sofia", "Вернуть до · Europe/Sofia", "Due back · Europe/Sofia"),
    state: s("Състояние", "Состояние", "State"),
    stored: s("На съхранение", "На хранении", "In storage"),
    checked_out: s("Предадени на служител", "Выданы сотруднику", "Checked out"),
    lost: s("Липсващи", "Утрачены", "Lost"),
    returned_to_owner: s("Върнати на собственика", "Возвращены собственнику", "Returned to owner"),
    reviewed: s(
      "Проверих действителната наличност, получателя и потвърждението за предаване",
      "Я проверил фактическое наличие, получателя и подтверждение передачи",
      "I checked physical custody, the recipient and handover evidence",
    ),
    note: s(
      "Потвърждение и основание",
      "Подтверждение и основание",
      "Handover evidence and reason",
    ),
    help: s(
      "При предаване изберете служител и срок. При връщане на съхранение посочете мястото. Потвърдете получателя или липсата в основанието.",
      "Для выдачи укажите сотрудника и срок. Для возврата на хранение укажите место. Подтвердите получателя или утрату в основании.",
      "For check-out choose a staff holder and due date. For storage record its location. Identify the recipient or loss evidence in the reason.",
    ),
    history: s("История на предаванията", "История передач", "Custody history"),
    recordedBy: s("Записал", "Записал", "Recorded by"),
    empty: s(
      "Няма записи за този филтър.",
      "По этому фильтру записей нет.",
      "No key sets match this filter.",
    ),
    all: s("Всички", "Все", "All"),
    more: s("Следващи записи", "Следующие записи", "Next records"),
    overdue: s("Просрочено връщане", "Возврат просрочен", "Return overdue"),
    terminal: s(
      "Комплектът е върнат на собственика. Ново получаване изисква нов етикет и запис.",
      "Комплект возвращён собственнику. Для нового приёма нужны новая бирка и запись.",
      "This set was returned to its owner. A new receipt needs a new tag and record.",
    ),
  };
}
