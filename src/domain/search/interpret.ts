// Search intent interpreter (spec §01.1 decision 2, F01, F02, F29; plan AD10).
// Free text in any public locale becomes reviewable chips before any search runs. Nothing is
// applied until the visitor accepts a chip; uncertain parts stay questions and subjective wishes
// ("quiet", "center") never become hidden filters. Pure: no IO, no provider, no clock.
import type { AreaBasis, ListingPurpose, PropertyType } from "../facts";
import type { CurrencyCode, PublicLocale } from "../ids";
import type { placeLevels } from "../records";
import type { Range, SearchCriteria } from "./filters";

// Types the search UI renders. Keep them stable.

export type PlaceLevel = (typeof placeLevels)[number];

/** A reviewed place and every name it is known by (native, Latin, aliases in any locale). */
export interface InterpretPlace {
  readonly id: string;
  readonly level: PlaceLevel;
  readonly parentId: string | null;
  readonly countryCode: string;
  readonly names: readonly string[];
}

export interface TextSpan {
  /** UTF-16 offsets into the input text; `text` is exactly `input.slice(start, end)`. */
  readonly start: number;
  readonly end: number;
  readonly text: string;
}

export type ChipConfidence = "certain" | "likely";
/** `rules` = this interpreter; `assist` = proposed by the optional AI provider. */
export type ChipSource = "rules" | "assist";

/** Feature keys the interpreter can propose as must-haves. Sea view is deliberately absent. */
export const interpretedFeatureKeys = ["parking", "garden", "pool", "furnished", "lift"] as const;
export type InterpretedFeatureKey = (typeof interpretedFeatureKeys)[number];

interface ChipBase {
  /** Stable within one interpretation; `toSearchCriteria` takes accepted ids. */
  readonly id: string;
  /** The exact substring of the input this chip was read from. */
  readonly evidence: string;
  readonly span: { readonly start: number; readonly end: number };
  readonly confidence: ChipConfidence;
  readonly source: ChipSource;
}

export interface PurposeChip extends ChipBase {
  readonly kind: "purpose";
  readonly value: ListingPurpose;
}
export interface PropertyTypeChip extends ChipBase {
  readonly kind: "property_type";
  readonly value: PropertyType;
}
export interface PlaceChip extends ChipBase {
  readonly kind: "place";
  readonly placeId: string;
  /** The visitor said "near" the place; the filter still means "in" it. */
  readonly near?: boolean;
  /** Broader places with the same name (e.g. the municipality of a town). */
  readonly broader?: readonly string[];
}
export interface PriceChip extends ChipBase {
  readonly kind: "price";
  /** Minor units; the currency is as written, never converted. */
  readonly min?: number;
  readonly max?: number;
  readonly currency: CurrencyCode;
}
export interface CountChip extends ChipBase {
  readonly kind: "rooms" | "bedrooms";
  readonly min?: number;
  readonly max?: number;
}
export interface AreaChip extends ChipBase {
  readonly kind: "area";
  readonly basis: AreaBasis;
  readonly min?: number;
  readonly max?: number;
}
export interface FeatureChip extends ChipBase {
  readonly kind: "feature";
  readonly key: InterpretedFeatureKey;
}

export type Chip =
  | PurposeChip
  | PropertyTypeChip
  | PlaceChip
  | PriceChip
  | CountChip
  | AreaChip
  | FeatureChip;

export type QuestionKind =
  /** No purpose, or several: buy, rent or short stay? */
  | "purpose"
  /** A name matches unrelated places; pick one. */
  | "place"
  /** Amounts that do not form one budget (different currencies, two maxima). */
  | "price"
  | "rooms"
  | "bedrooms"
  /** An area without a stated basis: living, built or land? */
  | "area_basis"
  /** A feature was mentioned: required (accept `chipId`) or only preferred? */
  | "requirement"
  /** "Without a lift", "not ground floor": exclusions are not filters. */
  | "exclusion"
  /** Floor wishes are not filters yet. */
  | "floor"
  /** Criteria the agency does not offer as filters (sea view, beach). */
  | "unsupported";

export interface Question {
  readonly id: string;
  readonly kind: QuestionKind;
  /** Exact substring of the input; empty when the question is about something not said. */
  readonly evidence: string;
  readonly span: { readonly start: number; readonly end: number };
  /** Chips the visitor may accept as an answer; empty when the answer is not a filter. */
  readonly options: readonly Chip[];
  /** For `requirement`: the must-have chip the question is about. */
  readonly chipId?: string;
  /** For `unsupported`, `floor`, `exclusion`: what was asked for. */
  readonly topic?: string;
}

export const subjectiveTopics = ["center", "quiet", "new_build", "view", "investment"] as const;
export type PreferenceTopic = (typeof subjectiveTopics)[number] | InterpretedFeatureKey;

/** A soft wish shown as a question, never a hidden filter (F02). */
export interface Preference {
  readonly id: string;
  readonly topic: PreferenceTopic;
  readonly evidence: string;
  readonly span: { readonly start: number; readonly end: number };
  /** For a preferred feature: the must-have chip the visitor may still accept. */
  readonly options: readonly Chip[];
}

export interface Interpretation {
  readonly locale: PublicLocale;
  readonly purpose?: PurposeChip;
  readonly propertyTypes: readonly PropertyTypeChip[];
  readonly places: readonly PlaceChip[];
  readonly price?: PriceChip;
  /** Bulgarian "двустаен" and Russian "двухкомнатная" are rooms, never bedrooms. */
  readonly rooms?: CountChip;
  readonly bedrooms?: CountChip;
  readonly mustHave: readonly FeatureChip[];
  readonly preferences: readonly Preference[];
  readonly questions: readonly Question[];
  /** Text the interpreter did not understand, shown back to the visitor. */
  readonly unparsed: readonly TextSpan[];
}

export interface InterpretOptions {
  readonly locale: PublicLocale;
  readonly places: readonly InterpretPlace[];
  /** Reserved for relative stay dates; the interpreter does not read dates yet. */
  readonly now?: Date;
}

// Folded views: lower case, no diacritics, unified spaces and quotes, with a map back to the
// original offsets so every chip can quote its exact evidence.

interface View {
  readonly text: string;
  /** Original start/end offset of the character that produced each view character. */
  readonly start: readonly number[];
  readonly end: readonly number[];
}

interface Span {
  readonly start: number;
  readonly end: number;
}

const foldSpecial: Readonly<Record<string, string>> = {
  ς: "σ",
  ß: "ss",
  "²": "2",
  " ": " ",
  " ": " ",
  " ": " ",
  "\t": " ",
  "\n": " ",
  "\r": " ",
  "’": "'",
  "‘": "'",
  "׳": "'",
  "״": '"',
  "“": '"',
  "”": '"',
  "„": '"',
  "–": "-",
  "—": "-",
  "־": "-",
};

function foldChar(ch: string): string {
  return foldSpecial[ch] ?? ch.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
}

function foldView(text: string): View {
  let out = "";
  const start: number[] = [];
  const end: number[] = [];
  let offset = 0;
  for (const ch of text) {
    const folded = foldChar(ch);
    for (let k = 0; k < folded.length; k += 1) {
      start.push(offset);
      end.push(offset + ch.length);
    }
    out += folded;
    offset += ch.length;
  }
  return { text: out, start, end };
}

function fold(text: string): string {
  return foldView(text).text;
}

/** Rewrites a view left to right; `step` returns how many characters it consumed and its output. */
function rewrite(view: View, step: (text: string, i: number) => [number, string]): View {
  let out = "";
  const start: number[] = [];
  const end: number[] = [];
  for (let i = 0; i < view.text.length; ) {
    const [consumed, replacement] = step(view.text, i);
    const s = view.start[i] ?? 0;
    const e = view.end[i + consumed - 1] ?? s;
    for (let k = 0; k < replacement.length; k += 1) {
      start.push(s);
      end.push(e);
    }
    out += replacement;
    i += consumed;
  }
  return { text: out, start, end };
}

/** "a:1 b:2" → { a: "1", b: "2" }. */
function pairs(spec: string): Record<string, string> {
  return Object.fromEntries(spec.split(" ").map((pair) => pair.split(":") as [string, string]));
}

function numbers(spec: string): Record<string, number> {
  return Object.fromEntries(Object.entries(pairs(spec)).map(([k, v]) => [k, Number(v)]));
}

