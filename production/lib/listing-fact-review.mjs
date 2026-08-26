import fs from "node:fs";
import { publicPropertyProjection } from "./content.mjs";
import { fromRoot } from "./paths.mjs";
import { publicMediaLibrary } from "./media.mjs";
import {
  factVerificationFor,
  primaryAreaFieldFor,
  propertyFamilyFor,
  propertySubtypeFor,
  publicFactValue,
} from "./listing-facts.mjs";

export const DEFAULT_MANUAL_LISTING_AUDIT_PATH = fromRoot("production", "data", "manual-listing-audit.json");
export const DEFAULT_LIVE_LISTING_AUDIT_PATH = fromRoot("production", "data", "live-listing-audit.json");

// These pairs were confirmed during the source review.  The comparison is
// deliberately read-only: the broker still decides which record, price, and
// scope survives in the existing editor and publication controls.
export const DUPLICATE_REVIEW_PAIRS = Object.freeze([
  Object.freeze({
    pair_id: "MS-CRAWL-0083--MS-CRAWL-0159",
    confirmed_listing_id: "MS-CRAWL-0083",
    candidate_listing_id: "MS-CRAWL-0159",
  }),
  Object.freeze({
    pair_id: "MS-CRAWL-0065--MS-CRAWL-0135",
    confirmed_listing_id: "MS-CRAWL-0135",
    candidate_listing_id: "MS-CRAWL-0065",
  }),
]);
export const DUPLICATE_REVIEW_LISTING_IDS = Object.freeze(
  [...new Set(DUPLICATE_REVIEW_PAIRS.flatMap((pair) => [pair.confirmed_listing_id, pair.candidate_listing_id]))],
);

// These are the figures the public listing page can mark as coming from the
// source.  The editor field is deliberately the existing legacy field: the
// save service translates it to the canonical property field below.
const FACT_REVIEW_ROWS = Object.freeze({
  bedrooms: Object.freeze({ editor_field: "bedrooms", property_fields: ["bedrooms_count"] }),
  area_sqm: Object.freeze({ editor_field: "area_sqm", property_fields: null }),
  floor: Object.freeze({ editor_field: "floor", property_fields: ["floor_number", "total_floors"] }),
  storeys: Object.freeze({ editor_field: "total_floors", property_fields: ["storeys_count"] }),
  land_area_sqm: Object.freeze({ editor_field: "land_area_sqm", property_fields: ["land_area_sqm"] }),
  condition: Object.freeze({ editor_field: "condition", property_fields: ["condition"] }),
  price: Object.freeze({ editor_field: "price_eur", property_fields: [] }),
});

export const FACT_REVIEW_ROW_KEYS = Object.freeze(Object.keys(FACT_REVIEW_ROWS));
export const CONFIRMABLE_EDITOR_FIELDS = Object.freeze([
  ...new Set(Object.values(FACT_REVIEW_ROWS).map((row) => row.editor_field)),
]);

