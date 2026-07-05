import fs from "node:fs";
import path from "node:path";
import { getLocale } from "./locales.mjs";
import { fromRoot } from "./paths.mjs";
import { listingPath } from "./seo.mjs";

export const DEFAULT_SLUG_HISTORY_PATH = fromRoot("production", "data", "slug-history.jsonl");

export function resetSlugHistory(filePath = DEFAULT_SLUG_HISTORY_PATH) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, "");
}

export function readSlugHistory(filePath = DEFAULT_SLUG_HISTORY_PATH) {
  if (!fs.existsSync(filePath)) return [];
  return fs
    .readFileSync(filePath, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function normalizePath(value, field) {
  const raw = String(value || "").trim();
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.includes("://")) {
    throw new Error(`${field} must be a site-relative absolute path`);
  }
  return raw.length > 1 ? raw.replace(/\/+$/, "") : raw;
}

function assertNotBroadPath(registry, localeCode, value, field) {
  const locale = getLocale(registry, localeCode);
  const normalized = normalizePath(value, field);
  const broadPaths = new Set([
    "/",
    `/${locale.code}`,
    `/${locale.code}/${locale.route_segments.search}`,
    `/${locale.code}/${locale.route_segments.search}/`,
  ]);
  if (broadPaths.has(value) || broadPaths.has(normalized)) {
    throw new Error(`${field} must not be a homepage or search-page redirect`);
  }
  return normalized;
}

function listingRecord(seed, listingId) {
  return seed.records.find((record) => record.collection === "listings" && record.id === listingId);
}

export function appendSlugChange(
  registry,
  seed,
  input,
  { filePath = DEFAULT_SLUG_HISTORY_PATH, changedAt = new Date().toISOString() } = {},
) {
  const listingId = String(input.listingId || input.listing_id || "").trim();
  const localeCode = String(input.locale || registry.source_locale).trim();
  if (!listingRecord(seed, listingId)) throw new Error("Slug change requires a known listingId");
  const locale = getLocale(registry, localeCode);
  const oldPath = assertNotBroadPath(registry, locale.code, input.oldPath || input.old_path, "oldPath");
  if (!oldPath.startsWith(`/${locale.code}/`)) throw new Error("oldPath must stay inside the listing locale prefix");

  const canonicalNewPath = listingPath(registry, locale.code, listingId);
  const newPath = assertNotBroadPath(registry, locale.code, input.newPath || input.new_path || canonicalNewPath, "newPath");
  if (newPath !== canonicalNewPath) throw new Error("newPath must be the current canonical listing path");
  if (oldPath === newPath) throw new Error("oldPath and newPath must be different");

  const row = {
    id: input.id || `slug-${listingId}-${locale.code}`,
    listing_id: listingId,
    locale: locale.code,
    old_path: oldPath,
    new_path: newPath,
    status: 301,
    reason: input.reason || "listing_slug_changed",
    changed_by: input.editor || input.changed_by || "admin",
    changed_at: input.changedAt || input.changed_at || changedAt,
  };

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.appendFileSync(filePath, `${JSON.stringify(row)}\n`);
  return row;
}

export function slugRedirectForPath(rows, pathname) {
  const normalized = normalizePath(pathname, "pathname");
  return [...rows].reverse().find((row) => row.old_path === normalized && row.status === 301) || null;
}

export function assertSlugHistory(rows) {
  if (!rows.length) throw new Error("Slug history must contain at least one row");
  for (const row of rows) {
    if (!row.listing_id || !row.locale || !row.old_path || !row.new_path) {
      throw new Error("Slug history row is missing redirect data");
    }
    if (row.status !== 301) throw new Error("Slug history redirects must be 301");
    if (row.old_path === row.new_path) throw new Error("Slug history old and new paths must differ");
    if (row.new_path === "/" || row.new_path.includes("/search")) {
      throw new Error("Slug history must not target homepage or search pages");
    }
  }
  return true;
}
