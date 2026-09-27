// Specimen copy. Every name, reference and figure here is fictional (spec §18.3).
// Only bg, en and he are written out; other locales show the English copy.

export type SpecimenCopy = {
  lang: "bg" | "en" | "he";
  title: string;
  intro: string;
  skip: string;
  sections: Record<
    | "foundations"
    | "actions"
    | "text"
    | "choice"
    | "dates"
    | "overlays"
    | "validation"
    | "status"
    | "property"
    | "work"
    | "navigation",
    string
  >;
  states: Record<
    | "default"
    | "pending"
    | "disabled"
    | "readOnly"
    | "selected"
    | "indeterminate"
    | "optional"
    | "withHint",
    string
  >;
  button: {
    primary: string;
    secondary: string;
    tertiary: string;
    destructive: string;
    pending: string;
    disabledReason: string;
  };
  link: { inline: string; standalone: string; sentence: [string, string] };
  external: { label: string; app: string; note: string };
  field: {
    name: string;
    nameHint: string;
    email: string;
    emailError: string;
    reference: string;
    message: string;
    optional: string;
    area: string;
    areaHint: string;
    bedrooms: string;
    bedroomsError: string;
  };
  select: {
    label: string;
    placeholder: string;
    error: string;
    options: [string, string, string, string];
  };
  place: {
    label: string;
    hint: string;
    ambiguous: string;
    regions: [string, string, string];
    country: string;
    names: [string, string];
  };
  checks: {
    single: string;
    group: string;
    groupHint: string;
    options: [string, string, string];
    error: string;
    radio: string;
    radioOptions: [string, string, string];
    switchLabel: string;
  };
  dates: {
    date: string;
    viewing: string;
    timeZone: string;
    dateHint: string;
    dateError: string;
  };
  overlay: {
    openDialog: string;
    dialogTitle: string;
    dialogBody: string;
    confirmTitle: string;
    confirmBody: string;
    confirmAction: string;
    cancel: string;
    close: string;
    openSheet: string;
    sheetTitle: string;
    sheetBody: string;
    clear: string;
    apply: string;
    openPopover: string;
    popoverTitle: string;
    popoverBody: string;
    tooltipTrigger: string;
    tooltip: string;
  };
  validation: {
    summaryTitle: string;
    submit: string;
    nameError: string;
    emailError: string;
    formName: string;
    formEmail: string;
  };
  status: {
    availability: [string, string, string, string];
    approval: [string, string, string];
    delivery: [string, string, string, string];
    notices: {
      info: string;
      success: string;
      warning: string;
      error: string;
      body: string;
      action: string;
    };
    banner: string;
    bannerBody: string;
  };
  receipt: {
    title: string;
    referenceLabel: string;
    recordedAtLabel: string;
    recordedAt: string;
    next: string;
    action: string;
  };
  empty: {
    newTitle: string;
    newBody: string;
    newAction: string;
    filteredTitle: string;
    filteredBody: string;
    filteredCriteria: [string, string];
    filteredAction: string;
    failedTitle: string;
    failedBody: string;
    failedAction: string;
    failedReference: string;
    inaccessibleTitle: string;
    inaccessibleBody: string;
    inaccessibleAction: string;
  };
  loading: {
    skeleton: string;
    progress: string;
    progressDone: string;
    indeterminate: string;
    announce: string;
    announced: string;
  };
  facts: {
    area: string;
    areaBasis: string;
    areaSource: string;
    bedrooms: string;
    lift: string;
    unknown: string;
    ask: string;
  };
  price: { perMonth: string; onRequest: string; vat: string };
  criteria: {
    label: string;
    remove: string;
    assist: [string, string, string];
    question: string;
    add: string;
    draft: string;
  };
  card: {
    meta: [string, string, string];
    titles: [string, string, string];
    localities: [string, string, string];
    facts: [string[], string[], string[]];
    highlights: string[];
    availability: [string, string];
    noPhoto: string;
    photoAlt: string;
    save: string;
    compare: string;
  };
  tasks: {
    label: string;
    rows: [string, string, string, string];
    reason: string;
    owner: string;
    unassigned: string;
    due: string;
    overdue: string;
    waiting: string;
    done: string;
  };
  timeline: {
    label: string;
    events: [string, string, string, string];
    actor: string;
    source: string;
    consequence: string;
    kinds: { correction: string; restricted: string; delayed: string };
    time: string;
  };
  table: { caption: string; columns: [string, string, string, string] };
  tabs: { label: string; items: [string, string, string]; panels: [string, string, string] };
  breadcrumbs: { label: string; items: [string, string, string] };
  pagination: { label: string; previous: string; next: string; page: string };
  loadMore: { status: string; label: string; pending: string };
  language: string;
};

