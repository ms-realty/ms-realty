const en = {
  title: "Alerts for this search",
  entry: "Get alerts for this search",
  criteria: "Search to save",
  edit: "Review or edit these filters",
  lead: "Review the search first. Then choose a verified email and give separate permission for search alerts in your account.",
  account: "Continue in your account",
  accountHint:
    "Use your existing account email. Signing in does not subscribe you. If you do not have access, contact the team.",
  manual: "Ask the team",
  manualHint:
    "Keep the search link when asking the team for help. Contacting us does not enable alerts or marketing.",
  deliveryOff:
    "Email alerts are currently unavailable. You can record or manage your preference, but delivery is not enabled.",
  deliveryBoundary:
    "Delivery depends on current consent, an eligible verified email and the agency’s approved alert service. No delivery time is promised.",
  unknown:
    "Listings with unknown facts do not match unless you explicitly include results needing confirmation.",
  source: "Search language",
  save: "Save this search preference",
  saved: "Search preference recorded",
  savedNext:
    "Review, pause or unsubscribe in your account preferences. Recording this choice does not confirm email delivery.",
  preferences: "Manage preferences",
  check: "Check your choices",
  invalid: "The search could not be preserved. Review its filters before continuing.",
  consent:
    "I reviewed this search and the terms, and choose email alerts for it. This does not enable marketing.",
  retained: "Your choices are retained. Review the current state before trying again.",
  status: "Check this preference request",
  unconfirmed: "This change is not confirmed. Check its status before submitting another request.",
  existing:
    "A search-alert preference already exists. Review or change it in your account before creating another for the same email.",
  checkedAt: "Checked at",
};
const bg: typeof en = {
  title: "Известия за това търсене",
  entry: "Известия за това търсене",
  criteria: "Търсене за запазване",
  edit: "Преглед или промяна на филтрите",
  lead: "Първо прегледайте търсенето. След това изберете потвърден имейл и дайте отделно съгласие за известия в профила си.",
  account: "Продължете в профила си",
  accountHint:
    "Използвайте имейла на съществуващия си профил. Влизането не Ви абонира. Ако нямате достъп, свържете се с екипа.",
  manual: "Попитайте екипа",
  manualHint:
    "Запазете връзката към търсенето, когато търсите помощ. Контактът с нас не активира известия или маркетинг.",
  deliveryOff:
    "Имейл известията в момента не са достъпни. Можете да запишете или управлявате предпочитанието си, но изпращането не е активирано.",
  deliveryBoundary:
    "Изпращането зависи от текущото съгласие, потвърден имейл и одобрената услуга на агенцията. Не се обещава час на получаване.",
  unknown:
    "Имотите с неизвестни данни не съвпадат, освен ако изрично включите резултати, изискващи потвърждение.",
  source: "Език на търсенето",
  save: "Запазете предпочитанието за търсене",
  saved: "Предпочитанието за търсене е записано",
  savedNext:
    "Прегледайте, спрете или прекратете абонамента от предпочитанията в профила. Записването не потвърждава доставен имейл.",
  preferences: "Управление на предпочитанията",
  check: "Проверете избора си",
  invalid: "Търсенето не може да бъде запазено точно. Прегледайте филтрите, преди да продължите.",
  consent:
    "Прегледах търсенето и условията и избирам имейл известия за него. Това не активира маркетинг.",
  retained: "Изборът Ви е запазен. Прегледайте текущото състояние, преди да опитате отново.",
  status: "Проверете заявката за предпочитание",
  unconfirmed: "Промяната не е потвърдена. Проверете състоянието ѝ, преди да подадете нова заявка.",
  existing:
    "Вече има предпочитание за известия. Прегледайте или променете съществуващото, преди да създадете друго за същия имейл.",
  checkedAt: "Проверено на",
};
export const searchAlertCopy = (locale: string) => (locale === "bg" ? bg : en);
export const searchAlertCopyLocale = (locale: string) => (locale === "bg" ? "bg" : "en");
