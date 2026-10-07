// O03 / O03L / O03LR staff copy for linking an inquiry to an existing Case. BG is the source;
// EN and RU are drafts for human language review. Staff-only, never public or indexable.
import type { CaseStage } from "@/domain/case";
import type { InquiryCaseBlockReason } from "@/server/cases/inquiry-link";

type BlockReason = NonNullable<InquiryCaseBlockReason>;

const bg = {
  title: "Свързване или създаване на случай",
  linkTitle: "Свързване със съществуващ случай",
  linkLead:
    "Активни случаи, достъпни за вас, със същото лице или същите данни за контакт като в запитването. Съвпадението е предложение, а не доказателство за самоличност.",
  capped: "Показани са 50-те последно обновени съвпадения.",
  // Only an exact live same-Party participant has a name; a contact route names no one.
  basisParty: "Същата страна: {party}",
  basisPartyUnnamed: "Същата страна като в запитването",
  basisContact: "Съвпадение по контакт",
  reviewLink: "Преглед на свързването",
  notLinkable: "Не може да се свърже",
  // C02's own refusal class per candidate. inquiry_permission also covers a task the viewer
  // cannot see, so it never mentions tasks.
  reasons: {
    inquiry_owner: "Само отговорникът на запитването може да го свърже със случай.",
    inquiry_state: "Статусът на запитването не позволява свързване.",
    inquiry_permission: "Достъпът ви не включва работа по това запитване.",
    task_permission:
      "Достъпът ви не позволява задачите на запитването да преминат към този случай.",
    staff_unavailable:
      "За вас е отбелязано отсъствие, затова сега не можете да записвате свързване.",
    task_case_conflict: "Задача от това запитване вече е към друг случай.",
    case_permission: "Достъпът ви не позволява да свържете това запитване с този случай.",
  } satisfies Record<BlockReason, string>,
  emptyTitle: "Няма подходящ случай",
  emptyBody:
    "Нито един активен случай, достъпен за вас, няма същото лице или същите данни за контакт.",
  noPartyTitle: "Все още няма с какво да се сравни",
  noPartyBody:
    "Към запитването няма свързан контакт, затова не може да се предложи съществуващ случай.",
  failedTitle: "Подходящите случаи не можаха да се заредят",
  failedBody: "Това не означава, че няма такива. Презаредете страницата, за да опитате отново.",
  reload: "Презареждане",
  createTitle: "Нов случай",
  createLead:
    "Изберете това, когато запитването е нова работа. Новият случай изисква тип, отговорник и следващо действие.",
  create: "Създайте нов случай",
  reviewLead: "Проверете дали това е правилният случай и запишете свързването.",
  inquiry: "Запитване",
  factAction: "Действие",
  factCase: "Случай",
  factBasis: "Защо е предложен",
  factAlternative: "Алтернатива",
  alternative: "Нов случай само след уточняване и преглед",
  effectsTitle: "Какво прави свързването",
  effectJoins:
    "Запитването влиза в случай {case}. Задачите му преминават към случая със същия отговорник, срокове и обещания към клиента.",
  effectVisible:
    "Служителите с достъп до случай {case} ще виждат запитването и задачите му; клиентите няма да ги виждат.",
  effectKept: "Запазват се оригиналното запитване, лицето в него и разписката на клиента.",
  effectNot: "Не се създават ново лице, участник, разрешение или покана.",
  matchWarning:
    "Същият имейл или телефон не доказва, че е същият човек. Новият случай изисква тип, отговорник и следващо действие; свързването запазва оригиналното запитване.",
  submit: "Запишете свързването",
  back: "Назад",
  checkStatus: "Проверка на свързването",
  notCandidate:
    "Този случай не може да се свърже от това запитване. Може вече да не съвпада, да не е активен или да не е видим за вас.",
  alreadyLinked: "Това запитване вече е свързано със случай.",
  conflict:
    "Запитването или случаят са променени, след като отворихте прегледа. Нищо не е свързано. Презаредете, за да видите последната версия.",
  reloadReview: "Презаредете прегледа",
  denied: "Достъпът ви не позволява да свържете това запитване с този случай. Нищо не е свързано.",
  missing: "Запитването или случаят вече не са достъпни за вас. Нищо не е свързано.",
  unavailable:
    "Свързването не е възможно при текущото състояние на запитването или случая. Нищо не е свързано.",
  invalid:
    "Заявката за свързване е непълна. Презаредете прегледа и опитайте отново. Нищо не е свързано.",
  sessionEnded: "Сесията ви е изтекла. Влезте отново; нищо не е свързано.",
  unknown: "Не можем да потвърдим дали свързването е записано. Проверете го преди нов опит.",
  backToInquiry: "Към запитването",
  openCase: "Към случая",
  resultTitle: "Записано свързване",
  resultHeading: "Запитването е свързано със случай {case}.",
  recorded: "Решението е записано:",
  nextStep: "Следваща стъпка по запитването",
  resultNote:
    "Оригиналната разписка и историята са запазени. Не са добавени участник, разрешение или покана; служителите с достъп до случая вече виждат запитването и задачите му.",
  statusTitle: "Статус на свързването",
  statusPending:
    "Свързването още няма потвърден резултат. Проверете отново, преди да опитате друго.",
  statusFailed: "Свързването не е записано. Нищо не е променено.",
  statusMissing: "Няма записано свързване за този опит. Проверете запитването преди нов опит.",
  checkAgain: "Проверете отново",
  serviceIntake: "Консултация за услуга",
  caseIdLabel: "ID на случая",
  caseVersionLabel: "Версия на случая",
  stages: {
    needs_agreed: "Уточняване на изискванията",
    evaluating: "Подбор на имоти",
    viewing: "Огледи",
    proposal_preparation: "Подготовка на предложение",
    proposal_active: "Предложението се обсъжда",
    coordination: "Координиране на сделката",
    completed: "Завършен",
    request_received: "Получена заявка",
    scope_authority_review: "Проверка на обхват и представителна власт",
    assessment: "Оценка",
    instructions_agreed: "Уговорени инструкции",
    preparing: "Подготовка на обявата",
    marketing: "Предлагане на пазара",
    proposal_coordination: "Координиране на предложения",
    completion_handover: "Приключване и предаване",
    consultation: "Консултация",
    concluded: "Приключен",
  } satisfies Record<CaseStage, string>,
};
type Copy = Omit<{ [K in keyof typeof bg]: string }, "stages" | "reasons"> & {
  stages: Record<CaseStage, string>;
  reasons: Record<BlockReason, string>;
};