const en: SpecimenCopy = {
  lang: "en",
  title: "Design system specimen",
  intro:
    "Every component in each of its states. All names, references and figures on this page are fictional.",
  skip: "Skip to the specimen",
  sections: {
    foundations: "Foundations",
    actions: "Actions and links",
    text: "Text and number fields",
    choice: "Choices",
    dates: "Dates and times",
    overlays: "Dialogs, sheets and popovers",
    validation: "Validation",
    status: "Status and outcomes",
    property: "Property facts and cards",
    work: "Tasks and history",
    navigation: "Navigation and data",
  },
  states: {
    default: "Default",
    pending: "Pending",
    disabled: "Disabled, with reason",
    readOnly: "Read-only",
    selected: "Selected",
    indeterminate: "Mixed",
    optional: "Optional",
    withHint: "With hint",
  },
  button: {
    primary: "Request a viewing",
    secondary: "Save draft",
    tertiary: "Change criteria",
    destructive: "Withdraw listing",
    pending: "Sending request…",
    disabledReason: "Add a phone number or email first.",
  },
  link: {
    inline: "how viewings are arranged",
    standalone: "See all properties in Sandanski",
    sentence: ["Read ", " before you request one."],
  },
  external: {
    label: "Message us",
    app: "WhatsApp",
    note: "Opens WhatsApp. Nothing is sent until you send it there.",
  },
  field: {
    name: "Your name",
    nameHint: "As you would like us to address you.",
    email: "Email address",
    emailError: "Enter an email address in the correct format, like name@example.com",
    reference: "Listing reference",
    message: "Your question",
    optional: "(optional)",
    area: "Minimum living area",
    areaHint: "Usable living area, not built area.",
    bedrooms: "Bedrooms",
    bedroomsError: "Enter a number of bedrooms from 0 to 10",
  },
  select: {
    label: "Property type",
    placeholder: "Choose a type",
    error: "Choose a property type",
    options: ["Apartment", "House", "Plot of land", "Commercial space"],
  },
  place: {
    label: "Place",
    hint: "Type a town or village, then choose it from the list.",
    ambiguous: "More than one place has this name. Choose the one in the right region.",
    regions: ["Blagoevgrad Province", "Burgas Province", "Lovech Province"],
    country: "Bulgaria",
    names: ["Sandanski", "Aleksandrovo"],
  },
  checks: {
    single: "Email me when matching properties are published",
    group: "Must have",
    groupHint: "Only properties where this is confirmed will match.",
    options: ["Lift", "Parking space", "Step-free entrance"],
    error: "Choose at least one requirement",
    radio: "Purpose",
    radioOptions: ["Buy", "Rent long-term", "Sell or let"],
    switchLabel: "Show approximate map areas",
  },
  dates: {
    date: "Moving date",
    viewing: "Preferred viewing time",
    timeZone: "Bulgarian time (Europe/Sofia)",
    dateHint: "We confirm the time after checking access.",
    dateError: "Enter a moving date, like 1 November 2026",
  },
  overlay: {
    openDialog: "Open dialog",
    dialogTitle: "Share this shortlist",
    dialogBody: "People you invite can see the saved properties and your notes, not your messages.",
    confirmTitle: "Withdraw this listing?",
    confirmBody:
      "It stops appearing on the website and in partner feeds. Saved copies show it as unavailable. You can publish it again later.",
    confirmAction: "Withdraw listing",
    cancel: "Keep it published",
    close: "Close",
    openSheet: "Filters",
    sheetTitle: "Filters",
    sheetBody: "Filter groups go here. Back closes this sheet without applying anything.",
    clear: "Clear filters",
    apply: "Show 12 properties",
    openPopover: "What is living area?",
    popoverTitle: "Living area",
    popoverBody:
      "The usable floor area inside the home, excluding walls, balconies and common parts.",
    tooltipTrigger: "Copy reference",
    tooltip: "Copies the listing reference",
  },
  validation: {
    summaryTitle: "There is a problem",
    submit: "Send question to the team",
    nameError: "Enter your name",
    emailError: "Enter an email address",
    formName: "Your name",
    formEmail: "Email address",
  },
  status: {
    availability: ["Available", "Availability needs confirmation", "Reserved", "Sold"],
    approval: ["Approved for publication", "Awaiting review", "Changes requested"],
    delivery: [
      "Delivered",
      "Sent to the messaging service; delivery pending",
      "Delivery failed",
      "Queued",
    ],
    notices: {
      info: "Prices are shown in euro",
      success: "Draft saved",
      warning: "Availability was last confirmed 40 days ago",
      error: "The photos could not be uploaded",
      body: "Your other changes are kept.",
      action: "Try the upload again",
    },
    banner: "This listing has an unpublished correction",
    bannerBody: "Visitors still see the previous price until the correction is approved.",
  },
  receipt: {
    title: "Your request was received",
    referenceLabel: "Reference",
    recordedAtLabel: "Received",
    recordedAt: "24 September 2026, 14:05 Bulgarian time",
    next: "We'll confirm a time after checking access to the property. Quote the reference if you contact us.",
    action: "Back to the property",
  },
  empty: {
    newTitle: "No saved properties yet",
    newBody: "Save properties while you search to compare them here.",
    newAction: "Search properties",
    filteredTitle: "No properties match these criteria",
    filteredBody: "Your criteria are kept. Change one to see more properties.",
    filteredCriteria: ["Sandanski", "At least 3 bedrooms"],
    filteredAction: "Change criteria",
    failedTitle: "The listings could not be loaded",
    failedBody: "This is a problem on our side. Your search is kept.",
    failedAction: "Try again",
    failedReference: "Support reference: ERR-EX-7F3A",
    inaccessibleTitle: "You don't have access to this case",
    inaccessibleBody: "Ask the person who invited you, or contact the agency.",
    inaccessibleAction: "Contact the agency",
  },
  loading: {
    skeleton: "Loading properties",
    progress: "Importing listings",
    progressDone: "Import finished",
    indeterminate: "Checking the upload",
    announce: "Announce a status",
    announced: "Shortlist updated",
  },
  facts: {
    area: "Area",
    areaBasis: "Built area, including a share of common parts",
    areaSource: "From the owner's title deed, checked 12 Aug 2026",
    bedrooms: "Bedrooms",
    lift: "Lift",
    unknown: "Not yet confirmed",
    ask: "Ask us to confirm",
  },
  price: { perMonth: "per month", onRequest: "Price on request", vat: "No VAT applies" },
  criteria: {
    label: "Interpreted criteria",
    remove: "Remove",
    assist: ["Sandanski", "Apartment", "Up to €220,000"],
    question: "Parking: required or preferred?",
    add: "More criteria",
    draft: "Draft from the assistant · needs review",
  },
  card: {
    meta: [
      "MSR-EX-2041 · updated 3 days ago",
      "MSR-EX-2042 · updated yesterday",
      "MSR-EX-2043 · updated today",
    ],
    titles: ["Two-bedroom apartment", "House with garden", "Studio near the park"],
    localities: [
      "Sandanski, Blagoevgrad Province",
      "Aleksandrovo, Lovech Province",
      "Sandanski, Blagoevgrad Province",
    ],
    facts: [
      ["86 m² built", "2 bedrooms", "Apartment"],
      ["140 m² built", "3 bedrooms", "House"],
      ["38 m² built", "Studio"],
    ],
    highlights: ["South-facing", "Renovated 2024"],
    availability: ["Available", "Availability needs confirmation"],
    noPhoto: "No photo yet",
    photoAlt: "Placeholder image for the fictional example listing",
    save: "Save",
    compare: "Compare",
  },
  tasks: {
    label: "Today",
    rows: [
      "Call back about the Sandanski apartment",
      "Assign the new house inquiry",
      "Publish the corrected price",
      "Send viewing times to the buyer",
    ],
    reason: "The buyer asked for a callback before noon.",
    owner: "Alex Example",
    unassigned: "Unassigned",
    due: "24 Sep, 12:00",
    overdue: "Overdue by 2 hours",
    waiting: "Waiting for: owner's approval",
    done: "Done 23 Sep · call logged",
  },
  timeline: {
    label: "Listing history",
    events: [
      "Inquiry received",
      "Price corrected from €125,000 to €118,000",
      "Internal note",
      "Partner feed update",
    ],
    actor: "Alex Example",
    source: "Website form",
    consequence: "Task created: call back",
    kinds: { correction: "Correction", restricted: "Details restricted", delayed: "Sync delayed" },
    time: "24 Sep 2026, 09:12",
  },
  table: { caption: "Listings in review", columns: ["Reference", "Place", "Price (€)", "Updated"] },
  tabs: {
    label: "Property details",
    items: ["Overview", "Facts", "Documents"],
    panels: [
      "A short approved description of the property.",
      "Each fact with its unit, basis and source.",
      "Documents shared with you for this property.",
    ],
  },
  breadcrumbs: { label: "Breadcrumb", items: ["Home", "Sandanski", "Two-bedroom apartment"] },
  pagination: { label: "Result pages", previous: "Previous", next: "Next", page: "Page" },
  loadMore: {
    status: "Showing 24 of 131 properties",
    label: "Show more properties",
    pending: "Loading more properties…",
  },
  language: "Language",
};

