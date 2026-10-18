// O03 / O03L / O03LR staff copy for linking an inquiry to an existing Case. BG is the source;
// EN and RU are drafts for human language review. Staff-only, never public or indexable.
import type { CaseStage } from "@/domain/case";
import type { InquiryCaseBlockReason } from "@/server/cases/inquiry-link";

type BlockReason = NonNullable<InquiryCaseBlockReason>;

const bg = {
  title: "Свързване или създаване на сделка",
  linkTitle: "Свързване със съществуваща сделка",
  linkLead:
    "Активни сделки, достъпни за вас, със същото лице или същите данни за контакт като в запитването. Съвпадението е предложение, а не доказателство за самоличност.",
  capped: "Показани са 50-те последно обновени съвпадения.",
  // Only an exact live same-Party participant has a name; a contact route names no one.
  basisParty: "Същият човек или същата фирма: {party}",
  basisPartyUnnamed: "Същият човек или същата фирма като в запитването",
  basisContact: "Съвпадение по контакт",
  reviewLink: "Преглед на свързването",
  notLinkable: "Не може да се свърже",
  // C02's own refusal class per candidate. inquiry_permission also covers a task the viewer
  // cannot see, so it never mentions tasks.
  reasons: {
    inquiry_owner: "Само отговорникът на запитването може да го свърже със сделка.",
    inquiry_state: "Статусът на запитването не позволява свързване.",
    inquiry_permission: "Достъпът ви не включва работа по това запитване.",
    task_permission:
      "Достъпът ви не позволява задачите на запитването да преминат към тази сделка.",
    staff_unavailable:
      "За вас е отбелязано отсъствие, затова сега не можете да записвате свързване.",
    task_case_conflict: "Задача от това запитване вече е към друга сделка.",
    case_permission: "Достъпът ви не позволява да свържете това запитване с тази сделка.",
  } satisfies Record<BlockReason, string>,
  emptyTitle: "Няма подходяща сделка",
  emptyBody:
    "Нито една активна сделка, достъпна за вас, няма същото лице или същите данни за контакт.",
  noPartyTitle: "Все още няма с какво да се сравни",
  noPartyBody:
    "Към запитването няма свързан контакт, затова не може да се предложи съществуваща сделка.",
  failedTitle: "Подходящите сделки не можаха да се заредят",
  failedBody: "Това не означава, че няма такива. Презаредете страницата, за да опитате отново.",
  reload: "Презареждане",
  createTitle: "Нова сделка",
  createLead:
    "Изберете това, когато запитването е нова работа. За нова сделка уточнете услугата, отговорника и следващото действие.",
  create: "Създайте нова сделка",
  reviewLead: "Проверете дали това е правилната сделка и запишете свързването.",
  inquiry: "Запитване",
  factAction: "Действие",
  factCase: "Сделка",
  factBasis: "Защо е предложена",
  factAlternative: "Алтернатива",
  alternative: "Нова сделка само след уточняване и преглед",
  effectsTitle: "Какво прави свързването",
  effectJoins:
    "Запитването влиза в сделка {case}. Задачите му преминават към сделката със същия отговорник, срокове и обещания към клиента.",
  effectVisible:
    "Служителите с достъп до сделка {case} ще виждат запитването и задачите му; клиентите няма да ги виждат.",
  effectKept: "Запазват се оригиналното запитване, лицето в него и разписката на клиента.",
  effectNot: "Не се създават ново лице, участник, разрешение или покана.",
  matchWarning:
    "Същият имейл или телефон не доказва, че е същият човек. За нова сделка уточнете услугата, отговорника и следващото действие; свързването запазва оригиналното запитване.",
  submit: "Запишете свързването",
  back: "Назад",
  checkStatus: "Проверка на свързването",
  notCandidate:
    "Тази сделка не може да се свърже от това запитване. Може вече да не съвпада, да не е активна или да не е видима за вас.",
  alreadyLinked: "Това запитване вече е свързано със сделка.",
  conflict:
    "Запитването или сделката са променени, след като отворихте прегледа. Нищо не е свързано. Презаредете, за да видите последната версия.",
  reloadReview: "Презаредете прегледа",
  denied: "Достъпът ви не позволява да свържете това запитване с тази сделка. Нищо не е свързано.",
  missing: "Запитването или сделката вече не са достъпни за вас. Нищо не е свързано.",
  unavailable:
    "Свързването не е възможно при текущото състояние на запитването или сделката. Нищо не е свързано.",
  invalid:
    "Заявката за свързване е непълна. Презаредете прегледа и опитайте отново. Нищо не е свързано.",
  sessionEnded: "Сесията ви е изтекла. Влезте отново; нищо не е свързано.",
  unknown: "Не можем да потвърдим дали свързването е записано. Проверете го преди нов опит.",
  backToInquiry: "Към запитването",
  openCase: "Към сделката",
  resultTitle: "Записано свързване",
  resultHeading: "Запитването е свързано със сделка {case}.",
  recorded: "Решението е записано:",
  nextStep: "Следваща стъпка по запитването",
  resultNote:
    "Оригиналната разписка и историята са запазени. Не са добавени участник, разрешение или покана; служителите с достъп до сделката вече виждат запитването и задачите му.",
  statusTitle: "Статус на свързването",
  statusPending:
    "Свързването още няма потвърден резултат. Проверете отново, преди да опитате друго.",
  statusFailed: "Свързването не е записано. Нищо не е променено.",
  statusMissing: "Няма записано свързване за този опит. Проверете запитването преди нов опит.",
  checkAgain: "Проверете отново",
  serviceIntake: "Консултация за услуга",
  caseIdLabel: "ID на сделката",
  caseVersionLabel: "Версия на сделката",
  stages: {
    needs_agreed: "Уточняване на изискванията",
    evaluating: "Подбор на имоти",
    viewing: "Огледи",
    proposal_preparation: "Подготовка на предложение",
    proposal_active: "Предложението се обсъжда",
    coordination: "Координиране на сделката",
    completed: "Завършена",
    request_received: "Получена заявка",
    scope_authority_review: "Проверка на обхват и представителна власт",
    assessment: "Оценка",
    instructions_agreed: "Уговорени инструкции",
    preparing: "Подготовка на обявата",
    marketing: "Предлагане на пазара",
    proposal_coordination: "Координиране на предложения",
    completion_handover: "Приключване и предаване",
    consultation: "Консултация",
    concluded: "Приключена",
  } satisfies Record<CaseStage, string>,
};
type Copy = Omit<{ [K in keyof typeof bg]: string }, "stages" | "reasons"> & {
  stages: Record<CaseStage, string>;
  reasons: Record<BlockReason, string>;
};