const en: Copy = {
  title: "Link or create a Case",
  linkTitle: "Link to an existing Case",
  linkLead:
    "Active Cases you can access that have the same person or organization, or the same contact details, as this inquiry. A match is a suggestion, not proof of identity.",
  capped: "Showing the 50 most recently updated matches.",
  basisParty: "Same party: {party}",
  basisPartyUnnamed: "Same party as this inquiry",
  basisContact: "Contact route match",
  reviewLink: "Review the link",
  notLinkable: "Can't be linked",
  reasons: {
    inquiry_owner: "Only the inquiry's owner can link it to a Case.",
    inquiry_state: "This inquiry's status doesn't allow linking.",
    inquiry_permission: "Your access doesn't include working on this inquiry.",
    task_permission: "Your access doesn't allow this inquiry's tasks to move to this Case.",
    staff_unavailable: "You are recorded as absent, so you can't record links now.",
    task_case_conflict: "A task from this inquiry already belongs to another Case.",
    case_permission: "Your access doesn't allow linking this inquiry to this Case.",
  },
  emptyTitle: "No matching Case",
  emptyBody: "No active Case you can access has the same person, organization or contact details.",
  noPartyTitle: "Nothing to match yet",
  noPartyBody: "This inquiry has no linked contact, so no existing Case can be suggested.",
  failedTitle: "Matching Cases couldn't be loaded",
  failedBody: "This doesn't mean there are none. Reload the page to try again.",
  reload: "Reload",
  createTitle: "New Case",
  createLead:
    "Choose this when the inquiry is new work. A new Case needs a purpose, an owner and a next action.",
  create: "Create a new Case",
  reviewLead: "Check that this is the right Case, then record the link.",
  inquiry: "Inquiry",
  factAction: "Action",
  factCase: "Case",
  factBasis: "Why it's suggested",
  factAlternative: "Alternative",
  alternative: "A new Case, only after qualifying and review",
  effectsTitle: "What linking does",
  effectJoins:
    "The inquiry joins Case {case}. Its tasks move to the Case with the same owner, due times and client promises.",
  effectVisible:
    "Staff with access to Case {case} will see this inquiry and its tasks; clients will not.",
  effectKept: "The original inquiry, its person or organization and the client's receipt are kept.",
  effectNot: "No new person, participant, permission or invitation is created.",
  matchWarning:
    "The same email or phone doesn't prove it is the same person. A new Case needs a purpose, an owner and a next action; linking keeps the original inquiry.",
  submit: "Record the link",
  back: "Back",
  checkStatus: "Check the link status",
  notCandidate:
    "This Case can't be linked from this inquiry. It may no longer match, be active or be visible to you.",
  alreadyLinked: "This inquiry is already linked to a Case.",
  conflict:
    "The inquiry or the Case changed after you opened this review. Nothing was linked. Reload to see the latest version.",
  reloadReview: "Reload the review",
  denied: "Your access doesn't allow linking this inquiry to this Case. Nothing was linked.",
  missing: "This inquiry or Case is no longer available to you. Nothing was linked.",
  unavailable:
    "The link isn't possible in the current state of the inquiry or the Case. Nothing was linked.",
  invalid: "This link request is incomplete. Reload the review and try again. Nothing was linked.",
  sessionEnded: "Your session ended. Sign in again; nothing was linked.",
  unknown: "We couldn't confirm whether the link was recorded. Check it before trying again.",
  backToInquiry: "Back to the inquiry",
  openCase: "Open the Case",
  resultTitle: "Link recorded",
  resultHeading: "The inquiry is linked to Case {case}.",
  recorded: "Decision recorded:",
  nextStep: "Next step for this inquiry",
  resultNote:
    "The original receipt and history are kept. No participant, permission or invitation was added; staff with access to the Case can now see this inquiry and its tasks.",
  statusTitle: "Link status",
  statusPending: "The link has no confirmed result yet. Check again before trying anything else.",
  statusFailed: "The link was not recorded. Nothing changed.",
  statusMissing:
    "No recorded link was found for this attempt. Check the inquiry before trying again.",
  checkAgain: "Check again",
  serviceIntake: "Service consultation",
  caseIdLabel: "Case ID",
  caseVersionLabel: "Case revision",
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
  title: "Связать или создать дело",
  linkTitle: "Связать с существующим делом",
  linkLead:
    "Доступные вам активные дела с тем же лицом или теми же контактными данными, что и в обращении. Совпадение — подсказка, а не доказательство личности.",
  capped: "Показаны 50 последних обновлённых совпадений.",
  basisParty: "Та же сторона: {party}",
  basisPartyUnnamed: "Та же сторона, что и в обращении",
  basisContact: "Совпадение по контакту",
  reviewLink: "Проверить связь",
  notLinkable: "Связать нельзя",
  reasons: {
    inquiry_owner: "Связать обращение с делом может только его ответственный.",
    inquiry_state: "Статус обращения не позволяет связать его с делом.",
    inquiry_permission: "Ваш доступ не включает работу с этим обращением.",
    task_permission: "Ваш доступ не позволяет перенести задачи обращения в это дело.",
    staff_unavailable: "У вас отмечено отсутствие, поэтому сейчас нельзя записывать связь.",
    task_case_conflict: "Задача из этого обращения уже относится к другому делу.",
    case_permission: "Ваш доступ не позволяет связать это обращение с этим делом.",
  },
  emptyTitle: "Подходящего дела нет",
  emptyBody:
    "Ни в одном доступном вам активном деле нет того же лица или тех же контактных данных.",
  noPartyTitle: "Пока не с чем сравнить",
  noPartyBody: "К обращению не привязан контакт, поэтому предложить существующее дело нельзя.",
  failedTitle: "Не удалось загрузить подходящие дела",
  failedBody: "Это не значит, что их нет. Обновите страницу, чтобы попробовать снова.",
  reload: "Обновить",
  createTitle: "Новое дело",
  createLead:
    "Выберите это, если обращение — новая работа. Для нового дела нужны цель, ответственный и следующее действие.",
  create: "Создать новое дело",
  reviewLead: "Проверьте, что это нужное дело, и запишите связь.",
  inquiry: "Обращение",
  factAction: "Действие",
  factCase: "Дело",
  factBasis: "Почему предложено",
  factAlternative: "Альтернатива",
  alternative: "Новое дело — только после уточнения и проверки",
  effectsTitle: "Что делает связь",
  effectJoins:
    "Обращение войдёт в дело {case}. Его задачи перейдут в дело с тем же ответственным, сроками и обещаниями клиенту.",
  effectVisible:
    "Сотрудники с доступом к делу {case} увидят это обращение и его задачи; клиенты — нет.",
  effectKept: "Сохраняются исходное обращение, лицо в нём и квитанция клиента.",
  effectNot: "Не создаются новое лицо, участник, разрешение или приглашение.",
  matchWarning:
    "Тот же email или телефон не доказывает, что это тот же человек. Для нового дела нужны цель, ответственный и следующее действие; связь сохраняет исходное обращение.",
  submit: "Записать связь",
  back: "Назад",
  checkStatus: "Проверить статус связи",
  notCandidate:
    "Это дело нельзя связать из этого обращения. Возможно, оно больше не совпадает, не активно или недоступно вам.",
  alreadyLinked: "Это обращение уже связано с делом.",
  conflict:
    "Обращение или дело изменились после открытия проверки. Связь не записана. Обновите, чтобы увидеть последнюю версию.",
  reloadReview: "Обновить проверку",
  denied: "Ваш доступ не позволяет связать это обращение с этим делом. Связь не записана.",
  missing: "Обращение или дело вам больше недоступны. Связь не записана.",
  unavailable: "Связь невозможна в текущем состоянии обращения или дела. Связь не записана.",
  invalid: "Запрос на связь неполный. Обновите проверку и попробуйте снова. Связь не записана.",
  sessionEnded: "Сеанс завершён. Войдите снова; связь не записана.",
  unknown: "Не удалось подтвердить, записана ли связь. Проверьте её перед новой попыткой.",
  backToInquiry: "К обращению",
  openCase: "К делу",
  resultTitle: "Связь записана",
  resultHeading: "Обращение связано с делом {case}.",
  recorded: "Решение записано:",
  nextStep: "Следующий шаг по обращению",
  resultNote:
    "Исходная квитанция и история сохранены. Участники, разрешения и приглашения не добавлены; сотрудники с доступом к делу теперь видят это обращение и его задачи.",
  statusTitle: "Статус связи",
  statusPending:
    "У связи ещё нет подтверждённого результата. Проверьте снова, прежде чем делать что-то ещё.",
  statusFailed: "Связь не записана. Ничего не изменилось.",
  statusMissing:
    "Записанная связь для этой попытки не найдена. Проверьте обращение перед новой попыткой.",
  checkAgain: "Проверить снова",
  serviceIntake: "Консультация по услуге",
  caseIdLabel: "ID дела",
  caseVersionLabel: "Версия дела",
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
