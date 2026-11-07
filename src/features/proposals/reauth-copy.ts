import { isPublicLocale } from "@/i18n/config";

// Only the client proposal response is admitted. Other proposal forms remain local drafts.
const copy = {
  en: {
    save: "Save response draft and verify access",
    notice:
      "Your response is still on this page. Save it for up to 15 minutes while you verify access, then review and submit it yourself.",
    failed:
      "The response draft could not be saved. Your entries are still on this page. Try again, or copy them before leaving.",
    restored:
      "Your saved response is restored as a draft. Review the current terms and submit it yourself. Nothing has been sent.",
    pending:
      "Your saved response is waiting for access verification in this browser. Nothing has been sent.",
    unavailable:
      "The saved response could not be restored. Review the current terms and enter your response again. Nothing was submitted by recovery.",
    localOnly:
      "Your entries are kept on this page. Copy them before leaving to verify access; this form does not save them across verification.",
  },
  bg: {
    save: "Запази черновата на отговора и потвърди достъпа",
    notice:
      "Отговорът ви е още на тази страница. Запазете го за до 15 минути, докато потвърдите достъпа, после го прегледайте и изпратете лично.",
    failed:
      "Черновата на отговора не можа да бъде запазена. Въведеното е още на тази страница. Опитайте пак или го копирайте, преди да я напуснете.",
    restored:
      "Запазеният отговор е възстановен като чернова. Прегледайте текущите условия и го изпратете лично. Нищо не е изпратено.",
    pending: "Запазеният отговор чака потвърждение на достъпа в този браузър. Нищо не е изпратено.",
    unavailable:
      "Запазеният отговор не можа да бъде възстановен. Прегледайте текущите условия и въведете отговора отново. Възстановяването не изпрати нищо.",
    localOnly:
      "Въведеното се пази на тази страница. Копирайте го, преди да я напуснете за потвърждение на достъпа; този формуляр не го запазва при потвърждението.",
  },
  ru: {
    save: "Сохранить черновик ответа и подтвердить доступ",
    notice:
      "Ответ остаётся на этой странице. Сохраните его на срок до 15 минут, пока подтверждаете доступ, затем проверьте и отправьте сами.",
    failed:
      "Не удалось сохранить черновик ответа. Введённые данные остаются на этой странице. Повторите попытку или скопируйте их перед уходом.",
    restored:
      "Сохранённый ответ восстановлен как черновик. Проверьте текущие условия и отправьте его сами. Ничего не отправлено.",
    pending:
      "Сохранённый ответ ожидает подтверждения доступа в этом браузере. Ничего не отправлено.",
    unavailable:
      "Не удалось восстановить сохранённый ответ. Проверьте текущие условия и введите ответ заново. При восстановлении ничего не отправлено.",
    localOnly:
      "Введённые данные остаются на этой странице. Скопируйте их перед переходом к подтверждению доступа; эта форма не сохраняет их при подтверждении.",
  },
  de: {
    save: "Antwortentwurf speichern und Zugang bestätigen",
    notice:
      "Ihre Antwort bleibt auf dieser Seite. Speichern Sie sie für bis zu 15 Minuten, während Sie den Zugang bestätigen. Prüfen und senden Sie sie danach selbst.",
    failed:
      "Der Antwortentwurf konnte nicht gespeichert werden. Ihre Eingaben bleiben auf dieser Seite. Versuchen Sie es erneut oder kopieren Sie sie vor dem Verlassen.",
    restored:
      "Ihre gespeicherte Antwort wurde als Entwurf wiederhergestellt. Prüfen Sie die aktuellen Bedingungen und senden Sie sie selbst. Es wurde nichts gesendet.",
    pending:
      "Ihre gespeicherte Antwort wartet auf die Zugangsbestätigung in diesem Browser. Es wurde nichts gesendet.",
    unavailable:
      "Die gespeicherte Antwort konnte nicht wiederhergestellt werden. Prüfen Sie die aktuellen Bedingungen und geben Sie Ihre Antwort erneut ein. Die Wiederherstellung hat nichts gesendet.",
    localOnly:
      "Ihre Eingaben bleiben auf dieser Seite. Kopieren Sie sie, bevor Sie zur Zugangsbestätigung wechseln; dieses Formular speichert sie während der Bestätigung nicht.",
  },
  nl: {
    save: "Antwoordconcept opslaan en toegang bevestigen",
    notice:
      "Uw antwoord staat nog op deze pagina. Sla het maximaal 15 minuten op terwijl u de toegang bevestigt. Controleer en verstuur het daarna zelf.",
    failed:
      "Het antwoordconcept kon niet worden opgeslagen. Uw invoer staat nog op deze pagina. Probeer opnieuw of kopieer deze voordat u vertrekt.",
    restored:
      "Uw opgeslagen antwoord is als concept hersteld. Controleer de huidige voorwaarden en verstuur het zelf. Er is niets verstuurd.",
    pending:
      "Uw opgeslagen antwoord wacht op toegangsbevestiging in deze browser. Er is niets verstuurd.",
    unavailable:
      "Het opgeslagen antwoord kon niet worden hersteld. Controleer de huidige voorwaarden en voer uw antwoord opnieuw in. Bij het herstellen is niets verstuurd.",
    localOnly:
      "Uw invoer blijft op deze pagina. Kopieer deze voordat u de toegang gaat bevestigen; dit formulier bewaart de invoer niet tijdens de bevestiging.",
  },
  el: {
    save: "Αποθήκευση πρόχειρης απάντησης και επιβεβαίωση πρόσβασης",
    notice:
      "Η απάντησή σας παραμένει σε αυτή τη σελίδα. Αποθηκεύστε την για έως 15 λεπτά όσο επιβεβαιώνετε την πρόσβαση και έπειτα ελέγξτε και υποβάλετέ την εσείς.",
    failed:
      "Δεν ήταν δυνατή η αποθήκευση της πρόχειρης απάντησης. Τα στοιχεία σας παραμένουν σε αυτή τη σελίδα. Δοκιμάστε ξανά ή αντιγράψτε τα πριν φύγετε.",
    restored:
      "Η αποθηκευμένη απάντηση επανήλθε ως πρόχειρο. Ελέγξτε τους τρέχοντες όρους και υποβάλετέ την εσείς. Δεν έχει σταλεί τίποτα.",
    pending:
      "Η αποθηκευμένη απάντηση περιμένει επιβεβαίωση πρόσβασης σε αυτό το πρόγραμμα περιήγησης. Δεν έχει σταλεί τίποτα.",
    unavailable:
      "Δεν ήταν δυνατή η επαναφορά της αποθηκευμένης απάντησης. Ελέγξτε τους τρέχοντες όρους και εισαγάγετε ξανά την απάντησή σας. Η επαναφορά δεν υπέβαλε τίποτα.",
    localOnly:
      "Τα στοιχεία σας παραμένουν σε αυτή τη σελίδα. Αντιγράψτε τα πριν φύγετε για επιβεβαίωση πρόσβασης· αυτή η φόρμα δεν τα διατηρεί κατά την επιβεβαίωση.",
  },
  he: {
    save: "שמירת טיוטת התשובה ואימות הגישה",
    notice:
      "התשובה עדיין נמצאת בעמוד הזה. אפשר לשמור אותה למשך עד 15 דקות בזמן אימות הגישה, ואז לבדוק ולשלוח אותה בעצמך.",
    failed:
      "לא ניתן היה לשמור את טיוטת התשובה. הפרטים עדיין נמצאים בעמוד הזה. אפשר לנסות שוב או להעתיק אותם לפני היציאה.",
    restored:
      "התשובה השמורה שוחזרה כטיוטה. יש לבדוק את התנאים העדכניים ולשלוח אותה בעצמך. דבר לא נשלח.",
    pending: "התשובה השמורה ממתינה לאימות גישה בדפדפן הזה. דבר לא נשלח.",
    unavailable:
      "לא ניתן היה לשחזר את התשובה השמורה. יש לבדוק את התנאים העדכניים ולהזין את התשובה שוב. השחזור לא שלח דבר.",
    localOnly:
      "הפרטים נשמרים בעמוד הזה. יש להעתיק אותם לפני היציאה לאימות הגישה; הטופס הזה אינו שומר אותם במהלך האימות.",
  },
} as const;

export const proposalReauthCopy = (locale: string) => copy[isPublicLocale(locale) ? locale : "bg"];
