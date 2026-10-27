import type { PublicLocale } from "@/i18n/config";
import { discoveryCopy } from "./copy";

// Interface labels only; an eligible approved content title always takes precedence.
const labels = {
  bg: {
    area: "Информация за района",
    service: "Информация за услугата",
    help: "Помощ",
    contact: "Контакт",
    unavailable: "Одобрена информация за тази страница все още не е достъпна.",
    scope: "Обхват на прегледа",
  },
  en: {
    area: "Area information",
    service: "Service information",
    help: "Help",
    contact: "Contact",
    unavailable: "Approved information is not yet available for this page.",
    scope: "Review scope",
  },
  ru: {
    area: "Информация о районе",
    service: "Информация об услуге",
    help: "Помощь",
    contact: "Контакт",
    unavailable: "Одобренная информация для этой страницы пока недоступна.",
    scope: "Область проверки",
  },
  de: {
    area: "Ortsinformationen",
    service: "Serviceinformationen",
    help: "Hilfe",
    contact: "Kontakt",
    unavailable: "Freigegebene Informationen für diese Seite sind noch nicht verfügbar.",
    scope: "Prüfumfang",
  },
  nl: {
    area: "Gebiedsinformatie",
    service: "Dienstinformatie",
    help: "Hulp",
    contact: "Contact",
    unavailable: "Goedgekeurde informatie voor deze pagina is nog niet beschikbaar.",
    scope: "Reikwijdte van beoordeling",
  },
  el: {
    area: "Πληροφορίες περιοχής",
    service: "Πληροφορίες υπηρεσίας",
    help: "Βοήθεια",
    contact: "Επικοινωνία",
    unavailable: "Δεν υπάρχουν ακόμη εγκεκριμένες πληροφορίες για αυτή τη σελίδα.",
    scope: "Πεδίο ελέγχου",
  },
  he: {
    area: "מידע על האזור",
    service: "מידע על השירות",
    help: "עזרה",
    contact: "יצירת קשר",
    unavailable: "מידע מאושר לעמוד זה עדיין אינו זמין.",
    scope: "היקף הבדיקה",
  },
};

export const contentLabels = (locale: PublicLocale) => labels[locale];
export function contentFallbackTitle(
  locale: PublicLocale,
  input: {
    kind: "area" | "service" | "help";
    route: string;
    intent?: "seller_consultation" | "landlord_consultation";
  },
) {
  const copy = discoveryCopy(locale),
    label = contentLabels(locale);
  return input.intent === "seller_consultation"
    ? copy.sell
    : input.intent === "landlord_consultation"
      ? copy.let
      : input.route === "/contact"
        ? label.contact
        : label[input.kind];
}
