// The one place the "Sandanski is not a sea destination" rule is expressed.
//
// It lived beside the area-guide reader, which meant the Hermes validators kept
// their own copy: a Latin-only /sandanski/i place test and a whole-word token
// list. A Bulgarian draft reading "Сандански ... на две крачки от плажа" passed
// both, because the town was spelled in Cyrillic and "плажа" is an inflected
// form the word-boundary list never matched. The rule is stated once here, in
// every script the product ships, and imported by everything that enforces it.
//
// Kept free of any I/O so the Hermes validators can import it without pulling a
// file reader into a module that only ever sees text.

// Named explicitly so the prohibition in AGENTS.md is greppable from the code
// that enforces it.
export const NEVER_A_SEA_DESTINATION = Object.freeze(["Sandanski", "Sandanski Municipality", "Melnik", "Hotovo", "Petrich"]);

// Sea vocabulary across the seven public locales plus the source language.
// Hebrew is matched on חוף (shore) and on הים followed by a non-Hebrew letter,
// because the bare ים is also the masculine plural ending and would refuse
// ordinary copy.
const SEA_CLAIM_PATTERN = new RegExp(
  [
    "\\bsea\\b",
    "\\bseaside\\b",
    "\\bseafront\\b",
    "\\bsea[- ]?views?\\b",
    "\\bbeach\\b",
    "\\bcoast(al|line)?\\b",
    "\\bshore\\b",
    "\\bwaterfront\\b",
    "мор[ея]",
    "морск",
    "крайбреж",
    "побереж",
    "плаж",
    "пляж",
    "\\bmeer\\b",
    "\\bstrand\\b",
    "\\bküste\\b",
    "\\bzee\\b",
    "\\bkust\\b",
    "θάλασσ",
    "παραλί",
    "ακτή",
    "חוף",
    "הים(?![\\u0590-\\u05FF])",
  ].join("|"),
  "iu",
);

export function containsSeaClaim(value) {
  return SEA_CLAIM_PATTERN.test(String(value || ""));
}

// The same towns as they are written in the seven public locales. A place name
// is distinctive enough to match as a substring; a word boundary would miss the
// Greek and Hebrew forms and every Slavic case ending.
const INLAND_PLACE_PATTERN = new RegExp(
  [
    "sandanski",
    "melnik",
    "hotovo",
    "petrich",
    "сандански",
    "мелник",
    "хотово",
    "петрич",
    "σαντάνσκι",
    "μέλνικ",
    "χότοβο",
    "πέτριτς",
    "סנדנסקי",
    "מלניק",
    "חוטובו",
    "פטריץ",
  ].join("|"),
  "iu",
);

export function mentionsInlandPlace(value) {
  return INLAND_PLACE_PATTERN.test(String(value || ""));
}

// The check every caller actually wants: this text talks about one of the
// inland towns AND sells it with sea vocabulary.
export function framesInlandPlaceAsSea(value) {
  return mentionsInlandPlace(value) && containsSeaClaim(value);
}
