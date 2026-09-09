// A visitor types what they mean in their own language: "apartment" on the
// English page, "Wohnung" on the German one, "под наем" on the Bulgarian one.
// Listing text is indexed in the source language, so a word that is a filter
// value in disguise used to be required as a literal substring and found
// nothing. This module turns those words into the filter they name, and lifts
// the agency's own listing references out of the text so both search engines
// can answer them exactly.
//
// The vocabulary is deliberately a flat table of surface forms, not a stemmer:
// every entry is a word or phrase a visitor plausibly types, kept in the
// language's own script. Transliteration stays with the lexical matcher.

import { CANONICAL_PROPERTY_FAMILIES } from "./listing-facts.mjs";

// Mirrors SEARCH_OFFER_TYPES in search-intent.mjs, which imports this module
// and therefore cannot be imported back.
const OFFER_TYPES = Object.freeze(["sale", "rent"]);

// Crawl-era ids (MS-CRAWL-0013), pre-rekey short ids (MS-3000) and lot
// numbers (MS-00815) all share the MS- prefix and a digit tail.
export const SEARCH_REFERENCE_PATTERN = /^MS-(?:CRAWL-)?\d+$/iu;

export function searchReferenceFromText(value) {
  const text = String(value ?? "").trim();
  return SEARCH_REFERENCE_PATTERN.test(text) ? text.toUpperCase() : null;
}

const PROPERTY_FAMILY_WORDS = Object.freeze({
  apartment: [
    // en
    "apartment", "apartments", "flat", "flats",
    // de
    "Wohnung", "Wohnungen",
    // nl
    "appartement", "appartementen",
    // ru
    "квартира", "квартиры", "квартиру", "апартаменты",
    // bg
    "апартамент", "апартаменти",
    // el
    "διαμέρισμα", "διαμερίσματα",
    // he
    "דירה", "דירות",
  ],
  house: [
    "house", "houses", "villa", "villas",
    "Haus", "Häuser",
    "huis", "huizen",
    "дом", "дома", "вилла",
    "къща", "къщи", "вила", "вили",
    "κατοικία", "κατοικίες", "μονοκατοικία", "βίλα",
    "בית", "בתים", "וילה",
  ],
  plot: [
    "plot", "plots", "land",
    "Grundstück", "Grundstücke",
    "kavel", "kavels", "grond",
    "участок", "участки",
    "парцел", "парцели",
    "οικόπεδο", "οικόπεδα",
    "מגרש", "מגרשים",
  ],
  agricultural_land: [
    "agricultural land", "farmland",
    "Landwirtschaftsfläche",
    "landbouwgrond",
    "сельхозземля", "сельхозземли",
    "земеделска земя", "земеделски земи", "нива",
    "αγροτική γη",
    "קרקע חקלאית",
  ],
  commercial: [
    "commercial", "commercial property",
    "Gewerbeimmobilie", "Gewerbeimmobilien",
    "commercieel vastgoed", "commercieel",
    "коммерческая недвижимость", "коммерческая",
    "търговски имот", "търговски", "търговска",
    "επαγγελματικό ακίνητο", "επαγγελματικό",
    "נכס מסחרי", "מסחרי",
  ],
  hotel: [
    "hotel", "hotels",
    "отель", "отели",
    "хотел", "хотели",
    "ξενοδοχείο", "ξενοδοχεία",
    "מלון", "מלונות",
  ],
});

const OFFER_TYPE_WORDS = Object.freeze({
  rent: [
    "rent", "for rent", "to rent", "to let", "rental",
    "Miete", "zur Miete", "mieten",
    "huur", "te huur", "huren",
    "аренда", "аренду", "в аренду", "снять",
    "наем", "под наем",
    "ενοικίαση", "προς ενοικίαση",
    "להשכרה", "השכרה",
  ],
  sale: [
    "sale", "for sale", "buy",
    "Kauf", "zum Kauf", "kaufen", "Verkauf",
    "koop", "te koop", "kopen",
    "продажа", "продажу", "купить",
    "продажба", "за продажба",
    "πώληση", "προς πώληση",
    "למכירה", "מכירה",
  ],
});

function normalizeWord(value) {
  return String(value ?? "")
    .toLocaleLowerCase()
    .normalize("NFKD")
    .replace(/\p{M}/gu, "");
}

function bareToken(token) {
  return normalizeWord(token).replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
}

function buildPhrases(table, allowedValues) {
  const phrases = [];
  for (const [value, words] of Object.entries(table)) {
    if (!allowedValues.includes(value)) throw new Error(`search vocabulary names an unsupported value: ${value}`);
    for (const word of words) {
      const tokens = normalizeWord(word).split(/\s+/u).filter(Boolean);
      if (tokens.length) phrases.push({ value, tokens });
    }
  }
  // Longer phrases first so "agricultural land" wins over "land".
  return phrases.sort((a, b) => b.tokens.length - a.tokens.length);
}

const PROPERTY_FAMILY_PHRASES = buildPhrases(PROPERTY_FAMILY_WORDS, CANONICAL_PROPERTY_FAMILIES);
const OFFER_TYPE_PHRASES = buildPhrases(OFFER_TYPE_WORDS, OFFER_TYPES);

export function searchVocabularyWords() {
  return {
    property_families: Object.fromEntries(Object.entries(PROPERTY_FAMILY_WORDS).map(([key, words]) => [key, [...words]])),
    offer_types: Object.fromEntries(Object.entries(OFFER_TYPE_WORDS).map(([key, words]) => [key, [...words]])),
  };
}

function phraseAt(tokens, index, phrase) {
  if (index + phrase.tokens.length > tokens.length) return false;
  return phrase.tokens.every((token, offset) => tokens[index + offset].bare === token);
}

/**
 * Splits a text query into filter vocabulary and residual words.
 *
 * Returns the property family and offer type the text newly names (first
 * occurrence wins; a value the caller already holds is never overridden, only
 * its redundant words are dropped) and the query with every token that named
 * them removed. Words naming a different family than the chosen one stay in
 * the text, exactly as before, so a contradictory query still reads literally.
 */
export function extractSearchVocabulary(value, { propertyFamily = null, offerType = null } = {}) {
  const text = String(value ?? "").trim();
  if (!text) return { text_query: "", property_family: null, offer_type: null };
  const tokens = text.split(/\s+/u).filter(Boolean).map((raw) => ({ raw, bare: bareToken(raw), consumed: false }));

  // `false` means "never adopt one from the text": the words stay lexical.
  let family = propertyFamily === false ? false : propertyFamily || null;
  let offer = offerType === false ? false : offerType || null;
  for (const [phrases, get, set] of [
    [PROPERTY_FAMILY_PHRASES, () => family, (next) => { family = next; }],
    [OFFER_TYPE_PHRASES, () => offer, (next) => { offer = next; }],
  ]) {
    for (let index = 0; index < tokens.length; index += 1) {
      if (tokens[index].consumed || get() === false) continue;
      const phrase = phrases.find((candidate) => phraseAt(tokens, index, candidate));
      if (!phrase) continue;
      if (!get()) set(phrase.value);
      if (get() !== phrase.value) continue;
      for (let offset = 0; offset < phrase.tokens.length; offset += 1) tokens[index + offset].consumed = true;
      index += phrase.tokens.length - 1;
    }
  }

  return {
    text_query: tokens.filter((token) => !token.consumed).map((token) => token.raw).join(" "),
    property_family: typeof family === "string" && family !== propertyFamily ? family : null,
    offer_type: typeof offer === "string" && offer !== offerType ? offer : null,
  };
}
