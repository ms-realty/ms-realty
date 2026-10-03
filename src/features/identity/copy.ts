// Copy for the access pages (F13, C01, C02, O23 access states). English is the reference;
// Bulgarian (source locale) and Russian (staff locale) are drafts awaiting human review;
// other client locales fall back to English until the catalogs take these strings over.
import type { ParticipantRole } from "@/domain/parties";
import type { PublicLocale } from "@/i18n/config";

const en = {
  // Shared
  signOut: "Sign out",
  switchAccount: "Sign out and use another account",
  tryAgain: "Try again",
  rateLimited: "Too many attempts. Wait a moment and try again.",
  unexpected: "Something went wrong on our side. Try again; nothing was changed.",
  supportLine: "Agency phone: {phone}.",
  // Passkeys
  passkeyWorking: "Waiting for your passkey…",
  passkeyCancelled: "The passkey request was cancelled or timed out. Nothing was changed.",
  passkeyFailed: "We could not verify this passkey. Try again.",
  passkeyUnsupported: "This browser cannot use passkeys. Use a current browser on this device.",
  // Staff sign-in (O23 access variant)
  staffSignInTitle: "Staff sign-in",
  staffSignInLead: "MS Realty workspace, for agency staff only. Sign in with your passkey.",
  signInWithPasskey: "Sign in with a passkey",
  lostAccessLink: "Lost access to your passkeys?",
  staffSessionEnded: "Your session ended. Sign in again to continue.",
  // Staff invitation
  staffInvitationTitle: "Join the MS Realty workspace",
  staffRecoveryTitle: "Restore your workspace access",
  staffInvitationLead:
    "This invitation is for {email}. Accepting opens your staff access; next you register two passkeys, one to use and one as a backup.",
  staffRecoveryLead:
    "This recovery invitation is for {email}. Your previous passkeys and sessions were revoked when it was issued. Accepting asks you to register two new passkeys.",
  invitationValidUntil: "Valid until {time}.",
  acceptAndContinue: "Accept and continue",
  invitationInvalid: "This invitation link is not valid. Check that you opened the whole link.",
  invitationExpired: "This invitation has expired. Ask the person who invited you for a new one.",
  invitationUsed:
    "This invitation was already answered. If that was not you, tell the person who invited you now.",
  invitationRevoked:
    "This invitation was replaced or withdrawn. Use the newest invitation you received.",
  // Enrolment
  enrolTitle: "Register your passkeys",
  enrolLead:
    "Staff sign in only with a passkey. Register two, for example on this device and on a security key or a second device, so that losing one does not lock you out.",
  enrolProgress: "{count} of 2 passkeys registered.",
  passkeyLabel: "Name for this passkey",
  optional: "(optional)",
  registerPasskey: "Register a passkey",
  enrolDone: "Both passkeys are registered.",
  passkeysRegistered: "{count} passkeys registered.",
  continueToWorkspace: "Continue to the workspace",
  enrolWindowClosed:
    "The time to finish enrolment has passed. Ask your manager to send a new invitation.",
  // Recovery explanation
  recoveryTitle: "Lost access to your passkeys?",
  recoveryBody:
    "Only a manager can restore workspace access. Contact your manager, or the agency by phone. After confirming who you are, they send a recovery invitation to your work email. It revokes your old passkeys and sessions, and you register two new passkeys.",
  recoveryNoCodes:
    "There are no recovery codes, and nobody at MS Realty will ask you for a passkey, code or password.",
  backToSignIn: "Back to sign-in",
  // Access denied
  deniedTitle: "No workspace access",
  deniedBody:
    "This account cannot open the MS Realty workspace. If you think that is wrong, contact your manager or the agency by phone.",
  // Step-up
  reauthTitle: "Confirm it is you",
  reauthLead:
    "This action needs a recent passkey check. After confirming you return to the page and review the action again before anything happens.",
  confirmWithPasskey: "Confirm with a passkey",
  // Client access (C01)
  clientAccessTitle: "Your MS Realty client account",
  clientAccessLead:
    "For clients invited by MS Realty. We email you a sign-in link; there is no password.",
  noSelfRegistration:
    "Client accounts are opened by an invitation from your broker. There is no public registration.",
  emailLabel: "Email address",
  sendLink: "Email me a sign-in link",
  sending: "Sending…",
  invalidEmail: "Enter an email address in the format name@example.com.",
  linkSentTitle: "Check your email",
  linkSent:
    "If this address belongs to a client account, a sign-in link is on its way. It works once, for 15 minutes. It can take a few minutes to arrive.",
  useDifferentEmail: "Use a different address",
  orPasskey: "Or, if you added a passkey to this account:",
  // Email-link confirm
  confirmTitle: "Finish signing in",
  confirmLead: "Press the button to sign in on this device.",
  confirmButton: "Sign in",
  linkInvalid: "This sign-in link is not valid. Request a new one.",
  linkExpired: "This sign-in link has expired. Request a new one.",
  linkConsumed: "This sign-in link was already used. Request a new one if you are not signed in.",
  linkRevoked: "This sign-in link was withdrawn. Request a new one.",
  requestNewLink: "Request a new link",
  // Signed-in client
  signedInTitle: "You are signed in",
  signedInAs: "Signed in as {email}.",
  noCasesYet: "When your broker shares a case with you, you receive an invitation by email.",
  addPasskeyTitle: "Faster sign-in (optional)",
  addPasskeyLead: "Add a passkey on this device to sign in without an email link.",
  addPasskey: "Add a passkey",
  passkeyAdded: "Passkey added.",
  clientStepUp:
    "For your security, adding a passkey needs a sign-in from the last 15 minutes. Sign out and sign in again with a new email link first.",
  // Client invitation (C02)
  invitationTitle: "Invitation",
  invitationSignIn:
    "Sign in with the email address this invitation was sent to. Its details are shown only to that account.",
  invitationUnavailable:
    "This invitation is not available to the account you are signed in with. If it was sent to another address, sign out and sign in with that one.",
  invitationFrom: "{inviter} invites you to take part in case {reference}: {title}.",
  invitationRole: "Your role",
  invitationAccess: "What you will be able to do",
  invitationRecipient: "Sent to {email}. Valid until {time}.",
  accept: "Accept",
  decline: "Decline",
  invitationAccepted: "You accepted this invitation.",
  invitationDeclined: "You declined this invitation. Ask your broker if you change your mind.",
};