// The public admin shell remains BG/RU/EN, but fact review can be reached from
// every public locale. Keeping the small vocabulary here avoids making a
// reviewer read internal field names when a locale-aware URL is opened.
export const FACT_REVIEW_COPY = Object.freeze({
  bg: Object.freeze({
    title: "Факти за потвърждение",
    description: "Числата са взети от източника и чакат потвърждение от брокер.",
    confirm: "Потвърждавам тази стойност",
    sourceStated: "Посочено в източника",
    openEditor: "Отвори редактора",
    count: "непотвърдени факти",
    noRows: "Няма факти за потвърждение.",
    labels: Object.freeze({ bedrooms: "Спални", area_sqm: "Площ", floor: "Етаж", storeys: "Етажи", land_area_sqm: "Площ на земята", condition: "Състояние", price: "Цена" }),
    duplicateTitle: "Сравнение на обяви за ръчен преглед",
    duplicateDescription: "Потвърдените двойки са показани една до друга. Не обединявайте и не сваляйте обява от този екран.",
    pairConfirmed: "Потвърдена двойка",
    candidate: "Кандидат",
    confirmed: "Потвърден запис",
    price: "Цена",
    area: "Площ",
    location: "Местоположение",
    photos: "Снимки",
    openPublication: "Отвори контролите за публикуване",
    reviewOnly: "Само за сравнение; решението остава за брокер.",
    areaTitle: "Площи за преглед",
    areaDescription: "Каноничната площ липсва. Стойностите по-долу са предложения от текста и не се попълват автоматично.",
    missingCanonicalArea: "липсваща канонична площ",
    multipleCandidates: "обяви с няколко предложения",
    suggestion: "Предложение",
    context: "Контекст",
    source: "Източник",
    noAreaRows: "Няма площи за преглед.",
  }),
  en: Object.freeze({
    title: "Facts to confirm",
    description: "These figures came from the source and await a broker’s confirmation.",
    confirm: "I confirm this value",
    sourceStated: "Stated by source",
    openEditor: "Open editor",
    count: "unchecked facts",
    noRows: "No facts need confirmation.",
    labels: Object.freeze({ bedrooms: "Bedrooms", area_sqm: "Area", floor: "Floor", storeys: "Storeys", land_area_sqm: "Land area", condition: "Condition", price: "Price" }),
    duplicateTitle: "Manual duplicate comparison",
    duplicateDescription: "Confirmed pairs are shown side by side. Do not merge or remove a listing from this screen.",
    pairConfirmed: "Confirmed pair",
    candidate: "Candidate",
    confirmed: "Confirmed record",
    price: "Price",
    area: "Area",
    location: "Location",
    photos: "Photos",
    openPublication: "Open publication controls",
    reviewOnly: "Comparison only; the broker keeps the decision.",
    areaTitle: "Areas for review",
    areaDescription: "The canonical area is missing. Values below are suggestions from the text and are never filled in automatically.",
    missingCanonicalArea: "missing canonical area",
    multipleCandidates: "listings with multiple suggestions",
    suggestion: "Suggestion",
    context: "Context",
    source: "Source",
    noAreaRows: "No areas need review.",
  }),
  de: Object.freeze({
    title: "Zu bestätigende Angaben",
    description: "Diese Angaben stammen aus der Quelle und warten auf die Bestätigung durch einen Makler.",
    confirm: "Diesen Wert bestätigen",
    sourceStated: "In der Quelle angegeben",
    openEditor: "Editor öffnen",
    count: "ungeprüfte Angaben",
    noRows: "Keine Angaben müssen bestätigt werden.",
    labels: Object.freeze({ bedrooms: "Schlafzimmer", area_sqm: "Fläche", floor: "Etage", storeys: "Geschosse", land_area_sqm: "Grundstücksfläche", condition: "Zustand", price: "Preis" }),
    duplicateTitle: "Manueller Vergleich doppelter Inserate",
    duplicateDescription: "Bestätigte Paare werden nebeneinander angezeigt. Auf diesem Bildschirm keine Inserate zusammenführen oder entfernen.",
    pairConfirmed: "Bestätigtes Paar",
    candidate: "Kandidat",
    confirmed: "Bestätigter Eintrag",
    price: "Preis",
    area: "Fläche",
    location: "Ort",
    photos: "Fotos",
    openPublication: "Veröffentlichungskontrollen öffnen",
    reviewOnly: "Nur Vergleich; die Entscheidung bleibt beim Makler.",
    areaTitle: "Flächen zur Prüfung",
    areaDescription: "Die kanonische Fläche fehlt. Die folgenden Werte sind Vorschläge aus dem Text und werden nie automatisch eingetragen.",
    missingCanonicalArea: "fehlende kanonische Fläche",
    multipleCandidates: "Inserate mit mehreren Vorschlägen",
    suggestion: "Vorschlag",
    context: "Kontext",
    source: "Quelle",
    noAreaRows: "Keine Flächen zur Prüfung.",
  }),
  nl: Object.freeze({
    title: "Te bevestigen gegevens",
    description: "Deze cijfers komen uit de bron en wachten op bevestiging door een makelaar.",
    confirm: "Deze waarde bevestigen",
    sourceStated: "In de bron vermeld",
    openEditor: "Editor openen",
    count: "ongecontroleerde gegevens",
    noRows: "Geen gegevens hoeven te worden bevestigd.",
    labels: Object.freeze({ bedrooms: "Slaapkamers", area_sqm: "Oppervlakte", floor: "Verdieping", storeys: "Verdiepingen", land_area_sqm: "Perceeloppervlakte", condition: "Staat", price: "Prijs" }),
    duplicateTitle: "Handmatige vergelijking van dubbele woningen",
    duplicateDescription: "Bevestigde paren staan naast elkaar. Voeg woningen op dit scherm niet samen en verwijder ze niet.",
    pairConfirmed: "Bevestigd paar",
    candidate: "Kandidaat",
    confirmed: "Bevestigde vermelding",
    price: "Prijs",
    area: "Oppervlakte",
    location: "Locatie",
    photos: "Foto's",
    openPublication: "Publicatiebeheer openen",
    reviewOnly: "Alleen vergelijking; de makelaar neemt de beslissing.",
    areaTitle: "Oppervlakten ter beoordeling",
    areaDescription: "De canonieke oppervlakte ontbreekt. Deze waarden zijn suggesties uit de tekst en worden nooit automatisch ingevuld.",
    missingCanonicalArea: "ontbrekende canonieke oppervlakte",
    multipleCandidates: "vermeldingen met meerdere suggesties",
    suggestion: "Suggestie",
    context: "Context",
    source: "Bron",
    noAreaRows: "Geen oppervlakten ter beoordeling.",
  }),
  ru: Object.freeze({
    title: "Факты для подтверждения",
    description: "Эти значения взяты из источника и ждут подтверждения брокера.",
    confirm: "Подтверждаю это значение",
    sourceStated: "Указано в источнике",
    openEditor: "Открыть редактор",
    count: "непроверенных фактов",
    noRows: "Нет фактов для подтверждения.",
    labels: Object.freeze({ bedrooms: "Спальни", area_sqm: "Площадь", floor: "Этаж", storeys: "Этажи", land_area_sqm: "Площадь участка", condition: "Состояние", price: "Цена" }),
    duplicateTitle: "Ручное сравнение дублей объявлений",
    duplicateDescription: "Подтверждённые пары показаны рядом. На этом экране нельзя объединять или снимать объявление.",
    pairConfirmed: "Подтверждённая пара",
    candidate: "Кандидат",
    confirmed: "Подтверждённая запись",
    price: "Цена",
    area: "Площадь",
    location: "Местоположение",
    photos: "Фотографии",
    openPublication: "Открыть управление публикацией",
    reviewOnly: "Только сравнение; решение остаётся за брокером.",
    areaTitle: "Площади для проверки",
    areaDescription: "Каноническая площадь отсутствует. Значения ниже взяты из текста и никогда не заполняются автоматически.",
    missingCanonicalArea: "объявлений без канонической площади",
    multipleCandidates: "объявлений с несколькими вариантами",
    suggestion: "Вариант",
    context: "Контекст",
    source: "Источник",
    noAreaRows: "Нет площадей для проверки.",
  }),
  el: Object.freeze({
    title: "Στοιχεία προς επιβεβαίωση",
    description: "Τα στοιχεία προέρχονται από την πηγή και αναμένουν επιβεβαίωση μεσίτη.",
    confirm: "Επιβεβαιώνω αυτή την τιμή",
    sourceStated: "Αναφέρεται στην πηγή",
    openEditor: "Άνοιγμα επεξεργαστή",
    count: "μη ελεγμένα στοιχεία",
    noRows: "Δεν υπάρχουν στοιχεία προς επιβεβαίωση.",
    labels: Object.freeze({ bedrooms: "Υπνοδωμάτια", area_sqm: "Εμβαδόν", floor: "Όροφος", storeys: "Όροφοι", land_area_sqm: "Εμβαδόν γης", condition: "Κατάσταση", price: "Τιμή" }),
    duplicateTitle: "Χειροκίνητη σύγκριση διπλών καταχωρίσεων",
    duplicateDescription: "Τα επιβεβαιωμένα ζεύγη εμφανίζονται δίπλα-δίπλα. Μην συγχωνεύετε ή αφαιρείτε καταχώριση από αυτή την οθόνη.",
    pairConfirmed: "Επιβεβαιωμένο ζεύγος",
    candidate: "Υποψήφια καταχώριση",
    confirmed: "Επιβεβαιωμένη καταχώριση",
    price: "Τιμή",
    area: "Εμβαδόν",
    location: "Τοποθεσία",
    photos: "Φωτογραφίες",
    openPublication: "Άνοιγμα ελέγχων δημοσίευσης",
    reviewOnly: "Μόνο σύγκριση· η απόφαση παραμένει στον μεσίτη.",
    areaTitle: "Εμβαδά προς έλεγχο",
    areaDescription: "Το κανονικό εμβαδόν λείπει. Οι παρακάτω τιμές είναι προτάσεις από το κείμενο και δεν συμπληρώνονται αυτόματα.",
    missingCanonicalArea: "χωρίς κανονικό εμβαδόν",
    multipleCandidates: "καταχωρίσεις με πολλές προτάσεις",
    suggestion: "Πρόταση",
    context: "Πλαίσιο",
    source: "Πηγή",
    noAreaRows: "Δεν υπάρχουν εμβαδά προς έλεγχο.",
  }),
  he: Object.freeze({
    title: "נתונים לאישור",
    description: "הנתונים נלקחו מהמקור וממתינים לאישור מתווך.",
    confirm: "אני מאשר ערך זה",
    sourceStated: "צוין במקור",
    openEditor: "פתיחת העורך",
    count: "נתונים שלא נבדקו",
    noRows: "אין נתונים שדורשים אישור.",
    labels: Object.freeze({ bedrooms: "חדרי שינה", area_sqm: "שטח", floor: "קומה", storeys: "קומות", land_area_sqm: "שטח הקרקע", condition: "מצב", price: "מחיר" }),
    duplicateTitle: "השוואה ידנית של נכסים כפולים",
    duplicateDescription: "זוגות שאושרו מוצגים זה לצד זה. אין לאחד או להסיר נכס ממסך זה.",
    pairConfirmed: "זוג שאושר",
    candidate: "מועמד",
    confirmed: "רשומה מאושרת",
    price: "מחיר",
    area: "שטח",
    location: "מיקום",
    photos: "תמונות",
    openPublication: "פתיחת בקרות פרסום",
    reviewOnly: "השוואה בלבד; ההחלטה נשארת בידי המתווך.",
    areaTitle: "שטחים לבדיקה",
    areaDescription: "השטח הקנוני חסר. הערכים הבאים הם הצעות מהטקסט ולעולם אינם מוזנים אוטומטית.",
    missingCanonicalArea: "שטח קנוני חסר",
    multipleCandidates: "נכסים עם כמה הצעות",
    suggestion: "הצעה",
    context: "הקשר",
    source: "מקור",
    noAreaRows: "אין שטחים לבדיקה.",
  }),
});