const cyrillicLatin: Readonly<Record<string, string>> = pairs(
  "а:a б:b в:v г:g д:d е:e ж:zh з:z и:i к:k л:l м:m н:n о:o п:p р:r с:s т:t у:u ф:f х:h ц:ts ч:ch ш:sh щ:sht ъ:a ь: ю:yu я:ya ы:y э:e",
);

const greekLatin: Readonly<Record<string, string>> = pairs(
  "α:a β:v γ:g δ:d ε:e ζ:z η:i θ:th ι:i κ:k λ:l μ:m ν:n ξ:x ο:o π:p ρ:r σ:s τ:t υ:i φ:f χ:h ψ:ps ω:o",
);

/** Greek digraphs: [pair, word-initial, word-medial]. */
const greekPairs: readonly (readonly [string, string, string])[] = [
  ["ου", "u", "u"],
  ["μπ", "b", "mb"],
  ["ντ", "d", "nd"],
  ["γκ", "g", "ng"],
  ["γγ", "ng", "ng"],
  ["αι", "e", "e"],
  ["ει", "i", "i"],
  ["οι", "i", "i"],
];

/** Spelling variants of the same sound across transliteration systems. */
const latinSkeleton: readonly (readonly [string, string])[] = [
  ["tsch", "ch"],
  ["dzh", "j"],
  ["tsj", "ch"],
  ["tch", "ch"],
  ["sch", "sh"],
  ["zh", "j"],
  ["dj", "j"],
  ["sj", "sh"],
  ["kh", "h"],
  ["ts", "c"],
  ["tz", "c"],
  ["ph", "f"],
  ["ck", "k"],
  ["y", "i"],
  ["w", "v"],
  ["q", "k"],
];

const isLetter = (ch: string | undefined) => ch !== undefined && /\p{L}/u.test(ch);

/** Cyrillic and Greek to a Latin skeleton, so "Сандански", "Sandanski" and "Σαντάνσκι" meet. */
function placeView(view: View): View {
  const latin = rewrite(view, (text, i) => {
    for (const [pair, initial, medial] of greekPairs) {
      if (text.startsWith(pair, i)) return [2, isLetter(text[i - 1]) ? medial : initial];
    }
    const ch = text[i] ?? "";
    return [1, cyrillicLatin[ch] ?? greekLatin[ch] ?? ch];
  });
  const skeleton = rewrite(latin, (text, i) => {
    for (const [from, to] of latinSkeleton) {
      if (text.startsWith(from, i)) return [from.length, to];
    }
    return [1, text[i] ?? ""];
  });
  // Doubled Latin letters collapse (Thessaloniki / Thesaloniki).
  return rewrite(skeleton, (text, i) => {
    const ch = text[i] ?? "";
    let n = 1;
    while (/[a-z]/.test(ch) && text[i + n] === ch) n += 1;
    return [n, ch];
  });
}

function placeKey(name: string): string {
  return placeView(foldView(name.trim())).text.replace(/[\s-]+/g, " ");
}

// Regex building blocks. Patterns are written in folded form (no diacritics, "й" → "и").

const B = "(?<![\\p{L}\\p{N}])";
const E = "(?![\\p{L}\\p{N}])";
const hebrewPrefix = "[ובלהמשכ]{0,2}";

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
}

/** A phrase: words separated by spaces/hyphens; a trailing `*` allows a short suffix. */
function phraseSource(phrase: string): string {
  const stem = phrase.endsWith("*");
  const body = fold(stem ? phrase.slice(0, -1) : phrase).trim();
  const words = body
    .split(/[\s-]+/)
    .map(escapeRegExp)
    .join("[\\s-]*");
  const prefix = /^[֐-׿]/.test(body) ? hebrewPrefix : "";
  return `${prefix}${words}${stem ? "\\p{L}{0,6}" : ""}`;
}

interface Lexicon<T> {
  readonly re: RegExp;
  readonly entries: readonly { readonly value: T; readonly re: RegExp }[];
}

function lexicon<T>(groups: readonly (readonly [T, readonly string[]])[]): Lexicon<T> {
  const all = groups
    .flatMap(([value, phrases]) => phrases.map((p) => ({ value, src: phraseSource(p) })))
    .sort((a, b) => b.src.length - a.src.length);
  return {
    re: new RegExp(`${B}(?:${all.map((e) => e.src).join("|")})${E}`, "gu"),
    entries: all.map((e) => ({ value: e.value, re: new RegExp(`^(?:${e.src})$`, "u") })),
  };
}

function lexiconValue<T>(lex: Lexicon<T>, matched: string): T | undefined {
  return lex.entries.find((entry) => entry.re.test(matched))?.value;
}

function alternation(words: readonly string[]): string {
  return [...words]
    .map((w) => phraseSource(w))
    .sort((a, b) => b.length - a.length)
    .join("|");
}

function words(list: string): string[] {
  return list.split("|");
}

// Lexicons (all locales at once: visitors often type another language than the page's).

const numberWords: Readonly<Record<string, number>> = numbers(
  "one:1 two:2 three:3 four:4 five:5 six:6 един:1 една:1 едно:1 два:2 две:2 три:3 четири:4 пет:5 шест:6 один:1 одна:1 двух:2 двумя:2 трех:3 тремя:3 четыре:4 пять:5 ein:1 eine:1 zwei:2 drei:3 vier:4 funf:5 sechs:6 een:1 twee:2 drie:3 vijf:5 ενα:1 μια:1 δυο:2 τρια:3 τεσσερα:4 πεντε:5 אחד:1 אחת:1 שניים:2 שתיים:2 שני:2 שתי:2 שלושה:3 שלוש:3 שלושת:3 ארבעה:4 ארבע:4 ארבעת:4 חמישה:5 חמש:5",
);

const numberWordSource = Object.keys(numberWords)
  .sort((a, b) => b.length - a.length)
  .join("|");
const countNumber = `(\\d+(?:[.,]5)?|${numberWordSource})`;
const amountNumber = "(\\d{1,3}(?:[ .,']\\d{3})+|\\d+(?:[.,]\\d{1,2})?)";

const maxWords = words(
  "up to|upto|under|below|less than|no more than|not more than|max|maximum|within|до|под|максимум|макс|не повече от|не над|не более|не дороже|дешевле|менее|bis|bis zu|unter|höchstens|maximal|tot|onder|maximaal|hooguit|έως|ως|μέχρι|κάτω από|το πολύ|עד|מתחת ל|לא יותר מ|מקסימום",
);
const minWords = words(
  "from|over|above|at least|more than|min|minimum|starting at|between|от|над|поне|минимум|мин|не по-малко от|между|свыше|более|не менее|не дешевле|больше|ab|über|mindestens|von|zwischen|vanaf|boven|minimaal|minstens|meer dan|tussen|από|πάνω από|τουλάχιστον|μεταξύ|מ|מעל|לפחות|החל מ|בין",
);
const orMoreWords = words(
  "or more|and more|and up|или повече|и повече|или больше|и более|и больше|oder mehr|und mehr|of meer|ή περισσότερα|και πάνω|או יותר|ומעלה",
);
const rangeJoin = "(?:-|to|and|и|до|und|bis|en|tot|και|εως|μεχρι|ως|עד|ו|ל-?|or|или|oder|of|ή|או)";

const boundBefore = (words: readonly string[]) =>
  new RegExp(`(?:^|[^\\p{L}\\p{N}])(?:${alternation(words)})[\\s-]*$`, "u");
const maxBefore = boundBefore(maxWords);
const minBefore = boundBefore(minWords);
const orMoreAfter = new RegExp(`^\\s*(?:${alternation(orMoreWords)})${E}`, "u");

const currencyWords: readonly (readonly [CurrencyCode, readonly string[]])[] = [
  ["EUR", words("€|eur|euro|euros|evro|евро|евра|ευρώ|אירו|יורו")],
  ["BGN", words("лв.|лв|лева|лев|bgn|leva|lv")],
  ["USD", words("$|usd|dollar|dollars|долара|долар|долларов|доллара|доллар|דולר")],
  ["GBP", words("£|gbp|pound|pounds|паунда|фунтов|фунта|фунт")],
];
const currencyByWord = new Map(
  currencyWords.flatMap(([code, words]) => words.map((w) => [fold(w), code] as const)),
);
const currencySource = [...currencyByWord.keys()]
  .sort((a, b) => b.length - a.length)
  .map(escapeRegExp)
  .join("|");

