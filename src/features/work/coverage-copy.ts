// Private workspace copy; BG/RU remain subject to human language review.
export function coverageCopy(locale: string) {
  const s = (bg: string, ru: string, en: string) =>
    locale === "bg" ? bg : locale === "ru" ? ru : en;
  return {
    title: s("Работа без отговорник", "Работа без ответственного", "Work without an owner"),
    lead: s(
      "Отворена работа без наличен отговорник, включително при отсъствие. Ръководителят организира поемането ѝ; показани са само записите, до които имате достъп. Предаването на всеки запис се потвърждава отделно.",
      "Открытая работа без доступного ответственного, в том числе при отсутствии. Руководитель решает, кто её возьмёт; показаны только доступные вам записи. Передача каждой записи подтверждается отдельно.",
      "Open work without an available owner, including during absence. A manager arranges who takes it over; only records you can access are shown. Each record needs its own confirmed handover.",
    ),
    owner: s(
      "Последен потвърден отговорник",
      "Последний подтверждённый ответственный",
      "Last accepted owner",
    ),
    cases: s("Сделки без отговорник", "Сделки без ответственного", "Deals without an owner"),
    appointments: s(
      "Срещи без отговорник",
      "Встречи без ответственного",
      "Appointments without an owner",
    ),
    appointmentNote: s(
      "Текущата уговорка и резервираните ресурси остават в сила. Прегледайте срещата и съгласувайте всяка промяна с участниците.",
      "Текущая договорённость и бронирование ресурсов сохраняются. Проверьте встречу и согласуйте изменения с участниками.",
      "The current arrangement and calendar reservations stay in force. Review the appointment and coordinate any change with participants.",
    ),
    host: s("Записан домакин", "Назначенный сотрудник", "Recorded host"),
    starts: s("Начало", "Начало", "Starts at"),
    tasks: s("Задачи без отговорник", "Задачи без ответственного", "Tasks without an owner"),
    inquiries: s(
      "Запитвания без отговорник",
      "Запросы без ответственного",
      "Inquiries without an owner",
    ),
    keys: s("Ключове за връщане", "Ключи для возврата", "Keys needing recovery"),
    keyNote: s(
      "Физическите ключове остават при записания държател до потвърдено връщане или предаване.",
      "Физические ключи остаются у записанного держателя до подтверждённого возврата или передачи.",
      "Physical keys remain with the recorded holder until a return or transfer is confirmed.",
    ),
    holder: s("Записан държател", "Записанный держатель", "Recorded holder"),
    promise: s("Обещано на клиент", "Обещано клиенту", "Promised to a client"),
  };
}