export function factReviewCopyFor(locale) {
  return FACT_REVIEW_COPY[String(locale || "en").trim().toLowerCase()] || FACT_REVIEW_COPY.en;
}

function auditRows(value) {
  if (Array.isArray(value)) return value;
  return Array.isArray(value?.listings) ? value.listings : [];
}

export function loadListingReviewEvidence({
  manualPath = DEFAULT_MANUAL_LISTING_AUDIT_PATH,
  livePath = DEFAULT_LIVE_LISTING_AUDIT_PATH,
} = {}) {
  const manual = JSON.parse(fs.readFileSync(manualPath, "utf8"));
  const live = JSON.parse(fs.readFileSync(livePath, "utf8"));
  return { manualAudit: auditRows(manual), liveAudit: auditRows(live) };
}

const AREA_TEXT_PATTERN = /(\d[\d\s.,]*\d|\d)\s*(кв\.?\s*м\.?|м2|м²|sqm|m²|дка|гка|га)(?![\p{L}\d])/giu;

function areaNumber(raw, unit) {
  let normalized = String(raw || "").replace(/\s+/gu, "");
  if (normalized.includes(",") && normalized.includes(".")) {
    if (normalized.lastIndexOf(",") > normalized.lastIndexOf(".")) {
      normalized = normalized.replaceAll(".", "").replace(",", ".");
    } else {
      normalized = normalized.replaceAll(",", "");
    }
  } else if (normalized.includes(",")) {
    const parts = normalized.split(",");
    normalized = parts.at(-1)?.length === 3 && parts[0].length > 1
      ? normalized.replaceAll(",", "")
      : normalized.replace(",", ".");
  } else if (normalized.includes(".")) {
    const parts = normalized.split(".");
    if (parts.at(-1)?.length === 3 && parts[0].length > 1) normalized = normalized.replaceAll(".", "");
  }
  const value = Number(normalized);
  if (!Number.isFinite(value) || value <= 0) return null;
  const normalizedUnit = String(unit || "").toLocaleLowerCase();
  if (normalizedUnit.includes("дка")) return value * 1000;
  if (normalizedUnit.includes("га") || normalizedUnit.includes("гка")) return value * 10000;
  return value;
}

