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
  const requestedLocale = input.requestedLocale || input.requested_locale;
  const requestedPath = input.requestedPath || input.requested_path;
  if (!BCP47.test(requestedLocale || "")) throw new Error("requestedLocale must be a BCP 47 language code");
  if (!requestedPath) throw new Error("requestedPath is required");
  const requested = localesByCode(registry).get(requestedLocale);
  const fallbackLocale = requested?.fallback_locale || registry.source_locale;
  const contact = input.contact && typeof input.contact === "object" ? input.contact : {};
  const notificationRequested = ["email", "phone", "whatsapp", "viber"].some((field) => Boolean(String(contact[field] || "").trim()));

  return {
    requested_at: requestedAt,
    id: input.id || `language-request-${requestedLocale}`,
    requested_locale: requestedLocale,
    requested_path: requestedPath,
    fallback_locale: fallbackLocale,
    admin_locale: adminLocales(registry).includes(requestedLocale) ? requestedLocale : "en",
    public_indexable: false,
    contact,
    notification_requested: notificationRequested,
    message: input.message || "",
  };
}

export function privacySafeLanguageRequest(request) {
  const { contact, message, ...safe } = request;
  return {
    ...safe,
    contact_ref: request.notification_requested ? request.id : null,
    contact_available: request.notification_requested === true,
    message_available: Boolean(String(message || "").trim()),
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
    if (row.contact || row.message) throw new Error("Language request ledger must not store raw contact or message data");
    if (row.notification_requested && (!row.contact_available || row.contact_ref !== row.id)) {
      throw new Error("Language request notification must preserve private contact routing");
    }
  }
  return true;
}
