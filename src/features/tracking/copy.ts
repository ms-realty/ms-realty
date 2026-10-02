import type { PublicLocale } from "@/i18n/config";
// Interface draft for staging review. This does not approve public translation indexing.
export const trackingCopy: Record<
  PublicLocale,
  {
    title: string;
    description: string;
    allow: string;
    necessary: string;
    settings: string;
    withdraw: string;
    enabled: string;
    disabled: string;
  }
> = {
  bg: {
    title: "Вашият избор за поверителност",
    description:
      "Използваме незадължителни аналитични бисквитки само с ваше съгласие. Можете да го оттеглите по всяко време.",
    allow: "Разрешавам анализи",
    necessary: "Само необходимите",
    settings: "Настройки за поверителност",
    withdraw: "Оттеглям съгласието",
    enabled: "Аналитичните бисквитки са разрешени.",
    disabled: "Използват се само необходимите бисквитки.",
  },
  en: {
    title: "Your privacy choice",
    description:
      "We use optional analytics cookies only with your consent. You can withdraw it at any time.",
    allow: "Allow analytics",
    necessary: "Necessary only",
    settings: "Privacy settings",
    withdraw: "Withdraw consent",
    enabled: "Analytics cookies are allowed.",
    disabled: "Only necessary cookies are used.",
  },
  ru: {
    title: "Ваш выбор конфиденциальности",
    description:
      "Необязательные аналитические cookies используются только с вашего согласия. Его можно отозвать в любой момент.",
    allow: "Разрешить аналитику",
    necessary: "Только необходимые",
    settings: "Настройки конфиденциальности",
    withdraw: "Отозвать согласие",
    enabled: "Аналитические cookies разрешены.",
    disabled: "Используются только необходимые cookies.",
  },
  de: {
    title: "Ihre Datenschutzauswahl",
    description:
      "Optionale Analyse-Cookies verwenden wir nur mit Ihrer Einwilligung. Sie können sie jederzeit widerrufen.",
    allow: "Analyse erlauben",
    necessary: "Nur notwendige",
    settings: "Datenschutzeinstellungen",
    withdraw: "Einwilligung widerrufen",
    enabled: "Analyse-Cookies sind erlaubt.",
    disabled: "Nur notwendige Cookies werden verwendet.",
  },
  nl: {
    title: "Uw privacykeuze",
    description:
      "We gebruiken optionele analytische cookies alleen met uw toestemming. U kunt die op elk moment intrekken.",
    allow: "Analyse toestaan",
    necessary: "Alleen noodzakelijke",
    settings: "Privacyinstellingen",
    withdraw: "Toestemming intrekken",
    enabled: "Analytische cookies zijn toegestaan.",
    disabled: "Alleen noodzakelijke cookies worden gebruikt.",
  },
  el: {
    title: "Η επιλογή απορρήτου σας",
    description:
      "Χρησιμοποιούμε προαιρετικά cookies ανάλυσης μόνο με τη συγκατάθεσή σας. Μπορείτε να την ανακαλέσετε οποτεδήποτε.",
    allow: "Να επιτρέπεται η ανάλυση",
    necessary: "Μόνο απαραίτητα",
    settings: "Ρυθμίσεις απορρήτου",
    withdraw: "Ανάκληση συγκατάθεσης",
    enabled: "Τα cookies ανάλυσης επιτρέπονται.",
    disabled: "Χρησιμοποιούνται μόνο απαραίτητα cookies.",
  },
  he: {
    title: "בחירת הפרטיות שלך",
    description: "אנו משתמשים בקובצי Cookie לניתוח רק בהסכמתך. אפשר לבטל את ההסכמה בכל עת.",
    allow: "לאפשר ניתוח",
    necessary: "הכרחיים בלבד",
    settings: "הגדרות פרטיות",
    withdraw: "ביטול הסכמה",
    enabled: "קובצי Cookie לניתוח מותרים.",
    disabled: "נעשה שימוש בקובצי Cookie הכרחיים בלבד.",
  },
};