function comparableArea(value) {
  return Number.isFinite(value) && value > 0 ? value : null;
}

function sameAreaValue(left, right) {
  const a = comparableArea(left);
  const b = comparableArea(right);
  return a !== null && b !== null && (Math.abs(a - b) <= 1 || Math.abs(a - b) / Math.max(a, b) <= 0.01);
}

/**
 * Pull area phrases out of source copy for broker context only.  Values stay
 * suggestions: this helper never chooses a canonical field or writes a fact.
 */
export function areaCandidatesForListing(listing = {}) {
  const text = String(listing.facts?.description || listing.description || listing.seo?.description || "");
  const candidates = [];
  for (const match of text.matchAll(AREA_TEXT_PATTERN)) {
    const value_sqm = areaNumber(match[1], match[2]);
    if (value_sqm === null || candidates.some((candidate) => sameAreaValue(candidate.value_sqm, value_sqm))) continue;
    const start = Math.max(0, match.index - 72);
    const end = Math.min(text.length, match.index + match[0].length + 72);
    candidates.push({
      value_sqm,
      raw: match[0].trim(),
      context: text.slice(start, end).replace(/\s+/gu, " ").trim(),
    });
  }
  return candidates;
}

function finiteArea(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}

function canonicalAreaPresent(property) {
  if (!property?.facts) return false;
  const facts = {
    ...property.facts,
    property_family: property.property_family || property.facts.property_family || null,
    property_subtype: property.property_subtype || property.facts.property_subtype || null,
  };
  const primaryField = primaryAreaFieldFor(facts);
  return primaryField ? finiteArea(facts[primaryField]) !== null : false;
}

