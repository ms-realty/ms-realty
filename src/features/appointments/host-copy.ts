const en = {
  title: "Accept hosting responsibility",
  lead: "The recorded host needs coverage. Review the confirmed time, travel allowance, participants and access before accepting. The booking stays in force; this does not send a calendar update or confirm attendance.",
  reviewed: "I reviewed the recorded arrangement and accept its existing commitments",
  reason: "Reason and handover note",
  submit: "Accept as the new host",
  reserved: "Reserved interval including travel time",
  busy: "You are already booked during this interval, including travel time. The existing viewing is unchanged. Resolve the conflicting booking, then review and accept again.",
  external: "I checked my external calendar for the full reserved interval",
};
const bg: typeof en = {
  title: "Поемане на отговорност за огледа",
  lead: "Записаният водещ се нуждае от заместване. Проверете потвърдения час, времето за пътуване, участниците и достъпа преди поемане. Уговорката остава в сила; това не изпраща календарна актуализация и не потвърждава присъствие.",
  reviewed: "Прегледах записаната уговорка и приемам съществуващите ангажименти",
  reason: "Причина и бележка за предаването",
  submit: "Поемане като нов водещ",
  reserved: "Запазен интервал с времето за пътуване",
  busy: "Имате друг ангажимент в този интервал, включително времето за пътуване. Съществуващият оглед е непроменен. Разрешете конфликта, след това прегледайте и приемете отново.",
  external: "Проверих външния си календар за целия запазен интервал",
};
const ru: typeof en = {
  title: "Принять ответственность за показ",
  lead: "Назначенному ведущему требуется замена. Перед принятием проверьте согласованное время, запас на дорогу, участников и доступ. Договорённость сохраняется; это действие не отправляет обновление календаря и не подтверждает явку.",
  reviewed: "Я проверил договорённость и принимаю существующие обязательства",
  reason: "Причина и примечание к передаче",
  submit: "Принять роль ведущего",
  reserved: "Зарезервированное время, включая дорогу",
  busy: "У вас уже есть встреча в этом интервале, включая дорогу. Существующий показ не изменён. Разрешите конфликт занятости, затем снова проверьте и подтвердите приём.",
  external: "Я проверил свой внешний календарь на весь зарезервированный интервал",
};
export const hostHandoverCopy = (locale: string) =>
  locale === "bg" ? bg : locale === "ru" ? ru : en;