export type IdentityCopy = { readonly [K in keyof typeof en]: string };

const bg: IdentityCopy = {
  signOut: "Изход",
  switchAccount: "Изход и вход с друг профил",
  tryAgain: "Опитайте отново",
  rateLimited: "Твърде много опити. Изчакайте малко и опитайте отново.",
  unexpected: "Възникна проблем при нас. Опитайте отново; нищо не е променено.",
  supportLine: "Телефон на агенцията: {phone}.",
  passkeyWorking: "Изчакване на ключа за достъп…",
  passkeyCancelled: "Заявката за ключ за достъп е отказана или изтече. Нищо не е променено.",
  passkeyFailed: "Не успяхме да потвърдим този ключ за достъп. Опитайте отново.",
  passkeyUnsupported:
    "Този браузър не поддържа ключове за достъп. Използвайте актуален браузър на това устройство.",
  staffSignInTitle: "Вход за служители",
  staffSignInLead:
    "Работно пространство на MS Realty, само за служители на агенцията. Влезте с ключ за достъп.",
  signInWithPasskey: "Вход с ключ за достъп",
  lostAccessLink: "Нямате достъп до ключовете си?",
  staffSessionEnded: "Сесията ви приключи. Влезте отново, за да продължите.",
  staffInvitationTitle: "Присъединяване към работното пространство на MS Realty",
  staffRecoveryTitle: "Възстановяване на достъпа",
  staffInvitationLead:
    "Поканата е за {email}. Приемането отваря служебния ви достъп; след това регистрирате два ключа за достъп – един за ползване и един резервен.",
  staffRecoveryLead:
    "Тази покана за възстановяване е за {email}. Предишните ви ключове и сесии бяха отменени при издаването ѝ. Приемането изисква да регистрирате два нови ключа за достъп.",
  invitationValidUntil: "Валидна до {time}.",
  acceptAndContinue: "Приемане и продължаване",
  invitationInvalid: "Връзката към поканата не е валидна. Проверете дали сте отворили цялата връзка.",
  invitationExpired: "Поканата е изтекла. Помолете човека, който ви е поканил, за нова.",
  invitationUsed:
    "На тази покана вече е отговорено. Ако не сте били вие, уведомете веднага човека, който ви е поканил.",
  invitationRevoked: "Поканата е заменена или оттеглена. Използвайте най-новата получена покана.",
  enrolTitle: "Регистрирайте ключовете си за достъп",
  enrolLead:
    "Служителите влизат само с ключ за достъп. Регистрирайте два – например на това устройство и на ключ за сигурност или друго устройство, за да не загубите достъп, ако изгубите единия.",
  enrolProgress: "Регистрирани ключове: {count} от 2.",
  passkeyLabel: "Име на ключа",
  optional: "(по избор)",
  registerPasskey: "Регистриране на ключ за достъп",
  enrolDone: "И двата ключа за достъп са регистрирани.",
  passkeysRegistered: "Регистрирани ключове: {count}.",
  continueToWorkspace: "Към работното пространство",
  enrolWindowClosed:
    "Времето за завършване на регистрацията изтече. Помолете мениджъра си за нова покана.",
  recoveryTitle: "Нямате достъп до ключовете си?",
  recoveryBody:
    "Само мениджър може да възстанови достъпа. Свържете се с мениджъра си или с агенцията по телефона. След като потвърдят самоличността ви, ще изпратят покана за възстановяване на служебния ви имейл. Тя отменя старите ключове и сесии и регистрирате два нови ключа.",
  recoveryNoCodes:
    "Няма кодове за възстановяване и никой от MS Realty няма да ви поиска ключ, код или парола.",
  backToSignIn: "Обратно към входа",
  deniedTitle: "Няма достъп до работното пространство",
  deniedBody:
    "Този профил не може да отвори работното пространство на MS Realty. Ако смятате, че е грешка, свържете се с мениджъра си или с агенцията по телефона.",
  reauthTitle: "Потвърдете, че сте вие",
  reauthLead:
    "Това действие изисква скорошна проверка с ключ за достъп. След потвърждението се връщате на страницата и преглеждате действието отново, преди да се случи каквото и да е.",
  confirmWithPasskey: "Потвърждаване с ключ за достъп",
  clientAccessTitle: "Вашият клиентски профил в MS Realty",
  clientAccessLead:
    "За клиенти, поканени от MS Realty. Изпращаме ви връзка за вход по имейл; няма парола.",
  noSelfRegistration:
    "Клиентските профили се откриват с покана от вашия брокер. Няма публична регистрация.",
  emailLabel: "Имейл адрес",
  sendLink: "Изпратете ми връзка за вход",
  sending: "Изпращане…",
  invalidEmail: "Въведете имейл адрес във формат name@example.com.",
  linkSentTitle: "Проверете имейла си",
  linkSent:
    "Ако адресът принадлежи на клиентски профил, връзката за вход е на път. Тя работи веднъж, 15 минути. Може да пристигне след няколко минути.",
  useDifferentEmail: "Използване на друг адрес",
  orPasskey: "Или, ако сте добавили ключ за достъп към профила:",
  confirmTitle: "Завършване на входа",
  confirmLead: "Натиснете бутона, за да влезете на това устройство.",
  confirmButton: "Вход",
  linkInvalid: "Връзката за вход не е валидна. Поискайте нова.",
  linkExpired: "Връзката за вход е изтекла. Поискайте нова.",
  linkConsumed: "Връзката за вход вече е използвана. Поискайте нова, ако не сте влезли.",
  linkRevoked: "Връзката за вход е оттеглена. Поискайте нова.",
  requestNewLink: "Нова връзка за вход",
  signedInTitle: "Влезли сте",
  signedInAs: "Влезли сте като {email}.",
  noCasesYet: "Когато брокерът ви сподели случай с вас, ще получите покана по имейл.",
  addPasskeyTitle: "По-бърз вход (по избор)",
  addPasskeyLead: "Добавете ключ за достъп на това устройство, за да влизате без връзка по имейл.",
  addPasskey: "Добавяне на ключ за достъп",
  passkeyAdded: "Ключът за достъп е добавен.",
  clientStepUp:
    "За ваша сигурност добавянето на ключ изисква вход от последните 15 минути. Излезте и влезте отново с нова връзка по имейл.",
  invitationTitle: "Покана",
  invitationSignIn:
    "Влезте с имейл адреса, на който е изпратена поканата. Подробностите се показват само на този профил.",
  invitationUnavailable:
    "Тази покана не е достъпна за профила, с който сте влезли. Ако е изпратена на друг адрес, излезте и влезте с него.",
  invitationFrom: "{inviter} ви кани да участвате в случай {reference}: {title}.",
  invitationRole: "Вашата роля",
  invitationAccess: "Какво ще можете да правите",
  invitationRecipient: "Изпратена до {email}. Валидна до {time}.",
  accept: "Приемам",
  decline: "Отказвам",
  invitationAccepted: "Приехте тази покана.",
  invitationDeclined: "Отказахте тази покана. Попитайте брокера си, ако промените решението си.",
};

