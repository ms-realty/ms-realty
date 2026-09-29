export function taskHandoverCopy(locale: string) {
  const s = (bg: string, ru: string, en: string) =>
    locale === "bg" ? bg : locale === "ru" ? ru : en;
  return {
    inbox: s("Очакващи моето приемане", "Ожидают моего принятия", "Awaiting my acceptance"),
    title: s("Предаване на задача", "Передача задачи", "Task handover"),
    lead: s(
      "Отговорникът се сменя само след приемане от посочения служител. Сроковете, състоянието и обещанията към клиента се запазват.",
      "Ответственный сменится только после принятия указанным сотрудником. Сроки, состояние и обещания клиенту сохраняются.",
      "Ownership changes only when the named colleague accepts. Deadlines, state and client promises stay unchanged.",
    ),
    receiver: s("Приемащ служител", "Принимающий сотрудник", "Receiving colleague"),
    reason: s(
      "Причина и бележки за предаване",
      "Причина и заметки для передачи",
      "Reason and handover notes",
    ),
    reviewed: s(
      "Проверих задачата, сроковете и приемащия служител",
      "Я проверил задачу, сроки и принимающего сотрудника",
      "I checked the task, deadlines and receiving colleague",
    ),
    request: s("Предлагане на предаване", "Предложить передачу", "Request task handover"),
    accept: s("Приемане на задачата", "Принять задачу", "Accept task handover"),
    cancel: s("Отмяна на предложението", "Отменить предложение", "Cancel task handover"),
    pending: s("Очаква приемане от", "Ожидает принятия от", "Awaiting acceptance by"),
    none: s(
      "Няма друг служител с необходимия достъп.",
      "Нет другого сотрудника с необходимым доступом.",
      "No other colleague currently has the required access.",
    ),
  };
}