const bg: SpecimenCopy = {
  lang: "bg",
  title: "Образец на дизайн системата",
  intro:
    "Всеки компонент във всяко от състоянията си. Всички имена, номера и стойности на тази страница са измислени.",
  skip: "Към образеца",
  sections: {
    foundations: "Основи",
    actions: "Действия и връзки",
    text: "Текстови и числови полета",
    choice: "Избор",
    dates: "Дати и часове",
    overlays: "Диалози, панели и изскачащи прозорци",
    validation: "Проверка на данните",
    status: "Статус и резултати",
    property: "Факти за имоти и карти",
    work: "Задачи и история",
    navigation: "Навигация и данни",
  },
  states: {
    default: "По подразбиране",
    pending: "В процес",
    disabled: "Недостъпно, с причина",
    readOnly: "Само за четене",
    selected: "Избрано",
    indeterminate: "Частично",
    optional: "Незадължително",
    withHint: "С подсказка",
  },
  button: {
    primary: "Заявете оглед",
    secondary: "Запазете черновата",
    tertiary: "Променете критериите",
    destructive: "Оттеглете обявата",
    pending: "Изпращане на заявката…",
    disabledReason: "Първо добавете телефон или имейл.",
  },
  link: {
    inline: "как се уговарят огледите",
    standalone: "Всички имоти в Сандански",
    sentence: ["Прочетете ", ", преди да заявите оглед."],
  },
  external: {
    label: "Пишете ни",
    app: "WhatsApp",
    note: "Отваря WhatsApp. Нищо не се изпраща, докато не го изпратите там.",
  },
  field: {
    name: "Вашето име",
    nameHint: "Както желаете да се обръщаме към вас.",
    email: "Имейл адрес",
    emailError: "Въведете имейл адрес във вида име@example.com",
    reference: "Номер на обявата",
    message: "Вашият въпрос",
    optional: "(незадължително)",
    area: "Минимална жилищна площ",
    areaHint: "Полезна жилищна площ, не застроена площ.",
    bedrooms: "Спални",
    bedroomsError: "Въведете брой спални от 0 до 10",
  },
  select: {
    label: "Вид имот",
    placeholder: "Изберете вид",
    error: "Изберете вид имот",
    options: ["Апартамент", "Къща", "Парцел", "Търговски обект"],
  },
  place: {
    label: "Населено място",
    hint: "Въведете град или село и го изберете от списъка.",
    ambiguous: "Няколко места носят това име. Изберете това в правилната област.",
    regions: ["област Благоевград", "област Бургас", "област Ловеч"],
    country: "България",
    names: ["Сандански", "Александрово"],
  },
  checks: {
    single: "Изпращайте ми имейл при нови подходящи имоти",
    group: "Задължително",
    groupHint: "Съвпадат само имоти, за които това е потвърдено.",
    options: ["Асансьор", "Паркомясто", "Вход без стъпала"],
    error: "Изберете поне едно изискване",
    radio: "Цел",
    radioOptions: ["Покупка", "Дългосрочен наем", "Продажба или отдаване"],
    switchLabel: "Показвай приблизителни зони на картата",
  },
  dates: {
    date: "Дата на нанасяне",
    viewing: "Предпочитан час за оглед",
    timeZone: "Българско време (Europe/Sofia)",
    dateHint: "Потвърждаваме часа след проверка на достъпа.",
    dateError: "Въведете дата на нанасяне, например 1 ноември 2026",
  },
  overlay: {
    openDialog: "Отворете диалога",
    dialogTitle: "Споделете този списък",
    dialogBody: "Поканените виждат запазените имоти и бележките ви, но не и съобщенията ви.",
    confirmTitle: "Да се оттегли ли обявата?",
    confirmBody:
      "Тя спира да се показва на сайта и в партньорските емисии. Запазените копия я показват като недостъпна. Можете да я публикувате отново по-късно.",
    confirmAction: "Оттеглете обявата",
    cancel: "Оставете я публикувана",
    close: "Затворете",
    openSheet: "Филтри",
    sheetTitle: "Филтри",
    sheetBody: "Тук са групите филтри. Бутонът „Назад“ затваря панела, без да прилага нищо.",
    clear: "Изчистете филтрите",
    apply: "Покажете 12 имота",
    openPopover: "Какво е жилищна площ?",
    popoverTitle: "Жилищна площ",
    popoverBody: "Полезната площ в жилището без стени, балкони и общи части.",
    tooltipTrigger: "Копирайте номера",
    tooltip: "Копира номера на обявата",
  },
  validation: {
    summaryTitle: "Има проблем",
    submit: "Изпратете въпроса на екипа",
    nameError: "Въведете името си",
    emailError: "Въведете имейл адрес",
    formName: "Вашето име",
    formEmail: "Имейл адрес",
  },
  status: {
    availability: ["Свободен", "Наличността трябва да се потвърди", "Резервиран", "Продаден"],
    approval: ["Одобрен за публикуване", "Очаква преглед", "Поискани са промени"],
    delivery: [
      "Доставено",
      "Изпратено към услугата за съобщения; доставката предстои",
      "Доставката е неуспешна",
      "В опашка",
    ],
    notices: {
      info: "Цените са в евро",
      success: "Черновата е запазена",
      warning: "Наличността е потвърдена преди 40 дни",
      error: "Снимките не бяха качени",
      body: "Другите ви промени са запазени.",
      action: "Опитайте да качите отново",
    },
    banner: "Обявата има непубликувана корекция",
    bannerBody: "Посетителите виждат старата цена, докато корекцията не бъде одобрена.",
  },
  receipt: {
    title: "Заявката ви е получена",
    referenceLabel: "Номер",
    recordedAtLabel: "Получена",
    recordedAt: "24 септември 2026 г., 14:05 българско време",
    next: "Ще потвърдим час, след като проверим достъпа до имота. Посочвайте номера, ако се свържете с нас.",
    action: "Обратно към имота",
  },
  empty: {
    newTitle: "Все още няма запазени имоти",
    newBody: "Запазвайте имоти, докато търсите, за да ги сравните тук.",
    newAction: "Търсете имоти",
    filteredTitle: "Няма имоти по тези критерии",
    filteredBody: "Критериите ви са запазени. Променете някой, за да видите повече имоти.",
    filteredCriteria: ["Сандански", "Поне 3 спални"],
    filteredAction: "Променете критериите",
    failedTitle: "Обявите не се заредиха",
    failedBody: "Проблемът е при нас. Търсенето ви е запазено.",
    failedAction: "Опитайте отново",
    failedReference: "Номер за поддръжка: ERR-EX-7F3A",
    inaccessibleTitle: "Нямате достъп до този случай",
    inaccessibleBody: "Попитайте човека, който ви е поканил, или се свържете с агенцията.",
    inaccessibleAction: "Свържете се с агенцията",
  },
  loading: {
    skeleton: "Зареждане на имотите",
    progress: "Импортиране на обявите",
    progressDone: "Импортирането завърши",
    indeterminate: "Проверка на каченото",
    announce: "Обявете статус",
    announced: "Списъкът е обновен",
  },
  facts: {
    area: "Площ",
    areaBasis: "Застроена площ, включително дял от общите части",
    areaSource: "От нотариалния акт на собственика, проверено на 12.08.2026 г.",
    bedrooms: "Спални",
    lift: "Асансьор",
    unknown: "Все още не е потвърдено",
    ask: "Помолете ни да потвърдим",
  },
  price: { perMonth: "на месец", onRequest: "Цена при запитване", vat: "Без ДДС" },
  criteria: {
    label: "Разбрани критерии",
    remove: "Премахни",
    assist: ["Сандански", "Апартамент", "До 220 000 €"],
    question: "Паркомясто: задължително или желано?",
    add: "Още критерии",
    draft: "Чернова от асистента · нужен е преглед",
  },
  card: {
    meta: [
      "MSR-EX-2041 · обновено преди 3 дни",
      "MSR-EX-2042 · обновено вчера",
      "MSR-EX-2043 · обновено днес",
    ],
    titles: ["Двустаен апартамент", "Къща с двор", "Студио до парка"],
    localities: [
      "Сандански, област Благоевград",
      "Александрово, област Ловеч",
      "Сандански, област Благоевград",
    ],
    facts: [
      ["86 м² застроена", "2 спални", "Апартамент"],
      ["140 м² застроена", "3 спални", "Къща"],
      ["38 м² застроена", "Студио"],
    ],
    highlights: ["Южно изложение", "Ремонтиран 2024 г."],
    availability: ["Свободен", "Наличността трябва да се потвърди"],
    noPhoto: "Все още няма снимка",
    photoAlt: "Заместващо изображение за измислената примерна обява",
    save: "Запазете",
    compare: "Сравнете",
  },
  tasks: {
    label: "Днес",
    rows: [
      "Обадете се за апартамента в Сандански",
      "Възложете новото запитване за къща",
      "Публикувайте коригираната цена",
      "Изпратете часове за оглед на купувача",
    ],
    reason: "Купувачът поиска обаждане преди обяд.",
    owner: "Алекс Пример",
    unassigned: "Невъзложена",
    due: "24 септ., 12:00",
    overdue: "Просрочена с 2 часа",
    waiting: "Чака: одобрение от собственика",
    done: "Изпълнена 23 септ. · разговорът е записан",
  },
  timeline: {
    label: "История на обявата",
    events: [
      "Получено запитване",
      "Цената е коригирана от 125 000 € на 118 000 €",
      "Вътрешна бележка",
      "Обновяване на партньорска емисия",
    ],
    actor: "Алекс Пример",
    source: "Формуляр на сайта",
    consequence: "Създадена задача: обратно обаждане",
    kinds: {
      correction: "Корекция",
      restricted: "Ограничени подробности",
      delayed: "Забавена синхронизация",
    },
    time: "24.09.2026 г., 09:12",
  },
  table: { caption: "Обяви за преглед", columns: ["Номер", "Място", "Цена (€)", "Обновена"] },
  tabs: {
    label: "Подробности за имота",
    items: ["Преглед", "Факти", "Документи"],
    panels: [
      "Кратко одобрено описание на имота.",
      "Всеки факт с мерната единица, основанието и източника.",
      "Документи, споделени с вас за този имот.",
    ],
  },
  breadcrumbs: {
    label: "Навигационна пътека",
    items: ["Начало", "Сандански", "Двустаен апартамент"],
  },
  pagination: {
    label: "Страници с резултати",
    previous: "Предишна",
    next: "Следваща",
    page: "Страница",
  },
  loadMore: {
    status: "Показани са 24 от 131 имота",
    label: "Покажете още имоти",
    pending: "Зареждане на още имоти…",
  },
  language: "Език",
};

