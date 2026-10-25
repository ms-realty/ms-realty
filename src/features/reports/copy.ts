import type { ReportMetricId } from "@/server/reports/queries";

interface Copy {
  title: string;
  about: string;
  period: string;
  days: string;
  scope: string;
  all: string;
  mine: string;
  apply: string;
  export: string;
  asOf: string;
  window: string;
  definitions: string;
  snapshot: string;
  empty: string;
  denied: string;
  sample: string;
  unavailable: string;
  retry: string;
  response: string;
  responseDefinition: string;
  received: string;
  responded: string;
  missing: string;
  median: string;
  minutes: string;
  small: string;
  incomplete: string;
  staffed: string;
  effort: string;
  invalid: string;
  unknown: string;
  scopeNotice: string;
  moreTools: string;
  metrics: Record<ReportMetricId, { title: string; definition: string }>;
}
const en: Copy = {
  title: "Business reports",
  about: "Find work that needs attention and review recorded service outcomes.",
  period: "Observation period",
  days: "days",
  scope: "Responsibility",
  all: "All work I may read",
  mine: "My responsibility",
  apply: "Show report",
  export: "Download these totals",
  asOf: "Observed at",
  window: "Outcomes observed from",
  definitions: "What this report measures",
  snapshot:
    "Open work is a current snapshot. The selected period applies to response, viewing and stage-change observations. This is a rolling, incomplete period.",
  empty: "No matching records within your access.",
  denied: "Your access does not include this measure.",
  sample:
    "Only the first 20 matching records are shown. The total includes all matching records within your access.",
  unavailable: "The report could not be read. The totals are unknown. Your work has not changed.",
  retry: "Try reading again",
  response: "Useful human response",
  responseDefinition:
    "Requests received in the selected period. A recorded useful human contact counts; an automatic acknowledgement does not. Duration is elapsed time from receipt to that contact, including time outside staffed hours.",
  received: "Requests received",
  responded: "With a recorded useful response",
  missing: "Without a valid recorded useful response",
  median: "Median elapsed minutes among recorded responses",
  minutes: "minutes",
  small: "Fewer than five recorded responses: a small sample.",
  incomplete:
    "Missing responses are not treated as zero-minute responses. This cohort can change as more responses are recorded.",
  staffed:
    "Response time within staffed hours is unknown until approved hours and their policy are connected to these observations.",
  effort:
    "Correction and re-entry effort is unknown: this report has no recorded effort observations.",
  invalid:
    "Some response times fall outside their valid receipt-to-observation interval and are excluded from duration calculations.",
  unknown: "Unknown",
  scopeNotice:
    "Totals and links cover only records and fields your current access permits. Opening a record checks access again. Use Back to return to these filters.",
  moreTools: "More tools",
  metrics: {
    unowned: {
      title: "Requests awaiting a named owner",
      definition:
        "Open received, assigned or waiting requests without a named owner. Their coverage queue retains responsibility. Unowned requests are outside My responsibility.",
    },
    promises: {
      title: "Overdue client promises",
      definition:
        "Open, in-progress or waiting tasks with a recorded client promise and an elapsed promised due time. Internal follow-up alone is not a client promise.",
    },
    nextActions: {
      title: "Deals with a due next step or review",
      definition:
        "Active deals with an elapsed next-action or waiting-review time. This measure requires access to internal deal work.",
    },
    viewings: {
      title: "Recorded completed viewings",
      definition:
        "Appointments currently recorded as completed whose confirmed end falls in the selected period. A request, confirmation or past appointment alone is not completion.",
    },
    progressions: {
      title: "Recorded stage changes",
      definition:
        "Recorded changes from one deal stage to a different stage during the selected period. Initial creation is excluded. This counts events, including reversals, rather than distinct deals or inferred conversion.",
    },
    freshness: {
      title: "Listings needing freshness review",
      definition:
        "Listings with an elapsed review time, review due, conflicting or unknown freshness. A timer never confirms availability.",
    },
    deliveries: {
      title: "Email deliveries needing attention",
      definition:
        "Outgoing deal emails currently failed, bounced or with an unknown outcome. Provider acceptance does not prove delivery; no recipient or message content appears here.",
    },
  },
};
const bg: Copy = {
  ...en,
  title: "Справки за работата",
  about: "Намерете работа, която изисква внимание, и прегледайте отчетените резултати.",
  period: "Период на наблюдение",
  days: "дни",
  scope: "Отговорност",
  all: "Цялата достъпна за мен работа",
  mine: "Моя отговорност",
  apply: "Покажи справката",
  export: "Изтегли тези обобщения",
  asOf: "Наблюдение към",
  window: "Отчетени резултати от",
  definitions: "Какво измерва справката",
  snapshot:
    "Отворената работа е текущо състояние. Периодът се отнася до отговорите, огледите и промените на етап. Това е подвижен, незавършен период.",
  empty: "Няма съответстващи записи в рамките на достъпа ви.",
  denied: "Достъпът ви не включва този показател.",
  sample:
    "Показани са първите 20 записа. Общият брой включва всички съответстващи записи в рамките на достъпа ви.",
  unavailable: "Справката не можа да се прочете. Броят е неизвестен. Работата ви не е променена.",
  retry: "Прочети отново",
  response: "Полезен човешки отговор",
  responseDefinition:
    "Запитвания, получени през избрания период. Отчита се записан полезен контакт с човек; автоматичното потвърждение не е отговор. Продължителността включва цялото време от получаването до контакта, включително извън работните часове.",
  received: "Получени запитвания",
  responded: "Със записан полезен отговор",
  missing: "Без валиден записан полезен отговор",
  median: "Медиана на изминалите минути за записаните отговори",
  minutes: "минути",
  small: "По-малко от пет записани отговора: малка извадка.",
  incomplete:
    "Липсващите отговори не се считат за отговори за нула минути. Групата може да се промени при записване на още отговори.",
  staffed:
    "Времето за отговор в работни часове е неизвестно, докато одобрените часове и правилата им не бъдат свързани с тези наблюдения.",
  effort:
    "Усилията за поправки и повторно въвеждане са неизвестни: справката няма записани наблюдения за тях.",
  invalid:
    "Някои времена за отговор са извън допустимия интервал и не участват в изчисляването на продължителността.",
  unknown: "Неизвестно",
  scopeNotice:
    "Броят и връзките включват само записите и полетата, разрешени от текущия ви достъп. При отваряне достъпът се проверява отново. Назад връща същите филтри.",
  moreTools: "Още инструменти",
  metrics: {
    unowned: {
      title: "Запитвания без поименен отговорник",
      definition:
        "Отворени получени, възложени или чакащи запитвания без поименен отговорник. Опашката за покритие запазва отговорността. Те не са в Моя отговорност.",
    },
    promises: {
      title: "Просрочени обещания към клиенти",
      definition:
        "Отворени, изпълнявани или чакащи задачи с обещание към клиент и изтекъл обещан срок. Вътрешното проследяване само по себе си не е обещание.",
    },
    nextActions: {
      title: "Сделки с дължима стъпка или преглед",
      definition:
        "Активни сделки с изтекло време за следваща стъпка или преглед на изчакване. Изисква достъп до вътрешната работа по сделката.",
    },
    viewings: {
      title: "Записани приключили огледи",
      definition:
        "Срещи, записани като приключили, с потвърден край през избрания период. Заявка, потвърждение или изминал час сами по себе си не са приключване.",
    },
    progressions: {
      title: "Записани промени на етап",
      definition:
        "Записани преминавания между различни етапи през периода. Създаването се изключва. Броят се събития, включително връщания, а не отделни сделки или предполагаема конверсия.",
    },
    freshness: {
      title: "Обяви за преглед на актуалността",
      definition:
        "Обяви с изтекъл срок за преглед, дължим преглед, противоречива или неизвестна актуалност. Таймерът не потвърждава наличност.",
    },
    deliveries: {
      title: "Имейли, изискващи внимание",
      definition:
        "Изходящи имейли по сделки с неуспех, отказ или неизвестен резултат. Приемането от доставчика не доказва доставка; получатели и съдържание не се показват.",
    },
  },
};
const ru: Copy = {
  ...en,
  title: "Отчёты о работе",
  about: "Найдите работу, требующую внимания, и просмотрите зафиксированные результаты.",
  period: "Период наблюдения",
  days: "дней",
  scope: "Ответственность",
  all: "Вся доступная мне работа",
  mine: "Моя ответственность",
  apply: "Показать отчёт",
  export: "Скачать эти итоги",
  asOf: "Наблюдение на",
  window: "Зафиксированные результаты с",
  definitions: "Что измеряет отчёт",
  snapshot:
    "Открытая работа отражает текущее состояние. Период относится к ответам, просмотрам и изменениям этапа. Это скользящий, незавершённый период.",
  empty: "В пределах вашего доступа подходящих записей нет.",
  denied: "Ваш доступ не включает этот показатель.",
  sample:
    "Показаны первые 20 записей. Итог включает все подходящие записи в пределах вашего доступа.",
  unavailable: "Не удалось прочитать отчёт. Итоги неизвестны. Ваша работа не изменилась.",
  retry: "Прочитать снова",
  response: "Полезный ответ человека",
  responseDefinition:
    "Запросы, полученные за выбранный период. Учитывается записанный полезный контакт с человеком; автоматическое подтверждение не является ответом. Длительность включает всё время от получения до контакта, в том числе вне рабочих часов.",
  received: "Полученные запросы",
  responded: "С записанным полезным ответом",
  missing: "Без корректного записанного полезного ответа",
  median: "Медиана прошедших минут среди записанных ответов",
  minutes: "минут",
  small: "Менее пяти записанных ответов: малая выборка.",
  incomplete:
    "Отсутствующие ответы не считаются ответами за ноль минут. Группа меняется по мере записи новых ответов.",
  staffed:
    "Время ответа в рабочие часы неизвестно, пока утверждённые часы и их правила не связаны с наблюдениями.",
  effort: "Затраты на исправления и повторный ввод неизвестны: для них нет записанных наблюдений.",
  invalid:
    "Некоторые времена ответа вне допустимого интервала и исключены из расчёта длительности.",
  unknown: "Неизвестно",
  scopeNotice:
    "Итоги и ссылки включают только записи и поля, разрешённые текущим доступом. При открытии доступ проверяется снова. Назад возвращает те же фильтры.",
  moreTools: "Другие инструменты",
  metrics: {
    unowned: {
      title: "Запросы без назначенного ответственного",
      definition:
        "Открытые полученные, назначенные или ожидающие запросы без ответственного человека. Очередь покрытия сохраняет ответственность. Они не входят в Моя ответственность.",
    },
    promises: {
      title: "Просроченные обещания клиентам",
      definition:
        "Открытые, выполняемые или ожидающие задачи с обещанием клиенту и истёкшим обещанным сроком. Внутреннее напоминание само по себе не является обещанием.",
    },
    nextActions: {
      title: "Сделки с наступившим действием или проверкой",
      definition:
        "Активные сделки с истёкшим сроком следующего действия или проверки ожидания. Требуется доступ к внутренней работе по сделке.",
    },
    viewings: {
      title: "Записанные завершённые просмотры",
      definition:
        "Встречи, записанные завершёнными, с подтверждённым окончанием в выбранном периоде. Запрос, подтверждение или прошедшее время сами по себе не являются завершением.",
    },
    progressions: {
      title: "Записанные изменения этапа",
      definition:
        "Зафиксированные переходы между разными этапами за период. Создание исключается. Считаются события, включая возвраты, а не отдельные сделки или предполагаемая конверсия.",
    },
    freshness: {
      title: "Объявления для проверки актуальности",
      definition:
        "Объявления с истёкшим сроком проверки, необходимой проверкой, противоречивой или неизвестной актуальностью. Таймер не подтверждает доступность.",
    },
    deliveries: {
      title: "Письма, требующие внимания",
      definition:
        "Исходящие письма по сделкам с неуспехом, отказом или неизвестным результатом. Принятие провайдером не доказывает доставку; получатели и содержание не показаны.",
    },
  },
};
export const reportsCopy = (locale: string): Copy =>
  locale === "bg" ? bg : locale === "ru" ? ru : en;