const multipliers: readonly (readonly [number, readonly string[]])[] = [
  [
    1_000,
    words(
      "k|к|хил.|хил|хиляди|хиляда|тыс.|тыс|тысяч|тысяча|тысячи|tsd.|tsd|tausend|duizend|χιλ.|χιλ|χιλιάδες|אלף|אלפים",
    ),
  ],
  [
    1_000_000,
    words(
      "m|mln|mln.|mio|mio.|million|millionen|miljoen|млн|млн.|милион|милиона|миллион|миллиона|εκατ.|εκατομμύριο|εκατομμύρια|מיליון",
    ),
  ],
];
const multiplierByWord = new Map(
  multipliers.flatMap(([factor, words]) => words.map((w) => [fold(w), factor] as const)),
);
const multiplierSource = [...multiplierByWord.keys()]
  .sort((a, b) => b.length - a.length)
  .map(escapeRegExp)
  .join("|");

const amountRe = new RegExp(
  `${B}(?:(${currencySource})\\s?)?${amountNumber}(?:\\s?(${multiplierSource})(?![\\p{L}\\p{N}]))?(?:\\s?(${currencySource})(?!\\p{L}))?`,
  "gu",
);

const periodAfter = new RegExp(
  `^\\s*(?:/\\s*|(?:per|a|an|на|в|за|pro|im|het|το|ανα|τον|την)\\s+)?(?:(month|monthly|mo|pcm|месец|месеца|месечно|мес|месяц|monat|monatlich|maand|μηνα|μηνιαιως|ל?חודש)|(night|nightly|нощ|нощувка|ночь|сутки|nacht|βραδια|βραδυ|ל?לילה))${E}`,
  "u",
);

const areaRe = new RegExp(
  `${B}${amountNumber}(?:\\s*${rangeJoin}\\s*${amountNumber})?\\s*(?:m2|м2|кв\\.?\\s*м\\.?|квм|кв\\.?\\s*метр\\p{L}*|квадратн\\p{L}*\\s+метр\\p{L}*|sq\\.?\\s*m|sqm|sq\\.?\\s*ft|square\\s+met(?:er|re)s?|qm|quadratmeter|τ\\.?\\s*μ\\.?|τμ|μ2|מ"ר|מטר(?:ים)?(?:\\s+רבוע(?:ים)?)?)(?![\\p{L}\\p{N}])`,
  "gu",
);

const bedroomWords =
  "bed(?:room)?s?|br|bd|bdr|bdrm|спалн\\p{L}*|спальн\\p{L}*|schlafzimmer\\p{L}*|slaapkamers?|υπνοδωματι\\p{L}*|חדרי\\s+שינה|חדר\\s+שינה";
const roomWords = "rooms?|стаи|стая|комнат\\p{L}*|zimmer|kamers?|δωματι\\p{L}*|חדרים|חדר";
const countPrefix = `${B}${countNumber}(?:\\s*${rangeJoin}\\s*${countNumber})?\\s*(\\+)?\\s*-?\\s*`;
const bedroomRe = new RegExp(`${countPrefix}(?:${bedroomWords})${E}`, "gu");
const roomRe = new RegExp(
  `${countPrefix}(?:${roomWords})(-?(?:wohnung|appartement|apartment|woning))?${E}`,
  "gu",
);
// Bulgarian "двустаен" and Russian "двухкомнатная": a room count, and an apartment by default.
const adjectiveRooms: Readonly<Record<string, number>> = numbers(
  "едно:1 дву:2 три:3 четири:4 пет:5 одно:1 двух:2 трех:3 четырех:4 пяти:5",
);
const bgRoomsRe = new RegExp(
  `${B}(едно|дву|три|четири|пет|много|\\d)\\s*-?\\s*ста(?:ен|ин[аио])${E}`,
  "gu",
);
const ruRoomsRe = new RegExp(
  `${B}(одно|двух|трех|четырех|пяти|много|\\d)\\s*-?\\s*комнатн\\p{L}*${E}`,
  "gu",
);
/** Words that name a room count and an apartment at once; confidence "likely" for studios. */
const roomNouns = lexicon<readonly [number, ChipConfidence]>([
  [
    [1, "certain"],
    ["однушка*", "однушк*"],
  ],
  [
    [2, "certain"],
    ["двушк*", "δυάρι*"],
  ],
  [
    [3, "certain"],
    ["трешк*", "τριάρι*"],
  ],
  [[4, "certain"], ["τεσσάρι*"]],
  [[1, "likely"], words("гарсониер*|студио|студия|студию|studio|studios|γκαρσονιέρ*")],
]);

const propertyTypes = lexicon<PropertyType>([
  [
    "apartment",
    words(
      "апартамент*|мезонет*|apartment*|flat|flats|condo|condos|penthouse|квартир*|wohnung|wohnungen|eigentumswohnung|appartement*|διαμέρισμα*|διαμερίσματα|דירה|דירת|דירות|פנטהאוז",
    ),
  ],
  [
    "house",
    words(
      "къща|къщи|къщата|къщичка|вила|вили|house|houses|villa|villas|cottage|townhouse|дом|дома|домик|коттедж*|таунхаус|вилла|виллу|haus|häuser|einfamilienhaus|reihenhaus|huis|huizen|woonhuis|vrijstaand*|σπίτι*|μονοκατοικία*|βίλα|βίλες|בית|בתים|וילה|קוטג'",
    ),
  ],
  [
    "plot",
    words(
      "парцел*|земя|земеделска земя|упи|plot|plots|land|building plot|участок|участка|участки|земельный участок|земля|землю|grundstück|grundstücke|bauland|perceel|percelen|bouwgrond|grond|οικόπεδο*|οικόπεδα|αγροτεμάχιο*|מגרש|קרקע",
    ),
  ],
  ["hotel", words("хотел*|hotel*|отель|отеля|гостиниц*|ξενοδοχείο*|מלון")],
]);
/** Commercial words double as amenities ("near shops"), so they are only ever "likely". */
const commercialTypes = lexicon<PropertyType>([
  [
    "commercial",
    words(
      "магазин|офис|търговски имот|shop|office|commercial|retail|коммерческ*|gewerbe*|laden|büro|winkel|kantoor|bedrijfspand|κατάστημα|γραφείο|חנות|משרד",
    ),
  ],
]);

const purposes = lexicon<ListingPurpose>([
  [
    "sale",
    words(
      "купя|купувам|купуване|покупка|за продажба|продажба|buy|buying|purchase|for sale|купить|куплю|покупку|продажа|продажу|kaufen|kauf|zu verkaufen|zum kauf|kopen|te koop|αγορά|αγοράσω|προς πώληση|πωλείται|לקנות|קנייה|קניה|למכירה",
    ),
  ],
  [
    "long_term_rent",
    words(
      "наем|под наем|да наема|наемам|rent|to rent|for rent|rental|renting|аренда|аренду|в аренду|снять|сниму|mieten|miete|zu vermieten|zur miete|huren|te huur|huur|ενοικίαση|ενοικιάζεται|νοικιάσω|להשכרה|לשכור|שכירות",
    ),
  ],
  [
    "short_stay",
    words(
      "нощувка|нощувки|краткосрочен наем|holiday rental|vacation rental|short stay|short term rental|посуточно|на сутки|vakantiewoning|ferienwohnung|βραχυχρόνια μίσθωση|צימר",
    ),
  ],
]);

const features = lexicon<InterpretedFeatureKey>([
  [
    "parking",
    words(
      "паркомясто|паркомястото|паркоместа|паркинг|паркинга|гараж*|място за паркиране|parking|parking space|parking spot|car park|garage|garages|carport|парковк*|парковочное место|машиномест*|parkplatz|parkplätze|stellplatz|stellplätze|tiefgarage|parkeerplaats|parkeerplaatsen|parkeren|πάρκινγκ|θέση στάθμευσης|γκαράζ|חניה|חנייה|חניון",
    ),
  ],
  [
    "garden",
    words(
      "двор|двора|дворът|дворно място|градин*|garden|gardens|yard|backyard|сад|садом|двором|garten|tuin|κήπο*|κήπος|αυλή|גינה|חצר",
    ),
  ],
  [
    "pool",
    words(
      "басейн*|pool|swimming pool|бассейн*|schwimmbad|swimmingpool|zwembad|πισίνα*|בריכה|בריכת שחייה",
    ),
  ],
  [
    "furnished",
    words(
      "обзаведен*|обзавеждане|мебелиран*|мебели|furnished|мебель|мебелью|меблирован*|möbliert|gemeubileerd|gemeubeld|επιπλωμένο*|επιπλωμένη|מרוהטת|מרוהט|ריהוט",
    ),
  ],
  ["lift", words("асансьор*|lift|elevator|лифт*|aufzug|fahrstuhl|ασανσέρ|ανελκυστήρα*|מעלית")],
]);
/** Negative forms of a feature: an exclusion, never a filter. */
const negatedFeatures = lexicon<InterpretedFeatureKey>([
  [
    "furnished",
    words("необзаведен*|unfurnished|немеблирован*|unmöbliert|ongemeubileerd|ongemeubeld"),
  ],
]);