function observedAreaFor(manualRow, liveRow) {
  const manualValue = finiteArea(manualRow?.observed?.area_sqm_or_unknown);
  return manualValue ?? finiteArea(liveRow?.live_area_sqm);
}

function listingComparisonCard(record, { role, areaCandidates = areaCandidatesForListing(record) } = {}) {
  const facts = record?.facts || {};
  const publicMedia = publicMediaLibrary(record?.media || []);
  return {
    listing_id: record?.id || null,
    role,
    title: facts.title || facts.h1 || record?.id || "",
    source_locale: record?.source_locale || "",
    price_eur: facts.price_on_request === true ? null : facts.price_eur ?? null,
    price_on_request: facts.price_on_request === true,
    location: facts.location || facts.location_native || "",
    area_candidates: areaCandidates,
    photos: {
      count: publicMedia.gallery_count,
      assets: publicMedia.gallery.slice(0, 4).map((asset) => ({ url: asset.url, alt: asset.alt || facts.title || record?.id || "" })),
    },
    source_url: record?.source_url || "",
    editor_path: `/admin/listings/edit?listingId=${encodeURIComponent(record?.id || "")}`,
    publication_path: "/admin/listings#listing-publication-schedule",
  };
}

export function buildListingDuplicateReview(seed = {}, { pairs = DUPLICATE_REVIEW_PAIRS } = {}) {
  const records = new Map((seed.records || []).filter((record) => record.collection === "listings").map((record) => [record.id, record]));
  const rows = [];
  for (const pair of pairs) {
    const confirmedRecord = records.get(pair.confirmed_listing_id);
    const candidateRecord = records.get(pair.candidate_listing_id);
    if (!confirmedRecord || !candidateRecord) continue;
    rows.push({
      pair_id: pair.pair_id,
      confirmed: listingComparisonCard(confirmedRecord, { role: "confirmed" }),
      candidate: listingComparisonCard(candidateRecord, { role: "candidate" }),
    });
  }
  return {
    rows,
    summary: { confirmed_pairs: rows.length },
  };
}

