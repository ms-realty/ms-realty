export const CYRILLIC_SEARCH_FOLD_PAIRS = Object.freeze([
  ["а", "a"],
  ["б", "b"],
  ["в", "v"],
  ["г", "g"],
  ["д", "d"],
  ["е", "e"],
  ["ё", "yo"],
  ["ж", "zh"],
  ["з", "z"],
  ["и", "i"],
  ["й", "y"],
  ["к", "k"],
  ["л", "l"],
  ["м", "m"],
  ["н", "n"],
  ["о", "o"],
  ["п", "p"],
  ["р", "r"],
  ["с", "s"],
  ["т", "t"],
  ["у", "u"],
  ["ф", "f"],
  ["х", "h"],
  ["ц", "ts"],
  ["ч", "ch"],
  ["ш", "sh"],
  ["щ", "sht"],
  ["ъ", "a"],
  ["ы", "y"],
  ["ь", "y"],
  ["э", "e"],
  ["ю", "yu"],
  ["я", "ya"],
  ["ѝ", "i"],
]);

const CYRILLIC_SEARCH_FOLD = new Map(CYRILLIC_SEARCH_FOLD_PAIRS);

export function foldSearchText(value) {
  return [...String(value ?? "").toLocaleLowerCase()]
    .map((character) => CYRILLIC_SEARCH_FOLD.get(character) || character)
    .join("")
    .replace(/[^\p{L}\p{N}\s-]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function postgresLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

export function postgresSearchFoldExpression(inputExpression = "input") {
  const transliterated = CYRILLIC_SEARCH_FOLD_PAIRS.reduce(
    (expression, [source, replacement]) =>
      `replace(${expression}, ${postgresLiteral(source)}, ${postgresLiteral(replacement)})`,
    `lower(coalesce(${inputExpression}, ''))`,
  );
  return `
    trim(
      regexp_replace(
        regexp_replace(
          ${transliterated},
          '[^[:alnum:][:space:]-]+',
          ' ',
          'g'
        ),
        '[[:space:]]+',
        ' ',
        'g'
      )
    )
  `;
}

export const POSTGRES_SEARCH_FOLD_SQL = postgresSearchFoldExpression();
