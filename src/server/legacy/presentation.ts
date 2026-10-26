import type { LegacyPage } from "./pages";

export type SourceField = { label: string; value: string };

// Only theme/plugin residue observed in the preserved inventory. Editorial bracketed
// text, unknown shortcodes and prose mentioning a form/share action stay intact.
export function cleanArchiveText(text: string): string {
  return text
    .replace(
      /\[\/?(?:si-contact-form|wp-ultimate-search-bar|wp-ultimate-search-results|wp_html_sitemap)\b[^\]\r\n]*\]/giu,
      "",
    )
    .replace(/(?:\b(?:e-?mail|email)\s*:\s*)?\[email protected\]/giu, "")
    .replace(
      /(?:^|\s)Tweet\s+(?:Name Email Phone Message Send|Име Email Телефон Съобщение Изпрати|Ваше имя Email Телефон Сообщение Оставить заявку)\s*$/u,
      "",
    )
    .replace(/(?:^|\s)Tweet\s*$/u, "")
    .replace(/[ \t]{2,}/gu, " ")
    .trim();
}

const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");

function fieldPattern(text: string) {
  // A captured DOM field joins adjacent text nodes differently from the plain body.
  // Whitespace around commas is the only punctuation variation accepted here.
  return escapeRegex(text.trim()).replace(/\s+/gu, "\\s+").replace(/,/gu, "\\s*,\\s*");
}

function structuredFields(page: LegacyPage): SourceField[] {
  const source = page.listing?.liveSourceFields ?? page.listing?.sourceStatedFacts;
  if (!Array.isArray(source)) return [];
  return source.filter(
    (field): field is SourceField =>
      field !== null &&
      typeof field === "object" &&
      typeof field.label === "string" &&
      typeof field.value === "string" &&
      Boolean(field.label.trim() && field.value.trim()),
  );
}

const legacyLabels = [
  "ID №",
  "Лот №",
  "No",
  "№",
  "Country",
  "City",
  "Category",
  "Floor",
  "Area",
  "Land area",
  "Terraces",
  "Rooms (include living room)",
  "Property Type",
  "Price",
  "Garage, parking space",
  "WC / bathrooms",
  "Period",
  "Държава",
  "Град",
  "Категория обект",
  "Етаж",
  "Площ",
  "Площ на парцела",
  "Тераси",
  "Количество стаи",
  "Гараж, паркинг",
  "Бани",
  "Срок за издаване в експлоатация",
  "Тип",
  "Цена",
  "Государство",
  "Город",
  "Категория объекта",
  "Количество этажей/уровней",
  "Площадь объекта",
  "Площадь участка",
  "Количество балконов",
  "Количество комнат",
  "Количество санузлов",
  "Гараж, парковка",
  "Срок сдачи в эксплуатацию",
  "Стоимость",
];
const leadingLabel = new RegExp(
  `(?:^|(?<=\\s))(${legacyLabels.map(escapeRegex).join("|")})\\s*:\\s*`,
  "gu",
);

function boundedLeadingFields(page: LegacyPage): { fields: SourceField[]; length: number } {
  if (!page.listing || !/^(?:ID\s*№|Лот\s*№|No|№)\s*:/u.test(page.bodyText))
    return { fields: [], length: 0 };
  const titleStart = page.bodyText.indexOf(page.title);
  if (titleStart < 1) return { fields: [], length: 0 };
  const prefix = page.bodyText.slice(0, titleStart);
  const labels = [...prefix.matchAll(leadingLabel)];
  if (labels[0]?.index !== 0 || labels.length < 3) return { fields: [], length: 0 };
  const fields = labels.map((match, index) => ({
    label: match[0].trim(),
    value: prefix.slice(match.index + match[0].length, labels[index + 1]?.index).trim(),
  }));
  const last = fields.at(-1);
  // The old theme may put sold/let text between price and heading. Without a
  // separate source field, leave that ambiguous prefix in prose rather than make
  // availability part of a parsed price or infer a current lifecycle state.
  if (
    fields.some((field) => !field.value || field.value.includes(":")) ||
    !last ||
    !/^(?:Price|Цена|Стоимость)\s*:/u.test(last.label) ||
    !/^(?:[\d\s.,]+(?:€|EUR)|(?:По договаряне|Договорная)\s*€?)$/u.test(last.value)
  )
    return { fields: [], length: 0 };
  return { fields, length: titleStart };
}

function cleanSourceLinks(page: LegacyPage) {
  const links = new Map<string, { url: string; text: string }>();
  for (const link of page.contentLinks ?? []) {
    const text = cleanArchiveText(link.text);
    if (!text || /^Tweet$/iu.test(text)) continue;
    let url: URL;
    try {
      url = new URL(link.url);
    } catch {
      continue;
    }
    if (
      !["https:", "http:", "mailto:", "tel:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      (url.protocol === "tel:" && url.pathname.replace(/[\s()-]/gu, "") !== "+359879696870") ||
      (/^(?:www\.)?(?:twitter\.com|x\.com|facebook\.com)$/iu.test(url.hostname) &&
        /^\/(?:intent|share|sharer)(?:\/|\.|$)/iu.test(url.pathname)) ||
      /\/cdn-cgi\/l\/email-protection(?:#|$)/u.test(link.url)
    )
      continue;
    const prior = links.get(link.url);
    if (!prior || prior.text === prior.url) links.set(link.url, { url: link.url, text });
  }
  return [...links.values()];
}

/** P21 / F09: a derived reading view, never an edit or approval of source evidence. */
export function presentLegacyPage(page: LegacyPage) {
  const fields = structuredFields(page);
  let narrative = page.bodyText;
  let facts = fields;
  if (fields.length) {
    const prefix = new RegExp(
      `^${fields.map((field) => `${fieldPattern(field.label)}\\s*${fieldPattern(field.value)}`).join("\\s+")}(?=\\s|$)`,
      "u",
    ).exec(narrative);
    if (prefix) narrative = narrative.slice(prefix[0].length).trimStart();
  } else {
    const parsed = boundedLeadingFields(page);
    facts = parsed.fields;
    if (parsed.length) narrative = narrative.slice(parsed.length);
  }
  // Flattened source text cannot distinguish a duplicated heading from the
  // subject of a sentence. Retain title-shaped prose rather than guess.
  return { facts, bodyText: cleanArchiveText(narrative), contentLinks: cleanSourceLinks(page) };
}
