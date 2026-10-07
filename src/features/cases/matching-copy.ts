// O07 matching workbench copy (design/contracts/o07.md §7, keys `staff.matching.*`, Figma
// «O07 follow-ups done»). Bulgarian is the source; en and ru are drafts written from it. `{param}`
// values are inserted as read and never translated. The UI never says "brief", "interest",
// "candidate" or "criteria": the staff noun is the deal («Сделка»), the requirements are "what the
// client is looking for". There is no «Потвърдено» rollup (removed in the follow-ups).
import { displayLocale, isPublicLocale } from "@/i18n/config";
import { formatDate, formatTime } from "@/i18n/format";

type Forms = { one: string; few?: string; many?: string; other: string };

/** `{name}` placeholders; an unknown name stays visible rather than silently dropped. */
export const fill = (template: string, params: Record<string, string | number>) =>
  template.replace(/\{(\w+)\}/g, (match, key: string) =>
    Object.hasOwn(params, key) ? String(params[key]) : match,
  );

const tag = (locale: string) => (isPublicLocale(locale) ? displayLocale(locale) : "en-GB");

/** Bulgarian and English have one/other only; an empty few/many form falls back to other. */
export function pluralForm(locale: string, count: number, forms: Forms) {
  const rule = new Intl.PluralRules(tag(locale)).select(count);
  const form =
    rule === "one" ? forms.one : rule === "few" ? forms.few : rule === "many" ? forms.many : "";
  return form || forms.other;
}

/** "a, b and c" in the page language. */
export function joinList(locale: string, items: readonly string[]) {
  return new Intl.ListFormat(tag(locale), { type: "conjunction" }).format(items);
}

export const agencyZone = "Europe/Sofia";

/** «5 октомври 2026 г., 17:30 · Europe/Sofia»: stored in UTC, shown with the named zone. */
export function zonedDateTime(locale: string, instant: string | Date) {
  const pl = isPublicLocale(locale) ? locale : "en";
  return `${formatDate(pl, instant, { dateStyle: "long" })}, ${formatTime(pl, instant)} · ${agencyZone}`;
}

/** «10:20 · Europe/Sofia» for a read of today, else the date as well. */
export function zonedTime(locale: string, instant: string | Date, now = new Date()) {
  const pl = isPublicLocale(locale) ? locale : "en";
  const day = (value: string | Date) => formatDate(pl, value, { dateStyle: "short" });
  return day(instant) === day(now)
    ? `${formatTime(pl, instant)} · ${agencyZone}`
    : zonedDateTime(locale, instant);
}