const en: Copy = {
  title: "Link or create a deal",
  linkTitle: "Link to an existing deal",
  linkLead:
    "Active deals you can access that have the same person or organization, or the same contact details, as this inquiry. A match is a suggestion, not proof of identity.",
  capped: "Showing the 50 most recently updated matches.",
  basisParty: "Same person or company: {party}",
  basisPartyUnnamed: "Same person or company as this inquiry",
  basisContact: "Matching contact details",
  reviewLink: "Review the link",
  notLinkable: "Can't be linked",
  reasons: {
    inquiry_owner: "Only the inquiry's owner can link it to a deal.",
    inquiry_state: "This inquiry's status doesn't allow linking.",
    inquiry_permission: "Your access doesn't include working on this inquiry.",
    task_permission: "Your access doesn't allow this inquiry's tasks to move to this deal.",
    staff_unavailable: "You are recorded as absent, so you can't record links now.",
    task_case_conflict: "A task from this inquiry already belongs to another deal.",
    case_permission: "Your access doesn't allow linking this inquiry to this deal.",
  },
  emptyTitle: "No matching deal",
  emptyBody: "No active deal you can access has the same person, organization or contact details.",
  noPartyTitle: "Nothing to match yet",
  noPartyBody: "This inquiry has no linked contact, so no existing deal can be suggested.",
  failedTitle: "Matching deals couldn't be loaded",
  failedBody: "This doesn't mean there are none. Reload the page to try again.",
  reload: "Reload",
  createTitle: "New deal",
  createLead:
    "Choose this when the inquiry is new work. For a new deal, choose the kind of work, its owner and the next action.",
  create: "Create a new deal",
  reviewLead: "Check that this is the right deal, then record the link.",
  inquiry: "Inquiry",
  factAction: "Action",
  factCase: "Deal",
  factBasis: "Why it's suggested",
  factAlternative: "Alternative",
  alternative: "A new deal, only after qualifying and review",
  effectsTitle: "What linking does",
  effectJoins:
    "The inquiry joins deal {case}. Its tasks move to the deal with the same owner, due times and client promises.",
  effectVisible:
    "Staff with access to deal {case} will see this inquiry and its tasks; clients will not.",
  effectKept: "The original inquiry, its person or organization and the client's receipt are kept.",
  effectNot: "No new person, participant, permission or invitation is created.",
  matchWarning:
    "The same email or phone doesn't prove it is the same person. For a new deal, choose the kind of work, its owner and the next action; linking keeps the original inquiry.",
  submit: "Record the link",
  back: "Back",
  checkStatus: "Check the link status",
  notCandidate:
    "This deal can't be linked from this inquiry. It may no longer match, be active or be visible to you.",
  alreadyLinked: "This inquiry is already linked to a deal.",
  conflict:
    "The inquiry or the deal changed after you opened this review. Nothing was linked. Reload to see the latest version.",
  reloadReview: "Reload the review",
  denied: "Your access doesn't allow linking this inquiry to this deal. Nothing was linked.",
  missing: "This inquiry or deal is no longer available to you. Nothing was linked.",
  unavailable:
    "The link isn't possible in the current state of the inquiry or the deal. Nothing was linked.",
  invalid: "This link request is incomplete. Reload the review and try again. Nothing was linked.",
  sessionEnded: "Your session ended. Sign in again; nothing was linked.",
  unknown: "We couldn't confirm whether the link was recorded. Check it before trying again.",
  backToInquiry: "Back to the inquiry",
  openCase: "Open the deal",
  resultTitle: "Link recorded",
  resultHeading: "The inquiry is linked to deal {case}.",
  recorded: "Decision recorded:",
  nextStep: "Next step for this inquiry",
  resultNote:
    "The original receipt and history are kept. No participant, permission or invitation was added; staff with access to the deal can now see this inquiry and its tasks.",
  statusTitle: "Link status",
  statusPending: "The link has no confirmed result yet. Check again before trying anything else.",
  statusFailed: "The link was not recorded. Nothing changed.",
  statusMissing:
    "No recorded link was found for this attempt. Check the inquiry before trying again.",
  checkAgain: "Check again",
  serviceIntake: "Service consultation",
  caseIdLabel: "Deal ID",
  caseVersionLabel: "Deal revision",
  stages: {
    needs_agreed: "Agreeing requirements",
    evaluating: "Selecting properties",
    viewing: "Viewings",
    proposal_preparation: "Preparing a proposal",
    proposal_active: "Proposal under discussion",
    coordination: "Coordinating the deal",
    completed: "Completed",
    request_received: "Request received",
    scope_authority_review: "Checking scope and authority",
    assessment: "Assessment",
    instructions_agreed: "Instructions agreed",
    preparing: "Preparing the listing",
    marketing: "On the market",
    proposal_coordination: "Coordinating proposals",
    completion_handover: "Completion and handover",
    consultation: "Consultation",
    concluded: "Concluded",
  },
};