function listingAreaReviewRow(record, manualRow, liveRow) {
  const facts = record.facts || {};
  return {
    listing_id: record.id,
    title: facts.title || facts.h1 || record.id,
    source_locale: record.source_locale || "",
    location: facts.location || facts.location_native || "",
    source_url: record.source_url || manualRow?.source_url || liveRow?.source_url || "",
    observed_area_sqm: observedAreaFor(manualRow, liveRow),
    area_candidates: areaCandidatesForListing(record),
    editor_path: `/admin/listings/edit?listingId=${encodeURIComponent(record.id)}#listing-facts`,
    publication_path: "/admin/listings#listing-publication-schedule",
  };
}

export function buildListingAreaReview(seed = {}, { manualAudit, liveAudit } = {}) {
  const evidence = manualAudit === undefined || liveAudit === undefined ? loadListingReviewEvidence() : { manualAudit, liveAudit };
  const manualRows = auditRows(evidence.manualAudit);
  const liveRows = auditRows(evidence.liveAudit);
  const manualById = new Map(manualRows.map((row) => [row.id, row]));
  const liveById = new Map(liveRows.map((row) => [row.id, row]));
  const properties = new Map((seed.properties || []).map((property) => [property.id, property]));
  const records = (seed.records || []).filter((record) => record.collection === "listings");
  // A duplicate pair leaves the area queue only when both source pages carry
  // an independently observed area.  If one page is unavailable (0065), the
  // surviving source (0135) still needs its own canonical-area review.
  const duplicateAreaExclusions = new Set(
    DUPLICATE_REVIEW_PAIRS
      .filter((pair) => finiteArea(liveById.get(pair.confirmed_listing_id)?.live_area_sqm) !== null && finiteArea(liveById.get(pair.candidate_listing_id)?.live_area_sqm) !== null)
      .flatMap((pair) => [pair.confirmed_listing_id, pair.candidate_listing_id]),
  );
  const missingCanonicalArea = records
    .filter((record) => manualById.get(record.id)?.review_status === "review")
    .filter((record) => finiteArea(liveById.get(record.id)?.live_area_sqm) !== null)
    .filter((record) => !duplicateAreaExclusions.has(record.id))
    .filter((record) => !canonicalAreaPresent(properties.get(record.property)))
    .map((record) => listingAreaReviewRow(record, manualById.get(record.id), liveById.get(record.id)));
  const multipleProseCandidates = records
    .filter((record) => manualById.get(record.id)?.review_status === "hold")
    .map((record) => listingAreaReviewRow(record, manualById.get(record.id), liveById.get(record.id)))
    .filter((row) => row.area_candidates.length > 1);
  return {
    missing_canonical_area: missingCanonicalArea,
    multiple_prose_candidates: multipleProseCandidates,
    summary: {
      missing_canonical_area: missingCanonicalArea.length,
      multiple_prose_candidates: multipleProseCandidates.length,
    },
    review_pack: { command: "npm run listing:review-pack" },
  };
}