const he: SpecimenCopy = {
  lang: "he",
  title: "דוגמת מערכת העיצוב",
  intro: "כל רכיב בכל אחד מהמצבים שלו. כל השמות, המספרים והנתונים בעמוד הזה בדויים.",
  skip: "דלגו לדוגמה",
  sections: {
    foundations: "יסודות",
    actions: "פעולות וקישורים",
    text: "שדות טקסט ומספרים",
    choice: "בחירות",
    dates: "תאריכים ושעות",
    overlays: "חלונות דו-שיח, לוחות וחלוניות",
    validation: "אימות נתונים",
    status: "סטטוס ותוצאות",
    property: "עובדות על נכסים וכרטיסים",
    work: "משימות והיסטוריה",
    navigation: "ניווט ונתונים",
  },
  states: {
    default: "ברירת מחדל",
    pending: "בתהליך",
    disabled: "לא זמין, עם סיבה",
    readOnly: "לקריאה בלבד",
    selected: "נבחר",
    indeterminate: "חלקי",
    optional: "רשות",
    withHint: "עם הסבר",
  },
  button: {
    primary: "בקשו סיור בנכס",
    secondary: "שמרו טיוטה",
    tertiary: "שנו את הקריטריונים",
    destructive: "הסירו את המודעה",
    pending: "הבקשה נשלחת…",
    disabledReason: "הוסיפו קודם מספר טלפון או אימייל.",
  },
  link: {
    inline: "איך מתאמים סיורים",
    standalone: "כל הנכסים בסנדנסקי",
    sentence: ["קראו ", " לפני שאתם מבקשים סיור."],
  },
  external: {
    label: "שלחו לנו הודעה",
    app: "WhatsApp",
    note: "נפתח WhatsApp. שום דבר לא נשלח עד שתשלחו אותו שם.",
  },
  field: {
    name: "השם שלכם",
    nameHint: "כפי שתרצו שנפנה אליכם.",
    email: "כתובת אימייל",
    emailError: "הזינו כתובת אימייל בפורמט הנכון, למשל name@example.com",
    reference: "מספר המודעה",
    message: "השאלה שלכם",
    optional: "(רשות)",
    area: "שטח מגורים מינימלי",
    areaHint: "שטח מגורים שמיש, לא שטח בנוי.",
    bedrooms: "חדרי שינה",
    bedroomsError: "הזינו מספר חדרי שינה בין 0 ל-10",
  },
  select: {
    label: "סוג הנכס",
    placeholder: "בחרו סוג",
    error: "בחרו סוג נכס",
    options: ["דירה", "בית", "מגרש", "שטח מסחרי"],
  },
  place: {
    label: "מקום",
    hint: "הקלידו עיר או כפר ובחרו מהרשימה.",
    ambiguous: "יש יותר ממקום אחד בשם הזה. בחרו את המקום באזור הנכון.",
    regions: ["מחוז בלאגואבגרד", "מחוז בורגס", "מחוז לובץ'"],
    country: "בולגריה",
    names: ["סנדנסקי", "אלכסנדרובו"],
  },
  checks: {
    single: "שלחו לי אימייל כשמתפרסמים נכסים מתאימים",
    group: "חובה",
    groupHint: "יתאימו רק נכסים שבהם הדבר אושר.",
    options: ["מעלית", "מקום חניה", "כניסה ללא מדרגות"],
    error: "בחרו לפחות דרישה אחת",
    radio: "מטרה",
    radioOptions: ["קנייה", "שכירות לטווח ארוך", "מכירה או השכרה"],
    switchLabel: "הצגת אזורים משוערים במפה",
  },
  dates: {
    date: "תאריך כניסה",
    viewing: "שעה מועדפת לסיור",
    timeZone: "שעון בולגריה (Europe/Sofia)",
    dateHint: "נאשר את השעה אחרי שנבדוק את הגישה לנכס.",
    dateError: "הזינו תאריך כניסה, למשל 1 בנובמבר 2026",
  },
  overlay: {
    openDialog: "פתחו חלון",
    dialogTitle: "שתפו את הרשימה",
    dialogBody: "מי שתזמינו יראו את הנכסים השמורים ואת ההערות שלכם, לא את ההודעות.",
    confirmTitle: "להסיר את המודעה?",
    confirmBody:
      "היא לא תופיע יותר באתר ובפידים של שותפים. עותקים שמורים יציגו אותה כלא זמינה. אפשר לפרסם אותה שוב מאוחר יותר.",
    confirmAction: "הסירו את המודעה",
    cancel: "השאירו אותה מפורסמת",
    close: "סגירה",
    openSheet: "מסננים",
    sheetTitle: "מסננים",
    sheetBody: "כאן יופיעו קבוצות המסננים. „חזרה” סוגר את הלוח בלי להחיל דבר.",
    clear: "נקו מסננים",
    apply: "הציגו 12 נכסים",
    openPopover: "מהו שטח מגורים?",
    popoverTitle: "שטח מגורים",
    popoverBody: "השטח השמיש בתוך הבית, בלי קירות, מרפסות ושטחים משותפים.",
    tooltipTrigger: "העתיקו את המספר",
    tooltip: "מעתיק את מספר המודעה",
  },
  validation: {
    summaryTitle: "יש בעיה",
    submit: "שלחו את השאלה לצוות",
    nameError: "הזינו את השם שלכם",
    emailError: "הזינו כתובת אימייל",
    formName: "השם שלכם",
    formEmail: "כתובת אימייל",
  },
  status: {
    availability: ["פנוי", "יש לאשר זמינות", "שמור", "נמכר"],
    approval: ["אושר לפרסום", "ממתין לבדיקה", "התבקשו שינויים"],
    delivery: ["נמסר", "נשלח לשירות ההודעות; המסירה ממתינה", "המסירה נכשלה", "בתור"],
    notices: {
      info: "המחירים מוצגים באירו",
      success: "הטיוטה נשמרה",
      warning: "הזמינות אושרה לאחרונה לפני 40 יום",
      error: "לא ניתן היה להעלות את התמונות",
      body: "שאר השינויים שלכם נשמרו.",
      action: "נסו להעלות שוב",
    },
    banner: "למודעה יש תיקון שלא פורסם",
    bannerBody: "המבקרים רואים את המחיר הקודם עד שהתיקון יאושר.",
  },
  receipt: {
    title: "הבקשה שלכם התקבלה",
    referenceLabel: "מספר",
    recordedAtLabel: "התקבלה",
    recordedAt: "24 בספטמבר 2026, 14:05 שעון בולגריה",
    next: "נאשר שעה אחרי שנבדוק את הגישה לנכס. ציינו את המספר אם תפנו אלינו.",
    action: "חזרה לנכס",
  },
  empty: {
    newTitle: "עדיין אין נכסים שמורים",
    newBody: "שמרו נכסים בזמן החיפוש כדי להשוות ביניהם כאן.",
    newAction: "חפשו נכסים",
    filteredTitle: "אין נכסים שמתאימים לקריטריונים",
    filteredBody: "הקריטריונים שלכם נשמרו. שנו אחד מהם כדי לראות עוד נכסים.",
    filteredCriteria: ["סנדנסקי", "לפחות 3 חדרי שינה"],
    filteredAction: "שנו את הקריטריונים",
    failedTitle: "לא ניתן היה לטעון את המודעות",
    failedBody: "הבעיה אצלנו. החיפוש שלכם נשמר.",
    failedAction: "נסו שוב",
    failedReference: "מספר לתמיכה: ERR-EX-7F3A",
    inaccessibleTitle: "אין לכם גישה לתיק הזה",
    inaccessibleBody: "פנו למי שהזמין אתכם, או צרו קשר עם הסוכנות.",
    inaccessibleAction: "צרו קשר עם הסוכנות",
  },
  loading: {
    skeleton: "הנכסים נטענים",
    progress: "המודעות מיובאות",
    progressDone: "הייבוא הסתיים",
    indeterminate: "הקובץ נבדק",
    announce: "הכריזו על סטטוס",
    announced: "הרשימה עודכנה",
  },
  facts: {
    area: "שטח",
    areaBasis: "שטח בנוי, כולל חלק מהשטחים המשותפים",
    areaSource: "מתוך שטר הבעלות, נבדק ב-12.08.2026",
    bedrooms: "חדרי שינה",
    lift: "מעלית",
    unknown: "טרם אושר",
    ask: "בקשו שנאשר",
  },
  price: { perMonth: "לחודש", onRequest: "מחיר לפי בקשה", vat: "ללא מע״מ" },
  criteria: {
    label: "קריטריונים שזוהו",
    remove: "הסרה",
    assist: ["סנדנסקי", "דירה", "עד 220,000 €"],
    question: "חניה: חובה או רצוי?",
    add: "קריטריונים נוספים",
    draft: "טיוטה מהעוזר · נדרשת בדיקה",
  },
  card: {
    meta: [
      "MSR-EX-2041 · עודכן לפני 3 ימים",
      "MSR-EX-2042 · עודכן אתמול",
      "MSR-EX-2043 · עודכן היום",
    ],
    titles: ["דירת שני חדרי שינה", "בית עם גינה", "סטודיו ליד הפארק"],
    localities: ["סנדנסקי, מחוז בלאגואבגרד", "אלכסנדרובו, מחוז לובץ'", "סנדנסקי, מחוז בלאגואבגרד"],
    facts: [
      ["86 מ״ר בנוי", "2 חדרי שינה", "דירה"],
      ["140 מ״ר בנוי", "3 חדרי שינה", "בית"],
      ["38 מ״ר בנוי", "סטודיו"],
    ],
    highlights: ["פונה דרומה", "שופץ ב-2024"],
    availability: ["פנוי", "יש לאשר זמינות"],
    noPhoto: "עדיין אין תמונה",
    photoAlt: "תמונה ממלאת מקום למודעת הדוגמה הבדויה",
    save: "שמירה",
    compare: "השוואה",
  },
  tasks: {
    label: "היום",
    rows: [
      "חזרו בטלפון לגבי הדירה בסנדנסקי",
      "שייכו את הפנייה החדשה על הבית",
      "פרסמו את המחיר המתוקן",
      "שלחו לקונה שעות לסיור",
    ],
    reason: "הקונה ביקש שיחזרו אליו לפני הצהריים.",
    owner: "אלכס דוגמה",
    unassigned: "לא משויך",
    due: "24 בספט׳, 12:00",
    overdue: "באיחור של שעתיים",
    waiting: "ממתין ל: אישור הבעלים",
    done: "בוצע 23 בספט׳ · השיחה תועדה",
  },
  timeline: {
    label: "היסטוריית המודעה",
    events: [
      "התקבלה פנייה",
      "המחיר תוקן מ-125,000 € ל-118,000 €",
      "הערה פנימית",
      "עדכון פיד שותפים",
    ],
    actor: "אלכס דוגמה",
    source: "טופס באתר",
    consequence: "נוצרה משימה: לחזור בטלפון",
    kinds: { correction: "תיקון", restricted: "הפרטים מוגבלים", delayed: "הסנכרון מתעכב" },
    time: "24.09.2026, 09:12",
  },
  table: { caption: "מודעות בבדיקה", columns: ["מספר", "מקום", "מחיר (€)", "עודכן"] },
  tabs: {
    label: "פרטי הנכס",
    items: ["סקירה", "עובדות", "מסמכים"],
    panels: [
      "תיאור קצר ומאושר של הנכס.",
      "כל עובדה עם יחידת המידה, הבסיס והמקור.",
      "מסמכים ששותפו איתכם לגבי הנכס.",
    ],
  },
  breadcrumbs: { label: "נתיב ניווט", items: ["דף הבית", "סנדנסקי", "דירת שני חדרי שינה"] },
  pagination: { label: "עמודי תוצאות", previous: "הקודם", next: "הבא", page: "עמוד" },
  loadMore: {
    status: "מוצגים 24 מתוך 131 נכסים",
    label: "הציגו עוד נכסים",
    pending: "טוענים עוד נכסים…",
  },
  language: "שפה",
};

export function specimenCopy(locale: string): SpecimenCopy {
  if (locale === "bg") return bg;
  if (locale === "he") return he;
  return en;
}