const negationBefore = new RegExp(
  `(?:^|[^\\p{L}\\p{N}])(?:${alternation(words("no|not|without|non|never|без|не|ohne|nicht|kein|keine|keinen|zonder|geen|niet|χωρίς|όχι|μη|בלי|ללא|לא|אין"))})\\s+(?:(?:on|the|a|an|in|at|на|в|във|с|im|am|in|der|dem|den|op|de|het|σε|στο|στον|στη|στην|το|τον|την)\\s+){0,2}$`,
  "u",
);
const mustBefore = new RegExp(
  `(?:^|[^\\p{L}\\p{N}])(?:${alternation(words("must have|must|required|essential|задължително|задължителен|обязательно|непременно|unbedingt|zwingend|verplicht|moet|απαραίτητα|απαραίτητο|חובה"))})\\s+(?:(?:with|a|an|the|have|с|със|mit|met|με|עם)\\s+){0,2}$`,
  "u",
);
/** A marker after a feature counts only when it closes the clause ("parking is a must."). */
const clauseEnd = "(?=\\s*(?:$|[,.;:!?]))";
const mustAfter = new RegExp(
  `^[\\s,]*(?:is\\s+)?(?:a\\s+)?(?:${alternation(words("must|required|essential|задължително|обязательно|unbedingt|verplicht|απαραίτητα|חובה"))})${clauseEnd}`,
  "u",
);
const preferWords = words(
  "ideally|preferably|nice to have|if possible|желателно|по възможност|за предпочитане|желательно|по возможности|idealerweise|am liebsten|wenn möglich|möglichst|bij voorkeur|liefst|idealiter|κατά προτίμηση|ιδανικά|רצוי|עדיף",
);
const preferBefore = new RegExp(
  `(?:^|[^\\p{L}\\p{N}])(?:${alternation(preferWords)})[\\s,]+(?:(?:with|a|an|the|с|със|mit|met|με|עם)\\s+){0,2}$`,
  "u",
);
const preferAfter = new RegExp(`^[\\s,]*(?:${alternation(preferWords)})${clauseEnd}`, "u");

const floorRe = new RegExp(
  `${B}(?:${alternation(words("ground floor|first floor|top floor|last floor|upper floor|партер|партерен|първи етаж|последен етаж|последния етаж|последният етаж|висок етаж|нисък етаж|първия етаж|первый этаж|первом этаже|последний этаж|последнем этаже|цокольный этаж|erdgeschoss|dachgeschoss|obergeschoss|oberste etage|obersten etage|letzte etage|begane grond|bovenste verdieping|benedenverdieping|gelijkvloers|ισόγειο|τελευταίο όροφο|τελευταίος όροφος|ρετιρέ|υπόγειο|קומת קרקע|קומה אחרונה|קומה ראשונה"))}|\\d+\\s*(?:st|nd|rd|th|-?(?:и|ри|ти|ми|ви|й|м|ой|ом|е|\\.|ος|ο|η))?\\s*(?:floor|етаж|этаж\\p{L}*|etage|stock|verdieping|όροφο\\p{L}*|οροφο\\p{L}*)|(?:[ובלהמשכ]{0,2})קומה\\s+\\d+)${E}`,
  "gu",
);

const seaRe = new RegExp(
  `${B}(?:${alternation(words("sea view|sea views|view of the sea|seaside|sea|beach|coast|ocean|seafront|морска гледка|гледка към морето|изглед към морето|море|морето|морски|морска|плаж|плажа|вид на море|видом на море|моря|морем|пляж*|побережь*|meerblick|meer|strand|küste|zeezicht|zee|kust|θέα θάλασσα|θάλασσα*|παραλία*|נוף לים|ים|חוף"))})${E}`,
  "gu",
);

const subjective = lexicon<(typeof subjectiveTopics)[number]>([
  [
    "center",
    words(
      "център|центъра|централн*|center|centre|central|downtown|city centre|city center|центр|центре|центра|центральн*|zentrum|zentral|zentrale|innenstadt|centrum|centraal|κέντρο|κεντρικό*|κεντρική|מרכז|מרכז העיר",
    ),
  ],
  [
    "quiet",
    words(
      "тих|тиха|тихо|тихи|спокоен|спокойн*|quiet|calm|peaceful|тихий|тихом|тихое|тихая|ruhig*|rustig*|ήσυχο*|ήσυχη|ησυχία|שקט|שקטה|שקטים",
    ),
  ],
  [
    "new_build",
    words(
      "ново строителство|нова сграда|новострой*|new build|newly built|new construction|новостройк*|neubau|nieuwbouw|νεόδμητο*|בנייה חדשה",
    ),
  ],
  ["view", words("гледка|изглед|view|views|вид|aussicht|uitzicht|θέα|נוף")],
  [
    "investment",
    words(
      "инвестиция|инвестиционен|investment|инвестиций|инвестиции|investition|investering|επένδυση|השקעה",
    ),
  ],
]);

const nearBefore = new RegExp(
  `(?:^|[^\\p{L}\\p{N}])(?:${alternation(words("near|close to|around|near to|близо до|около|край|в района на|рядом с|возле|недалеко от|in der nähe von|nahe|bei|in de buurt van|nabij|κοντά σε|κοντά στο|κοντά στη|κοντά στην|ליד|סמוך ל|באזור"))})\\s*$`,
  "u",
);

const stopwords = new Set(
  [
    // bg
    ...words(
      "в|във|на|с|със|и|за|да|от|до|по|при|близо|около|търся|искам|ми|ме|се|или|а|е|към|бюджет|имот|една|един|едно",
    ),
    // en
    ...words(
      "a|an|the|in|at|on|of|for|with|and|or|to|i|im|i'm|want|looking|need|near|around|close|some|please|is|me|my|budget|property|ideally|preferably|must|have",
    ),
    // ru
    ...words(
      "во|со|для|у|рядом|хочу|ищу|нужна|нужен|нужно|мне|я|возле|бюджетом|обязательно|желательно",
    ),
    // de
    ...words(
      "im|am|an|auf|mit|und|oder|fur|eine|ein|einen|einer|die|der|das|den|dem|ich|suche|zu|bei|nahe",
    ),
    // nl
    ...words("op|met|en|of|een|de|het|te|voor|ik|zoek|nabij|van"),
    // el
    ...words("σε|στο|στη|στην|με|και|η|για|ενα|μια|ψαχνω|θελω|κοντα|το|τη|την|του|της|ο"),
    // he
    ...words("ב|ל|של|עם|ו|את|אני|מחפש|מחפשת|רוצה|ליד|באזור|או|גם|תקציב"),
  ].map(fold),
);

// Scanning.

class Scan {
  readonly view: View;
  private readonly claims: Span[] = [];

  constructor(readonly text: string) {
    this.view = foldView(text);
  }

  toOriginal(view: View, start: number, end: number): Span {
    return { start: view.start[start] ?? 0, end: view.end[end - 1] ?? 0 };
  }

  isFree(span: Span): boolean {
    return this.claims.every((c) => span.end <= c.start || span.start >= c.end);
  }

  claim(span: Span): void {
    this.claims.push(span);
  }

  isClaimed(span: Span): boolean {
    return !this.isFree(span);
  }

  /** Unclaimed matches of `re` in `view`, mapped to original offsets. */
  *matches(re: RegExp, view: View = this.view): Generator<[RegExpExecArray, Span]> {
    re.lastIndex = 0;
    for (let m = re.exec(view.text); m; m = re.exec(view.text)) {
      if (m[0].length === 0) {
        re.lastIndex += 1;
        continue;
      }
      const span = this.toOriginal(view, m.index, m.index + m[0].length);
      if (this.isFree(span)) yield [m, span];
    }
  }

