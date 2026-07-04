import fs from "node:fs";
import path from "node:path";
import { adminLocales, localesByCode } from "./locales.mjs";
import { fromRoot } from "./paths.mjs";

export const DEFAULT_LANGUAGE_REQUEST_LEDGER_PATH = fromRoot("production", "data", "language-requests.jsonl");

const BCP47 = /^[a-z]{2,3}(-[A-Z]{2})?$/;

export function resetLanguageRequests(filePath = DEFAULT_LANGUAGE_REQUEST_LEDGER_PATH) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, "");
}

export function createLanguageRequest(registry, input, requestedAt = new Date().toISOString()) {
  if (!BCP47.test(input.requestedLocale || "")) throw new Error("requestedLocale must be a BCP 47 language code");
  if (!input.requestedPath) throw new Error("requestedPath is required");
  const requested = localesByCode(registry).get(input.requestedLocale);
  const fallbackLocale = requested?.fallback_locale || registry.source_locale;

  return {
    requested_at: requestedAt,
    id: input.id || `language-request-${input.requestedLocale}`,
    requested_locale: input.requestedLocale,
    requested_path: input.requestedPath,
    fallback_locale: fallbackLocale,
    admin_locale: adminLocales(registry).includes(input.requestedLocale) ? input.requestedLocale : "en",
    public_indexable: false,
    hermes_chat_available: true,
    contact: input.contact || {},
    message: input.message || "",
  };
}

export function appendLanguageRequest(
  request,
  { filePath = DEFAULT_LANGUAGE_REQUEST_LEDGER_PATH } = {},
) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.appendFileSync(filePath, `${JSON.stringify(request)}\n`);
  return request;
}

export function readLanguageRequests(filePath = DEFAULT_LANGUAGE_REQUEST_LEDGER_PATH) {
  if (!fs.existsSync(filePath)) return [];
  return fs
    .readFileSync(filePath, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

export function assertLanguageRequests(rows) {
  if (!rows.length) throw new Error("Language request ledger must contain at least one row");
  for (const row of rows) {
    if (!BCP47.test(row.requested_locale || "")) throw new Error("Language request row has invalid locale");
    if (!row.requested_path || !row.fallback_locale || !row.admin_locale) {
      throw new Error("Language request row is missing routing data");
    }
    if (row.public_indexable !== false) throw new Error("Language requests must never be indexable");
  }
  return true;
}
