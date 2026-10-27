import type { PublicLocale } from "@/i18n/config";

// Authentication copy is purpose-specific. Translation drafts do not grant language approval.
const copy = {
  bg: [
    "Вход в MS Realty",
    "Покана за Вашия кабинет в MS Realty",
    "Потвърдете самоличността си за вход в клиентския кабинет.",
    "Отворете поканата и потвърдете самоличността си. След това прегледайте достъпа, преди да я приемете или откажете.",
    "Не препращайте връзката. Ако не очаквате това писмо, можете да го игнорирате.",
    "Връзката е валидна до",
  ],
  en: [
    "Sign in to MS Realty",
    "Your MS Realty client invitation",
    "Verify your identity to sign in to your client account.",
    "Open the invitation and verify your identity. Then review the access before accepting or declining it.",
    "Do not forward the link. If you were not expecting this message, you can ignore it.",
    "The link works until",
  ],
  ru: [
    "Вход в MS Realty",
    "Приглашение в личный кабинет MS Realty",
    "Подтвердите личность для входа в клиентский кабинет.",
    "Откройте приглашение и подтвердите личность. Затем проверьте доступ, прежде чем принять или отклонить его.",
    "Не пересылайте ссылку. Если вы не ожидали это письмо, его можно проигнорировать.",
    "Ссылка действует до",
  ],
  de: [
    "Bei MS Realty anmelden",
    "Ihre MS Realty Kundeneinladung",
    "Bestätigen Sie Ihre Identität, um sich in Ihrem Kundenkonto anzumelden.",
    "Öffnen Sie die Einladung und bestätigen Sie Ihre Identität. Prüfen Sie dann den Zugang, bevor Sie ihn annehmen oder ablehnen.",
    "Leiten Sie den Link nicht weiter. Falls Sie diese Nachricht nicht erwartet haben, können Sie sie ignorieren.",
    "Der Link ist gültig bis",
  ],
  nl: [
    "Aanmelden bij MS Realty",
    "Uw MS Realty klantuitnodiging",
    "Verifieer uw identiteit om u aan te melden bij uw klantaccount.",
    "Open de uitnodiging en verifieer uw identiteit. Bekijk daarna de toegang voordat u deze accepteert of afwijst.",
    "Stuur de link niet door. Als u dit bericht niet verwachtte, kunt u het negeren.",
    "De link werkt tot",
  ],
  el: [
    "Σύνδεση στο MS Realty",
    "Πρόσκληση πελάτη MS Realty",
    "Επαληθεύστε την ταυτότητά σας για σύνδεση στον λογαριασμό πελάτη.",
    "Ανοίξτε την πρόσκληση και επαληθεύστε την ταυτότητά σας. Ελέγξτε την πρόσβαση πριν την αποδοχή ή απόρριψη.",
    "Μην προωθείτε τον σύνδεσμο. Αν δεν περιμένατε αυτό το μήνυμα, μπορείτε να το αγνοήσετε.",
    "Ο σύνδεσμος ισχύει έως",
  ],
  he: [
    "כניסה ל־MS Realty",
    "הזמנת הלקוח שלכם ל־MS Realty",
    "אמתו את זהותכם כדי להיכנס לחשבון הלקוח.",
    "פתחו את ההזמנה ואמתו את זהותכם. לאחר מכן בדקו את הגישה לפני אישור או דחייה.",
    "אין להעביר את הקישור. אם לא ציפיתם להודעה, אפשר להתעלם ממנה.",
    "הקישור תקף עד",
  ],
} as const;
export function clientAuthCopy(locale: PublicLocale, invitation: boolean) {
  const [signInSubject, invitationSubject, signIn, invite, protection, until] = copy[locale];
  return {
    subject: invitation ? invitationSubject : signInSubject,
    instructions: `${invitation ? invite : signIn} ${protection}`,
    until,
  };
}
