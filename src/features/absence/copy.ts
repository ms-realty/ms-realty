// Private staff copy. No public translation/index approval is implied.
export function absenceCopy(locale: string) {
  const s = (bg: string, ru: string, en: string) =>
    locale === "bg" ? bg : locale === "ru" ? ru : en;
  return {
    notApplied: s(
      "Тази операция не промени наличността.",
      "Эта операция не изменила доступность.",
      "This operation did not change availability.",
    ),
    blocked: s(
      "Проверете текущото състояние и осигурете поне един наличен ръководител, след което прегледайте отново.",
      "Проверьте текущее состояние и наличие хотя бы одного доступного руководителя, затем проверьте действие заново.",
      "Check the current state and keep at least one available manager, then review the change again.",
    ),
    title: s("Отсъствие и покритие", "Отсутствие и подхват работы", "Absence and coverage"),
    lead: s(
      "От началото на отсъствието отворената работа влиза в дежурната опашка. Входът и правата се запазват. Връщането се потвърждава изрично; приетите предавания не се отменят.",
      "С начала отсутствия открытая работа попадает в очередь подхвата. Вход и права сохраняются. Возврат подтверждается явно; принятые передачи работы не отменяются.",
      "From the start of absence, open work enters agency coverage. Sign-in and permissions remain. Return requires explicit confirmation; accepted handovers are retained.",
    ),
    available: s("На разположение", "Доступен для работы", "Available for work"),
    planned: s("Планирано отсъствие", "Запланировано отсутствие", "Absence scheduled"),
    absent: s("Отсъства", "Отсутствует", "Absent"),
    starts: s("Начало (UTC)", "Начало (UTC)", "Starts at (UTC)"),
    startsRecorded: s("Начало", "Начало", "Starts at"),
    startsHint: s(
      "Оставете празно за незабавно начало.",
      "Оставьте пустым, чтобы начать сейчас.",
      "Leave blank to start now.",
    ),
    review: s(
      "Проверка на покритието (UTC)",
      "Проверить подхват работы (UTC)",
      "Coverage review due (UTC)",
    ),
    reviewRecorded: s("Проверка на покритието", "Проверить подхват работы", "Coverage review due"),
    reviewHint: s(
      "Този срок не връща служителя автоматично.",
      "Этот срок не возвращает сотрудника автоматически.",
      "This deadline does not automatically return the staff member.",
    ),
    overdue: s(
      "Проверката на покритието е просрочена.",
      "Проверка подхвата работы просрочена.",
      "Coverage review is overdue.",
    ),
    reason: s(
      "План за покритие или връщане",
      "План подхвата работы или возврата",
      "Coverage or return plan",
    ),
    reasonHint: s(
      "Посочете служебния план, без здравни или други лични подробности.",
      "Укажите рабочий план без медицинских и других личных подробностей.",
      "Record the work plan without health or other personal details.",
    ),
    reviewed: s(
      "Прегледах ангажиментите, срещите, ключовете и покритието от ръководител.",
      "Я проверил обязательства, встречи, ключи и подхват работы руководителем.",
      "I reviewed commitments, appointments, keys and management coverage.",
    ),
    schedule: s("Записване на отсъствието", "Записать отсутствие", "Record absence"),
    return: s("Потвърждаване на връщането", "Подтвердить возврат", "Confirm return"),
    cancel: s(
      "Отмяна на планираното отсъствие",
      "Отменить запланированное отсутствие",
      "Cancel scheduled absence",
    ),
    recorded: s(
      "Промяната на наличността е записана",
      "Изменение доступности записано",
      "Availability change recorded",
    ),
    manager: s(
      "Поне един ръководител с работещ достъп трябва да остане на разположение.",
      "Хотя бы один руководитель с рабочим доступом должен оставаться доступным.",
      "At least one manager with usable access must remain available.",
    ),
  };
}
