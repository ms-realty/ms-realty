// Staff-only draft copy; this is not public translation approval.
const en = {
  boundary:
    "Check the file without changing business records. After a separate review, selected rows can create or update supplied working drafts. Facts, availability and publication still need their normal human review.",
  intro: "Check the source and mapping, review an exact subset, then follow its durable result.",
  limited:
    "Text checks are the first step. Prepare a dry run to compare these rows with current records before selecting any changes.",
  setup: "Declare the source interpretation",
  setupHint:
    "These declarations apply to this file. Country, region, property type and purpose are used for new records only. Location must be an exact settlement in the mapped source. Prices use EUR, areas use m² and the chosen basis; bedrooms may be zero. Blank cells preserve existing values. No currency conversion is performed.",
  prepare: "Prepare a dry run",
  review: "Review the exact rows",
  current: "Current working value",
  incoming: "Original source text",
  proposed: "Proposed working value",
  accepted: "Accepted working value",
  choose: "Choose explicitly",
  keep: "Keep current value",
  source: "Use supplied source value",
  select: "Include source row",
  choice: "Decision for row",
  subset:
    "Only checked rows will be accepted. Each changed field needs an explicit choice. This review does not execute the import.",
  confirm: "I reviewed the selected rows, their source, interpretation and every changed field.",
  seal: "Accept this exact subset",
  result: "Import receipt and recovery",
  execute: "Execute up to 10 reviewed rows",
  executeHint:
    "Each row commits separately. Continue with this same receipt to process pending reviewed rows. An interrupted request may have committed some rows; check this receipt before retrying.",
  stop: "Stop unstarted rows",
  stopConfirm: "I understand that stopping does not reverse committed rows.",
  reverse: "Reverse eligible imported drafts",
  reverseConfirm:
    "I reviewed the committed rows below. Reverse only drafts that have not changed since import.",
  reverseHint:
    "A reversal restores an unchanged earlier working draft. A newly created draft is emptied and withdrawn while its identity and source history remain. Later edits, revisions or dependent records can block reversal. Up to 10 rows are checked per request.",
  refresh: "Check this same receipt again",
  recent: "Your recent import receipts",
  technical: "Source, subset and operation identity",
  operation: "Logical operation",
  digest: "Source SHA-256",
  selection: "Accepted subset digest",
  manual: "Open the normal inventory workflow",
  notSelected: "Outside the reviewed subset",
  failed:
    "The command could not finish. Current results are shown below. Review changed source, choices, revisions and access before continuing.",
  unknown:
    "The result could not be confirmed. Use this same receipt to reconcile it before starting another import.",
  classifications: {
    create: "New working draft",
    update_proposal: "Changes need decisions",
    no_change: "No working changes",
    blocked: "Blocked",
    needs_review: "Needs review",
  },
  states: {
    review: "Dry run — awaiting subset review",
    ready: "Reviewed — awaiting execution",
    partial: "Partially completed — review each row",
    completed: "Reviewed subset completed",
    cancelled: "Unstarted rows stopped",
  },
  outcomes: {
    pending: "Not started",
    applied: "Working draft committed",
    skipped: "Unchanged",
    failed: "Not applied — fresh review needed",
  },
  reversals: {
    reversed: "Reversed; history retained",
    blocked: "Reversal blocked; current record retained",
  },
  issues: {
    reference_format:
      "Keep the exact MS listing reference: MS- followed by at least five digits, within the supported reference range.",
    target_unavailable: "This reference cannot be imported with your current record access.",
    draft_manual:
      "The existing record needs its normal inventory source review before a CSV draft update is supported.",
    location_manual:
      "The source settlement differs from the current record. Review this protected location through the normal inventory workflow.",
    purpose_manual:
      "The declared source purpose differs from this listing. Review the sale/rent price meaning through the normal inventory workflow.",
    location_required: "A new record needs an exact mapped settlement, up to 150 characters.",
    price_eur_positive:
      "A supplied price must be positive and explicitly in EUR. Other source currencies remain in the evidence for manual review.",
    area_positive: "A supplied area must be positive.",
    draft_limits:
      "The proposed working draft exceeds an editor limit or has unsupported source details.",
    version_conflict: "The reviewed record or source changed. Prepare a fresh dry run.",
    target_changed: "A later record change prevents automatic reversal.",
    dependent_records:
      "A later relationship or record depends on this identity. Review it manually before reversal.",
  },
};
type Copy = typeof en;
const bg: Copy = {
  boundary:
    "Проверете файла без промяна на работните записи. След отделен преглед избраните редове могат да създадат или обновят предоставени работни чернови. Фактите, наличността и публикуването изискват обичайния човешки преглед.",
  intro:
    "Проверете източника и колоните, прегледайте точен набор редове и следете записания резултат.",
  limited:
    "Проверката на текста е първата стъпка. Подгответе пробен импорт за сравнение с текущите записи, преди да изберете промени.",
  setup: "Уточнете значението на източника",
  setupHint:
    "Тези уточнения важат за файла. Държава, регион, тип и цел се използват само за нови записи. Местоположението трябва да е точно населено място от източника. Цените са в EUR, площите — в m² с избраната база; спалните може да са нула. Празните клетки запазват текущите стойности. Валутата не се преизчислява.",
  prepare: "Подготовка на пробен импорт",
  review: "Преглед на точните редове",
  current: "Текуща работна стойност",
  incoming: "Оригинален текст от източника",
  proposed: "Предложена работна стойност",
  accepted: "Приета работна стойност",
  choose: "Изберете изрично",
  keep: "Запазване на текущата стойност",
  source: "Използване на предоставената стойност",
  select: "Включване на ред",
  choice: "Решение за ред",
  subset:
    "Ще бъдат приети само отметнатите редове. Всяко променено поле изисква изричен избор. Прегледът не изпълнява импорта.",
  confirm: "Прегледах избраните редове, източника, уточненията и всяко променено поле.",
  seal: "Приемане на точния набор",
  result: "Резултат и възстановяване на импорта",
  execute: "Изпълнение на до 10 прегледани реда",
  executeHint:
    "Всеки ред се записва отделно. Продължете със същото потвърждение за оставащите редове. Прекъсната заявка може да е записала част от редовете; проверете резултата преди повторение.",
  stop: "Спиране на незапочнатите редове",
  stopConfirm: "Разбирам, че спирането не отменя записаните редове.",
  reverse: "Отмяна на допустимите внесени чернови",
  reverseConfirm:
    "Прегледах записаните редове по-долу. Да се отменят само непроменените след импорта чернови.",
  reverseHint:
    "Отмяната възстановява непроменена предишна чернова. Нова чернова се изпразва и оттегля, като идентичността и историята остават. Последващи промени, версии или зависими записи могат да блокират отмяната. Проверяват се до 10 реда на заявка.",
  refresh: "Повторна проверка на същия резултат",
  recent: "Последните ви импорти",
  technical: "Източник, набор и идентичност на операцията",
  operation: "Логическа операция",
  digest: "SHA-256 на източника",
  selection: "Контролна сума на приетия набор",
  manual: "Към обичайната работа с обявата",
  notSelected: "Извън прегледания набор",
  failed:
    "Командата не е завършена. Текущите резултати са по-долу. Проверете източника, изборите, версиите и достъпа, преди да продължите.",
  unknown: "Резултатът не е потвърден. Проверете същата операция, преди да започнете нов импорт.",
  classifications: {
    create: "Нова работна чернова",
    update_proposal: "Промените изискват избор",
    no_change: "Без работни промени",
    blocked: "Блокиран",
    needs_review: "Нужен е преглед",
  },
  states: {
    review: "Пробен импорт — чака избор на редове",
    ready: "Прегледан — чака изпълнение",
    partial: "Частично завършен — проверете всеки ред",
    completed: "Прегледаният набор е завършен",
    cancelled: "Незапочнатите редове са спрени",
  },
  outcomes: {
    pending: "Не е започнат",
    applied: "Черновата е записана",
    skipped: "Без промяна",
    failed: "Не е приложен — нужен е нов преглед",
  },
  reversals: {
    reversed: "Отменен; историята е запазена",
    blocked: "Отмяната е блокирана; текущият запис е запазен",
  },
  issues: {
    reference_format: "Запазете точната референция: MS- и поне пет цифри, в поддържания диапазон.",
    target_unavailable: "Тази референция не може да се импортира с текущия ви достъп.",
    draft_manual: "Текущият запис изисква обичайния преглед на източника преди обновяване с CSV.",
    location_manual:
      "Населеното място се различава от текущия запис. Прегледайте защитеното местоположение по обичайния ред.",
    purpose_manual:
      "Целта на източника се различава от обявата. Прегледайте значението на цената за продажба или наем по обичайния ред.",
    location_required: "Нов запис изисква точно населено място от колона, до 150 знака.",
    price_eur_positive:
      "Предоставената цена трябва да е положителна и изрично в EUR. Другите валути остават в доказателствата за ръчен преглед.",
    area_positive: "Предоставената площ трябва да е положителна.",
    draft_limits:
      "Предложената чернова надхвърля ограничение на редактора или има неподдържани данни за източника.",
    version_conflict: "Прегледаният запис или източник е променен. Подгответе нов пробен импорт.",
    target_changed: "Последваща промяна блокира автоматичната отмяна.",
    dependent_records:
      "Друга връзка или запис зависи от тази идентичност. Прегледайте ръчно преди отмяна.",
  },
};
const ru: Copy = {
  boundary:
    "Проверьте файл без изменения рабочих записей. После отдельной проверки выбранные строки могут создать или обновить предоставленные рабочие черновики. Факты, доступность и публикация требуют обычной проверки человеком.",
  intro:
    "Проверьте источник и столбцы, выберите точный набор строк и следите за сохранённым результатом.",
  limited:
    "Проверка текста — первый шаг. Подготовьте пробный импорт для сравнения с текущими записями до выбора изменений.",
  setup: "Уточните значение данных источника",
  setupHint:
    "Уточнения относятся ко всему файлу. Страна, регион, тип и цель используются только для новых записей. Местоположение — точный населённый пункт из источника. Цены — EUR, площади — m² с выбранной базой; спален может быть ноль. Пустые ячейки сохраняют текущие значения. Пересчёта валюты нет.",
  prepare: "Подготовить пробный импорт",
  review: "Проверить точные строки",
  current: "Текущее рабочее значение",
  incoming: "Оригинальный текст источника",
  proposed: "Предлагаемое рабочее значение",
  accepted: "Принятое рабочее значение",
  choose: "Выберите явно",
  keep: "Сохранить текущее значение",
  source: "Использовать предоставленное значение",
  select: "Включить строку",
  choice: "Решение для строки",
  subset:
    "Будут приняты только отмеченные строки. Для каждого изменяемого поля нужен явный выбор. Проверка не выполняет импорт.",
  confirm: "Я проверил выбранные строки, источник, значение данных и каждое изменяемое поле.",
  seal: "Принять точный набор",
  result: "Результат и восстановление импорта",
  execute: "Выполнить до 10 проверенных строк",
  executeHint:
    "Каждая строка сохраняется отдельно. Продолжайте по тому же результату для оставшихся строк. Прерванный запрос мог сохранить часть строк; проверьте результат перед повтором.",
  stop: "Остановить неначатые строки",
  stopConfirm: "Я понимаю, что остановка не отменяет сохранённые строки.",
  reverse: "Отменить допустимые импортированные черновики",
  reverseConfirm:
    "Я проверил сохранённые строки ниже. Отменить только черновики без изменений после импорта.",
  reverseHint:
    "Отмена восстанавливает неизменённый предыдущий черновик. Новый черновик очищается и снимается с предложения, идентичность и история остаются. Последующие изменения, версии или зависимые записи могут заблокировать отмену. Проверяется до 10 строк за запрос.",
  refresh: "Проверить тот же результат снова",
  recent: "Ваши последние импорты",
  technical: "Источник, набор и идентичность операции",
  operation: "Логическая операция",
  digest: "SHA-256 источника",
  selection: "Контрольная сумма принятого набора",
  manual: "Открыть обычную работу с объявлением",
  notSelected: "Вне проверенного набора",
  failed:
    "Команда не завершена. Текущие результаты показаны ниже. Проверьте источник, выбор, версии и доступ перед продолжением.",
  unknown: "Результат не подтверждён. Сверьте ту же операцию перед новым импортом.",
  classifications: {
    create: "Новый рабочий черновик",
    update_proposal: "Изменения требуют выбора",
    no_change: "Без рабочих изменений",
    blocked: "Заблокировано",
    needs_review: "Нужна проверка",
  },
  states: {
    review: "Пробный импорт — ожидается выбор строк",
    ready: "Проверено — ожидается выполнение",
    partial: "Частично завершено — проверьте каждую строку",
    completed: "Проверенный набор завершён",
    cancelled: "Неначатые строки остановлены",
  },
  outcomes: {
    pending: "Не начато",
    applied: "Черновик сохранён",
    skipped: "Без изменений",
    failed: "Не применено — нужна новая проверка",
  },
  reversals: {
    reversed: "Отменено; история сохранена",
    blocked: "Отмена заблокирована; текущая запись сохранена",
  },
  issues: {
    reference_format:
      "Сохраните точную референцию: MS- и не менее пяти цифр в поддерживаемом диапазоне.",
    target_unavailable: "Эту референцию нельзя импортировать с вашим текущим доступом.",
    draft_manual:
      "Перед обновлением через CSV нужна обычная проверка источника существующей записи.",
    location_manual:
      "Населённый пункт отличается от текущей записи. Проверьте защищённое местоположение обычным способом.",
    purpose_manual:
      "Цель источника отличается от объявления. Проверьте смысл цены продажи или аренды обычным способом.",
    location_required: "Новой записи нужен точный населённый пункт из столбца, до 150 символов.",
    price_eur_positive:
      "Предоставленная цена должна быть положительной и явно в EUR. Другие валюты остаются в доказательствах для ручной проверки.",
    area_positive: "Предоставленная площадь должна быть положительной.",
    draft_limits:
      "Предложенный черновик превышает ограничение редактора или содержит неподдерживаемые данные источника.",
    version_conflict:
      "Проверенная запись или источник изменились. Подготовьте новый пробный импорт.",
    target_changed: "Последующее изменение блокирует автоматическую отмену.",
    dependent_records:
      "Другая связь или запись зависит от этой идентичности. Перед отменой нужна ручная проверка.",
  },
};
export const importExecutionCopy = (locale: string): Copy =>
  locale === "en" ? en : locale === "ru" ? ru : bg;
