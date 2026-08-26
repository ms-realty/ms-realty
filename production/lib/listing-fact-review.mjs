import { publicPropertyProjection } from "./content.mjs";
import {
  factVerificationFor,
  primaryAreaFieldFor,
  propertyFamilyFor,
  propertySubtypeFor,
  publicFactValue,
} from "./listing-facts.mjs";

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
  }),
});

export function factReviewCopyFor(locale) {
  return FACT_REVIEW_COPY[String(locale || "en").trim().toLowerCase()] || FACT_REVIEW_COPY.en;
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
