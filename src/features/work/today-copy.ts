// O01 Today copy. Staff-only; BG and RU are drafts for human language review. Templates hold
// one {placeholder} each; the screen places a value or a <time> element there.
export function todayCopy(locale: string) {
  const s = (bg: string, ru: string, en: string) =>
    locale === "bg" ? bg : locale === "ru" ? ru : en;
  return {
    morning: s("Добро утро", "Доброе утро", "Good morning"),
    afternoon: s("Добър ден", "Добрый день", "Good afternoon"),
    evening: s("Добър вечер", "Добрый вечер", "Good evening"),
    leadWaiting: s(
      "Чакат действие: {n}. Започнете от началото на списъка.",
      "Ждут действия: {n}. Начните с начала списка.",
      "Waiting for action: {n}. Start at the top of the list.",
    ),
    // Only overdue items of one's own work wait for action; the rest is there to continue.
    leadOverdue: s(
      "Просрочено във Вашата работа: {n}. Започнете от „Продължете оттук“.",
      "Просрочено в вашей работе: {n}. Начните с раздела «Продолжить работу».",
      "Overdue in your own work: {n}. Start under “Continue from here”.",
    ),
    leadNothing: s(
      "Нищо в днешните списъци не чака Вашето действие. Продължете със своята работа по-долу.",
      "В сегодняшних списках ничто не ждёт вашего действия. Продолжите свою работу ниже.",
      "Nothing in today's lists is waiting for your action. Continue with your own work below.",
    ),
    leadEmpty: s(
      "Проверете запитванията за нови заявки.",
      "Проверьте, нет ли новых запросов.",
      "Check the inquiries for new requests.",
    ),
    leadFailed: s(
      "Заредете страницата отново. Ако не стане, проверете състоянието на системата.",
      "Обновите страницу. Если это не поможет, проверьте состояние системы.",
      "Reload the page. If that does not help, check the system status.",
    ),
    // A list that did not load may hold work, so the lead never reads as a clear day.
    leadPartialWaiting: s(
      "Чакат действие: {n}, но някои списъци не се заредиха. Заредете страницата отново, за да видите цялата работа за днес.",
      "Ждут действия: {n}, но некоторые списки не загрузились. Обновите страницу, чтобы увидеть всю работу на сегодня.",
      "Waiting for action: {n}, but some lists could not load. Reload the page to see all of today's work.",
    ),
    leadPartial: s(
      "Някои списъци не се заредиха, затова това не е цялата работа за днес. Заредете страницата отново.",
      "Некоторые списки не загрузились, поэтому здесь не вся работа на сегодня. Обновите страницу.",
      "Some lists could not load, so this is not all of today's work. Reload the page.",
    ),
    scope: s("Обхват на работата", "Область работы", "Work scope"),
    forAction: s("За действие", "К действию", "For action"),
    myTasks: s("Моите задачи", "Мои задачи", "My tasks"),
    team: s("Екип", "Команда", "Team"),
    attention: s("На Вашето внимание", "Требует вашего внимания", "For your attention"),
    order: s(
      "Подредено по приоритет, най-старото първо във всяка група.",
      "По приоритету, в каждой группе сначала самое давнее.",
      "In priority order, oldest first in each group.",
    ),
    unassigned: s("Неразпределени запитвания", "Запросы без исполнителя", "Unassigned requests"),
    continue: s("Продължете оттук", "Продолжить работу", "Continue from here"),
    allTasks: s("Всички задачи", "Все задачи", "All tasks"),
    // Lists that loaded and hold nothing are named on one line, never drawn as empty groups.
    nothingIn: s("Нищо не чака:", "Ничего не ждёт:", "Nothing waiting:"),
    more: s("Още в тази опашка", "Ещё в этой очереди", "More in this queue"),
    showMore: s("Покажете още {n}", "Показать ещё {n}", "Show {n} more"),
    // No page continues these lists yet; the line never points at one.
    firstLoaded: s(
      "„Днес“ показва първите {n} от {total}. Пълният списък все още не е достъпен тук.",
      "«Сегодня» показывает первые {n} из {total}. Полный список здесь пока недоступен.",
      "Today shows the first {n} of {total}. The full list is not available here yet.",
    ),
    // A list whose focus view pages the rest: the line links to it.
    firstShown: s(
      "„Днес“ показва първите {n} от {total}.",
      "«Сегодня» показывает первые {n} из {total}.",
      "Today shows the first {n} of {total}.",
    ),
    fullList: s("Отворете целия списък", "Открыть весь список", "Open the full list"),
    // O01 focus view: one queue, paged by the server past the rows Today shows.
    focus: {
      back: s("Назад към „Днес“", "Назад к «Сегодня»", "Back to Today"),
      lead: s(
        "Чакат преглед: {n}, най-старите първи.",
        "Ждут проверки: {n}, сначала самые давние.",
        "Waiting for review: {n}, oldest first.",
      ),
      later: s(
        "Продължение след предишната страница.",
        "Продолжение после предыдущей страницы.",
        "Continued after the previous page.",
      ),
      empty: s(
        "Няма преводи, които чакат Вашия преглед.",
        "Нет переводов, ожидающих вашей проверки.",
        "No translations are waiting for your review.",
      ),
      emptyLater: s(
        "След предишната страница няма повече преводи.",
        "После предыдущей страницы переводов больше нет.",
        "There are no more translations after the previous page.",
      ),
      invalid: s(
        "Тази връзка към страница вече не е валидна. Започнете от първата страница.",
        "Эта ссылка на страницу больше не действует. Начните с первой страницы.",
        "This page link is no longer valid. Start from the first page.",
      ),
      first: s("Към първата страница", "К первой странице", "Go to the first page"),
      pages: s("Страници на списъка", "Страницы списка", "Pages of this list"),
    },
    inQueue: s("В опашката:", "В очереди:", "In the queue:"),
    notLoaded: s("Не е заредено", "Не загружено", "Not loaded"),
    queueFailed: s(
      "Този списък не се зареди. В него може да чака работа.",
      "Этот список не загрузился. В нём может ждать работа.",
      "This list could not load. Work may be waiting in it.",
    ),
    overload: s(
      "Запитвания без отговорник: {n}",
      "Запросы без исполнителя: {n}",
      "Requests without an owner: {n}",
    ),
    overloadBody: s(
      "Най-старото е получено {age}. Дежурната опашка ги държи, докато някой ги поеме. Помолете ръководител да разпредели работата.",
      "Самый давний получен {age}. Пока их никто не принял, они в очереди подхвата. Попросите руководителя распределить работу.",
      "The oldest arrived {age}. Agency coverage holds them until someone accepts them. Ask a manager to share out the work.",
    ),
    owner: s("Отговорник: {name}", "Ответственный: {name}", "Owner: {name}"),
    holder: s("Държател: {name}", "Держатель: {name}", "Holder: {name}"),
    received: s("Получено {age}", "Получено {age}", "Received {age}"),
    overdueSince: s("Просрочено от {date}", "Просрочено с {date}", "Overdue since {date}"),
    dueAt: s("Срок {date}", "Срок {date}", "Due {date}"),
    next: s("Следваща стъпка: {action}", "Следующий шаг: {action}", "Next step: {action}"),
    waitingOn: s("Изчаква: {what}", "Ожидается: {what}", "Waiting on: {what}"),
    keys: s("Ключове {reference}", "Ключи {reference}", "Keys {reference}"),
    property: s("Имот {reference}", "Объект {reference}", "Property {reference}"),
    groups: {
      viewings: s("Огледи", "Показы", "Viewings"),
      listingReviews: s(
        "Корекции и прегледи на обяви",
        "Исправления и проверки объявлений",
        "Listing corrections and reviews",
      ),
      translationReviews: s("Преводи за преглед", "Переводы на проверку", "Translations to review"),
      deliveryExceptions: s(
        "Имейли за проверка на доставката",
        "Письма: проверить доставку",
        "Email delivery to check",
      ),
      publicationExceptions: s(
        "Публикации за проверка на доставката",
        "Публикации: проверить доставку",
        "Publication delivery to check",
      ),
      operatorDeliveryExceptions: s(
        "Операции по доставка за проверка",
        "Операции доставки: проверить",
        "Delivery operations to check",
      ),
      draftContinue: s("Моите чернови на обяви", "Мои черновики объявлений", "My listing drafts"),
    },
    viewing: {
      arrange_viewing: s("Оглед за уговаряне", "Показ нужно согласовать", "Viewing to arrange"),
      review_slot: s(
        "Предложен час за оглед",
        "Предложенное время показа",
        "Proposed viewing time",
      ),
      upcoming_viewing: s("Предстоящ оглед", "Предстоящий показ", "Upcoming viewing"),
      record_outcome: s(
        "Резултат от огледа за записване",
        "Нужно записать итог показа",
        "Viewing outcome to record",
      ),
      offered: s(
        "Предложен Ви оглед за водене",
        "Вам предложено провести показ",
        "Viewing offered to you to host",
      ),
    },
    host: s("Водещ: {name}", "Ведущий: {name}", "Host: {name}"),
    noTime: s("Все още няма уговорен час", "Время ещё не согласовано", "No time agreed yet"),
    caseRef: s("Случай {reference}", "Дело {reference}", "Case {reference}"),
    requested: s("Заявено {age}", "Запрошено {age}", "Requested {age}"),
    recorded: s("Записано {age}", "Записано {age}", "Recorded {age}"),
    saved: s("Запазено {age}", "Сохранено {age}", "Saved {age}"),
    paused: s("На пауза", "Приостановлено", "Paused"),
    draft: s("Чернова", "Черновик", "Draft"),
    earlierVersion: s(
      "По-ранна версия; проверете текущата",
      "Более ранняя версия; проверьте текущую",
      "An earlier version; check the current one",
    ),
    attempts: s("Опити: {n}", "Попыток: {n}", "Attempts: {n}"),
    lastAttempt: s("Последен опит {age}", "Последняя попытка {age}", "Last attempt {age}"),
    noAttempt: s("Няма записан опит", "Попыток не записано", "No attempt recorded"),
    outcome: {
      failed: s("Неуспешно", "Не удалось", "Failed"),
      outcome_unknown: s("Неизвестен резултат", "Результат неизвестен", "Result unknown"),
    },
    deliveryKind: {
      publish: s("Публикуване", "Публикация", "Publishing"),
      withdraw: s("Оттегляне", "Снятие", "Withdrawal"),
    },
    destination: {
      website: s("Уебсайт", "Сайт", "Website"),
      manual_portal: s("Портал (ръчно)", "Портал (вручную)", "Portal (manual)"),
    },
    operation: {
      email_send: s("Изпращане на имейл", "Отправка письма", "Email sending"),
      destination_publish: s(
        "Публикуване към дестинация",
        "Публикация на площадке",
        "Publishing to a destination",
      ),
      destination_withdraw: s(
        "Оттегляне от дестинация",
        "Снятие с площадки",
        "Withdrawal from a destination",
      ),
      media_purge: s("Премахване на медия", "Удаление медиа", "Media removal"),
    },
    actions: {
      accept: s("поемете и отговорете", "примите и ответьте", "accept and reply"),
      firstReply: s("запишете първия отговор", "запишите первый ответ", "record the first reply"),
      conversation: s("продължете разговора", "продолжите разговор", "continue the conversation"),
      clientReply: s(
        "проверете за отговор от клиента",
        "проверьте, ответил ли клиент",
        "check for the client's reply",
      ),
      review: s("прегледайте и решете", "проверьте и решите", "review and decide"),
      outcome: s("запишете резултата", "запишите результат", "record the outcome"),
      dependency: s("проверете зависимостта", "проверьте зависимость", "check the dependency"),
      handover: s("приемете или откажете", "примите или отклоните", "accept or decline"),
      keyReturn: s("запишете връщането", "запишите возврат", "record the return"),
      proposeTime: s("предложете час", "предложите время", "propose a time"),
      confirmTime: s(
        "потвърдете или променете часа",
        "подтвердите или измените время",
        "confirm or change the time",
      ),
      arrangements: s(
        "проверете достъпа и уговорките",
        "проверьте доступ и договорённости",
        "check access and arrangements",
      ),
      changes: s(
        "направете поисканите промени",
        "внесите запрошенные изменения",
        "make the requested changes",
      ),
      facts: s("добавете липсващите факти", "добавьте недостающие факты", "add the missing facts"),
      availability: s(
        "потвърдете актуалната наличност",
        "подтвердите актуальность",
        "confirm current availability",
      ),
      translation: s("прегледайте превода", "проверьте перевод", "review the translation"),
      delivery: s(
        "прегледайте доставката и решете",
        "проверьте доставку и решите",
        "review the delivery and decide",
      ),
      reconcile: s(
        "проверете резултата преди нов опит",
        "сверьте результат перед новой попыткой",
        "confirm the result before trying again",
      ),
      operations: s(
        "проверете в операциите на опашката",
        "проверьте в операциях очереди",
        "check it in queue operations",
      ),
      resume: s("решете дали да продължите", "решите, возобновлять ли", "decide whether to resume"),
      editing: s("продължете редакцията", "продолжите редактирование", "continue editing"),
      openCase: s("отворете случая", "откройте дело", "open the Case"),
    },
    emptyTitle: s(
      "Нищо в днешните списъци не чака действие",
      "В сегодняшних списках ничего не ждёт действия",
      "Nothing in today's lists needs action",
    ),
    emptyAction: s("Отворете запитванията", "Открыть запросы", "Open the inquiries"),
    failed: s(
      "Не успяхме да заредим задачите за днес. Това не означава, че няма работа.",
      "Не удалось загрузить сегодняшнюю работу. Это не значит, что работы нет.",
      "We could not load today's work. This does not mean there is none.",
    ),
    reload: s("Заредете страницата отново", "Обновить страницу", "Reload the page"),
    // Same wording as the O12 Butler panel; Butler only ever prepares a draft for review.
    butlerStatus: s("Под Ваш контрол", "Под вашим контролем", "Under your control"),
    butlerOffer: s(
      "Мога да подготвя отговор на {reference} от запитването и да отделя неизвестните факти.",
      "Я могу подготовить ответ на {reference} по тексту запроса и отделить неизвестные факты.",
      "I can prepare a reply to {reference} from the request and set apart the facts I do not know.",
    ),
    butlerScope: s(
      "Само разрешен контекст",
      "Только разрешённый контекст",
      "Permitted context only",
    ),
    butlerNote: s(
      "Ще получите чернова за преглед. Нищо не се изпраща или публикува.",
      "Вы получите черновик для проверки. Ничего не отправляется и не публикуется.",
      "You will get a draft to review. Nothing is sent or published.",
    ),
    butlerPrepare: s("Подгответе предложение", "Подготовить предложение", "Prepare a proposal"),
    // O32/F29: assistance stays inside one selected record's review; Today has no open chat.
    butlerBoundary: s(
      "Butler подготвя чернова само за избрания запис и само в неговия преглед. Тук няма свободен чат.",
      "Butler готовит черновик только для выбранной записи и только в её проверке. Свободного чата здесь нет.",
      "Butler drafts only for the selected record, in its own review. There is no open chat here.",
    ),
    manualHeading: s("Предпочитате сами?", "Предпочитаете сами?", "Prefer to do it yourself?"),
    manual: s("Продължете без Butler", "Продолжить без Butler", "Continue without Butler"),
  };
}
