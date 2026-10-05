// P12: the properties an inquiry was about, named from the snapshot saved at submission
// (design/contracts/w03-p12.md §3). Only `publicNow` is read live; it never refreshes a name.
import type { InquiryListingReceipt } from "@/domain/inquiry-selection";
import type { PublicLocale } from "@/i18n/config";
import { formatDateTime } from "@/i18n/format";
import type { ReceiptListings } from "@/ui/form/contract";

const copy = {
  bg: {
    one: "Имотът в запитването",
    many: "Имотите в запитването · {count}",
    reference: "№ {reference}",
    referenceOnly: "Имот № {reference}",
    noSavedName: "Името на имота не е записано в това запитване.",
    notPublic: "Тази обява вече не е активна и не може да се отвори.",
    unknown: "Не можем да проверим дали обявата е активна",
    view: "Вижте имота",
    similar: "Вижте подобни имоти",
    search: "Потърсете имот № {reference}",
    savedName:
      "Името е записано при изпращането на {submittedAt}. Ако обявата се промени по-късно, тук остава същото.",
    savedReference: "Номерът е записан при изпращането на {submittedAt}.",
  },
  en: {
    one: "The property in this inquiry",
    many: "The properties in this inquiry · {count}",
    reference: "No. {reference}",
    referenceOnly: "Property No. {reference}",
    noSavedName: "The property's name was not saved with this inquiry.",
    notPublic: "This listing is no longer active and cannot be opened.",
    unknown: "We can't check whether this listing is active",
    view: "View the property",
    similar: "See similar properties",
    search: "Search for property No. {reference}",
    savedName:
      "The name was saved when you sent this on {submittedAt}. If the listing changes later, it stays the same here.",
    savedReference: "The number was saved when you sent this on {submittedAt}.",
  },
  ru: {
    one: "Объект в запросе",
    many: "Объекты в запросе · {count}",
    reference: "№ {reference}",
    referenceOnly: "Объект № {reference}",
    noSavedName: "Название объекта не сохранено в этом запросе.",
    notPublic: "Это объявление больше не активно, его нельзя открыть.",
    unknown: "Не можем проверить, активно ли объявление",
    view: "Посмотреть объект",
    similar: "Посмотреть похожие объекты",
    search: "Найти объект № {reference}",
    savedName:
      "Название сохранено при отправке {submittedAt}. Если объявление потом изменится, здесь останется прежнее.",
    savedReference: "Номер сохранён при отправке {submittedAt}.",
  },
  de: {
    one: "Die Immobilie in dieser Anfrage",
    many: "Die Immobilien in dieser Anfrage · {count}",
    reference: "Nr. {reference}",
    referenceOnly: "Immobilie Nr. {reference}",
    noSavedName: "Der Name der Immobilie wurde mit dieser Anfrage nicht gespeichert.",
    notPublic: "Dieses Inserat ist nicht mehr aktiv und kann nicht geöffnet werden.",
    unknown: "Wir können nicht prüfen, ob das Inserat aktiv ist",
    view: "Immobilie ansehen",
    similar: "Ähnliche Immobilien ansehen",
    search: "Immobilie Nr. {reference} suchen",
    savedName:
      "Der Name wurde beim Senden am {submittedAt} gespeichert. Ändert sich das Inserat später, bleibt er hier gleich.",
    savedReference: "Die Nummer wurde beim Senden am {submittedAt} gespeichert.",
  },
  nl: {
    one: "Het object in deze aanvraag",
    many: "De objecten in deze aanvraag · {count}",
    reference: "nr. {reference}",
    referenceOnly: "Object nr. {reference}",
    noSavedName: "De naam van het object is niet met deze aanvraag opgeslagen.",
    notPublic: "Deze advertentie is niet meer actief en kan niet worden geopend.",
    unknown: "We kunnen niet controleren of de advertentie actief is",
    view: "Object bekijken",
    similar: "Vergelijkbare objecten bekijken",
    search: "Zoek object nr. {reference}",
    savedName:
      "De naam is opgeslagen bij het verzenden op {submittedAt}. Als de advertentie later verandert, blijft hij hier hetzelfde.",
    savedReference: "Het nummer is opgeslagen bij het verzenden op {submittedAt}.",
  },
  el: {
    one: "Το ακίνητο του αιτήματος",
    many: "Τα ακίνητα του αιτήματος · {count}",
    reference: "αρ. {reference}",
    referenceOnly: "Ακίνητο αρ. {reference}",
    noSavedName: "Το όνομα του ακινήτου δεν αποθηκεύτηκε σε αυτό το αίτημα.",
    notPublic: "Αυτή η αγγελία δεν είναι πλέον ενεργή και δεν μπορεί να ανοίξει.",
    unknown: "Δεν μπορούμε να ελέγξουμε αν η αγγελία είναι ενεργή",
    view: "Δείτε το ακίνητο",
    similar: "Δείτε παρόμοια ακίνητα",
    search: "Αναζήτηση ακινήτου αρ. {reference}",
    savedName:
      "Το όνομα αποθηκεύτηκε κατά την αποστολή στις {submittedAt}. Αν η αγγελία αλλάξει αργότερα, εδώ μένει το ίδιο.",
    savedReference: "Ο αριθμός αποθηκεύτηκε κατά την αποστολή στις {submittedAt}.",
  },
  he: {
    one: "הנכס בפנייה",
    many: "הנכסים בפנייה · {count}",
    reference: "№ {reference}",
    referenceOnly: "נכס № {reference}",
    noSavedName: "שם הנכס לא נשמר בפנייה הזו.",
    notPublic: "המודעה הזו כבר לא פעילה ואי אפשר לפתוח אותה.",
    unknown: "אין לנו אפשרות לבדוק אם המודעה פעילה",
    view: "לצפייה בנכס",
    similar: "לנכסים דומים",
    search: "חיפוש נכס № {reference}",
    savedName:
      "השם נשמר בשליחה ב־{submittedAt}. אם המודעה תשתנה מאוחר יותר, כאן הוא יישאר כפי שהיה.",
    savedReference: "המספר נשמר בשליחה ב־{submittedAt}.",
  },
} satisfies Record<PublicLocale, Record<string, string>>;