function propertyFieldsForRow(rowKey, property) {
  const facts = {
    ...(property?.facts || {}),
    property_family: property?.property_family || property?.facts?.property_family || null,
    property_subtype: property?.property_subtype || property?.facts?.property_subtype || null,
  };
  const verification = property?.fact_verification || [];
  if (rowKey === "area_sqm") {
    const field = primaryAreaFieldFor(facts);
    return field ? [field] : [];
  }
  if (rowKey === "floor") {
    return ["floor_number", "total_floors"].filter(
      (field) => publicFactValue(facts, verification, field) !== null && factVerificationFor(field, verification).state === "entered_pending_review",
    );
  }
  if (rowKey === "storeys") {
    const family = propertyFamilyFor(facts);
    const subtype = propertySubtypeFor(facts);
    return ["total_floors", "storeys_count"].filter((field) => {
      const applicable =
        (family === "apartment" || family === "commercial") && field === "total_floors" ||
        (family === "house" || family === "hotel") && field === "storeys_count";
      return applicable && factVerificationFor(field, verification).state === "entered_pending_review";
    });
  }
  return [...(FACT_REVIEW_ROWS[rowKey]?.property_fields || [])].filter(
    (field) => factVerificationFor(field, verification).state === "entered_pending_review",
  );
}

// A grouped public row can contain more than one canonical field.  The editor
// still submits one legacy input for each of those fields, so never copy one
// editor value into every canonical field in the group.  In particular,
// `floor` is the apartment/commercial floor number while `total_floors` is a
// separate value; a reviewer may confirm either one without silently changing
// the other.
function propertyFieldsForEditorField(editorField, propertyFields) {
  const fields = [...new Set(propertyFields || [])];
  if (editorField === "floor") return fields.filter((field) => field === "floor_number");
  if (editorField === "total_floors") return fields.filter((field) => ["total_floors", "storeys_count"].includes(field));
  return fields;
}

function priceRow(listing) {
  const facts = listing?.facts || {};
  const value = facts.price_eur;
  return facts.price_on_request !== true && value !== null && value !== undefined && value !== "" && !listing?.workflow?.price_verified_at
    ? { row: "price", editor_field: "price_eur", property_fields: [], value }
    : null;
}

/**
 * Return exactly the rows the public page currently marks as source-stated.
 * This is intentionally derived from the same public projection, not from a
 * second copy of the publication rules.
 */
export function listingFactReviewFor({ listing = {}, property = null } = {}) {
  const projection = publicPropertyProjection(property);
  const rows = [];
  for (const rowKey of projection?.source_stated_facts || []) {
    const definition = FACT_REVIEW_ROWS[rowKey];
    if (!definition) continue;
    const propertyFields = propertyFieldsForRow(rowKey, property);
    const editorFields = rowKey === "floor" && propertyFields.length > 0
      ? propertyFields.map((field) => field === "floor_number" ? "floor" : "total_floors")
      : [definition.editor_field];
    for (const editorField of [...new Set(editorFields)]) {
      const editorPropertyFields = propertyFieldsForEditorField(editorField, propertyFields);
      const fieldValue = editorPropertyFields.length === 1 ? projection[editorPropertyFields[0]] : undefined;
      rows.push({
        row: rowKey,
        editor_field: editorField,
        property_fields: editorPropertyFields,
        value: fieldValue ?? projection[rowKey] ?? listing.facts?.[editorField] ?? null,
        source_stated: true,
      });
    }
  }
  const price = priceRow(listing);
  if (price) rows.push({ ...price, source_stated: true });
  rows.sort((left, right) => FACT_REVIEW_ROW_KEYS.indexOf(left.row) - FACT_REVIEW_ROW_KEYS.indexOf(right.row));
  return {
    listing_id: listing.id || null,
    property_id: property?.id || null,
    rows,
    unchecked_rows: [...new Set(rows.map((row) => row.row))],
    unchecked_editor_fields: [...new Set(rows.map((row) => row.editor_field))],
    unchecked_count: rows.length,
  };
}