const ru: IdentityCopy = {
  signOut: "Выйти",
  switchAccount: "Выйти и войти в другой аккаунт",
  tryAgain: "Попробовать снова",
  rateLimited: "Слишком много попыток. Подождите немного и попробуйте снова.",
  unexpected: "На нашей стороне произошла ошибка. Попробуйте снова; ничего не изменено.",
  supportLine: "Телефон агентства: {phone}.",
  passkeyWorking: "Ожидание ключа доступа…",
  passkeyCancelled: "Запрос ключа доступа отменён или истёк. Ничего не изменено.",
  passkeyFailed: "Не удалось проверить этот ключ доступа. Попробуйте снова.",
  passkeyUnsupported:
    "Этот браузер не поддерживает ключи доступа. Используйте актуальный браузер на этом устройстве.",
  staffSignInTitle: "Вход для сотрудников",
  staffSignInLead:
    "Рабочее пространство MS Realty, только для сотрудников агентства. Войдите с ключом доступа.",
  signInWithPasskey: "Войти с ключом доступа",
  lostAccessLink: "Потеряли доступ к ключам?",
  staffSessionEnded: "Сеанс завершён. Войдите снова, чтобы продолжить.",
  staffInvitationTitle: "Присоединиться к рабочему пространству MS Realty",
  staffRecoveryTitle: "Восстановление доступа",
  staffInvitationLead:
    "Приглашение для {email}. Принятие открывает служебный доступ; затем вы регистрируете два ключа доступа: основной и резервный.",
  staffRecoveryLead:
    "Это приглашение на восстановление для {email}. Прежние ключи и сеансы отозваны при его выдаче. Принятие потребует зарегистрировать два новых ключа доступа.",
  invitationValidUntil: "Действует до {time}.",
  acceptAndContinue: "Принять и продолжить",
  invitationInvalid: "Ссылка приглашения недействительна. Проверьте, что открыли её полностью.",
  invitationExpired: "Срок приглашения истёк. Попросите пригласившего вас прислать новое.",
  invitationUsed:
    "На это приглашение уже ответили. Если это были не вы, сразу сообщите пригласившему вас.",
  invitationRevoked:
    "Приглашение заменено или отозвано. Используйте самое новое полученное приглашение.",
  enrolTitle: "Зарегистрируйте ключи доступа",
  enrolLead:
    "Сотрудники входят только с ключом доступа. Зарегистрируйте два, например на этом устройстве и на ключе безопасности или другом устройстве, чтобы потеря одного не лишила вас доступа.",
  enrolProgress: "Зарегистрировано ключей: {count} из 2.",
  passkeyLabel: "Название ключа",
  optional: "(необязательно)",
  registerPasskey: "Зарегистрировать ключ доступа",
  enrolDone: "Оба ключа доступа зарегистрированы.",
  passkeysRegistered: "Зарегистрировано ключей: {count}.",
  continueToWorkspace: "Перейти в рабочее пространство",
  enrolWindowClosed:
    "Время на завершение регистрации истекло. Попросите руководителя прислать новое приглашение.",
  recoveryTitle: "Потеряли доступ к ключам?",
  recoveryBody:
    "Восстановить доступ может только руководитель. Свяжитесь с руководителем или с агентством по телефону. Подтвердив вашу личность, они отправят приглашение на восстановление на рабочую почту. Оно отзывает старые ключи и сеансы, и вы регистрируете два новых ключа.",
  recoveryNoCodes:
    "Кодов восстановления нет, и никто из MS Realty не попросит у вас ключ, код или пароль.",
  backToSignIn: "Назад ко входу",
  deniedTitle: "Нет доступа к рабочему пространству",
  deniedBody:
    "Этот аккаунт не может открыть рабочее пространство MS Realty. Если это ошибка, свяжитесь с руководителем или с агентством по телефону.",
  reauthTitle: "Подтвердите, что это вы",
  reauthLead:
    "Для этого действия нужна недавняя проверка ключом доступа. После подтверждения вы вернётесь на страницу и ещё раз проверите действие, прежде чем что-либо произойдёт.",
  confirmWithPasskey: "Подтвердить ключом доступа",
  clientAccessTitle: "Ваш клиентский аккаунт MS Realty",
  clientAccessLead:
    "Для клиентов, приглашённых MS Realty. Мы присылаем ссылку для входа по почте; пароля нет.",
  noSelfRegistration:
    "Клиентский аккаунт открывается по приглашению вашего брокера. Публичной регистрации нет.",
  emailLabel: "Адрес электронной почты",
  sendLink: "Прислать ссылку для входа",
  sending: "Отправка…",
  invalidEmail: "Введите адрес в формате name@example.com.",
  linkSentTitle: "Проверьте почту",
  linkSent:
    "Если адрес принадлежит клиентскому аккаунту, ссылка для входа уже отправлена. Она действует один раз в течение 15 минут и может прийти через несколько минут.",
  useDifferentEmail: "Указать другой адрес",
  orPasskey: "Или, если вы добавили ключ доступа к аккаунту:",
  confirmTitle: "Завершение входа",
  confirmLead: "Нажмите кнопку, чтобы войти на этом устройстве.",
  confirmButton: "Войти",
  linkInvalid: "Ссылка для входа недействительна. Запросите новую.",
  linkExpired: "Срок ссылки для входа истёк. Запросите новую.",
  linkConsumed: "Ссылка для входа уже использована. Запросите новую, если вы не вошли.",
  linkRevoked: "Ссылка для входа отозвана. Запросите новую.",
  requestNewLink: "Запросить новую ссылку",
  signedInTitle: "Вы вошли",
  signedInAs: "Вы вошли как {email}.",
  noCasesYet: "Когда брокер откроет вам доступ к делу, вы получите приглашение по почте.",
  addPasskeyTitle: "Быстрый вход (необязательно)",
  addPasskeyLead: "Добавьте ключ доступа на этом устройстве, чтобы входить без ссылки по почте.",
  addPasskey: "Добавить ключ доступа",
  passkeyAdded: "Ключ доступа добавлен.",
  clientStepUp:
    "Для безопасности добавление ключа требует входа в течение последних 15 минут. Выйдите и войдите снова по новой ссылке.",
  invitationTitle: "Приглашение",
  invitationSignIn:
    "Войдите с адресом, на который отправлено приглашение. Подробности видны только этому аккаунту.",
  invitationUnavailable:
    "Это приглашение недоступно аккаунту, в который вы вошли. Если оно отправлено на другой адрес, выйдите и войдите с ним.",
  invitationFrom: "{inviter} приглашает вас участвовать в деле {reference}: {title}.",
  invitationRole: "Ваша роль",
  invitationAccess: "Что вы сможете делать",
  invitationRecipient: "Отправлено на {email}. Действует до {time}.",
  accept: "Принять",
  decline: "Отклонить",
  invitationAccepted: "Вы приняли это приглашение.",
  invitationDeclined: "Вы отклонили это приглашение. Обратитесь к брокеру, если передумаете.",
};