const fill = (template: string, values: Record<string, string | number>) =>
  template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? ""));

/** One row per saved property, in the saved order; null when the inquiry named none. */
export function receiptListings(
  items: readonly InquiryListingReceipt[],
  locale: PublicLocale,
  acceptedAt: string,
): ReceiptListings | null {
  if (!items.length) return null;
  const c = copy[locale];
  const submittedAt = formatDateTime(locale, acceptedAt);
  return {
    heading: items.length > 1 ? fill(c.many, { count: items.length }) : c.one,
    note: fill(items.some((item) => item.title) ? c.savedName : c.savedReference, {
      submittedAt,
    }),
    items: items.map((item) => {
      const reference = item.reference;
      // Detail slugs are the lower-cased reference (listingSlug).
      const href =
        item.sourceUrl ?? `/${locale}/properties/${reference}/${reference.toLowerCase()}`;
      return {
        reference,
        referenceLabel: fill(c.reference, { reference }),
        name: item.title ?? fill(c.referenceOnly, { reference }),
        ...(item.title && item.locale ? { nameLang: item.locale } : {}),
        ...(item.title ? {} : { nameNote: c.noSavedName }),
        ...(item.publicNow === true
          ? { href, link: { href, label: c.view } }
          : item.publicNow === false
            ? {
                warning: c.notPublic,
                link: { href: `/${locale}/properties`, label: c.similar },
              }
            : {
                status: c.unknown,
                link: {
                  href: `/${locale}/properties?q=${encodeURIComponent(reference)}`,
                  label: fill(c.search, { reference }),
                },
              }),
      };
    }),
  };
}
