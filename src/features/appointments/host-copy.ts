const en = {
  links: "Links for this viewing",
  title: "Accept hosting responsibility",
  lead: "The recorded host needs coverage. Review the confirmed time, travel allowance, participants and access before accepting. The booking stays in force; this does not send a calendar update or confirm attendance.",
  reviewed: "I reviewed the recorded arrangement and accept its existing commitments",
  reason: "Reason and handover note",
  submit: "Accept as the new host",
  reserved: "Reserved interval including travel time",
  busy: "You are already booked during this interval, including travel time. The existing viewing is unchanged. Resolve the conflicting booking, then review and accept again.",
  external: "I checked my external calendar for the full reserved interval",
  plannedLead:
    "The current host offered you this viewing. Review its current time, travel allowance, participants and access before personally accepting. The booking remains with the current host until then; this does not send a calendar update.",
  offerTitle: "Offer a planned host handover",
  offerLead:
    "Choose a colleague who can access this Case. The current host, booked time and property access stay unchanged until that colleague personally accepts. Selection does not reserve their calendar or grant access.",
  receiver: "Receiving host",
  offerReviewed: "I reviewed this arrangement and want to offer the handover",
  offerSubmit: "Offer the handover",
  pending: "Awaiting host acceptance",
  stale:
    "The arrangement changed after this offer. Withdraw it and offer the current arrangement again.",
  withdraw: "Withdraw the offer",
  withdrawReviewed: "I want to withdraw this offer; I retain hosting responsibility",
  none: "No eligible colleague is currently available for the recorded interval.",
};
const bg: typeof en = {
  links: "Връзки за този оглед",
  title: "Поемане на отговорност за огледа",
  lead: "Записаният водещ се нуждае от заместване. Проверете потвърдения час, времето за пътуване, участниците и достъпа преди поемане. Уговорката остава в сила; това не изпраща календарна актуализация и не потвърждава присъствие.",
  reviewed: "Прегледах записаната уговорка и приемам съществуващите ангажименти",
  reason: "Причина и бележка за предаването",
  submit: "Поемане като нов водещ",
  reserved: "Запазен интервал с времето за пътуване",
  busy: "Имате друг ангажимент в този интервал, включително времето за пътуване. Съществуващият оглед е непроменен. Разрешете конфликта, след това прегледайте и приемете отново.",
  external: "Проверих външния си календар за целия запазен интервал",
  plannedLead:
    "Текущият водещ Ви предложи този оглед. Проверете актуалния час, времето за пътуване, участниците и достъпа преди лично поемане. Дотогава огледът остава при текущия водещ; това не изпраща календарна актуализация.",
  offerTitle: "Предложение за планово предаване на огледа",
  offerLead:
    "Изберете колега с достъп до това дело. Водещият, запазеният час и достъпът до имота остават непроменени до личното приемане от колегата. Изборът не резервира неговия календар и не дава достъп.",
  receiver: "Приемащ водещ",
  offerReviewed: "Прегледах уговорката и искам да предложа предаването",
  offerSubmit: "Предлагане на предаването",
  pending: "Изчаква се приемане от водещия",
  stale:
    "Уговорката е променена след предложението. Оттеглете го и предложете актуалната уговорка отново.",
  withdraw: "Оттегляне на предложението",
  withdrawReviewed: "Искам да оттегля предложението; запазвам отговорността за огледа",
  none: "Няма подходящ колега на разположение за записания интервал.",
};
const ru: typeof en = {
  links: "Ссылки этого показа",
  title: "Принять ответственность за показ",
  lead: "Назначенному ведущему требуется замена. Перед принятием проверьте согласованное время, запас на дорогу, участников и доступ. Договорённость сохраняется; это действие не отправляет обновление календаря и не подтверждает явку.",
  reviewed: "Я проверил договорённость и принимаю существующие обязательства",
  reason: "Причина и примечание к передаче",
  submit: "Принять роль ведущего",
  reserved: "Зарезервированное время, включая дорогу",
  busy: "У вас уже есть встреча в этом интервале, включая дорогу. Существующий показ не изменён. Разрешите конфликт занятости, затем снова проверьте и подтвердите приём.",
  external: "Я проверил свой внешний календарь на весь зарезервированный интервал",
  plannedLead:
    "Текущий ведущий предложил вам этот показ. Перед личным принятием проверьте актуальное время, запас на дорогу, участников и доступ. До принятия показ остаётся за текущим ведущим; это действие не отправляет обновление календаря.",
  offerTitle: "Предложить плановую передачу показа",
  offerLead:
    "Выберите коллегу с доступом к этому делу. Ведущий, согласованное время и доступ к объекту сохраняются до личного принятия коллегой. Выбор не резервирует его календарь и не предоставляет доступ.",
  receiver: "Принимающий ведущий",
  offerReviewed: "Я проверил договорённость и хочу предложить передачу",
  offerSubmit: "Предложить передачу",
  pending: "Ожидается принятие ведущим",
  stale:
    "После предложения договорённость изменилась. Отзовите предложение и предложите актуальную договорённость заново.",
  withdraw: "Отозвать предложение",
  withdrawReviewed: "Я хочу отозвать предложение; ответственность за показ остаётся за мной",
  none: "Для записанного интервала сейчас нет доступного коллеги с нужными правами.",
};
export const hostHandoverCopy = (locale: string) =>
  locale === "bg" ? bg : locale === "ru" ? ru : en;