export function identityCopy(locale: PublicLocale | string): IdentityCopy {
  return locale === "bg" ? bg : locale === "ru" ? ru : en;
}

/** Replaces `{name}` placeholders. */
export function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in values ? String(values[key]) : match,
  );
}

const roleLabels: Record<"en" | "bg" | "ru", Record<ParticipantRole, string>> = {
  en: {
    buyer: "Buyer",
    co_buyer: "Co-buyer",
    tenant: "Tenant",
    seller: "Seller",
    landlord: "Landlord",
    authorized_representative: "Authorised representative",
    adviser: "Adviser",
    collaborator: "Collaborator",
    specialist: "Specialist",
    guest: "Guest",
  },
  bg: {
    buyer: "Купувач",
    co_buyer: "Съкупувач",
    tenant: "Наемател",
    seller: "Продавач",
    landlord: "Наемодател",
    authorized_representative: "Упълномощен представител",
    adviser: "Консултант",
    collaborator: "Сътрудник",
    specialist: "Специалист",
    guest: "Гост",
  },
  ru: {
    buyer: "Покупатель",
    co_buyer: "Сопокупатель",
    tenant: "Арендатор",
    seller: "Продавец",
    landlord: "Арендодатель",
    authorized_representative: "Уполномоченный представитель",
    adviser: "Консультант",
    collaborator: "Участник",
    specialist: "Специалист",
    guest: "Гость",
  },
};