export function matchingCopy(locale: string) {
  const s = (bg: string, ru: string, en: string) =>
    locale === "bg" ? bg : locale === "ru" ? ru : en;
  return {
    /** Stand-ins when the deal names no client: object, subject, sentence start. */
    client: {
      object: s("клиента", "клиента", "the client"),
      subject: s("клиентът", "клиент", "the client"),
      start: s("Клиентът", "Клиент", "The client"),
    },
    title: s(
      "Подбор на имоти за {client}",
      "Подбор объектов для {client}",
      "Property matching for {client}",
    ),
    /** O05 entry into the workbench (contract §6, replaces «Прегледайте текущия вариант»). */
    entry: s("Вижте подходящите имоти", "Посмотреть подходящие объекты", "See matching properties"),
    backToDeal: s("Назад към сделката", "Назад к сделке", "Back to the deal"),
    nextStep: s("Следваща стъпка", "Следующий шаг", "Next step"),
    wants: {
      heading: s(
        "Какво търси {clientSubject}",
        "Что ищет {clientSubject}",
        "What {clientSubject} wants",
      ),
      acknowledged: s(
        "{clientStart} потвърди това на {at}.",
        "{clientStart}: подтверждено {at}.",
        "{clientStart} confirmed this on {at}.",
      ),
      notAcknowledged: s(
        "{clientStart} още не е потвърдил това.",
        "{clientStart}: ещё не подтверждено.",
        "{clientStart} has not confirmed this yet.",
      ),
      open: s(
        "Отворете какво търси клиентът",
        "Открыть, что ищет клиент",
        "Open what the client wants",
      ),
    },
    criteriaRequired: {
      missing: {
        alert: s(
          "Още не можем да търсим: не е записано какво търси клиентът или записът е непълен.",
          "Пока искать нельзя: не записано, что ищет клиент, или запись неполная.",
          "We cannot search yet: what the client wants is not recorded, or the record is incomplete.",
        ),
        fillHeading: s("Какво да попълните", "Что заполнить", "What to fill in"),
        fillRequired: s(
          "Задължително: покупка или наем.",
          "Обязательно: покупка или аренда.",
          "Required: purchase or rent.",
        ),
        fillRecommended: s(
          "Препоръчително: район, бюджет и вид имот. Без тях списъкът е твърде широк.",
          "Желательно: район, бюджет и тип объекта. Без них список слишком широкий.",
          "Recommended: area, budget and property type. Without them the list is too broad.",
        ),
        fillOptional: s(
          "Ако е важно: спални, площ и удобства, без които не може, например асансьор.",
          "Если важно: спальни, площадь и удобства, без которых нельзя, например лифт.",
          "If it matters: bedrooms, floor area and must-have features, for example a lift.",
        ),
        fill: s(
          "Попълнете какво търси клиентът",
          "Заполнить, что ищет клиент",
          "Fill in what the client wants",
        ),
      },
      kindMismatch: {
        alert: s(
          "Какво търси клиентът е записано за {recordedKind}, а тази сделка е {dealKind}. Показваме имоти само когато двете съвпадат.",
          "То, что ищет клиент, записано как {recordedKind}, а эта сделка — {dealKind}. Мы показываем объекты, только когда они совпадают.",
          "What the client wants is recorded as {recordedKind}, but this deal is {dealKind}. We show properties only when the two match.",
        ),
        recorded: s("Записано: {summary}", "Записано: {summary}", "Recorded: {summary}"),
        deal: s("Сделката: {dealKind}.", "Сделка: {dealKind}.", "The deal: {dealKind}."),
        dealInPlace: s(
          "Сделката: {dealKind} в {place}.",
          "Сделка: {dealKind} в {place}.",
          "The deal: {dealKind} in {place}.",
        ),
      },
    },
    empty: {
      title: s("Няма имоти, които отговарят", "Нет подходящих объектов", "No properties match"),
      body: s(
        "Проверихме всички публикувани обяви в {at}.",
        "Мы проверили все опубликованные объявления в {at}.",
        "We checked all published listings at {at}.",
      ),
      ask: s(
        "Попитайте {client} какво да промени",
        "Спросить {client}, что изменить",
        "Ask {client} what to change",
      ),
    },
    list: {
      count: (count: number) =>
        pluralForm(locale, count, {
          one: s("Намерен {count} имот", "Найден {count} объект", "Found {count} property"),
          few: s("", "Найдено {count} объекта", ""),
          many: s("", "Найдено {count} объектов", ""),
          other: s("Намерени {count} имота", "Найдено {count} объекта", "Found {count} properties"),
        }),
      shown: s("показани {shown}", "показано {shown}", "{shown} shown"),
      countEstimated: s(
        "Над {count} имота",
        "Более {count} объектов",
        "More than {count} properties",
      ),
      checkedAt: s(
        "Обявите са проверени в {at}.",
        "Объявления проверены в {at}.",
        "Listings checked at {at}.",
      ),
      more: s("Покажете още", "Показать ещё", "Show more"),
      end: s(
        "Това са всички намерени имоти.",
        "Это все найденные объекты.",
        "These are all the properties found.",
      ),
      groupMatch: s(
        "Отговарят на всичко · {count}",
        "Подходят по всем пунктам · {count}",
        "Match everything · {count}",
      ),
      groupNeeds: s(
        "Трябва да се потвърди · {count}",
        "Нужно подтвердить · {count}",
        "Needs confirmation · {count}",
      ),
      noPhoto: s("Няма снимка", "Нет фото", "No photo"),
    },
    availability: {
      available: s("Наличност: Свободен", "Доступность: свободен", "Availability: Available"),
      negotiating: s(
        "Наличност: В процес на договаряне",
        "Доступность: идут переговоры",
        "Availability: Under negotiation",
      ),
      reserved: s("Наличност: Резервиран", "Доступность: зарезервирован", "Availability: Reserved"),
      negotiatingNote: s(
        "Има започнали преговори за имота. Можете да го предложите, но кажете на {client}.",
        "По объекту начались переговоры. Его можно предложить, но предупредите {client}.",
        "Negotiations have started on this property. You can suggest it, but tell {client}.",
      ),
      reservedNote: s(
        "Имотът е резервиран. Предложете го само като резервен вариант.",
        "Объект зарезервирован. Предлагайте его только как запасной вариант.",
        "The property is reserved. Suggest it only as a back-up option.",
      ),
    },
    row: {
      property: s("Имот {reference}", "Объект {reference}", "Property {reference}"),
      match: s("Отговаря", "Подходит", "Matches"),
      needs: s("Трябва да се потвърди", "Нужно подтвердить", "Needs confirmation"),
      noMatch: s("Не отговаря", "Не подходит", "Does not match"),
      unknown: s("Не е известно: {facts}", "Неизвестно: {facts}", "Not known: {facts}"),
      onList: s(
        "Вече е в списъка на клиента",
        "Уже в списке клиента",
        "Already on the client's list",
      ),
      checkAndAdd: s(
        "Проверете и добавете {reference}",
        "Проверить и добавить {reference}",
        "Check and add {reference}",
      ),
      check: s("Проверете {reference}", "Проверить {reference}", "Check {reference}"),
      openInDeal: s(
        "Отворете {reference} в сделката",
        "Открыть {reference} в сделке",
        "Open {reference} in the deal",
      ),
    },
    stale: {
      alert: s(
        "Списъкът е зареден в {at}. Оттогава обявите или това, което търси клиентът, са променени.",
        "Список загружен в {at}. С тех пор объявления или то, что ищет клиент, изменились.",
        "The list was loaded at {at}. Since then the listings or what the client wants have changed.",
      ),
      /** The link that opened this page carried no load time. */
      alertSince: s(
        "Откакто отворихте списъка, обявите или това, което търси клиентът, са променени.",
        "С тех пор как вы открыли список, объявления или то, что ищет клиент, изменились.",
        "Since you opened the list, the listings or what the client wants have changed.",
      ),
      refresh: s("Обновете списъка", "Обновить список", "Refresh the list"),
      mayHaveChanged: s(
        "Може вече да не е така.",
        "Возможно, это уже не так.",
        "This may no longer be true.",
      ),
    },
    needs: {
      alert: (count: number) =>
        pluralForm(locale, count, {
          one: s(
            "Няма имот, за който всичко е потвърдено. Този имот може да отговаря, но за него липсват факти.",
            "Нет объекта, по которому всё подтверждено. Этот объект может подойти, но по нему не хватает фактов.",
            "No property has everything confirmed. This property may match, but facts are missing.",
          ),
          few: s(
            "",
            "Нет объекта, по которому всё подтверждено. Эти {count} объекта могут подойти, но по ним не хватает фактов.",
            "",
          ),
          many: s(
            "",
            "Нет объекта, по которому всё подтверждено. Эти {count} объектов могут подойти, но по ним не хватает фактов.",
            "",
          ),
          other: s(
            "Няма имот, за който всичко е потвърдено. Тези {count} имота може да отговарят, но за тях липсват факти.",
            "Нет объекта, по которому всё подтверждено. Эти {count} объекта могут подойти, но по ним не хватает фактов.",
            "No property has everything confirmed. These {count} properties may match, but facts are missing.",
          ),
        }),
      howHeading: s("Как да потвърдите", "Как подтвердить", "How to confirm"),
      how: [
        s(
          "1. Попитайте продавача или колегата, който води обявата.",
          "1. Спросите продавца или коллегу, который ведёт объявление.",
          "1. Ask the seller or the colleague who manages the listing.",
        ),
        s(
          "2. Запишете отговора при фактите за имота.",
          "2. Запишите ответ в фактах объекта.",
          "2. Record the answer with the property facts.",
        ),
        s(
          "3. Проверете имота отново тук.",
          "3. Снова проверьте объект здесь.",
          "3. Check the property again here.",
        ),
      ],
    },
    check: {
      title: s(
        "Имот {reference} за {client}",
        "Объект {reference} для {client}",
        "Property {reference} for {client}",
      ),
      backToList: s("Към списъка с имоти", "К списку объектов", "Back to the property list"),
      nothingToConfirm: s(
        "Няма факти за потвърждаване.",
        "Нет фактов для подтверждения.",
        "There are no facts to confirm.",
      ),
      noMatchHeading: s("Не отговаря на", "Не подходит по", "Does not match"),
      noMatchNotChecked: (count: number) =>
        pluralForm(locale, count, {
          one: s(
            "Другото не е проверено докрай, защото {fact} вече не отговаря.",
            "Остальное проверено не до конца, потому что уже не подходит: {fact}.",
            "The rest was not fully checked because {fact} already does not match.",
          ),
          other: s(
            "Другото не е проверено докрай, защото {fact} вече не отговарят.",
            "Остальное проверено не до конца, потому что уже не подходят: {fact}.",
            "The rest was not fully checked because {fact} already do not match.",
          ),
        }),
      alternativeUnavailable: s(
        "Да предложите имот, който не отговаря, като изрична алтернатива, още не може оттук. Ако {clientSubject} иска друго, първо променете какво търси клиентът.",
        "Предложить неподходящий объект как явную альтернативу отсюда пока нельзя. Если {clientSubject} хочет другое, сначала измените то, что ищет клиент.",
        "You cannot yet offer a non-matching property as an explicit alternative from here. If {clientSubject} wants something else, first change what the client wants.",
      ),
      needsHeading: s("Трябва да се потвърди", "Нужно подтвердить", "Needs confirmation"),
      /** The drawn case: only availability is unknown. */
      needsAddAfterAvailability: s(
        "Добавете имота в списъка на клиента, след като наличността е потвърдена.",
        "Добавьте объект в список клиента после того, как доступность будет подтверждена.",
        "Add the property to the client's list after its availability is confirmed.",
      ),
      needsAddAfter: s(
        "Добавете имота в списъка на клиента, след като потвърдите {fact}.",
        "Добавьте объект в список клиента после того, как подтвердите: {fact}.",
        "Add the property to the client's list after you confirm {fact}.",
      ),
      needsConfirm: s("Потвърдете {fact}", "Подтвердить: {fact}", "Confirm {fact}"),
      unknownAvailabilitySale: s(
        "Наличност: не знаем дали имотът още се продава.",
        "Доступность: мы не знаем, продаётся ли объект до сих пор.",
        "Availability: we do not know whether the property is still for sale.",
      ),
      unknownAvailabilityRent: s(
        "Наличност: не знаем дали имотът още се отдава под наем.",
        "Доступность: мы не знаем, сдаётся ли объект до сих пор.",
        "Availability: we do not know whether the property is still for rent.",
      ),
      unknownOther: s(
        "{fact}: няма потвърдени данни.",
        "{fact}: нет подтверждённых данных.",
        "{fact}: no confirmed information.",
      ),
      onListNote: s(
        "Имотът вече е в списъка на клиента. Не е нужно да го добавяте отново.",
        "Объект уже в списке клиента. Добавлять его снова не нужно.",
        "The property is already on the client's list. You do not need to add it again.",
      ),
    },
    add: {
      explanationLabel: s(
        "Обяснение за клиента *",
        "Пояснение для клиента *",
        "Explanation for the client *",
      ),
      explanationRule: s(
        "{clientStart} вижда това обяснение. Пишете само за имота; бележките ви за това какво търси той остават вътрешни.",
        "{clientStart} увидит это пояснение. Пишите только об объекте; ваши заметки о том, что ищет клиент, остаются внутренними.",
        "{clientStart} sees this explanation. Write only about the property; your notes on what the client wants stay internal.",
      ),
      effect: s(
        "Добавяме имота веднъж: второ натискане не го добавя повторно. {clientStart} ще го види в „Предложени имоти“.",
        "Объект добавляется один раз: повторное нажатие не добавит его снова. {clientStart} увидит его в разделе «Предложенные объекты».",
        "We add the property once: pressing again does not add it twice. {clientStart} will see it under “Suggested properties”.",
      ),
      submit: s(
        "Добавете {reference} в списъка на клиента",
        "Добавить {reference} в список клиента",
        "Add {reference} to the client's list",
      ),
      sending: s("Добавяме {reference}…", "Добавляем {reference}…", "Adding {reference}…"),
      sendingStatus: s("Добавя се", "Добавляется", "Adding"),
      sendingNote: s(
        "Добавяме имота веднъж. Ако връзката прекъсне, обяснението остава и проверяваме същата заявка.",
        "Объект добавляется один раз. Если связь прервётся, пояснение сохранится, и мы проверим тот же запрос.",
        "We add the property once. If the connection drops, the explanation stays and we check the same request.",
      ),
      explanationError: s(
        "Напишете обяснението за клиента: от 3 до 1500 знака.",
        "Напишите пояснение для клиента: от 3 до 1500 символов.",
        "Write the explanation for the client: 3 to 1,500 characters.",
      ),
      errorSummary: s(
        "Проверете отбелязаното",
        "Проверьте отмеченное",
        "Check the highlighted details",
      ),
      notAdded: s("Не е добавен", "Не добавлен", "Not added"),
      nothingAdded: s("Не е добавено", "Ничего не добавлено", "Nothing added"),
      conflict: {
        title: s(
          "Някой е променил това междувременно",
          "Кто-то изменил это тем временем",
          "Someone changed this in the meantime",
        ),
        brief: s(
          "Докато проверявахте, е променено какво търси клиентът. Затова {reference} не е добавен в списъка на клиента.",
          "Пока вы проверяли, изменилось то, что ищет клиент. Поэтому {reference} не добавлен в список клиента.",
          "While you were checking, what the client wants changed. So {reference} was not added to the client's list.",
        ),
        listing: s(
          "Докато проверявахте, е променена обявата. Затова {reference} не е добавен в списъка на клиента.",
          "Пока вы проверяли, изменилось объявление. Поэтому {reference} не добавлен в список клиента.",
          "While you were checking, the listing changed. So {reference} was not added to the client's list.",
        ),
        availability: s(
          "Докато проверявахте, е променена наличността. Затова {reference} не е добавен в списъка на клиента.",
          "Пока вы проверяли, изменилась доступность. Поэтому {reference} не добавлен в список клиента.",
          "While you were checking, the availability changed. So {reference} was not added to the client's list.",
        ),
        assessment: s(
          "Докато проверявахте, се промени проверката на имота. Затова {reference} не е добавен в списъка на клиента.",
          "Пока вы проверяли, изменилась проверка объекта. Поэтому {reference} не добавлен в список клиента.",
          "While you were checking, the property check changed. So {reference} was not added to the client's list.",
        ),
        /** None of the reviewed facts moved: another update to the deal came first. */
        deal: s(
          "Докато проверявахте, сделката е променена. Затова {reference} не е добавен в списъка на клиента.",
          "Пока вы проверяли, сделка изменилась. Поэтому {reference} не добавлен в список клиента.",
          "While you were checking, the deal changed. So {reference} was not added to the client's list.",
        ),
        kept: s(
          "Обяснението е запазено. Проверката ще покаже дали имотът отговаря на новото.",
          "Пояснение сохранено. Проверка покажет, подходит ли объект с учётом изменений.",
          "The explanation is kept. The check will show whether the property matches what changed.",
        ),
        recheck: s(
          "Проверете {reference} отново",
          "Проверить {reference} снова",
          "Check {reference} again",
        ),
      },
      offline: {
        status: s("Не е изпратено", "Не отправлено", "Not sent"),
        alert: s(
          "Връзката прекъсна преди изпращането. Нищо не е добавено. При нов опит изпращаме същата заявка.",
          "Связь прервалась до отправки. Ничего не добавлено. При повторной попытке мы отправим тот же запрос.",
          "The connection dropped before sending. Nothing was added. When you try again we send the same request.",
        ),
      },
      retry: s("Опитайте отново", "Попробовать снова", "Try again"),
      unknown: {
        title: s(
          "Още не знаем дали {reference} е добавен",
          "Мы пока не знаем, добавлен ли {reference}",
          "We do not know yet whether {reference} was added",
        ),
        status: s("Още не е потвърдено", "Ещё не подтверждено", "Not confirmed yet"),
        alert: s(
          "Връзката прекъсна след изпращането. Проверката не изпраща ново добавяне. Може да покаже, че резултатът още не е потвърден.",
          "Связь прервалась после отправки. Проверка не отправляет новое добавление. Она может показать, что результат ещё не подтверждён.",
          "The connection dropped after sending. The check does not send a new add. It may show that the result is not confirmed yet.",
        ),
      },
      checkSame: s("Проверете същата заявка", "Проверить тот же запрос", "Check the same request"),
      unavailableAlert: s(
        "Обявата вече не е публикувана. Имотът не е добавен.",
        "Объявление больше не опубликовано. Объект не добавлен.",
        "The listing is no longer published. The property was not added.",
      ),
      deniedAlert: s(
        "Сделката не е активна. Имотът не е добавен.",
        "Сделка не активна. Объект не добавлен.",
        "The deal is not active. The property was not added.",
      ),
      notFoundTitle: s(
        "Имотът не е достъпен",
        "Объект недоступен",
        "The property is not available",
      ),
      notFoundAlert: s(
        "Имотът не е достъпен или нямате достъп до него. Нищо не е добавено.",
        "Объект недоступен, или у вас нет к нему доступа. Ничего не добавлено.",
        "The property is not available, or you do not have access to it. Nothing was added.",
      ),
      /** Not drawn: the command refused the reviewed check itself (for example before binding). */
      reviewRejected: s(
        "Проверката на имота не беше приета. Имотът не е добавен. Проверете имота отново.",
        "Проверка объекта не принята. Объект не добавлен. Проверьте объект снова.",
        "The property check was not accepted. The property was not added. Check the property again.",
      ),
      failed: s(
        "Имотът не е добавен. Опитайте отново по-късно.",
        "Объект не добавлен. Попробуйте позже.",
        "The property was not added. Try again later.",
      ),
    },
    added: {
      title: s(
        "{reference} е в списъка на клиента",
        "{reference} в списке клиента",
        "{reference} is on the client's list",
      ),
      status: s(
        "Добавен в списъка на клиента",
        "Добавлен в список клиента",
        "Added to the client's list",
      ),
      property: s("Имот", "Объект", "Property"),
      explanation: s("Обяснение за клиента", "Пояснение для клиента", "Explanation for the client"),
      whatClientSeesLabel: s(
        "Какво вижда {clientSubject}",
        "Что видит {clientSubject}",
        "What {clientSubject} sees",
      ),
      whatClientSees: s(
        "Имота и обяснението в „Предложени имоти“. Бележките ви за това какво търси той не се показват.",
        "Объект и пояснение в разделе «Предложенные объекты». Ваши заметки о том, что ищет клиент, не показываются.",
        "The property and the explanation under “Suggested properties”. Your notes on what the client wants are not shown.",
      ),
      recordedLabel: s("Записано", "Записано", "Recorded"),
      recorded: "{actorName} · {at}",
    },
    next: {
      criteriaMissing: s(
        "Запишете какво търси {clientSubject}. След това тук ще видите подходящите имоти.",
        "Запишите, что ищет {clientSubject}. После этого здесь появятся подходящие объекты.",
        "Record what {clientSubject} wants. Then the matching properties appear here.",
      ),
      criteriaKind: s(
        "Поправете в какво търси клиентът „{recordedKind}“ на „{dealKind}“ или проверете дали сте в правилната сделка.",
        "Исправьте в том, что ищет клиент, «{recordedKind}» на «{dealKind}» или проверьте, та ли это сделка.",
        "Change “{recordedKind}” to “{dealKind}” in what the client wants, or check that you are in the right deal.",
      ),
      empty: s(
        "Няма подходящи имоти. Попитайте {client} какво може да промени: район, бюджет или вид имот.",
        "Подходящих объектов нет. Спросите {client}, что можно изменить: район, бюджет или тип объекта.",
        "No properties match. Ask {client} what could change: area, budget or property type.",
      ),
      ready: s(
        "Започнете с {reference}: отговаря на всичко, което търси {clientSubject}. Проверете го и го добавете в списъка на клиента.",
        "Начните с {reference}: он подходит по всем пунктам, которые ищет {clientSubject}. Проверьте его и добавьте в список клиента.",
        "Start with {reference}: it matches everything {clientSubject} wants. Check it and add it to the client's list.",
      ),
      allOnList: s(
        "Всички показани имоти вече са в списъка на клиента.",
        "Все показанные объекты уже в списке клиента.",
        "All the properties shown are already on the client's list.",
      ),
      stale: s(
        "Обновете списъка, преди да добавяте имоти. Нищо не е добавено.",
        "Обновите список, прежде чем добавлять объекты. Ничего не добавлено.",
        "Refresh the list before adding properties. Nothing has been added.",
      ),
      needs: s(
        "Потвърдете липсващите факти, преди да предложите имот. Започнете с {reference}.",
        "Подтвердите недостающие факты, прежде чем предлагать объект. Начните с {reference}.",
        "Confirm the missing facts before you suggest a property. Start with {reference}.",
      ),
      checkNoMatch: s(
        "{reference} не отговаря на {fact}. Върнете се към списъка и изберете друг имот.",
        "{reference} не подходит: {fact}. Вернитесь к списку и выберите другой объект.",
        "{reference} does not match {fact}. Go back to the list and choose another property.",
      ),
      checkNeedsAvailability: s(
        "Потвърдете наличността на {reference} с продавача и я запишете при фактите за имота. После проверете имота отново.",
        "Подтвердите доступность {reference} у продавца и запишите её в фактах объекта. Затем проверьте объект снова.",
        "Confirm the availability of {reference} with the seller and record it with the property facts. Then check the property again.",
      ),
      checkNeeds: s(
        "Потвърдете {fact} на {reference} с продавача и запишете отговора при фактите за имота. После проверете имота отново.",
        "Подтвердите у продавца для {reference}: {fact}. Запишите ответ в фактах объекта, затем проверьте объект снова.",
        "Confirm {fact} for {reference} with the seller and record the answer with the property facts. Then check the property again.",
      ),
      checkMatch: s(
        "Прегледайте обяснението за клиента и добавете {reference} в неговия списък.",
        "Проверьте пояснение для клиента и добавьте {reference} в его список.",
        "Review the explanation for the client and add {reference} to their list.",
      ),
      checkNegotiating: s(
        "Кажете на {client}, че за {reference} има започнали преговори, и го добавете в неговия списък.",
        "Предупредите {client}, что по {reference} начались переговоры, и добавьте объект в список клиента.",
        "Tell {client} that negotiations have started on {reference}, and add it to their list.",
      ),
      checkReserved: s(
        "Предложете {reference} само като резервен вариант: напишете го в обяснението и добавете имота.",
        "Предлагайте {reference} только как запасной вариант: напишите это в пояснении и добавьте объект.",
        "Suggest {reference} only as a back-up option: say so in the explanation and add the property.",
      ),
      onList: s(
        "{reference} вече е в списъка на клиента. Отворете го в сделката, за да видите какво е отговорил {clientSubject}.",
        "{reference} уже в списке клиента. Откройте его в сделке, чтобы увидеть, что ответил {clientSubject}.",
        "{reference} is already on the client's list. Open it in the deal to see what {clientSubject} replied.",
      ),
      addSend: s(
        "Изчакайте няколко секунди, докато добавим имота. Не натискайте отново.",
        "Подождите несколько секунд, пока мы добавим объект. Не нажимайте повторно.",
        "Wait a few seconds while we add the property. Do not press again.",
      ),
      addedNeeds: s(
        "Готово. Продължете със следващия имот: за {reference} трябва да се потвърди {fact}.",
        "Готово. Переходите к следующему объекту: для {reference} нужно подтвердить: {fact}.",
        "Done. Continue with the next property: for {reference}, {fact} needs confirming.",
      ),
      addedMatch: s(
        "Готово. Продължете със следващия имот: {reference} отговаря на всичко.",
        "Готово. Переходите к следующему объекту: {reference} подходит по всем пунктам.",
        "Done. Continue with the next property: {reference} matches everything.",
      ),
      addedLast: s(
        "Готово. В този списък няма друг имот за проверка.",
        "Готово. В этом списке больше нет объектов для проверки.",
        "Done. There is no other property to check in this list.",
      ),
      addConflict: s(
        "Проверете {reference} отново по новото. Имотът не е добавен.",
        "Проверьте {reference} снова с учётом изменений. Объект не добавлен.",
        "Check {reference} again against what changed. The property was not added.",
      ),
      addOffline: s(
        "Свържете се с интернет и опитайте отново. Обяснението е запазено.",
        "Подключитесь к интернету и попробуйте снова. Пояснение сохранено.",
        "Reconnect to the internet and try again. The explanation is kept.",
      ),
      addUnknown: s(
        "Не добавяйте отново. Проверете същата заявка.",
        "Не добавляйте повторно. Проверьте тот же запрос.",
        "Do not add it again. Check the same request.",
      ),
      unavailable: s(
        "Изберете друг имот от списъка с имоти.",
        "Выберите другой объект из списка объектов.",
        "Choose another property from the property list.",
      ),
      dealInactive: s(
        "Върнете се към списъка с имоти. Имоти се добавят само към активна сделка.",
        "Вернитесь к списку объектов. Объекты добавляются только в активную сделку.",
        "Go back to the property list. Properties are added only to an active deal.",
      ),
      notFound: s(
        "Върнете се към списъка с имоти и изберете имот оттам.",
        "Вернитесь к списку объектов и выберите объект оттуда.",
        "Go back to the property list and choose a property from there.",
      ),
    },
    fact: {
      purpose: {
        sale: s("покупка", "покупка", "purchase"),
        long_term_rent: s("наем", "аренда", "rent"),
      } as Record<string, string>,
      dealKind: {
        buyer: s("покупка", "покупка", "a purchase"),
        tenant: s("наем", "аренда", "a rental"),
      } as Record<string, string>,
      types: {
        apartment: s("апартамент", "квартира", "apartment"),
        house: s("къща", "дом", "house"),
        plot: s("парцел", "участок", "plot"),
        commercial: s("търговски имот", "коммерческий объект", "commercial property"),
        hotel: s("хотел", "отель", "hotel"),
        development: s("проект", "проект", "development"),
        other: s("друг вид имот", "другой тип объекта", "other property type"),
      } as Record<string, string>,
      or: s("или", "или", "or"),
      /** Presented availability, as shown beside the requirement or in a refusal line. */
      status: {
        available: s("Свободен", "свободен", "Available"),
        negotiating: s("В процес на договаряне", "идут переговоры", "Under negotiation"),
        reserved_with_recorded_basis: s("Резервиран", "зарезервирован", "Reserved"),
        confirmation_required: s(
          "Трябва да се потвърди",
          "нужно подтвердить",
          "Needs confirmation",
        ),
        sold: s("Продаден", "продан", "Sold"),
        let: s("Отдаден", "сдан", "Let"),
        withdrawn: s("Оттеглен", "снят", "Withdrawn"),
      } as Record<string, string>,
      /** Plain nouns for «Не е известно: …» and the check lines. */
      name: {
        purpose: s("вид сделка", "вид сделки", "transaction type"),
        propertyType: s("вид имот", "тип объекта", "property type"),
        place: s("район", "район", "location"),
        availability: s("наличност", "доступность", "availability"),
        price: s("цена", "цена", "price"),
        bedrooms: s("спални", "спальни", "bedrooms"),
        rooms: s("стаи", "комнаты", "rooms"),
        area: s("площ", "площадь", "area"),
      } as Record<string, string>,
      /** In a sentence: [object form, subject form] ("confirm the price" / "the price does not"). */
      definite: {
        purpose: [
          s("вида сделка", "вид сделки", "the transaction type"),
          s("видът сделка", "вид сделки", "the transaction type"),
        ],
        propertyType: [
          s("вида имот", "тип объекта", "the property type"),
          s("видът имот", "тип объекта", "the property type"),
        ],
        place: [s("района", "район", "the location"), s("районът", "район", "the location")],
        availability: [
          s("наличността", "доступность", "the availability"),
          s("наличността", "доступность", "the availability"),
        ],
        price: [s("цената", "цена", "the price"), s("цената", "цена", "the price")],
        bedrooms: [
          s("броя спални", "число спален", "the number of bedrooms"),
          s("броят спални", "число спален", "the number of bedrooms"),
        ],
        rooms: [
          s("броя стаи", "число комнат", "the number of rooms"),
          s("броят стаи", "число комнат", "the number of rooms"),
        ],
        area: [s("площта", "площадь", "the floor area"), s("площта", "площадь", "the floor area")],
      } as Record<string, [string, string]>,
      areaBasis: {
        living: s("жилищна", "жилая", "living"),
        built: s("застроена", "застройки", "built"),
        total: s("обща", "общая", "total"),
        land: s("парцел", "участка", "land"),
      } as Record<string, string>,
      areaNamed: s("площ ({basis})", "площадь ({basis})", "{basis} area"),
      features: {
        lift: s("асансьор", "лифт", "lift"),
        elevator: s("асансьор", "лифт", "lift"),
        parking: s("паркомясто", "парковка", "parking"),
        terrace: s("тераса", "терраса", "terrace"),
        garden: s("градина", "сад", "garden"),
        pool: s("басейн", "бассейн", "pool"),
        furnished: s("обзаведен", "с мебелью", "furnished"),
        step_free_access: s("достъп без стъпала", "доступ без ступенек", "step-free access"),
      } as Record<string, string>,
      featureQuoted: s("„{label}“", "«{label}»", "“{label}”"),
      bedroomsCount: (count: number) =>
        pluralForm(locale, count, {
          one: s("{count} спалня", "{count} спальня", "{count} bedroom"),
          few: s("", "{count} спальни", ""),
          many: s("", "{count} спален", ""),
          other: s("{count} спални", "{count} спальни", "{count} bedrooms"),
        }),
      roomsCount: (count: number) =>
        pluralForm(locale, count, {
          one: s("{count} стая", "{count} комната", "{count} room"),
          few: s("", "{count} комнаты", ""),
          many: s("", "{count} комнат", ""),
          other: s("{count} стаи", "{count} комнаты", "{count} rooms"),
        }),
      atLeast: s("поне {value}", "не менее {value}", "at least {value}"),
      upTo: s("до {value}", "до {value}", "up to {value}"),
      between: s("от {min} до {max}", "от {min} до {max}", "{min} to {max}"),
      from: s("от {value}", "от {value}", "from {value}"),
      overBudget: s("над бюджета {range}", "выше бюджета {range}", "above the budget {range}"),
      underBudget: s("под бюджета {range}", "ниже бюджета {range}", "below the budget {range}"),
      wanted: s("търси се {value}", "ищется {value}", "wanted: {value}"),
      required: s("задължително е", "обязательно", "required"),
      notOffered: s("не се предлага", "не предлагается", "not on offer"),
      dealIs: s("сделката е {dealKind}", "сделка — {dealKind}", "the deal is {dealKind}"),
      none: s("няма", "нет", "none"),
      line: s(
        "{fact}: {value} — {reason}.",
        "{fact}: {value} — {reason}.",
        "{fact}: {value} — {reason}.",
      ),
      lineNoValue: s("{fact}: {reason}.", "{fact}: {reason}.", "{fact}: {reason}."),
    },
  };
}

