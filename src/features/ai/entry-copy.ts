// Staff-only copy. BG and RU remain drafts for human language review.
const en = {
  title: "Butler · Choose a task",
  lead: "Choose a source you can access, review the included text, then request a draft.",
  boundary:
    "Butler produces drafts for human review. Sending, publishing and other actions stay in their original workspace and require separate human decisions.",
  unavailable:
    "No draft tasks are available for your current access. Continue in a manual workspace you can access.",
  manualOnly:
    "Inquiry drafts are not available for your current access. Continue in the manual inbox.",
  inventory: "Open the manual inventory",
  inquiry: "Work from an inquiry",
  inquiryHelp: "Summarize an inquiry or draft a reply or next action for your review.",
  source: "Choose an inquiry",
  choose: "Select an inquiry…",
  inspect: "Review selected source",
  sourceHelp:
    "Only open inquiries you can read and use for draft assistance are offered. Contact details are excluded from the source review.",
  empty: "No eligible inquiries on this page. Check another page or continue in the manual inbox.",
  pages: "Inquiry source pages",
  page: "Page",
  manual: "Open the manual inbox",
  other: "Other supported tasks",
  locale: "Draft a translation",
  localeHelp: "Choose a property and target language, then review the approved Bulgarian source.",
  intake: "Extract a property draft",
  intakeHelp:
    "Choose a property, then review its text source before requesting an extraction draft.",
  purposes: {
    question: "Question",
    callback: "Callback",
    viewing_request: "Viewing request",
    seller_consultation: "Seller consultation",
    landlord_consultation: "Landlord consultation",
    service_consultation: "Service consultation",
  },
};
type Copy = typeof en;
const bg: Copy = {
  title: "Butler · Изберете задача",
  lead: "Изберете източник, до който имате достъп, прегледайте включения текст и след това поискайте чернова.",
  boundary:
    "Butler подготвя чернови за човешки преглед. Изпращането, публикуването и другите действия остават в първоначалното работно пространство и изискват отделни човешки решения.",
  unavailable:
    "Няма задачи за чернови, достъпни с текущите ви права. Продължете в ръчно работно пространство, до което имате достъп.",
  manualOnly:
    "Чернови по запитвания не са достъпни с текущите ви права. Продължете във входящата поща.",
  inventory: "Отворете каталога с имоти",
  inquiry: "Работа по запитване",
  inquiryHelp:
    "Обобщете запитване или подгответе чернова на отговор или следваща стъпка за вашия преглед.",
  source: "Изберете запитване",
  choose: "Изберете запитване…",
  inspect: "Преглед на избрания източник",
  sourceHelp:
    "Показани са само отворени запитвания, които можете да четете и използвате за чернови. Данните за контакт са изключени от прегледа на източника.",
  empty:
    "Няма подходящи запитвания на тази страница. Проверете друга страница или продължете във входящата поща.",
  pages: "Страници с източници от запитвания",
  page: "Страница",
  manual: "Отворете входящата поща",
  other: "Други поддържани задачи",
  locale: "Чернова на превод",
  localeHelp: "Изберете имот и целеви език, след което прегледайте одобрения български източник.",
  intake: "Извличане на чернова за имот",
  intakeHelp:
    "Изберете имот и прегледайте текстовия му източник, преди да поискате чернова за извличане.",
  purposes: {
    question: "Въпрос",
    callback: "Обратно обаждане",
    viewing_request: "Заявка за оглед",
    seller_consultation: "Консултация за продажба",
    landlord_consultation: "Консултация за отдаване под наем",
    service_consultation: "Консултация за услуга",
  },
};
const ru: Copy = {
  title: "Butler · Выберите задачу",
  lead: "Выберите доступный вам источник, проверьте включённый текст и затем запросите черновик.",
  boundary:
    "Butler готовит черновики для проверки человеком. Отправка, публикация и другие действия остаются в исходном рабочем пространстве и требуют отдельных решений человека.",
  unavailable:
    "С текущими правами нет доступных задач для черновиков. Продолжите в доступном вам рабочем пространстве вручную.",
  manualOnly: "Черновики обращений недоступны с текущими правами. Продолжите во входящих.",
  inventory: "Открыть каталог объектов",
  inquiry: "Работа с обращением",
  inquiryHelp:
    "Подготовьте сводку обращения, черновик ответа или следующего действия для проверки.",
  source: "Выберите обращение",
  choose: "Выберите обращение…",
  inspect: "Проверить выбранный источник",
  sourceHelp:
    "Показаны только открытые обращения, которые вы можете читать и использовать для черновиков. Контактные данные исключены из проверки источника.",
  empty:
    "На этой странице нет подходящих обращений. Проверьте другую страницу или продолжите во входящих.",
  pages: "Страницы источников обращений",
  page: "Страница",
  manual: "Открыть входящие",
  other: "Другие доступные задачи",
  locale: "Черновик перевода",
  localeHelp: "Выберите объект и язык перевода, затем проверьте одобренный болгарский источник.",
  intake: "Извлечь черновик объекта",
  intakeHelp:
    "Выберите объект и проверьте его текстовый источник, прежде чем запросить черновик извлечения.",
  purposes: {
    question: "Вопрос",
    callback: "Обратный звонок",
    viewing_request: "Запрос просмотра",
    seller_consultation: "Консультация по продаже",
    landlord_consultation: "Консультация по сдаче в аренду",
    service_consultation: "Консультация по услуге",
  },
};
export const entryCopy = (locale: string): Copy =>
  locale === "bg" ? bg : locale === "ru" ? ru : en;