export function normalizeConfirmedFactFields(value) {
  const raw = Array.isArray(value) ? value : value === undefined || value === null || value === "" ? [] : [value];
  const fields = [...new Set(raw.map((field) => String(field || "").trim()).filter(Boolean))];
  const unsupported = fields.filter((field) => !CONFIRMABLE_EDITOR_FIELDS.includes(field));
  if (unsupported.length) throw new Error(`Confirmed facts must be editable figures: ${unsupported.join(", ")}`);
  return fields;
}

export function factPromotionsFor({ listing = {}, property = null, confirmedFields = [], changedFields = [] } = {}) {
  const review = listingFactReviewFor({ listing, property });
  const requested = new Set(
    [...confirmedFields, ...changedFields].map((field) => String(field || "").trim()).filter(Boolean),
  );
  const rows = review.rows.filter((row) => requested.has(row.editor_field));
  const propertyFieldsByEditorField = Object.fromEntries(
    rows.map((row) => [row.editor_field, propertyFieldsForEditorField(row.editor_field, row.property_fields)]),
  );
  return {
    rows: [...new Set(rows.map((row) => row.row))],
    editor_fields: [...new Set(rows.map((row) => row.editor_field))],
    property_fields_by_editor_field: propertyFieldsByEditorField,
    property_fields: [...new Set(Object.values(propertyFieldsByEditorField).flat())],
    verify_price: rows.some((row) => row.row === "price"),
  };
}

export function buildListingFactReviewQueue(seed = {}, { row = "", query = "" } = {}) {
  const properties = new Map((seed.properties || []).map((property) => [property.id, property]));
  const listings = (seed.records || []).filter((record) => record.collection === "listings");
  const normalizedRow = FACT_REVIEW_ROWS[row] ? row : "";
  const normalizedQuery = String(query || "").trim().toLocaleLowerCase();
  const byRow = Object.fromEntries(FACT_REVIEW_ROW_KEYS.map((key) => [key, 0]));
  const allRows = [];
  for (const listing of listings) {
    const review = listingFactReviewFor({ listing, property: properties.get(listing.property) || null });
    if (!review.unchecked_count) continue;
    review.unchecked_rows.forEach((key) => { byRow[key] += 1; });
    const title = listing.facts?.title || listing.facts?.h1 || listing.id;
    const location = listing.facts?.location || "";
    allRows.push({
      listing_id: listing.id,
      title,
      location,
      source_locale: listing.source_locale || "",
      unchecked_rows: review.unchecked_rows,
      unchecked_editor_fields: review.unchecked_editor_fields,
      unchecked_count: review.unchecked_count,
      editor_path: `/admin/listings/edit?listingId=${encodeURIComponent(listing.id)}#listing-facts`,
    });
  }
  const rows = allRows
    .filter((entry) => !normalizedRow || entry.unchecked_rows.includes(normalizedRow))
    .filter((entry) => !normalizedQuery || `${entry.listing_id} ${entry.title} ${entry.location}`.toLocaleLowerCase().includes(normalizedQuery))
    .sort((left, right) => right.unchecked_count - left.unchecked_count || left.listing_id.localeCompare(right.listing_id));
  return {
    rows,
    filters: { row: normalizedRow, q: String(query || "").trim() },
    summary: {
      listings_with_unchecked_facts: allRows.length,
      unchecked_figures: allRows.reduce((total, row) => total + row.unchecked_count, 0),
      visible: rows.length,
      by_row: byRow,
    },
  };
}

export function propertyFieldForEditorField(editorField, property, reviewRows = []) {
  const row = reviewRows.find((candidate) => candidate.editor_field === editorField);
  if (row?.property_fields?.length) {
    const facts = property?.facts || {};
    const existing = row.property_fields.find((field) => facts[field] !== null && facts[field] !== undefined && facts[field] !== "");
    return existing || row.property_fields[0];
  }
  if (editorField === "bedrooms") return "bedrooms_count";
  if (editorField === "floor") return "floor_number";
  if (editorField === "total_floors") return property?.property_family === "house" ? "storeys_count" : "total_floors";
  if (editorField === "land_area_sqm") return "land_area_sqm";
  return null;
}
