// Private staff copy. No public translation/index approval is implied.
export function absenceCopy(locale: string) {
  const s = (bg: string, ru: string, en: string) =>
    locale === "bg" ? bg : locale === "ru" ? ru : en;
  return {
    notApplied: s(
      "Тази заявка не промени наличността.",
      "Эта заявка не изменила доступность.",
      "This request did not change availability.",
    ),
    blocked: s(
      "Проверете текущото състояние и осигурете поне един наличен ръководител, след което прегледайте отново.",
      "Проверьте текущее состояние и наличие хотя бы одного доступного руководителя, затем проверьте действие заново.",
      "Check the current state and keep at least one available manager, then review the change again.",
    ),
    title: s(
      "Отсъствие и кой поема работата",
      "Отсутствие и кто берёт работу",
      "Absence and who takes over the work",
    ),
    lead: s(
      "От началото на отсъствието отворената работа няма наличен отговорник и се показва в „Работа без отговорник“. Входът и правата се запазват. Връщането се потвърждава изрично; приетите предавания не се отменят.",
      "С начала отсутствия у открытой работы нет доступного ответственного, и она показывается в разделе «Работа без ответственного». Вход и права сохраняются. Возврат подтверждается явно; принятые передачи работы не отменяются.",
      "From the start of absence, open work has no available owner and shows under “Work without an owner”. Sign-in and permissions remain. Return requires explicit confirmation; accepted handovers are retained.",
    ),
    available: s("На разположение", "Доступен для работы", "Available for work"),
    planned: s("Планирано отсъствие", "Запланировано отсутствие", "Absence scheduled"),
    absent: s("Отсъства", "Отсутствует", "Absent"),
    starts: s("Начало", "Начало", "Starts at"),
    startsRecorded: s("Начало", "Начало", "Starts at"),
    startsHint: s(
      "Оставете празно за незабавно начало.",
      "Оставьте пустым, чтобы начать сейчас.",
      "Leave blank to start now.",
    ),
    review: s(
      "Дата за проверка кой поема работата",
      "Дата проверки, кто берёт работу",
      "Date to check who takes over",
    ),
    reviewRecorded: s(
      "Дата за проверка кой поема работата",
      "Дата проверки, кто берёт работу",
      "Date to check who takes over",
    ),
    reviewHint: s(
      "Този срок не връща служителя автоматично.",
      "Этот срок не возвращает сотрудника автоматически.",
      "This deadline does not automatically return the staff member.",
    ),
    overdue: s(
      "Датата за проверка кой поема работата е минала.",
      "Дата проверки, кто берёт работу, уже прошла.",
      "The date to check who takes over has passed.",
    ),
    reason: s(
      "План кой поема работата или кога служителят се връща",
      "План: кто берёт работу или когда сотрудник вернётся",
      "Plan for who takes over, or for the return",
    ),
    reasonHint: s(
      "Посочете служебния план, без здравни или други лични подробности.",
      "Укажите рабочий план без медицинских и других личных подробностей.",
      "Record the work plan without health or other personal details.",
    ),
    reviewed: s(
      "Прегледах следващите стъпки, срещите, ключовете и кой ръководител поема работата.",
      "Я проверил следующие шаги, встречи, ключи и то, какой руководитель берёт работу.",
      "I reviewed next steps, appointments, keys and which manager takes over the work.",
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
