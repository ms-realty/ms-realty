// Staff copy; BG/RU remain drafts for human review, never public/indexable.
import type { ContactMethodKind } from "@/domain/parties";
import type { StaffLocale } from "@/i18n/config";

const en = {
  title: "Record a client contact",
  lead: "Record a contact that already took place. This entry does not send a message or verify delivery. Unanswered attempts and automatic receipts are not a useful human response.",
  submit: "Record contact and follow-up",
  contact: "Contact used",
  chooseContact: "Review and choose the current contact",
  result: "Contact result",
  unanswered: "No useful response reached the client",
  useful_response: "A useful human response reached the client",
  contactedAt: "Contact took place",
  timeHint: "Use the actual past date and time, after this inquiry was received.",
  note: "What happened and what was explained",
  nextAction: "Next contact action",
  dueAt: "Next contact action due",
  promise: "This follow-up was explicitly promised to the client",
  confirm: "I confirm that the recorded contact took place and that its result is accurate",
  firstResponse: "First useful human response",
  noResponse: "No useful human response recorded",
  acknowledgment: "Automatic receipt",
  internal: "Internal follow-up",
  clientPromise: "Recorded client promise",
  observed: "Contact observed at",
  followUp: "Next step",
};
type Copy = { [K in keyof typeof en]: string };
const bg: Copy = {
  title: "Записване на контакт с клиента",
  lead: "Запишете вече осъществен контакт. Този запис не изпраща съобщение и не потвърждава доставка. Неуспешните опити и автоматичните разписки не са съдържателен отговор от човек.",
  submit: "Записване на контакт и следващо действие",
  contact: "Използван контакт",
  chooseContact: "Прегледайте и изберете актуалния контакт",
  result: "Резултат от контакта",
  unanswered: "Клиентът не е получил съдържателен отговор",
  useful_response: "Клиентът е получил съдържателен отговор от човек",
  contactedAt: "Контактът е осъществен на",
  timeHint: "Въведете реални дата и час в миналото, след получаването на тази заявка.",
  note: "Какво се случи и какво беше обяснено",
  nextAction: "Следващо действие по контакта",
  dueAt: "Срок за следващото действие",
  promise: "Това следващо действие е изрично обещано на клиента",
  confirm: "Потвърждавам, че записаният контакт е осъществен и резултатът е верен",
  firstResponse: "Първи съдържателен отговор от човек",
  noResponse: "Няма записан съдържателен отговор от човек",
  acknowledgment: "Автоматична разписка",
  internal: "Вътрешно следващо действие",
  clientPromise: "Записано обещание към клиента",
  observed: "Контактът е осъществен на",
  followUp: "Следваща стъпка",
};
const ru: Copy = {
  title: "Записать контакт с клиентом",
  lead: "Запишите уже состоявшийся контакт. Эта запись не отправляет сообщение и не подтверждает доставку. Неудачные попытки и автоматические квитанции не считаются содержательным ответом человека.",
  submit: "Записать контакт и следующее действие",
  contact: "Использованный контакт",
  chooseContact: "Проверьте и выберите актуальный контакт",
  result: "Результат контакта",
  unanswered: "Клиент не получил содержательного ответа",
  useful_response: "Клиент получил содержательный ответ человека",
  contactedAt: "Контакт состоялся",
  timeHint: "Укажите фактические дату и время в прошлом, после получения этой заявки.",
  note: "Что произошло и что было объяснено",
  nextAction: "Следующее действие по контакту",
  dueAt: "Срок следующего действия",
  promise: "Это следующее действие явно обещано клиенту",
  confirm: "Подтверждаю, что записанный контакт состоялся и его результат указан верно",
  firstResponse: "Первый содержательный ответ человека",
  noResponse: "Содержательный ответ человека ещё не записан",
  acknowledgment: "Автоматическая квитанция",
  internal: "Внутреннее следующее действие",
  clientPromise: "Записанное обещание клиенту",
  observed: "Контакт состоялся",
  followUp: "Следующий шаг",
};
export function contactCopy(locale: string): Copy {
  return locale === "bg" ? bg : locale === "ru" ? ru : en;
}

const methodNames: Record<StaffLocale, Record<ContactMethodKind, string>> = {
  bg: {
    email: "Имейл",
    phone: "Телефон",
    whatsapp: "WhatsApp",
    viber: "Viber",
    postal: "Пощенски адрес",
  },
  en: {
    email: "Email",
    phone: "Phone",
    whatsapp: "WhatsApp",
    viber: "Viber",
    postal: "Postal address",
  },
  ru: {
    email: "Электронная почта",
    phone: "Телефон",
    whatsapp: "WhatsApp",
    viber: "Viber",
    postal: "Почтовый адрес",
  },
};
export function contactMethodLabel(kind: string, locale: string) {
  const labels = methodNames[locale === "bg" || locale === "ru" ? locale : "en"];
  return labels[kind as ContactMethodKind] ?? contactCopy(locale).contact;
}