  /** Where `re` (anchored with `$`) matches in the text just before `pos`; original offset. */
  before(pos: number, re: RegExp, window = 48): number | null {
    let lo = Math.max(0, pos - window);
    while (lo > 0 && /[\p{L}\p{N}]/u.test(this.text[lo - 1] ?? "")) lo -= 1;
    const view = foldView(this.text.slice(lo, pos));
    const m = re.exec(view.text);
    if (!m) return null;
    // Skip the boundary character the pattern consumed.
    const lead = m[0].search(/[\p{L}\p{N}€$£]/u);
    const at = m.index + Math.max(0, lead);
    return lo + (view.start[at] ?? 0);
  }

  /** Where `re` (anchored with `^`) matches right after `pos`: [end offset, match]. */
  after(pos: number, re: RegExp, window = 48): [number, RegExpExecArray] | null {
    const view = foldView(this.text.slice(pos, pos + window));
    const m = re.exec(view.text);
    if (!m || m[0].length === 0) return null;
    return [pos + (view.end[m.index + m[0].length - 1] ?? 0), m];
  }

  slice(span: Span): string {
    return this.text.slice(span.start, span.end);
  }
}

function base(scan: Scan, id: string, span: Span, confidence: ChipConfidence) {
  return {
    id,
    evidence: scan.slice(span),
    span: { start: span.start, end: span.end },
    confidence,
    source: "rules" as const,
  };
}

function parseAmount(raw: string): number {
  if (/^\d{1,3}(?:[ .,']\d{3})+$/.test(raw)) return Number(raw.replace(/[ .,']/g, ""));
  return Number(raw.replace(",", "."));
}

function parseCount(raw: string | undefined): number | undefined {
  if (raw === undefined) return undefined;
  const word = numberWords[raw];
  if (word !== undefined) return word;
  const value = Number(raw.replace(",", "."));
  return Number.isFinite(value) ? value : undefined;
}

interface PricePart {
  readonly span: Span;
  readonly min?: number;
  readonly max?: number;
  readonly currency: CurrencyCode;
  readonly confidence: ChipConfidence;
}

interface Draft {
  readonly purposes: PurposeChip[];
  readonly types: PropertyTypeChip[];
  readonly places: PlaceChip[];
  readonly prices: PricePart[];
  readonly rooms: CountChip[];
  readonly bedrooms: CountChip[];
  readonly features: FeatureChip[];
  readonly preferences: Preference[];
  readonly questions: Question[];
  /** A room word that also names an apartment ("двустаен", "3-Zimmer-Wohnung"). */
  impliedApartment: { readonly span: Span; readonly confidence: ChipConfidence } | null;
}

const minConfidence = (...values: ChipConfidence[]): ChipConfidence =>
  values.includes("likely") ? "likely" : "certain";

function countBounds(
  scan: Scan,
  span: Span,
  first: number,
  second: number | undefined,
  plus: boolean,
): { min?: number; max?: number; span: Span } {
  if (second !== undefined)
    return { min: Math.min(first, second), max: Math.max(first, second), span };
  const orMore = scan.after(span.end, orMoreAfter);
  if (plus || orMore) {
    return { min: first, span: orMore ? { start: span.start, end: orMore[0] } : span };
  }
  const minAt = scan.before(span.start, minBefore);
  if (minAt !== null) return { min: first, span: { start: minAt, end: span.end } };
  const maxAt = scan.before(span.start, maxBefore);
  if (maxAt !== null) return { max: first, span: { start: maxAt, end: span.end } };
  return { min: first, max: first, span };
}

function scanAreas(scan: Scan, draft: Draft): void {
  let n = 0;
  for (const [m, span] of scan.matches(areaRe)) {
    const first = parseAmount(m[1] ?? "");
    const second = m[2] === undefined ? undefined : parseAmount(m[2]);
    let bounds: { min?: number; max?: number };
    let full = span;
    if (second !== undefined) {
      bounds = { min: Math.min(first, second), max: Math.max(first, second) };
    } else {
      const maxAt = scan.before(span.start, maxBefore);
      const minAt = maxAt === null ? scan.before(span.start, minBefore) : null;
      bounds = maxAt !== null ? { max: first } : { min: first };
      const at = maxAt ?? minAt;
      if (at !== null) full = { start: at, end: span.end };
    }
    scan.claim(full);
    const suffix = n === 0 ? "" : `:${n}`;
    const options: AreaChip[] = (["living", "built", "land"] as const).map((basis) => ({
      ...base(scan, `area${suffix}:${basis}`, full, "likely"),
      kind: "area",
      basis,
      ...bounds,
    }));
    draft.questions.push({
      id: `q:area${suffix}`,
      kind: "area_basis",
      ...evidenceOf(scan, full),
      options,
    });
    n += 1;
  }
}

function evidenceOf(scan: Scan, span: Span) {
  return { evidence: scan.slice(span), span: { start: span.start, end: span.end } };
}

function scanCounts(scan: Scan, draft: Draft): void {
  const push = (
    kind: "rooms" | "bedrooms",
    bounds: { min?: number; max?: number; span: Span },
    confidence: ChipConfidence,
  ) => {
    scan.claim(bounds.span);
    const list = kind === "rooms" ? draft.rooms : draft.bedrooms;
    const { span, ...range } = bounds;
    list.push({ ...base(scan, kind, span, confidence), kind, ...range });
  };

  for (const re of [bgRoomsRe, ruRoomsRe]) {
    for (const [m, span] of scan.matches(re)) {
      const prefix = m[1] ?? "";
      if (prefix === "много") {
        push("rooms", { min: 4, span }, "likely");
      } else {
        const value = adjectiveRooms[prefix] ?? Number(prefix);
        push("rooms", countBounds(scan, span, value, undefined, false), "certain");
      }
      draft.impliedApartment ??= { span, confidence: "likely" };
    }
  }
  for (const [m, span] of scan.matches(roomNouns.re)) {
    const [value, confidence] = lexiconValue(roomNouns, m[0]) ?? [1, "likely"];
    push("rooms", { min: value, max: value, span }, confidence);
    draft.impliedApartment ??= { span, confidence };
  }
  for (const [kind, re] of [
    ["bedrooms", bedroomRe],
    ["rooms", roomRe],
  ] as const) {
    for (const [m, span] of scan.matches(re)) {
      const first = parseCount(m[1]);
      if (first === undefined || first > 50) continue;
      push(kind, countBounds(scan, span, first, parseCount(m[2]), m[3] === "+"), "certain");
      if (kind === "rooms" && m[4]) draft.impliedApartment ??= { span, confidence: "certain" };
    }
  }
}

function scanPrices(scan: Scan, draft: Draft): void {
  interface Amount {
    span: Span;
    raw: number;
    factor?: number;
    currency?: CurrencyCode;
    viewEnd: number;
    viewStart: number;
  }
  const amounts: Amount[] = [];
  for (const [m, span] of scan.matches(amountRe)) {
    const pre = m[1] === undefined ? undefined : currencyByWord.get(m[1]);
    const post = m[4] === undefined ? undefined : currencyByWord.get(m[4]);
    const factor = m[3] === undefined ? undefined : multiplierByWord.get(m[3]);
    amounts.push({
      span,
      raw: parseAmount(m[2] ?? ""),
      ...(factor === undefined ? {} : { factor }),
      ...((pre ?? post) === undefined ? {} : { currency: pre ?? post }),
      viewStart: m.index,
      viewEnd: m.index + m[0].length,
    });
  }

  const rangeGap = new RegExp(`^\\s*${rangeJoin}\\s*$`, "u");
  const groups: Amount[][] = [];
  for (let i = 0; i < amounts.length; i += 1) {
    const a = amounts[i];
    const b = amounts[i + 1];
    if (!a) continue;
    const sameCurrency = !a?.currency || !b?.currency || a.currency === b.currency;
    if (b && sameCurrency && rangeGap.test(scan.view.text.slice(a.viewEnd, b.viewStart))) {
      // "100-150k", "от 100 до 150 хил. евро": the later unit and currency cover both.
      if (a.factor === undefined && b.factor !== undefined && a.raw < b.raw) a.factor = b.factor;
      a.currency ??= b.currency;
      b.currency ??= a.currency;
      groups.push([a, b]);
      i += 1;
    } else {
      groups.push([a]);
    }
  }

  for (const group of groups) {
    const [a, b] = group;
    if (!a) continue;
    const value = (x: Amount) => x.raw * (x.factor ?? 1);
    const explicit = group.some((x) => x.currency !== undefined || x.factor !== undefined);
    const maxAt = scan.before(a.span.start, maxBefore);
    const minAt = maxAt === null ? scan.before(a.span.start, minBefore) : null;
    const bounded = maxAt !== null || minAt !== null || b !== undefined;
    const v = value(a);
    // A bare number (a year, a phone number, a plot size) is not a budget.
    if (!explicit && (!bounded || v < 1000)) continue;

    const last = b ?? a;
    let end = last.span.end;
    const period = scan.after(end, periodAfter);
    if (period) {
      end = period[0];
      const purpose: ListingPurpose = period[1][1] ? "long_term_rent" : "short_stay";
      const periodSpan = { start: last.span.end, end };
      const trimmed = trimSpan(scan.text, periodSpan);
      draft.purposes.push({
        ...base(scan, `purpose:${purpose}`, trimmed, "likely"),
        kind: "purpose",
        value: purpose,
      });
    }
    const start = maxAt ?? minAt ?? a.span.start;
    const span = { start, end };
    scan.claim(span);
    const currency = a.currency ?? "EUR";
    const minor = (x: Amount) => Math.round(value(x) * 100);
    const bounds = b
      ? { min: Math.min(minor(a), minor(b)), max: Math.max(minor(a), minor(b)) }
      : minAt !== null
        ? { min: minor(a) }
        : { max: minor(a) };
    draft.prices.push({
      span,
      ...bounds,
      currency,
      confidence: a.currency !== undefined && bounded ? "certain" : "likely",
    });
  }
}