const ru: Copy = {
  title: "Связать или создать сделку",
  linkTitle: "Связать с существующей сделкой",
  linkLead:
    "Доступные вам активные сделки с тем же лицом или теми же контактными данными, что и в обращении. Совпадение — подсказка, а не доказательство личности.",
  capped: "Показаны 50 последних обновлённых совпадений.",
  basisParty: "Тот же человек или та же компания: {party}",
  basisPartyUnnamed: "Тот же человек или та же компания, что и в обращении",
  basisContact: "Совпадение по контакту",
  reviewLink: "Проверить связь",
  notLinkable: "Связать нельзя",
  reasons: {
    inquiry_owner: "Связать обращение со сделкой может только его ответственный.",
    inquiry_state: "Статус обращения не позволяет связать его со сделкой.",
    inquiry_permission: "Ваш доступ не включает работу с этим обращением.",
    task_permission: "Ваш доступ не позволяет перенести задачи обращения в эту сделку.",
    staff_unavailable: "У вас отмечено отсутствие, поэтому сейчас нельзя записывать связь.",
    task_case_conflict: "Задача из этого обращения уже относится к другой сделке.",
    case_permission: "Ваш доступ не позволяет связать это обращение с этой сделкой.",
  },
  emptyTitle: "Подходящей сделки нет",
  emptyBody:
    "Ни в одной доступной вам активной сделке нет того же человека или тех же контактных данных.",
  noPartyTitle: "Пока не с чем сравнить",
  noPartyBody: "К обращению не привязан контакт, поэтому предложить существующую сделку нельзя.",
  failedTitle: "Не удалось загрузить подходящие сделки",
  failedBody: "Это не значит, что их нет. Обновите страницу, чтобы попробовать снова.",
  reload: "Обновить",
  createTitle: "Новая сделка",
  createLead:
    "Выберите это, если обращение — новая работа. Для новой сделки укажите, что нужно клиенту, кто отвечает за работу и какой шаг будет следующим.",
  create: "Создать новую сделку",
  reviewLead: "Проверьте, что это нужная сделка, и запишите связь.",
  inquiry: "Обращение",
  factAction: "Действие",
  factCase: "Сделка",
  factBasis: "Почему предложено",
  factAlternative: "Альтернатива",
  alternative: "Новая сделка — только после уточнения и проверки",
  effectsTitle: "Что делает связь",
  effectJoins:
    "Обращение войдёт в сделку {case}. Его задачи перейдут в эту сделку с тем же ответственным, сроками и обещаниями клиенту.",
  effectVisible:
    "Сотрудники с доступом к сделке {case} увидят это обращение и его задачи; клиенты — нет.",
  effectKept: "Сохраняются исходное обращение, лицо в нём и квитанция клиента.",
  effectNot: "Не создаются новое лицо, участник, разрешение или приглашение.",
  matchWarning:
    "Тот же email или телефон не доказывает, что это тот же человек. Для новой сделки укажите, что нужно клиенту, кто отвечает за работу и какой шаг будет следующим; связь сохраняет исходное обращение.",
  submit: "Записать связь",
  back: "Назад",
  checkStatus: "Проверить статус связи",
  notCandidate:
    "Эту сделку нельзя связать с этим обращением. Возможно, она больше не соответствует данным, не активна или недоступна вам.",
  alreadyLinked: "Это обращение уже связано со сделкой.",
  conflict:
    "Обращение или сделка изменились после открытия проверки. Связь не записана. Обновите, чтобы увидеть последнюю версию.",
  reloadReview: "Обновить проверку",
  denied: "Ваш доступ не позволяет связать это обращение с этой сделкой. Связь не записана.",
  missing: "Обращение или сделка вам больше недоступны. Связь не записана.",
  unavailable: "Связь невозможна в текущем состоянии обращения или сделки. Связь не записана.",
  invalid: "Запрос на связь неполный. Обновите проверку и попробуйте снова. Связь не записана.",
  sessionEnded: "Сеанс завершён. Войдите снова; связь не записана.",
  unknown: "Не удалось подтвердить, записана ли связь. Проверьте её перед новой попыткой.",
  backToInquiry: "К обращению",
  openCase: "К сделке",
  resultTitle: "Связь записана",
  resultHeading: "Обращение связано со сделкой {case}.",
  recorded: "Решение записано:",
  nextStep: "Следующий шаг по обращению",
  resultNote:
    "Исходная квитанция и история сохранены. Участники, разрешения и приглашения не добавлены; сотрудники с доступом к сделке теперь видят это обращение и его задачи.",
  statusTitle: "Статус связи",
  statusPending:
    "У связи ещё нет подтверждённого результата. Проверьте снова, прежде чем делать что-то ещё.",
  statusFailed: "Связь не записана. Ничего не изменилось.",
  statusMissing:
    "Записанная связь для этой попытки не найдена. Проверьте обращение перед новой попыткой.",
  checkAgain: "Проверить снова",
  serviceIntake: "Консультация по услуге",
  caseIdLabel: "ID сделки",
  caseVersionLabel: "Версия сделки",
  stages: {
    needs_agreed: "Согласование требований",
    evaluating: "Подбор объектов",
    viewing: "Просмотры",
    proposal_preparation: "Подготовка предложения",
    proposal_active: "Предложение на рассмотрении",
    coordination: "Координация сделки",
    completed: "Завершено",
    request_received: "Запрос получен",
    scope_authority_review: "Проверка объёма и полномочий",
    assessment: "Оценка",
    instructions_agreed: "Поручение согласовано",
    preparing: "Подготовка объявления",
    marketing: "На рынке",
    proposal_coordination: "Координация предложений",
    completion_handover: "Завершение и передача",
    consultation: "Консультация",
    concluded: "Завершено",
  },
};

export function inquiryLinkCopy(locale: string): Copy {
  return locale === "bg" ? bg : locale === "ru" ? ru : en;
}
export type InquiryLinkCopy = Copy;
