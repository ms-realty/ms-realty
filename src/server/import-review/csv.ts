/** Bounded UTF-8 CSV preview. Values remain source text; nothing evaluates spreadsheet cells. */
// Leave room for the signed source and progressive form state within the native action body.
export const csvLimits = { bytes: 65536, rows: 500, columns: 32, cell: 4096 } as const;
export type CsvFailure = "format" | "size" | "rows" | "columns" | "cell" | "quotes" | "empty";
export class CsvError extends Error {
  constructor(readonly reason: CsvFailure) {
    super(`csv_${reason}`);
  }
}
export type CsvDelimiter = "," | ";";
export interface CsvDocument {
  headers: string[];
  rows: { number: number; cells: string[] }[];
}

/** Quotes may contain delimiters/newlines; doubled quotes are decoded exactly once. */
export function parseCsv(source: string, delimiter: CsvDelimiter): CsvDocument {
  if (delimiter !== "," && delimiter !== ";") throw new CsvError("format");
  if (new TextEncoder().encode(source).byteLength > csvLimits.bytes) throw new CsvError("size");
  // A text export may contain tabs/line endings, but not embedded binary control values.
  // biome-ignore lint/suspicious/noControlCharactersInRegex: explicitly reject binary control characters in a text export.
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u.test(source)) throw new CsvError("format");
  const text = source.startsWith("\uFEFF") ? source.slice(1) : source;
  if (!text.length) throw new CsvError("empty");
  const records: string[][] = [];
  let row: string[] = [],
    cell = "",
    mode: "plain" | "quoted" | "closed" = "plain";
  const addCell = () => {
    if (row.length >= csvLimits.columns) throw new CsvError("columns");
    row.push(cell);
    cell = "";
    mode = "plain";
  };
  const addRow = () => {
    addCell();
    if (records.length > csvLimits.rows) throw new CsvError("rows");
    records.push(row);
    row = [];
  };
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (mode === "quoted") {
      if (char === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else mode = "closed";
      } else cell += char;
    } else if (char === delimiter) addCell();
    else if (char === "\r" || char === "\n") {
      if (char === "\r" && text[i + 1] === "\n") i++;
      addRow();
    } else if (char === '"' && cell.length === 0 && mode === "plain") mode = "quoted";
    else {
      if (mode === "closed" || char === '"') throw new CsvError("quotes");
      cell += char;
    }
    if (cell.length > csvLimits.cell) throw new CsvError("cell");
  }
  if (mode === "quoted") throw new CsvError("quotes");
  // A final line ending terminates the last row; it does not create a phantom empty row.
  if (cell.length || row.length || mode === "closed") addRow();
  const [headers, ...rows] = records;
  if (!headers?.some((value) => value.trim()) || !rows.length) throw new CsvError("empty");
  return { headers, rows: rows.map((cells, index) => ({ number: index + 2, cells })) };
}

export const importFields = [
  "reference",
  "title",
  "price",
  "currency",
  "area",
  "bedrooms",
  "location",
  "sourceUrl",
] as const;
export type ImportField = (typeof importFields)[number];
export type ColumnMapping = Record<ImportField, number | null>;
export const emptyMapping = (): ColumnMapping =>
  Object.fromEntries(importFields.map((key) => [key, null])) as ColumnMapping;
export type RowIssue =
  | "columnCount"
  | "required"
  | "number"
  | "currency"
  | "url"
  | "formula"
  | "duplicate";
export interface PreviewRow {
  number: number;
  cells: string[];
  values: Record<ImportField, string | null>;
  issues: { code: RowIssue; field?: ImportField; column?: number }[];
}

/** Mapping uses column positions, never ambiguous or attacker-controlled header object keys. */
export function validateMapping(value: unknown, columns: number): ColumnMapping {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new CsvError("format");
  if (Object.keys(value).some((key) => !importFields.includes(key as ImportField)))
    throw new CsvError("format");
  const seen = new Set<number>();
  const mapping = emptyMapping();
  for (const field of importFields) {
    const column = (value as Record<string, unknown>)[field];
    if (column === null) continue;
    if (
      typeof column !== "number" ||
      !Number.isInteger(column) ||
      column < 0 ||
      column >= columns ||
      seen.has(column)
    )
      throw new CsvError("format");
    seen.add(column);
    mapping[field] = column;
  }
  if (mapping.reference === null || mapping.title === null) throw new CsvError("format");
  return mapping;
}

/** Helpful defaults only for exact known header labels; staff still reviews every choice. */
export function suggestedMapping(document: CsvDocument): ColumnMapping {
  const result = emptyMapping();
  for (const field of importFields) {
    const matches = document.headers.flatMap((header, index) =>
      header.trim().toLowerCase() === field.toLowerCase() ? [index] : [],
    );
    if (matches.length === 1) result[field] = matches[0] ?? null;
  }
  return result;
}

export function previewRows(document: CsvDocument, input: unknown): PreviewRow[] {
  const mapping = validateMapping(input, document.headers.length);
  const references = new Map<string, number>();
  for (const row of document.rows) {
    const value = row.cells[mapping.reference as number];
    if (value?.trim()) references.set(value, (references.get(value) ?? 0) + 1);
  }
  return document.rows.map((row) => {
    const values = Object.fromEntries(
      importFields.map((field) => [
        field,
        mapping[field] === null ? null : (row.cells[mapping[field] as number] ?? ""),
      ]),
    ) as PreviewRow["values"];
    const issues: PreviewRow["issues"] = [];
    if (row.cells.length !== document.headers.length) issues.push({ code: "columnCount" });
    for (const [column, value] of row.cells.entries())
      if (/^\s*[=+\-@]/u.test(value)) issues.push({ code: "formula", column });
    for (const field of ["reference", "title"] as const)
      if (!values[field]?.trim()) issues.push({ code: "required", field });
    for (const field of ["price", "area", "bedrooms"] as const) {
      const value = values[field];
      if (
        value?.trim() &&
        !(field === "bedrooms" ? /^\d{1,3}$/u : /^\d{1,12}(?:[.,]\d{1,2})?$/u).test(value.trim())
      )
        issues.push({ code: "number", field });
    }
    if (values.price?.trim() && !values.currency?.trim())
      issues.push({ code: "required", field: "currency" });
    if (values.currency?.trim() && !/^[A-Z]{3}$/u.test(values.currency.trim()))
      issues.push({ code: "currency", field: "currency" });
    if (values.sourceUrl?.trim()) {
      try {
        const url = new URL(values.sourceUrl.trim());
        if (!["http:", "https:"].includes(url.protocol) || url.username || url.password)
          throw new Error("invalid");
      } catch {
        issues.push({ code: "url", field: "sourceUrl" });
      }
    }
    if (values.reference !== null && (references.get(values.reference) ?? 0) > 1)
      issues.push({ code: "duplicate", field: "reference" });
    return { ...row, values, issues };
  });
}