export type MatchingCopy = ReturnType<typeof matchingCopy>;

/** Every string the add form needs, filled for one property (O07 §3–4). */
export function addText(
  c: MatchingCopy,
  names: { object: string; subject: string; start: string },
  reference: string,
) {
  return {
    checkTitle: fill(c.check.title, { reference, client: names.object }),
    addedTitle: fill(c.added.title, { reference }),
    conflictTitle: c.add.conflict.title,
    unknownTitle: fill(c.add.unknown.title, { reference }),
    notFoundTitle: c.add.notFoundTitle,
    statusAdding: c.add.sendingStatus,
    statusAdded: c.added.status,
    statusNotAdded: c.add.notAdded,
    statusNothingAdded: c.add.nothingAdded,
    statusNotSent: c.add.offline.status,
    statusUnconfirmed: c.add.unknown.status,
    explanationLabel: c.add.explanationLabel,
    explanationRule: fill(c.add.explanationRule, { clientStart: names.start }),
    effect: fill(c.add.effect, { clientStart: names.start }),
    submit: fill(c.add.submit, { reference }),
    sending: fill(c.add.sending, { reference }),
    sendingNote: c.add.sendingNote,
    explanationError: c.add.explanationError,
    errorSummary: c.add.errorSummary,
    conflict: {
      brief: fill(c.add.conflict.brief, { reference }),
      listing: fill(c.add.conflict.listing, { reference }),
      availability: fill(c.add.conflict.availability, { reference }),
      assessment: fill(c.add.conflict.assessment, { reference }),
      deal: fill(c.add.conflict.deal, { reference }),
      kept: c.add.conflict.kept,
      recheck: fill(c.add.conflict.recheck, { reference }),
    },
    offlineAlert: c.add.offline.alert,
    retry: c.add.retry,
    unknownAlert: c.add.unknown.alert,
    checkSame: c.add.checkSame,
    unavailableAlert: c.add.unavailableAlert,
    deniedAlert: c.add.deniedAlert,
    notFoundAlert: c.add.notFoundAlert,
    reviewRejected: c.add.reviewRejected,
    failed: c.add.failed,
    addedProperty: c.added.property,
    addedExplanation: c.added.explanation,
    whatClientSeesLabel: fill(c.added.whatClientSeesLabel, { clientSubject: names.subject }),
    whatClientSees: c.added.whatClientSees,
    recordedLabel: c.added.recordedLabel,
    backToList: c.check.backToList,
    openInDeal: fill(c.row.openInDeal, { reference }),
    nextStep: c.nextStep,
    nextAddSend: c.next.addSend,
    nextAddConflict: fill(c.next.addConflict, { reference }),
    nextAddOffline: c.next.addOffline,
    nextAddUnknown: c.next.addUnknown,
    nextUnavailable: c.next.unavailable,
    nextDealInactive: c.next.dealInactive,
    nextNotFound: c.next.notFound,
    nextAddedLast: c.next.addedLast,
  };
}

export type AddText = ReturnType<typeof addText>;
