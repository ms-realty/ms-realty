import type { PublicLocale } from "@/i18n/config";
import type { FormCopy } from "./contract";

const en = {
  heading: "Form submission specimen",
  scope:
    "Practice only. Use fictional text. No inquiry, message or agency record is created. The browser keeps one signed practice receipt for one hour; your text is not stored in it.",
  subject: "Practice subject",
  note: "Practice note",
  subjectHint: "Required. Between 3 and 80 characters.",
  noteHint: "Optional. Up to 2,000 characters. Do not enter personal information.",
  optional: "(optional)",
  submit: "Check practice form",
  subjectError: "Enter a subject between 3 and 80 characters.",
  noteError: "Keep the note within 2,000 characters.",
  invalid: "The form identity is invalid. Start a new practice form.",
  conflict:
    "This practice draft changed elsewhere. Your text is retained. Review both versions before reapplying.",
  reused:
    "This operation already checked different text. Open its receipt or start a deliberate new practice form.",
  confirmed: "Practice form checked",
  next: "Only the practice check completed. No inquiry was sent. You can reopen this receipt in this browser for one hour.",
  receipt: "Open practice receipt",
  status: "Check this operation",
  start: "Start a new practice form",
  conflictLink: "Practice a revision conflict",
  receiptMissing: "No confirmed practice receipt is available for this operation in this browser.",
  noJs: "This form also works without JavaScript. Submit returns the result and any retained input on this page.",
  form: {
    errorSummary: "Check the form",
    pending: "Checking practice form…",
    reapply: "Reapply my reviewed text",
    yourValue: "Your text",
    latestValue: "Current text",
    revision: "Current revision",
    reference: "Practice reference",
    recordedAt: "Checked at",
    unknown: "We could not confirm the result.",
    draftRetained:
      "Your text is retained below. Check this same operation before starting another attempt.",
  } satisfies FormCopy,
};

const bg: typeof en = {
  heading: "Образец на изпращане на формуляр",
  scope:
    "Само упражнение. Използвайте измислен текст. Не се създава запитване, съобщение или запис на агенцията. Браузърът пази една подписана учебна разписка за един час; текстът ви не се съхранява в нея.",
  subject: "Учебна тема",
  note: "Учебна бележка",
  subjectHint: "Задължително. Между 3 и 80 знака.",
  noteHint: "По избор. До 2000 знака. Не въвеждайте лични данни.",
  optional: "(по избор)",
  submit: "Проверете учебния формуляр",
  subjectError: "Въведете тема между 3 и 80 знака.",
  noteError: "Ограничете бележката до 2000 знака.",
  invalid: "Идентификаторът на формуляра е невалиден. Започнете нов учебен формуляр.",
  conflict:
    "Учебната чернова е променена другаде. Текстът ви е запазен. Прегледайте двете версии, преди да го приложите отново.",
  reused:
    "Тази операция вече провери друг текст. Отворете разписката или започнете нов учебен формуляр.",
  confirmed: "Учебният формуляр е проверен",
  next: "Завърши само учебната проверка. Не е изпратено запитване. Разписката е достъпна в този браузър за един час.",
  receipt: "Отворете учебната разписка",
  status: "Проверете тази операция",
  start: "Започнете нов учебен формуляр",
  conflictLink: "Упражнете конфликт на версии",
  receiptMissing: "В този браузър няма потвърдена учебна разписка за тази операция.",
  noJs: "Формулярът работи и без JavaScript. След изпращане резултатът и въведените данни се показват на тази страница.",
  form: {
    errorSummary: "Проверете формуляра",
    pending: "Проверка на учебния формуляр…",
    reapply: "Приложете прегледания ми текст",
    yourValue: "Вашият текст",
    latestValue: "Текущ текст",
    revision: "Текуща версия",
    reference: "Учебен номер",
    recordedAt: "Проверено на",
    unknown: "Не успяхме да потвърдим резултата.",
    draftRetained:
      "Текстът ви е запазен по-долу. Проверете същата операция, преди да започнете нов опит.",
  },
};

const he: typeof en = {
  heading: "דוגמת שליחת טופס",
  scope:
    "לתרגול בלבד. השתמשו בטקסט בדוי. לא נוצרת פנייה, הודעה או רשומת סוכנות. הדפדפן שומר אישור תרגול חתום אחד למשך שעה; הטקסט שלכם אינו נשמר בו.",
  subject: "נושא לתרגול",
  note: "הערה לתרגול",
  subjectHint: "חובה. בין 3 ל־80 תווים.",
  noteHint: "רשות. עד 2,000 תווים. אין להזין מידע אישי.",
  optional: "(רשות)",
  submit: "בדיקת טופס התרגול",
  subjectError: "הזינו נושא באורך 3 עד 80 תווים.",
  noteError: "הגבילו את ההערה ל־2,000 תווים.",
  invalid: "מזהה הטופס אינו תקין. התחילו טופס תרגול חדש.",
  conflict: "טיוטת התרגול השתנתה במקום אחר. הטקסט שלכם נשמר. בדקו את שתי הגרסאות לפני החלה מחדש.",
  reused: "הפעולה הזו כבר בדקה טקסט אחר. פתחו את האישור או התחילו טופס תרגול חדש במכוון.",
  confirmed: "טופס התרגול נבדק",
  next: "רק בדיקת התרגול הושלמה. לא נשלחה פנייה. אפשר לפתוח את האישור בדפדפן זה במשך שעה.",
  receipt: "פתיחת אישור התרגול",
  status: "בדיקת הפעולה הזו",
  start: "התחלת טופס תרגול חדש",
  conflictLink: "תרגול התנגשות בין גרסאות",
  receiptMissing: "אין בדפדפן זה אישור תרגול מאומת לפעולה הזו.",
  noJs: "הטופס פועל גם ללא JavaScript. לאחר השליחה התוצאה והקלט שנשמר מוצגים בעמוד זה.",
  form: {
    errorSummary: "בדקו את הטופס",
    pending: "טופס התרגול נבדק…",
    reapply: "החלת הטקסט שבדקתי מחדש",
    yourValue: "הטקסט שלכם",
    latestValue: "הטקסט הנוכחי",
    revision: "גרסה נוכחית",
    reference: "מספר תרגול",
    recordedAt: "נבדק בתאריך",
    unknown: "לא הצלחנו לאמת את התוצאה.",
    draftRetained: "הטקסט שלכם נשמר למטה. בדקו את אותה פעולה לפני תחילת ניסיון נוסף.",
  },
};

/** Non-indexable developer specimens only; remaining toolbar locales are explicitly English. */
export function formSpecimenCopy(locale: PublicLocale) {
  return locale === "bg" ? bg : locale === "he" ? he : en;
}

export type SpecimenCopy = typeof en;
