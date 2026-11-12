// Question router for Butler answers on a listing page (ADR 0017). Rules only, no model, no IO.
// It decides which questions are refused, which the facts tier answers and which may go to the
// text tier. Visitor text is data: an instruction aimed at Butler is recognised and answered
// with nothing, never followed. Words for all seven locales are matched at once because
// visitors often type another language than the page's (as in the search interpreter).
import type { FactKind, QuestionKind, RefusalClass } from "@/domain/public-answer";
import { bedroomWords, fold, roomWords } from "./intent";

export interface RoutedQuestion {
  readonly kind: QuestionKind;
  /** Facts the facts tier answers, in the order the question asks them; at most three. */
  readonly facts: readonly FactKind[];
  readonly refusal: RefusalClass | null;
  /** The question tries to instruct Butler; nothing runs and no model is called. */
  readonly injection: boolean;
  /** The question holds an e-mail address or a phone number; nothing is stored or sent on. */
  readonly contactDetails?: boolean;
}

const emailRe = /[^\s@<>()[\],;:]+@[^\s@<>()[\],;:]+\.[^\s@<>()[\],;:]{2,}/gu;
// A run of digits with the separators people put in phone numbers, including the slash common in
// Bulgaria (0879/696870). A run glued to letters or a hyphen (a listing reference such as
// MS-2026123) is not a phone number.
const phoneRe =
  /(?<![\p{L}\p{N}-])(?:\+|00)?\(?\d[\d\s()./\u2010-\u2015-]{5,}\d(?![\p{L}\p{N}-])/gu;

function isPhone(run: string): boolean {
  const digits = run.replace(/\D/g, "").length;
  const international = /^(?:\+|00)/u.test(run) || run.includes("(");
  return digits >= (international ? 7 : 8) && digits <= 16;
}

/** An e-mail address or a phone number anywhere in the question. */
export function containsContactDetails(question: string): boolean {
  emailRe.lastIndex = 0;
  if (emailRe.test(question)) return true;
  return (question.match(phoneRe) ?? []).some(isPhone);
}

/** The question with every e-mail address and phone number replaced; what may be stored. */
export function redactContactDetails(question: string): string {
  return question.replace(emailRe, "[…]").replace(phoneRe, (run) => (isPhone(run) ? "[…]" : run));
}

const hebrewPrefix = "[ובלהמשכ]{0,2}";

/**
 * Phrases separated by `|`; `*` stands for any run of letters (a stem or an inner variant).
 * Written plainly and folded here, so diacritics, case and Greek accents never matter.
 */
export function phrases(list: string): RegExp {
  const sources = list
    .split("|")
    .map((phrase) => fold(phrase).trim())
    .filter(Boolean)
    .map((phrase) => {
      const body = phrase
        .split(/\s+/)
        .map((word) =>
          word
            .split("*")
            .map((part) => part.replace(/[.+?^${}()|[\]\\/]/g, "\\$&"))
            .join("\\p{L}*"),
        )
        .join("[\\s-]+");
      const prefix = /^[֐-׿]/.test(body) ? hebrewPrefix : "";
      return `${prefix}${body}`;
    })
    .sort((a, b) => b.length - a.length);
  return new RegExp(`(?<![\\p{L}\\p{N}])(?:${sources.join("|")})(?![\\p{L}\\p{N}])`, "u");
}

// Instructions to Butler hidden in a question. Checked first; such text is never routed on.
export const injectionRe = phrases(
  "ignore previous|ignore all|ignore the above|ignore your|ignore prior|disregard*|system prompt|developer mode|you are now|act as|pretend*|jailbreak*|new instructions|your instructions|игнорирай*|забрави инструкции*|игнорируй*|забудь инструкци*|системн* промпт|ignoriere*|vergiss deine|negeer*|vergeet je|αγνοησε*|αγνοηστε|ξεχασε τις οδηγιες|התעלם*|שכח את ההוראות|הוראות המערכת",
);

const refusalRes: readonly (readonly [RefusalClass, RegExp])[] = [
  [
    "action",
    phrases(
      "reserve*|reservation|hold it|hold the|keep it for me|take it off|sign the|резервир*|запазете|запази ми|задръжте|задръж|забронир*|придерж*|reservier*|zurückhalten|reserveer*|reserveren|vasthouden|κρατηση|κρατησε*|δεσμευσ*|לשריין|שריון|תשמרו",
    ),
  ],
  [
    "negotiation",
    phrases(
      "discount*|negotiat*|bargain*|haggl*|lower the price|lower price|reduce the price|best price|make an offer|an offer|accept less|cheaper|отстъпк*|пазарл*|договаряем*|намал*|по-ниска цена|по ниска цена|предложение за цена|направя оферта|скидк*|торг*|снизить|снижен*|уступ*|предложить цену|rabatt*|verhandel*|nachlass|günstiger|angebot machen|preisnachlass|korting*|onderhandel*|een bod|goedkoper|εκπτωσ*|διαπραγματ*|προσφορα|φθηνοτερ*|הנחה|הנחות|משא ומתן|להוריד מחיר|הצעת מחיר|להתמקח",
    ),
  ],
  [
    "legal",
    phrases(
      'legal*|lawyer*|attorney|solicitor|contract*|title deed|notary|lawful|law|адвокат*|юрид*|договор*|нотариал*|нотариус*|законн*|закон|юрист*|anwalt|anwält*|rechtlich*|vertrag*|notar*|gesetz*|advocaat|juridisch*|notaris*|wettelijk*|δικηγορ*|νομικ*|συμβολαι*|νομος|עורך דין|עו"ד|משפטי*|חוזה|נוטריון|חוקי',
    ),
  ],
  [
    "tax",
    phrases(
      'tax|taxes|taxed|vat|stamp duty|данък*|данъци|данъчн*|ддс|налог*|ндс|пошлин*|steuer*|mwst|mehrwertsteuer|belasting*|btw|φορος|φοροι|φορολογ*|φπα|מס|מסים|מיסים|מע"מ',
    ),
  ],
  [
    "money",
    phrases(
      "mortgage*|loan*|credit|financ*|bank*|instalment*|installment*|payment*|pay for|down payment|deposit|afford*|ипотек*|кредит*|заем|заеми|банк*|вноск*|плащан*|депозит*|капаро|займ*|рассрочк*|оплат*|задат*|hypothek*|kredit*|darlehen|finanzier*|anzahlung|kaution|ratenzahlung|hypothe*|lening*|krediet|aanbetaling|borg|στεγαστικ*|δανει*|τραπεζ*|προκαταβολ*|δοσεις|εγγυηση|משכנתא|הלוואה|בנק|מקדמה|תשלומים|פיקדון",
    ),
  ],
  [
    "value",
    phrases(
      "worth it|worth the|good investment|investment|invest|return on|roi|yield|overpriced|good deal|good value|value for money|resale|appreciat*|инвестиц*|струва ли си|заслужава ли|доходност*|възвращаем*|стоит ли|выгодн*|окупаем*|investition*|rendite|lohnt sich|wertsteiger*|investering*|rendement|de moeite waard|waard|επενδυσ*|αποδοση|αξιζει|השקעה|תשואה|שווה את",
    ),
  ],
  [
    "people",
    phrases(
      "owner*|seller*|landlord*|neighbour*|neighbor*|who lives|who lived|tenant*|previous owner*|собственик*|продавач*|хазяи*|съсед*|кой живее|наемател*|собственник*|владел*|продавец|продавца|продавцу|сосед*|кто живет|eigentümer*|besitzer*|verkäufer*|vermieter*|nachbar*|mieter*|eigenaar*|verkoper*|verhuurder*|buren|buurman|buurvrouw|huurder*|ιδιοκτητ*|πωλητ*|γειτον*|ενοικιαστ*|בעלים|בעל הדירה|מוכר|משכיר|שכנים|שכן|דיירים",
    ),
  ],
];

const factRes: readonly (readonly [FactKind, RegExp])[] = [
  [
    "viewing",
    phrases(
      "viewing*|view it|visit*|see it|see the|come and see|show me|tour|оглед*|огледам|да видя|посещени*|посетя|просмотр*|посмотреть|осмотр*|осмотреть|besichtig*|anschauen|ansehen|bezichtig*|bekijken|komen kijken|επισκεψ*|να δω|ξεναγηση|να το δω|לראות|סיור|ביקור|צפייה|לבקר",
    ),
  ],
  [
    "price",
    phrases(
      "price*|cost*|how much|expensive|rent is|the rent|monthly rent|цена*|цената|струва|колко струва|наемът|наема|стоимост*|стоит|сколько стоит|аренд* плата|арендн*|preis*|kostet|kosten|wie viel kostet|miete|prijs*|kost|huur|huurprijs|τιμη*|κοστιζ*|ποσο κανει|ενοικιο|מחיר|עולה|כמה עולה|שכר דירה|שכירות",
    ),
  ],
  [
    "inclusions",
    phrases(
      "include*|included|including|what is included|what's included|comes with|come with|включва*|включен*|включени|входи в цената|входит*|входят|включ*|inklusive|enthalten|inbegriffen|inbegrepen|inclusief|bevat*|περιλαμβαν*|περιλαμβανετ*|כולל*|כלול*",
    ),
  ],
  [
    "area",
    phrases(
      'size|big|large|area|square met*|sqm|sq m|m2|floor area|living area|площ*|квадрат*|кв м|кв.м|квм|голям*|размер*|площад*|больш*|groß*|gross|größe|fläche|quadratmeter|qm|wohnfläche|groot|grootte|oppervlak*|vierkante meter*|εμβαδ*|τετραγωνικ*|μεγεθος|τμ|μεγαλο|גודל|שטח|מ"ר|מטר*|גדולה|גדול',
    ),
  ],
  [
    "bedrooms",
    new RegExp(
      `(?<![\\p{L}\\p{N}])(?:${bedroomWords}|спален|${roomWords}|${hebrewPrefix}(?:חדרי שינה|חדרים))(?![\\p{L}\\p{N}])`,
      "u",
    ),
  ],
  [
    "floor",
    phrases(
      "floor|which floor|storey|story|level|етаж*|этаж*|etage|stockwerk|geschoss|stock|verdieping*|οροφο*|οροφος|קומה|באיזו קומה",
    ),
  ],
  [
    "type",
    phrases(
      "what type|what kind|which type|type of property|property type|is it a house|is it an apartment|house or|apartment or|flat or|какъв тип|какъв вид|вид имот|тип имот|къща ли|апартамент ли|какой тип|тип недвижимости|квартира или|дом или|was für ein|welche art|art der immobilie|haus oder|wohnung oder|wat voor|soort woning|type woning|huis of|appartement of|τι τυπου|ειδος ακινητου|τυπος ακινητου|σπιτι η|διαμερισμα η|איזה סוג|סוג הנכס|בית או|דירה או",
    ),
  ],
  [
    "place",
    phrases(
      "where|location|located|which town|which city|neighbourhood|neighborhood|district|address|къде|местоположени*|намира|адрес*|кой град|квартал*|район*|где|расположен*|находится|адрес*|в каком|wo|lage|liegt|adresse|ort|stadtteil|waar|ligging|ligt|adres|wijk|που|τοποθεσια|βρισκεται|διευθυνση|περιοχη|איפה|היכן|מיקום|כתובת|שכונה|נמצא*",
    ),
  ],
  [
    "availability",
    phrases(
      "available|availability|still for sale|still available|sold|vacant|free now|let already|наличен|налична|наличност|свободен|свободна|продаден*|актуал*|доступн*|доступен|свободн*|продан*|ещё продается|verfügbar*|frei|verkauft|noch zu haben|beschikbaar*|vrij|verkocht|nog te koop|διαθεσιμ*|πουληθηκε|ελευθερ*|πωλειται ακομα|זמין|זמינה|פנוי|פנויה|נמכר*",
    ),
  ],
  [
    "reference",
    phrases(
      "reference|ref|listing number|listing id|property id|референ*|номер на обява*|код на обява*|номер объявлени*|референс|код объекта|referenz*|objektnummer|kennung|referentie*|objectnummer|κωδικ*|αριθμος αγγελιας|מספר מודעה|מספר הנכס|קוד הנכס|אסמכתא",
    ),
  ],
  [
    "contact",
    phrases(
      "contact*|phone*|call|telephone|agency|agent|broker|email|e-mail|reach you|who do i|контакт*|телефон*|обадя|обаждане|агенци*|брокер*|имейл|позвонить|звонить|агентств*|связаться|kontakt*|telefon*|anrufen|agentur|makler*|erreichen|bellen|telefoon*|makelaar*|kantoor|bereiken|επικοινων*|τηλεφων*|γραφει*|μεσιτ*|טלפון|ליצור קשר|סוכנות|מתווך|מתווכים|להתקשר",
    ),
  ],
];

/** Position of the first match, for keeping the question's own order of asks. */
function firstIndex(re: RegExp, text: string): number {
  const match = re.exec(text);
  return match ? match.index : -1;
}

export function routeQuestion(question: string): RoutedQuestion {
  if (containsContactDetails(question))
    return {
      kind: "contact_details",
      facts: [],
      refusal: null,
      injection: false,
      contactDetails: true,
    };
  const text = fold(question).replace(/\s+/g, " ").trim();
  if (injectionRe.test(text))
    return { kind: "injection", facts: [], refusal: null, injection: true };
  const asked = factRes
    .map(([kind, re]) => [kind, firstIndex(re, text)] as const)
    .filter(([, index]) => index >= 0);
  const viewing = asked.some(([kind]) => kind === "viewing");
  for (const [refusal, re] of refusalRes) {
    // "Book a viewing" asks how to arrange one: Butler explains the way, it books nothing.
    if (
      refusal === "action" &&
      viewing &&
      !/(?:reserv|hold|резерв|запаз|задърж|брон|придерж|zurück|vasthoud|κρατησ|δεσμευ|לשריין)/u.test(
        text,
      )
    )
      continue;
    if (re.test(text)) return { kind: `refusal.${refusal}`, facts: [], refusal, injection: false };
  }
  // "Floor area" is a size; "how many rooms" is a room count, not a floor.
  const facts = asked
    .filter(([kind]) => !(kind === "floor" && /(?:floor area|floor space)/u.test(text)))
    .sort((a, b) => a[1] - b[1])
    .map(([kind]) => kind)
    .slice(0, 3);
  if (facts.length === 0) return { kind: "other", facts, refusal: null, injection: false };
  return {
    kind: facts.length === 1 ? (facts[0] as FactKind) : "multiple",
    facts,
    refusal: null,
    injection: false,
  };
}
