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
    leadNothing: s(
      "Няма запитвания или задачи, които чакат Вашето действие. Продължете с отворените си запитвания.",
      "Нет запросов и задач, которые ждут вашего действия. Продолжите работу с открытыми запросами.",
      "No requests or tasks are waiting for your action. Continue with your open inquiries.",
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
    none: s("Няма чакащи.", "Ничего не ждёт.", "Nothing waiting."),
    more: s("Още в тази опашка", "Ещё в этой очереди", "More in this queue"),
    inQueue: s("В опашката:", "В очереди:", "In the queue:"),
    overload: s(
      "Повече от {n} запитвания нямат отговорник",
      "Больше {n} запросов без исполнителя",
      "More than {n} requests have no owner",
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
    },
    emptyTitle: s(
      "Няма запитвания или задачи за действие",
      "Нет запросов и задач, требующих действия",
      "No requests or tasks need action",
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
    manualHeading: s("Предпочитате сами?", "Предпочитаете сами?", "Prefer to do it yourself?"),
    manual: s("Продължете без Butler", "Продолжить без Butler", "Continue without Butler"),
  };
}