export function roleLabel(locale: string, role: ParticipantRole): string {
  const table = roleLabels[locale === "bg" || locale === "ru" ? locale : "en"];
  return table[role];
}

const capabilityLabels: Record<"en" | "bg" | "ru", Record<string, string>> = {
  en: {
    "portal.case.read": "See the case overview and its progress",
    "portal.interest.respond": "Give feedback on suggested properties",
    "portal.message.write": "Send messages to the agency",
    "portal.document.upload": "Upload requested documents",
    "portal.appointment.request": "Request viewings and appointments",
    "portal.proposal.respond": "Respond to proposals",
    "portal.listing.acknowledge": "Review the listing preview",
  },
  bg: {
    "portal.case.read": "Преглед на случая и напредъка му",
    "portal.interest.respond": "Обратна връзка за предложени имоти",
    "portal.message.write": "Съобщения до агенцията",
    "portal.document.upload": "Качване на поискани документи",
    "portal.appointment.request": "Заявки за огледи и срещи",
    "portal.proposal.respond": "Отговор на предложения",
    "portal.listing.acknowledge": "Преглед на обявата преди публикуване",
  },
  ru: {
    "portal.case.read": "Просмотр дела и его хода",
    "portal.interest.respond": "Отзывы о предложенных объектах",
    "portal.message.write": "Сообщения агентству",
    "portal.document.upload": "Загрузка запрошенных документов",
    "portal.appointment.request": "Запросы просмотров и встреч",
    "portal.proposal.respond": "Ответы на предложения",
    "portal.listing.acknowledge": "Просмотр объявления перед публикацией",
  },
};

