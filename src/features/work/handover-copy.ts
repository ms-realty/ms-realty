export function taskHandoverCopy(locale: string) {
  const s = (bg: string, ru: string, en: string) =>
    locale === "bg" ? bg : locale === "ru" ? ru : en;
  return {
    inbox: s("Очакващи моето приемане", "Ожидают моего принятия", "Awaiting my acceptance"),
    title: s("Предаване на задача", "Передача задачи", "Task handover"),
    lead: s(
      "Отговорникът се сменя само след приемане от посочения служител. Сроковете, състоянието и обещанията към клиента се запазват.",
      "Ответственный сменится только после принятия указанным сотрудником. Сроки, состояние и обещания клиенту сохраняются.",
      "Ownership changes only when the named colleague accepts. Deadlines, state and client promises stay unchanged.",
    ),
    receiver: s("Приемащ служител", "Принимающий сотрудник", "Receiving colleague"),
    reason: s(
      "Причина и бележки за предаване",
      "Причина и заметки для передачи",
      "Reason and handover notes",
    ),
    reviewed: s(
      "Проверих задачата, сроковете и приемащия служител",
      "Я проверил задачу, сроки и принимающего сотрудника",
      "I checked the task, deadlines and receiving colleague",
    ),
    request: s("Предлагане на предаване", "Предложить передачу", "Request task handover"),
    accept: s("Приемане на задачата", "Принять задачу", "Accept task handover"),
    cancel: s("Отмяна на предложението", "Отменить предложение", "Cancel task handover"),
    pending: s("Очаква приемане от", "Ожидает принятия от", "Awaiting acceptance by"),
    // W03 (design/contracts/w03-p12.md §1–2). {owner}/{receiver}/{actor} are person names.
    receiverTitle: s(
      "{owner} ви предлага работата си",
      "{owner} предлагает вам свою работу",
      "{owner} is offering you their work",
    ),
    from: s("От", "От", "From"),
    handedOver: s("Какво се предава", "Что передаётся", "What is handed over"),
    nextAction: s("Вашата следваща стъпка", "Ваш следующий шаг", "Your next step"),
    reviewAt: s(
      "Кога ще прегледате отново?",
      "Когда вы вернётесь к этому?",
      "When will you review it again?",
    ),
    acceptRule: s(
      "Задължително: стъпка и бъдещ ден и час. Няма час по подразбиране. Стъпката става ваша задача; клиентите не я виждат.",
      "Обязательно: шаг и будущие день и время. Времени по умолчанию нет. Шаг станет вашей задачей; клиенты его не видят.",
      "Required: a step and a future day and time. There is no default time. The step becomes your task; clients do not see it.",
    ),
    acceptEffect: s(
      "Когато приемете, работата е ваша от този момент. Стъпката става ваша задача, а часът е за вашия преглед. Клиентите не получават съобщение.",
      "Когда вы примете, работа станет вашей с этого момента. Шаг станет вашей задачей, а время — для вашей проверки. Клиенты не получают сообщений.",
      "Once you accept, the work is yours from that moment. The step becomes your task and the time is for your own review. Clients receive no message.",
    ),
    acceptWork: s("Приемете работата", "Принять работу", "Accept the work"),
    declineOpen: s("Откажете с причина", "Отказаться с причиной", "Decline with a reason"),
    declineReason: s("Причина за отказа", "Причина отказа", "Reason for declining"),
    declineEffect: s(
      "{owner} ще види причината. Нищо не преминава към вас и работата остава при {owner}.",
      "{owner} увидит причину. К вам ничего не переходит, работа остаётся у {owner}.",
      "{owner} will see the reason. Nothing moves to you and the work stays with {owner}.",
    ),
    backToOffer: s("Назад към предложението", "Назад к предложению", "Back to the offer"),
    sendDecline: s("Изпратете отказа", "Отправить отказ", "Send the decline"),
    pendingAlert: s(
      "Предложението чака отговор от {receiver}. Дотогава работата остава при вас. Ако {receiver} откаже, тук ще видите причината.",
      "Предложение ждёт ответа {receiver}. До тех пор работа остаётся у вас. Если {receiver} откажется, здесь будет видна причина.",
      "The offer is waiting for {receiver} to answer. Until then the work stays with you. If {receiver} declines, you will see the reason here.",
    ),
    withdrawOpen: s("Оттеглете предложението", "Отозвать предложение", "Withdraw the offer"),
    withdrawReason: s("Причина", "Причина", "Reason"),
    withdrawEffect: s(
      "Работата остава при вас. {receiver} ще види „Предложението е оттеглено“ и причината.",
      "Работа остаётся у вас. {receiver} увидит «Предложение отозвано» и причину.",
      "The work stays with you. {receiver} will see “The offer was withdrawn” and the reason.",
    ),
    declinedTitle: s(
      "{actor} отказа предаването",
      "{actor} отказался от передачи",
      "{actor} declined the handover",
    ),
    declinedNext: s(
      "Предложете работата на друг колега или я запазете при себе си.",
      "Предложите работу другому коллеге или оставьте её у себя.",
      "Offer the work to another colleague or keep it yourself.",
    ),
    withdrawnByMe: s(
      "Оттеглихте предложението",
      "Вы отозвали предложение",
      "You withdrew the offer",
    ),
    withdrawnByMeNote: s(
      "Получателят вижда „Предложението е оттеглено“ и вашата причина. Не се записва като отказ.",
      "Получатель видит «Предложение отозвано» и вашу причину. Это не записывается как отказ.",
      "The receiver sees “The offer was withdrawn” and your reason. It is not recorded as a decline.",
    ),
    withdrawnForMe: s(
      "Предложението е оттеглено",
      "Предложение отозвано",
      "The offer was withdrawn",
    ),
    withdrawnForMeNote: s(
      "Не е ваш отказ. {actor} оттегли предложението, преди да отговорите. Не е нужно действие.",
      "Это не ваш отказ. {actor} отозвал предложение до вашего ответа. Действий не требуется.",
      "This is not a decline by you. {actor} withdrew the offer before you answered. No action is needed.",
    ),
    reasonFrom: s("Причина от {actor}", "Причина от {actor}", "Reason from {actor}"),
    recorded: s("Записано", "Записано", "Recorded"),
    workWith: s("Работата е при", "Работа у", "The work is with"),
    offerTitle: s(
      "Предложете работата на колега",
      "Предложите работу коллеге",
      "Offer the work to a colleague",
    ),
    none: s(
      "Няма друг служител с необходимия достъп.",
      "Нет другого сотрудника с необходимым доступом.",
      "No other colleague currently has the required access.",
    ),
  };
}
