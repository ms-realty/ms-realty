const en = {
  title: "Saved-search alert rule",
  lead: "Review the fixed service template, subscriber schedule and link destinations before approving this rule. Separate verified search-alert consent is required for every recipient.",
  active: "Human approval is current",
  inactive: "No current human approval",
  gateOn: "Runtime delivery is enabled; all per-message checks still apply.",
  gateOff: "Runtime delivery is disabled. Recording approval does not enable it.",
  schedule:
    "Daily by default; weekly when selected. At most one digest per subscriber-local calendar day or Monday-starting week. No fixed delivery hour is promised.",
  content:
    "A digest contains up to 20 currently approved listing titles, references and links. Criteria needing confirmation are labelled. Empty periods produce no email. No marketing, AI copy, media or tracking is included.",
  fences:
    "Pause, edits, withdrawal, changed terms, revoked permissions and changed publications stop queued work. Provider acceptance is not delivery; unknown outcomes are never automatically resent.",
  destinations: "Link destinations",
  template: "Exact fixed text by language",
  entry: "Each listing entry",
  placeholder: "[approved listing reference] — [approved title]\n[current canonical listing URL]",
  review: "I reviewed this exact template, schedule and destinations.",
  note: "Review note",
  expiry: "Approval expires at (UTC)",
  approve: "Approve fixed rule",
  disable: "Disable rule and cancel queued digests",
  receipt: "Decision recorded",
  error:
    "This submission did not return a confirmed result. Review the current state and retained inputs before submitting again.",
  conflict: "The rule or approval changed. Review the current state before making a new decision.",
  reauth: "Verify your identity again before deciding.",
  openReauth: "Verify identity",
  back: "Queue and delivery status",
  expires: "Expires",
  hint: "The note records your review; it does not change the message text.",
  disabledBoundary:
    "This page approves or disables one service rule. It never sends a test message or grants subscriber consent.",
};
const bg: typeof en = {
  title: "Правило за известия по запазено търсене",
  lead: "Прегледайте точния служебен шаблон, графика и адресите на връзките преди одобрение. За всеки получател е необходимо отделно потвърдено съгласие за известия по търсене.",
  active: "Има валидно човешко одобрение",
  inactive: "Няма валидно човешко одобрение",
  gateOn:
    "Изпращането е разрешено в средата; всички проверки за всяко съобщение остават задължителни.",
  gateOff: "Изпращането е изключено в средата. Записването на одобрение не го включва.",
  schedule:
    "Ежедневно по подразбиране; седмично при избор. Най-много едно обобщение за календарен ден или седмица от понеделник в часовата зона на абоната. Не се обещава точен час на доставка.",
  content:
    "Обобщението съдържа до 20 актуално одобрени заглавия, референции и връзки към обяви. Критериите за потвърждение са обозначени. При липса на съвпадения няма имейл. Без маркетинг, AI текст, медия или проследяване.",
  fences:
    "Пауза, промени, отказ, сменени условия, отнети права и променени публикации спират чакащата работа. Приемане от доставчик не е доставка; неизвестен резултат не се изпраща автоматично повторно.",
  destinations: "Адреси на връзките",
  template: "Точен фиксиран текст по език",
  entry: "Всеки запис за обява",
  placeholder: "[одобрена референция] — [одобрено заглавие]\n[актуален каноничен адрес на обявата]",
  review: "Прегледах този точен шаблон, график и адреси.",
  note: "Бележка от прегледа",
  expiry: "Одобрението изтича на (UTC)",
  approve: "Одобри фиксираното правило",
  disable: "Изключи правилото и отмени чакащите обобщения",
  receipt: "Решението е записано",
  error:
    "Няма потвърден резултат от изпращането. Прегледайте текущото състояние и запазените полета преди ново изпращане.",
  conflict:
    "Правилото или одобрението е променено. Прегледайте текущото състояние преди ново решение.",
  reauth: "Потвърдете отново самоличността си преди решение.",
  openReauth: "Потвърди самоличност",
  back: "Състояние на опашката и доставките",
  expires: "Изтича",
  hint: "Бележката записва прегледа ви; тя не променя текста на съобщението.",
  disabledBoundary:
    "Тази страница одобрява или изключва едно служебно правило. Тя не изпраща тестово съобщение и не дава съгласие вместо абонат.",
};
const ru: typeof en = {
  title: "Правило уведомлений сохранённого поиска",
  lead: "Перед одобрением проверьте точный служебный шаблон, расписание и адреса ссылок. Для каждого получателя требуется отдельное подтверждённое согласие на уведомления поиска.",
  active: "Одобрение человека действует",
  inactive: "Нет действующего одобрения человека",
  gateOn: "Отправка включена в среде; все проверки каждого сообщения остаются обязательными.",
  gateOff: "Отправка отключена в среде. Запись одобрения её не включает.",
  schedule:
    "Ежедневно по умолчанию; еженедельно по выбору. Не более одной сводки за календарный день или неделю с понедельника в часовом поясе подписчика. Точный час доставки не обещается.",
  content:
    "Сводка содержит до 20 актуально одобренных заголовков, референций и ссылок. Критерии для подтверждения отмечены. При отсутствии совпадений письма нет. Без маркетинга, AI текста, медиа и отслеживания.",
  fences:
    "Пауза, изменения, отказ, смена условий, отзыв прав и изменения публикаций останавливают очередь. Принятие провайдером не означает доставку; неизвестный результат не повторяется автоматически.",
  destinations: "Адреса ссылок",
  template: "Точный фиксированный текст по языкам",
  entry: "Каждая запись объявления",
  placeholder:
    "[одобренная референция] — [одобренный заголовок]\n[текущий канонический адрес объявления]",
  review: "Я проверил этот точный шаблон, расписание и адреса.",
  note: "Примечание к проверке",
  expiry: "Одобрение истекает (UTC)",
  approve: "Одобрить фиксированное правило",
  disable: "Отключить правило и отменить ожидающие сводки",
  receipt: "Решение записано",
  error:
    "Нет подтверждённого результата отправки. Проверьте текущее состояние и сохранённые поля перед повторной отправкой.",
  conflict: "Правило или одобрение изменилось. Проверьте текущее состояние перед новым решением.",
  reauth: "Повторно подтвердите личность перед решением.",
  openReauth: "Подтвердить личность",
  back: "Состояние очереди и доставки",
  expires: "Истекает",
  hint: "Примечание фиксирует проверку и не меняет текст сообщения.",
  disabledBoundary:
    "Эта страница одобряет или отключает одно служебное правило. Она не отправляет тестовые письма и не даёт согласие за подписчика.",
};
export const subscriptionCopy = (locale: string) =>
  locale === "bg" ? bg : locale === "ru" ? ru : en;