function trimSpan(text: string, span: Span): Span {
  let { start, end } = span;
  while (start < end && /[\s/,]/.test(text[start] ?? "")) start += 1;
  while (end > start && /\s/.test(text[end - 1] ?? "")) end -= 1;
  return { start, end };
}

interface PlaceMatcher {
  readonly re: RegExp | null;
  readonly byKey: ReadonlyMap<string, readonly string[]>;
  readonly byId: ReadonlyMap<string, InterpretPlace>;
}

const caseEndings = "ami|ah|am|ov|om|em|oi|a|e|i|u";

/** The places a matched (possibly inflected) name stands for. */
function resolvePlaceKey(matcher: PlaceMatcher, matched: string): readonly string[] {
  const direct = matcher.byKey.get(matched);
  if (direct) return direct;
  for (const ending of caseEndings.split("|")) {
    if (!matched.endsWith(ending)) continue;
    const stem = matched.slice(0, -ending.length);
    for (const candidate of [stem, ...["a", "e", "i", "o", "u"].map((v) => stem + v)]) {
      const ids = matcher.byKey.get(candidate);
      if (ids) return ids;
    }
  }
  return [];
}

const matcherCache = new WeakMap<readonly InterpretPlace[], PlaceMatcher>();

function placeMatcher(places: readonly InterpretPlace[]): PlaceMatcher {
  const cached = matcherCache.get(places);
  if (cached) return cached;
  const byKey = new Map<string, string[]>();
  for (const place of places) {
    for (const name of place.names) {
      const key = placeKey(name);
      if (key.replace(/[\s-]/g, "").length < 3) continue;
      const ids = byKey.get(key) ?? [];
      if (!ids.includes(place.id)) ids.push(place.id);
      byKey.set(key, ids);
    }
  }
  const alternatives = [...byKey.keys()]
    .sort((a, b) => b.length - a.length)
    .map((key) => {
      const src = key.split(" ").map(escapeRegExp).join("[\\s-]+");
      // Russian case endings: "Петрича", "Салониках" (a final vowel may be replaced).
      const vowel = /[aeiou]$/.exec(key)?.[0];
      return vowel ? `${src.slice(0, -1)}(?:${vowel}|${caseEndings})` : `${src}(?:${caseEndings})?`;
    });
  const matcher: PlaceMatcher = {
    re:
      alternatives.length === 0
        ? null
        : new RegExp(`${B}${hebrewPrefix}(${alternatives.join("|")})${E}`, "gu"),
    byKey,
    byId: new Map(places.map((p) => [p.id, p])),
  };
  matcherCache.set(places, matcher);
  return matcher;
}

function ancestors(matcher: PlaceMatcher, id: string): Set<string> {
  const seen = new Set<string>();
  for (
    let p = matcher.byId.get(id)?.parentId;
    p && !seen.has(p);
    p = matcher.byId.get(p)?.parentId
  ) {
    seen.add(p);
  }
  return seen;
}

const levelRank = (matcher: PlaceMatcher, id: string) =>
  words("country|district|municipality|settlement|neighborhood").indexOf(
    matcher.byId.get(id)?.level ?? "country",
  );

function scanPlaces(scan: Scan, draft: Draft, places: readonly InterpretPlace[]): void {
  const matcher = placeMatcher(places);
  if (!matcher.re) return;
  const view = placeView(scan.view);
  let ambiguous = 0;
  for (const [m, span] of scan.matches(matcher.re, view)) {
    const ids = resolvePlaceKey(matcher, (m[1] ?? "").replace(/[\s-]+/g, " "));
    if (ids.length === 0) continue;
    const nearAt = scan.before(span.start, nearBefore);
    const full = nearAt === null ? span : { start: nearAt, end: span.end };
    scan.claim(full);
    const confidence: ChipConfidence = nearAt === null ? "certain" : "likely";
    const chip = (
      placeId: string,
      c: ChipConfidence,
      broader: readonly string[] = [],
    ): PlaceChip => ({
      ...base(scan, `place:${placeId}`, full, c),
      kind: "place",
      placeId,
      ...(nearAt === null ? {} : { near: true }),
      ...(broader.length > 0 ? { broader } : {}),
    });
    // A town and its same-named municipality is one choice (the town); anything else is asked.
    const specific =
      [...ids].sort((a, b) => levelRank(matcher, b) - levelRank(matcher, a))[0] ?? "";
    const up = ancestors(matcher, specific);
    const others = ids.filter((id) => id !== specific);
    if (others.every((id) => up.has(id))) {
      draft.places.push(chip(specific, confidence, others));
    } else {
      draft.questions.push({
        id: `q:place${ambiguous === 0 ? "" : `:${ambiguous}`}`,
        kind: "place",
        ...evidenceOf(scan, full),
        options: ids.map((id) => chip(id, "likely")),
      });
      ambiguous += 1;
    }
  }
}

function scanUnsupported(scan: Scan, draft: Draft): void {
  let n = 0;
  for (const [, span] of scan.matches(seaRe)) {
    scan.claim(span);
    draft.questions.push({
      id: `q:unsupported:sea${n === 0 ? "" : `:${n}`}`,
      kind: "unsupported",
      topic: "sea",
      ...evidenceOf(scan, span),
      options: [],
    });
    n += 1;
  }
  n = 0;
  for (const [, span] of scan.matches(floorRe)) {
    const negAt = scan.before(span.start, negationBefore);
    const full = negAt === null ? span : { start: negAt, end: span.end };
    scan.claim(full);
    draft.questions.push({
      id: `q:floor${n === 0 ? "" : `:${n}`}`,
      kind: negAt === null ? "floor" : "exclusion",
      topic: "floor",
      ...evidenceOf(scan, full),
      options: [],
    });
    n += 1;
  }
}

function scanFeatures(scan: Scan, draft: Draft): void {
  let exclusions = 0;
  const exclude = (key: string, span: Span) => {
    scan.claim(span);
    draft.questions.push({
      id: `q:exclusion${exclusions === 0 ? "" : `:${exclusions}`}`,
      kind: "exclusion",
      topic: key,
      ...evidenceOf(scan, span),
      options: [],
    });
    exclusions += 1;
  };
  for (const [m, span] of scan.matches(negatedFeatures.re)) {
    exclude(lexiconValue(negatedFeatures, m[0]) ?? "furnished", span);
  }
  for (const [m, span] of scan.matches(features.re)) {
    const key = lexiconValue(features, m[0]);
    if (!key) continue;
    const negAt = scan.before(span.start, negationBefore);
    if (negAt !== null) {
      exclude(key, { start: negAt, end: span.end });
      continue;
    }
    scan.claim(span);
    const chipOf = (confidence: ChipConfidence): FeatureChip => ({
      ...base(scan, `feature:${key}`, span, confidence),
      kind: "feature",
      key,
    });
    // A marker word ("ideally", "задължително") is understood, so it is claimed too.
    const marker = (before: RegExp, after: RegExp): boolean => {
      const start = scan.before(span.start, before);
      if (start !== null) scan.claim({ start, end: span.start });
      const end = scan.after(span.end, after)?.[0];
      if (end !== undefined) scan.claim({ start: span.end, end });
      return start !== null || end !== undefined;
    };
    if (marker(preferBefore, preferAfter)) {
      draft.preferences.push({
        id: `pref:${key}`,
        topic: key,
        ...evidenceOf(scan, span),
        options: [chipOf("likely")],
      });
    } else {
      draft.features.push(chipOf(marker(mustBefore, mustAfter) ? "certain" : "likely"));
    }
  }
}

