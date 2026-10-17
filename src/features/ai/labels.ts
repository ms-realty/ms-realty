// Staff labels describe recorded observations; they confer no execution authority.
const labels = {
  "run.queued": ["Waiting to generate", "Чака генериране", "Ожидает генерации"],
  "run.running": ["Generating a draft", "Генериране на чернова", "Создание черновика"],
  "run.draft": [
    "Draft for human review",
    "Чернова за човешки преглед",
    "Черновик для проверки человеком",
  ],
  "run.failed": ["Draft generation failed", "Генерирането е неуспешно", "Генерация не удалась"],
  "run.stale": [
    "Source changed; review again",
    "Източникът е променен; нужен е нов преглед",
    "Источник изменился; проверьте снова",
  ],
  "run.accepted": [
    "Accepted for manual use",
    "Приета за ръчно използване",
    "Принят для ручного использования",
  ],
  "run.rejected": ["Draft rejected", "Черновата е отхвърлена", "Черновик отклонён"],
  "task.inquiry_summary": ["Inquiry summary", "Обобщение на запитване", "Обобщение запроса"],
  "task.reply_draft": ["Reply draft", "Чернова на отговор", "Черновик ответа"],
  "task.task_draft": [
    "Next-action draft",
    "Чернова на следваща стъпка",
    "Черновик следующего шага",
  ],
  "task.locale.draft": [
    "Listing translation draft",
    "Чернова на превод на обява",
    "Черновик перевода объявления",
  ],
  "task.intake.extract": [
    "Broker-note fact candidates",
    "Предложени данни от брокерска бележка",
    "Предлагаемые данные из заметки брокера",
  ],
  "operation.pending": [
    "Request is being processed",
    "Заявката се обработва",
    "Запрос обрабатывается",
  ],
  "operation.accepted": [
    "Request accepted for processing",
    "Заявката е приета за обработка",
    "Запрос принят в обработку",
  ],
  "operation.in_progress": [
    "Request is being processed",
    "Заявката се обработва",
    "Запрос обрабатывается",
  ],
  "operation.succeeded": ["Request recorded", "Заявката е записана", "Запрос записан"],
  "operation.failed": [
    "Request was not completed",
    "Заявката не е завършена",
    "Запрос не завершён",
  ],
  "operation.outcome_unknown": [
    "Outcome is not yet confirmed",
    "Резултатът още не е потвърден",
    "Результат ещё не подтверждён",
  ],
  "field.reference": ["Reference", "Номер", "Номер"],
  "field.purpose": ["Request purpose", "Цел на запитването", "Цель запроса"],
  "field.locale": ["Source language", "Език на източника", "Язык источника"],
  "field.message": ["Source message", "Съобщение от източника", "Исходное сообщение"],
  "field.note": ["Broker note", "Брокерска бележка", "Заметка брокера"],
  "queue.auth.email_link": [
    "Client access email",
    "Имейл за достъп на клиент",
    "Письмо для доступа клиента",
  ],
  "queue.outbox.dispatch": [
    "External delivery dispatch",
    "Изпълнение на външни доставки",
    "Выполнение внешней доставки",
  ],
  "queue.outbox.sweep": ["Delivery reconciliation", "Проверка на доставките", "Сверка доставки"],
  "queue.search_alerts.sweep": [
    "Search alert checks",
    "Проверка на известията за търсене",
    "Проверка уведомлений о поиске",
  ],
  "queue.rate_limit.prune": [
    "Expired request-limit cleanup",
    "Почистване на изтекли ограничения",
    "Очистка истёкших ограничений",
  ],
  "queue.files.process": [
    "File safety processing",
    "Проверка и обработка на файлове",
    "Проверка и обработка файлов",
  ],
  "queue.ai.draft": [
    "Butler draft generation",
    "Генериране на чернови с Butler",
    "Создание черновиков Butler",
  ],
  "queue.inbox.reconcile": [
    "Provider-event reconciliation",
    "Проверка на събитията от доставчика",
    "Сверка событий провайдера",
  ],
  "queue.worker.heartbeat": [
    "Queue progress checks",
    "Проверка на напредъка на опашката",
    "Проверка хода очереди",
  ],
  "job.created": ["Waiting", "Чака", "Ожидает"],
  "job.retry": ["Waiting for another attempt", "Чака следващ опит", "Ожидает следующей попытки"],
  "job.active": ["Processing", "Обработва се", "Обрабатывается"],
  "job.completed": ["Completed", "Завършена", "Завершено"],
  "job.cancelled": ["Cancelled", "Отменена", "Отменено"],
  "job.failed": ["Failed", "Неуспешна", "Не удалось"],
  "worker.current": [
    "Current queue progress recorded",
    "Записан е текущ напредък на опашката",
    "Текущий ход очереди зафиксирован",
  ],
  "worker.stale": [
    "Queue progress needs checking",
    "Напредъкът на опашката трябва да се провери",
    "Ход очереди нужно проверить",
  ],
  "worker.missing": [
    "No queue progress recorded",
    "Няма записан напредък на опашката",
    "Ход очереди не зафиксирован",
  ],
  "reason.no_progress": [
    "No completed progress check is available.",
    "Няма завършена проверка на напредъка.",
    "Завершённая проверка хода очереди отсутствует.",
  ],
  "reason.build_unbound": [
    "The running version is not identified.",
    "Текущата версия не е идентифицирана.",
    "Текущая версия не определена.",
  ],
  "reason.other_build": [
    "The check belongs to another version.",
    "Проверката е за друга версия.",
    "Проверка относится к другой версии.",
  ],
  "reason.future_timestamp": [
    "The check time is ahead of the system clock.",
    "Часът на проверката е след системния часовник.",
    "Время проверки опережает системные часы.",
  ],
  "reason.progress_expired": [
    "The recorded check is no longer current.",
    "Записаната проверка вече не е актуална.",
    "Зафиксированная проверка уже не актуальна.",
  ],
  "reason.recent_queue_progress": [
    "A recent progress check belongs to this version.",
    "Скорошна проверка на напредъка е за тази версия.",
    "Недавняя проверка хода очереди относится к этой версии.",
  ],
  "provider.resend": ["Resend", "Resend", "Resend"],
  "provider.other": ["Another provider", "Друг доставчик", "Другой провайдер"],
  "event.email.sent": [
    "Email accepted by provider",
    "Имейлът е приет от доставчика",
    "Письмо принято провайдером",
  ],
  "event.email.delivered": [
    "Email delivery reported",
    "Доставката на имейла е отчетена",
    "Доставка письма подтверждена провайдером",
  ],
  "event.email.delivery_delayed": [
    "Email delivery delayed",
    "Доставката на имейла се забавя",
    "Доставка письма задерживается",
  ],
  "event.email.bounced": ["Email returned", "Имейлът е върнат", "Письмо возвращено"],
  "event.email.complained": [
    "Spam complaint received",
    "Получен е сигнал за нежелан имейл",
    "Получена жалоба на спам",
  ],
  "event.email.failed": [
    "Email delivery failed",
    "Доставката на имейла е неуспешна",
    "Доставка письма не удалась",
  ],
  "event.email.opened": [
    "Email-open event reported",
    "Отчетено е отваряне на имейл",
    "Провайдер сообщил об открытии письма",
  ],
  "event.email.clicked": [
    "Email-link event reported",
    "Отчетено е отваряне на връзка в имейл",
    "Провайдер сообщил о переходе по ссылке",
  ],
  "event.email.received": [
    "Incoming email reported",
    "Отчетен е входящ имейл",
    "Провайдер сообщил о входящем письме",
  ],
  "event.unsupported_event": [
    "Unrecognized provider event",
    "Неразпознато събитие от доставчика",
    "Неизвестное событие провайдера",
  ],
  "inbox.received": ["Received for processing", "Получено за обработка", "Получено для обработки"],
  "inbox.processed": ["Processing recorded", "Обработката е записана", "Обработка зафиксирована"],
  "inbox.rejected": ["Event rejected", "Събитието е отхвърлено", "Событие отклонено"],
  "inbox.ignored": [
    "No further processing required",
    "Не е нужна допълнителна обработка",
    "Дополнительная обработка не требуется",
  ],
  "externalKind.email_send": ["Email delivery", "Доставка на имейл", "Доставка письма"],
  "externalKind.destination_publish": [
    "Publication to a destination",
    "Публикуване към място за показване",
    "Публикация на площадке",
  ],
  "externalKind.destination_withdraw": [
    "Withdrawal from a destination",
    "Оттегляне от място за показване",
    "Снятие с площадки",
  ],
  "externalKind.media_purge": [
    "Restricted-media removal",
    "Премахване на ограничени изображения",
    "Удаление ограниченных изображений",
  ],
  "external.queued": ["Queued for an attempt", "Чака изпълнение", "Ожидает выполнения"],
  "external.attempting": [
    "External attempt in progress",
    "Изпълнява се външен опит",
    "Внешняя попытка выполняется",
  ],
  "external.acknowledged": [
    "Provider acknowledgment recorded",
    "Записано е потвърждение от доставчика",
    "Подтверждение провайдера зафиксировано",
  ],
  "external.verified": [
    "External result verified",
    "Външният резултат е проверен",
    "Внешний результат проверен",
  ],
  "external.failed": [
    "External action failed",
    "Външното действие е неуспешно",
    "Внешнее действие не удалось",
  ],
  "external.outcome_unknown": [
    "Result unconfirmed; reconciliation required",
    "Резултатът не е потвърден; нужна е проверка",
    "Результат не подтверждён; требуется сверка",
  ],
  "external.cancelled": [
    "External action cancelled",
    "Външното действие е отменено",
    "Внешнее действие отменено",
  ],
  "code.delivery_awaiting_reference": [
    "Waiting for the provider reference",
    "Чака се номер от доставчика",
    "Ожидается номер провайдера",
  ],
  "code.inbound_requires_triage": [
    "Incoming message needs review",
    "Входящото съобщение чака преглед",
    "Входящее сообщение требует проверки",
  ],
  "code.unsupported_event": [
    "Provider event needs review",
    "Събитието от доставчика чака преглед",
    "Событие провайдера требует проверки",
  ],
  "code.provider_unreachable": [
    "Provider could not be reached",
    "Няма връзка с доставчика",
    "Провайдер недоступен",
  ],
  "code.delivery_failed": ["Delivery failed", "Доставката е неуспешна", "Доставка не удалась"],
  "code.unsupported_or_expired_message": [
    "Message is unavailable for this action",
    "Съобщението е недостъпно за това действие",
    "Сообщение недоступно для этого действия",
  ],
  "code.provider_rate_limited": [
    "Provider temporarily limited requests",
    "Доставчикът временно ограничава заявките",
    "Провайдер временно ограничил запросы",
  ],
  "code.provider_rejected": [
    "Provider rejected the request",
    "Доставчикът е отказал заявката",
    "Провайдер отклонил запрос",
  ],
  "code.unclassified_error": [
    "Failure needs operator review",
    "Неуспехът изисква преглед от оператор",
    "Ошибка требует проверки оператором",
  ],
} as const;

export function aiLabel(
  kind:
    | "run"
    | "task"
    | "operation"
    | "field"
    | "queue"
    | "job"
    | "worker"
    | "reason"
    | "provider"
    | "event"
    | "inbox"
    | "externalKind"
    | "external"
    | "code",
  value: string | null,
  locale: string,
): string {
  const code =
    kind === "code" && /^provider_rejected_[45]\d\d$/.test(value ?? "")
      ? "provider_rejected"
      : value;
  const key = `${kind}.${code}`;
  const row = labels[key as keyof typeof labels];
  return (
    row?.[locale === "bg" ? 1 : locale === "ru" ? 2 : 0] ??
    (locale === "bg"
      ? "Нужен е преглед"
      : locale === "ru"
        ? "Требуется проверка"
        : "Requires review")
  );
}