export function capabilityLabel(locale: string, capability: string): string {
  const table = capabilityLabels[locale === "bg" || locale === "ru" ? locale : "en"];
  return table[capability] ?? capability;
}

/** Messages for one passkey ceremony button (PasskeyCeremony). */
export function ceremonyMessages(
  c: IdentityCopy,
  button: string,
  extra: { stepUp?: string; success?: string; label?: boolean } = {},
) {
  return {
    button,
    working: c.passkeyWorking,
    cancelled: c.passkeyCancelled,
    failed: c.passkeyFailed,
    unsupported: c.passkeyUnsupported,
    rateLimited: c.rateLimited,
    stepUp: extra.stepUp ?? c.unexpected,
    unexpected: c.unexpected,
    ...(extra.success ? { success: extra.success } : {}),
    ...(extra.label ? { label: c.passkeyLabel, optional: c.optional } : {}),
  };
}

/** The page message for a wire error code from an access action. */
export function accessErrorMessage(c: IdentityCopy, code: string | undefined): string | null {
  switch (code) {
    case undefined:
      return null;
    case "INVITATION_EXPIRED":
      return c.invitationExpired;
    case "INVITATION_USED":
      return c.invitationUsed;
    case "INVITATION_REVOKED":
      return c.invitationRevoked;
    case "NOT_FOUND":
      return c.invitationInvalid;
    case "LINK_EXPIRED":
      return c.linkExpired;
    case "LINK_CONSUMED":
      return c.linkConsumed;
    case "LINK_REVOKED":
      return c.linkRevoked;
    case "LINK_INVALID":
      return c.linkInvalid;
    case "RATE_LIMITED":
      return c.rateLimited;
    default:
      return c.unexpected;
  }
}