function scanWords(scan: Scan, draft: Draft): void {
  for (const [lex, confidence] of [
    [propertyTypes, "certain"],
    [commercialTypes, "likely"],
  ] as const) {
    for (const [m, span] of scan.matches(lex.re)) {
      const value = lexiconValue(lex, m[0]);
      if (!value) continue;
      scan.claim(span);
      draft.types.push({
        ...base(scan, `type:${value}`, span, confidence),
        kind: "property_type",
        value,
      });
    }
  }
  for (const [m, span] of scan.matches(purposes.re)) {
    const value = lexiconValue(purposes, m[0]);
    if (!value) continue;
    scan.claim(span);
    draft.purposes.push({
      ...base(scan, `purpose:${value}`, span, "certain"),
      kind: "purpose",
      value,
    });
  }
  for (const [m, span] of scan.matches(subjective.re)) {
    const topic = lexiconValue(subjective, m[0]);
    if (!topic) continue;
    scan.claim(span);
    draft.preferences.push({ id: `pref:${topic}`, topic, ...evidenceOf(scan, span), options: [] });
  }
}

// Unparsed text: runs of unclaimed words, trimmed of function words.

const wordRe = /[\p{L}\p{N}]+(?:['’׳"״.-][\p{L}\p{N}]+)*/gu;

interface Token extends Span {
  readonly stop: boolean;
}

function tokens(text: string, from = 0, to = text.length): Token[] {
  const out: Token[] = [];
  const re = new RegExp(wordRe.source, wordRe.flags);
  const slice = text.slice(from, to);
  for (let m = re.exec(slice); m; m = re.exec(slice)) {
    out.push({
      start: from + m.index,
      end: from + m.index + m[0].length,
      stop: stopwords.has(fold(m[0])),
    });
  }
  return out;
}

function unparsedRuns(
  text: string,
  list: readonly Token[],
  claimed: (t: Token) => boolean,
): TextSpan[] {
  const runs: Token[][] = [];
  let current: Token[] = [];
  for (const token of list) {
    if (claimed(token)) {
      if (current.length > 0) runs.push(current);
      current = [];
    } else {
      current.push(token);
    }
  }
  if (current.length > 0) runs.push(current);
  return runs.flatMap((run) => {
    const first = run.findIndex((t) => !t.stop);
    const last = run.findLastIndex((t) => !t.stop);
    const a = run[first];
    const b = run[last];
    if (first < 0 || !a || !b) return [];
    return [{ start: a.start, end: b.end, text: text.slice(a.start, b.end) }];
  });
}

// Assembly.

const byStart = <T extends { readonly span: Span }>(a: T, b: T) => a.span.start - b.span.start;

function uniqueBy<T>(items: readonly T[], key: (item: T) => string): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const k = key(item);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function single<T extends CountChip>(
  scan: Scan,
  list: readonly T[],
  kind: "rooms" | "bedrooms",
  questions: Question[],
): T | undefined {
  const distinct = uniqueBy(list, (c) => `${c.min}-${c.max}`);
  if (distinct.length <= 1) return list[0];
  const first = distinct[0];
  const last = distinct[distinct.length - 1];
  if (!first || !last) return undefined;
  questions.push({
    id: `q:${kind}`,
    kind,
    ...evidenceOf(scan, { start: first.span.start, end: last.span.end }),
    options: distinct.map((c, i) => ({ ...c, id: `${kind}:${i}`, confidence: "likely" })),
  });
  return undefined;
}

function priceOf(
  scan: Scan,
  parts: readonly PricePart[],
  questions: Question[],
): PriceChip | undefined {
  const chip = (id: string, span: Span, part: Omit<PricePart, "span">): PriceChip => ({
    ...base(scan, id, span, part.confidence),
    kind: "price",
    ...(part.min === undefined ? {} : { min: part.min }),
    ...(part.max === undefined ? {} : { max: part.max }),
    currency: part.currency,
  });
  const [first] = parts;
  if (!first) return undefined;
  if (parts.length === 1) return chip("price", first.span, first);
  const currencies = new Set(parts.map((p) => p.currency));
  const mins = parts.filter((p) => p.min !== undefined && p.max === undefined);
  const maxes = parts.filter((p) => p.max !== undefined && p.min === undefined);
  const last = parts[parts.length - 1] ?? first;
  const span = { start: first.span.start, end: last.span.end };
  if (currencies.size === 1 && parts.length === 2 && mins.length === 1 && maxes.length === 1) {
    return chip("price", span, {
      min: mins[0]?.min,
      max: maxes[0]?.max,
      currency: first.currency,
      confidence: minConfidence(first.confidence, last.confidence),
    });
  }
  questions.push({
    id: "q:price",
    kind: "price",
    ...evidenceOf(scan, span),
    options: parts.map((p, i) => chip(`price:${i}`, p.span, { ...p, confidence: "likely" })),
  });
  return undefined;
}

/** Reads free text into chips and questions; nothing here is applied until accepted. */
export function interpretIntent(text: string, options: InterpretOptions): Interpretation {
  const scan = new Scan(text);
  const draft: Draft = {
    purposes: [],
    types: [],
    places: [],
    prices: [],
    rooms: [],
    bedrooms: [],
    features: [],
    preferences: [],
    questions: [],
    impliedApartment: null,
  };

  scanAreas(scan, draft);
  scanCounts(scan, draft);
  scanPrices(scan, draft);
  scanUnsupported(scan, draft);
  scanPlaces(scan, draft, options.places);
  scanFeatures(scan, draft);
  scanWords(scan, draft);

  const questions = draft.questions;
  const types = uniqueBy(draft.types.sort(byStart), (c) => c.value);
  if (types.length === 0 && draft.impliedApartment) {
    const { span, confidence } = draft.impliedApartment;
    types.push({
      ...base(scan, "type:apartment", span, confidence),
      kind: "property_type",
      value: "apartment",
    });
  }

  // Explicit purpose words win over one implied by a price period.
  const stated = draft.purposes.filter((p) => p.confidence === "certain");
  const purposeChips = uniqueBy(
    (stated.length > 0 ? stated : draft.purposes).sort(byStart),
    (c) => c.value,
  );
  let purpose: PurposeChip | undefined;
  if (purposeChips.length === 1) {
    purpose = purposeChips[0];
  } else {
    // None stated: ask. Several stated: offer each as an answer.
    const [first] = purposeChips;
    const last = purposeChips[purposeChips.length - 1];
    questions.push({
      id: "q:purpose",
      kind: "purpose",
      ...(first && last
        ? evidenceOf(scan, { start: first.span.start, end: last.span.end })
        : { evidence: "", span: { start: 0, end: 0 } }),
      options: purposeChips.map((c) => ({ ...c, confidence: "likely" as const })),
    });
  }

  const mustHave = uniqueBy(
    draft.features.sort((a, b) =>
      a.confidence === b.confidence ? byStart(a, b) : a.confidence === "certain" ? -1 : 1,
    ),
    (c) => c.key,
  ).sort(byStart);
  for (const chip of mustHave) {
    if (chip.confidence === "likely") {
      questions.push({
        id: `q:feature:${chip.key}`,
        kind: "requirement",
        evidence: chip.evidence,
        span: chip.span,
        options: [],
        chipId: chip.id,
      });
    }
  }
  const mustKeys = new Set(mustHave.map((c) => c.key));
  const preferences = uniqueBy(
    draft.preferences.filter((p) => !mustKeys.has(p.topic as InterpretedFeatureKey)).sort(byStart),
    (p) => p.id,
  );

  const price = priceOf(scan, draft.prices.sort(byStart), questions);
  const rooms = single(scan, draft.rooms.sort(byStart), "rooms", questions);
  const bedrooms = single(scan, draft.bedrooms.sort(byStart), "bedrooms", questions);

  return {
    locale: options.locale,
    ...(purpose ? { purpose } : {}),
    propertyTypes: types,
    places: uniqueBy(draft.places.sort(byStart), (c) => c.placeId),
    ...(price ? { price } : {}),
    ...(rooms ? { rooms } : {}),
    ...(bedrooms ? { bedrooms } : {}),
    mustHave,
    preferences,
    questions: questions.sort(byStart),
    unparsed: unparsedRuns(text, tokens(text), (t) => scan.isClaimed(t)),
  };
}

// Chips and criteria.

/** The chips the interpretation proposes directly, in text order. */
export function interpretationChips(interpretation: Interpretation): Chip[] {
  const { purpose, price, rooms, bedrooms } = interpretation;
  return [
    ...(purpose ? [purpose] : []),
    ...interpretation.propertyTypes,
    ...interpretation.places,
    ...(price ? [price] : []),
    ...(rooms ? [rooms] : []),
    ...(bedrooms ? [bedrooms] : []),
    ...interpretation.mustHave,
  ].sort(byStart);
}

/** Every chip a visitor could accept: proposed ones plus answers offered by questions. */
export function acceptableChips(interpretation: Interpretation): Chip[] {
  return uniqueBy(
    [
      ...interpretationChips(interpretation),
      ...interpretation.questions.flatMap((q) => q.options),
      ...interpretation.preferences.flatMap((p) => p.options),
    ],
    (c) => c.id,
  );
}

export interface CriteriaOptions {
  /** The purpose control's value when no purpose chip was accepted (F01: always explicit). */
  readonly purpose?: ListingPurpose;
  readonly includeNeedsConfirmation?: boolean;
}

function oneOf<T extends Chip>(chips: readonly T[], kind: string): T | undefined {
  if (chips.length > 1) throw new Error(`Accepted chips conflict: more than one ${kind}.`);
  return chips[0];
}

function range(chip: { readonly min?: number; readonly max?: number }): Range {
  return {
    ...(chip.min === undefined ? {} : { min: chip.min }),
    ...(chip.max === undefined ? {} : { max: chip.max }),
  };
}

/**
 * Maps accepted chip ids to search criteria. Each accepted chip becomes exactly one criterion
 * and nothing else is added; unknown ids are ignored. Preferences and unanswered questions never
 * become filters.
 */
export function toSearchCriteria(
  interpretation: Interpretation,
  acceptedChipIds: Iterable<string>,
  options: CriteriaOptions = {},
): SearchCriteria {
  const accepted = new Set(acceptedChipIds);
  const chips = acceptableChips(interpretation).filter((c) => accepted.has(c.id));
  const of = <K extends Chip["kind"]>(kind: K) =>
    chips.filter((c): c is Extract<Chip, { kind: K }> => c.kind === kind);

  const purpose = oneOf(of("purpose"), "purpose");
  const price = oneOf(of("price"), "price");
  const rooms = oneOf(of("rooms"), "room count");
  const bedrooms = oneOf(of("bedrooms"), "bedroom count");
  const area = oneOf(of("area"), "area");
  const types = uniqueBy(of("property_type"), (c) => c.value).map((c) => c.value);
  const placeIds = uniqueBy(of("place"), (c) => c.placeId).map((c) => c.placeId);
  const mustHave = uniqueBy(of("feature"), (c) => c.key).map((c) => c.key);

  return {
    purpose: purpose?.value ?? options.purpose ?? "sale",
    ...(types.length > 0 ? { propertyTypes: types } : {}),
    ...(placeIds.length > 0 ? { placeIds } : {}),
    ...(price ? { price: { ...range(price), currency: price.currency } } : {}),
    ...(bedrooms ? { bedrooms: range(bedrooms) } : {}),
    ...(rooms ? { rooms: range(rooms) } : {}),
    ...(area ? { area: { ...range(area), basis: area.basis } } : {}),
    ...(mustHave.length > 0 ? { mustHave } : {}),
    ...(options.includeNeedsConfirmation === undefined
      ? {}
      : { includeNeedsConfirmation: options.includeNeedsConfirmation }),
  };
}

// Optional AI assistance (F29): proposals for the unparsed text only, validated by the caller
// against known place ids and feature keys. They never replace a rules chip.

export type AssistProposal =
  | { readonly kind: "purpose"; readonly value: ListingPurpose; readonly evidence: string }
  | { readonly kind: "property_type"; readonly value: PropertyType; readonly evidence: string }
  | { readonly kind: "place"; readonly placeId: string; readonly evidence: string }
  | { readonly kind: "feature"; readonly key: InterpretedFeatureKey; readonly evidence: string }
  | {
      readonly kind: "rooms" | "bedrooms";
      readonly min?: number;
      readonly max?: number;
      readonly evidence: string;
    };

/** Adds assist chips found inside unparsed spans; returns the interpretation unchanged otherwise. */
export function mergeAssistProposals(
  text: string,
  interpretation: Interpretation,
  proposals: readonly AssistProposal[],
  knownPlaceIds: ReadonlySet<string>,
): Interpretation {
  const spans: Span[] = [];
  const locate = (evidence: string): Span | null => {
    const needle = evidence.trim();
    if (needle.length === 0) return null;
    for (const unparsed of interpretation.unparsed) {
      const at = unparsed.text.indexOf(needle);
      if (at >= 0) return { start: unparsed.start + at, end: unparsed.start + at + needle.length };
    }
    return null;
  };
  const chipBase = (id: string, span: Span) => ({
    id,
    evidence: text.slice(span.start, span.end),
    span: { start: span.start, end: span.end },
    confidence: "likely" as const,
    source: "assist" as const,
  });

  let { purpose, rooms, bedrooms } = interpretation;
  const propertyTypes = [...interpretation.propertyTypes];
  const places = [...interpretation.places];
  const mustHave = [...interpretation.mustHave];
  let questions = [...interpretation.questions];

  for (const proposal of proposals) {
    const span = locate(proposal.evidence);
    if (!span) continue;
    switch (proposal.kind) {
      case "purpose":
        if (purpose || questions.some((q) => q.kind === "purpose" && q.options.length > 0))
          continue;
        purpose = {
          ...chipBase(`purpose:${proposal.value}`, span),
          kind: "purpose",
          value: proposal.value,
        };
        questions = questions.filter((q) => q.kind !== "purpose");
        break;
      case "property_type":
        if (propertyTypes.some((c) => c.value === proposal.value)) continue;
        propertyTypes.push({
          ...chipBase(`type:${proposal.value}`, span),
          kind: "property_type",
          value: proposal.value,
        });
        break;
      case "place":
        if (
          !knownPlaceIds.has(proposal.placeId) ||
          places.some((c) => c.placeId === proposal.placeId)
        )
          continue;
        places.push({
          ...chipBase(`place:${proposal.placeId}`, span),
          kind: "place",
          placeId: proposal.placeId,
        });
        break;
      case "feature": {
        if (mustHave.some((c) => c.key === proposal.key)) continue;
        const chip: FeatureChip = {
          ...chipBase(`feature:${proposal.key}`, span),
          kind: "feature",
          key: proposal.key,
        };
        mustHave.push(chip);
        questions.push({
          id: `q:feature:${proposal.key}`,
          kind: "requirement",
          evidence: chip.evidence,
          span: chip.span,
          options: [],
          chipId: chip.id,
        });
        break;
      }
      case "rooms":
      case "bedrooms": {
        const current = proposal.kind === "rooms" ? rooms : bedrooms;
        const taken = questions.some((q) => q.kind === proposal.kind);
        if (current || taken || (proposal.min === undefined && proposal.max === undefined))
          continue;
        const chip: CountChip = {
          ...chipBase(proposal.kind, span),
          kind: proposal.kind,
          ...range(proposal),
        };
        if (proposal.kind === "rooms") rooms = chip;
        else bedrooms = chip;
        break;
      }
    }
    spans.push(span);
  }
  if (spans.length === 0) return interpretation;

  const covered = (t: Span) => spans.some((s) => t.start < s.end && t.end > s.start);
  const unparsed = interpretation.unparsed.flatMap((u) =>
    unparsedRuns(text, tokens(text, u.start, u.end), covered),
  );
  return {
    ...interpretation,
    ...(purpose ? { purpose } : {}),
    propertyTypes: propertyTypes.sort(byStart),
    places: places.sort(byStart),
    ...(rooms ? { rooms } : {}),
    ...(bedrooms ? { bedrooms } : {}),
    mustHave: mustHave.sort(byStart),
    questions: questions.sort(byStart),
    unparsed,
  };
}
