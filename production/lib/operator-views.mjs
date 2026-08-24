import fs from "node:fs";
import path from "node:path";
import { fromRoot } from "./paths.mjs";

// Saved views: one operator's named set of list filters for a workspace
// surface. The ledger is append-only and keyed by (operator id, surface,
// slug); a delete appends a tombstone rather than rewriting history.
//
// The operator id is NEVER read from the request body. Callers pass the
// authenticated principal's id, and a submitted id that disagrees is refused
// by bindAuthenticatedOperator() before this module is reached.

export const DEFAULT_OPERATOR_VIEW_LEDGER_PATH = fromRoot("production", "data", "operator-views.jsonl");

export const OPERATOR_VIEW_SURFACES = Object.freeze(["leads", "pipeline"]);
const SURFACE_SET = new Set(OPERATOR_VIEW_SURFACES);

// A saved view may only store filters the surface actually offers. An unknown
// key is refused rather than stored and silently ignored later.
const SURFACE_FILTER_KEYS = Object.freeze({
  leads: Object.freeze(["queue", "sla", "broker", "leadType", "language", "source", "listingReference", "q"]),
  pipeline: Object.freeze(["pipeline", "stage", "broker", "leadType", "language", "q"]),
});

const MAX_FILTERS = 8;
const MAX_FILTER_VALUE = 120;
const MAX_VIEWS_PER_SURFACE = 25;
const SLUG = /^[a-z0-9][a-z0-9-]{0,63}$/;
const OPERATOR_ID = /^[a-z0-9][a-z0-9._-]{1,63}$/i;

function operatorIdOf(value) {
  const id = String(value || "").trim();
  if (!OPERATOR_ID.test(id)) throw new Error("Saved views require an authenticated operator id");
  return id;
}

function surfaceOf(value) {
  const surface = String(value || "").trim().toLowerCase();
  if (!SURFACE_SET.has(surface)) throw new Error(`surface must be one of: ${OPERATOR_VIEW_SURFACES.join(", ")}`);
  return surface;
}

function isoTimestamp(value, label) {
  const text = String(value || "").trim();
  if (!text || Number.isNaN(Date.parse(text))) throw new Error(`${label} must be an ISO timestamp`);
  return new Date(text).toISOString();
}

export function operatorViewSlug(value, name = "") {
  const raw = String(value || "").trim() || String(name || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  const slug = raw.toLowerCase();
  if (!SLUG.test(slug)) throw new Error("Saved view slug must be lowercase letters, digits, and dashes");
  return slug;
}

function normalizedFilters(surface, value) {
  let filters = value;
  if (filters === undefined || filters === null || filters === "") filters = {};
  if (typeof filters === "string") {
    try {
      filters = JSON.parse(filters);
    } catch {
      throw new Error("filters must be valid JSON");
    }
  }
  if (typeof filters !== "object" || Array.isArray(filters)) throw new Error("filters must be an object");
  const allowed = new Set(SURFACE_FILTER_KEYS[surface]);
  const entries = Object.entries(filters)
    .map(([key, entry]) => [String(key).trim(), entry])
    .filter(([, entry]) => entry !== null && entry !== undefined && String(entry).trim() !== "");
  if (!entries.length) throw new Error("A saved view must store at least one filter");
  if (entries.length > MAX_FILTERS) throw new Error(`A saved view may store ${MAX_FILTERS} filters or fewer`);
  const normalized = {};
  for (const [key, entry] of entries) {
    if (!allowed.has(key)) throw new Error(`filters.${key} is not a filter of the ${surface} surface`);
    if (typeof entry === "object") throw new Error(`filters.${key} must be a single value`);
    const text = String(entry).trim();
    if (text.length > MAX_FILTER_VALUE) throw new Error(`filters.${key} must be ${MAX_FILTER_VALUE} characters or fewer`);
    normalized[key] = text;
  }
  return Object.fromEntries(Object.entries(normalized).sort(([left], [right]) => left.localeCompare(right)));
}

export function resetOperatorViews(filePath = DEFAULT_OPERATOR_VIEW_LEDGER_PATH) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, "");
}

export function readOperatorViews(filePath = DEFAULT_OPERATOR_VIEW_LEDGER_PATH) {
  if (!fs.existsSync(filePath)) return [];
  return fs
    .readFileSync(filePath, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function viewId(operatorId, surface, slug) {
  return `operator-view-${operatorId}-${surface}-${slug}`;
}

// The current state of one operator's views on one surface: the last row per
// (operator, surface, slug) wins, and a tombstone removes the view.
export function operatorViewsFor(rows, operatorId, surface = null) {
  const id = operatorIdOf(operatorId);
  const wanted = surface === null || surface === undefined || surface === "" ? null : surfaceOf(surface);
  const latest = new Map();
  for (const row of rows || []) {
    if (row.operator_id !== id) continue;
    if (wanted && row.surface !== wanted) continue;
    latest.set(row.id, row);
  }
  return [...latest.values()]
    .filter((row) => row.status === "active")
    .map(({ operator_id, ...view }) => ({ ...view, operator_id }))
    .sort((left, right) => left.surface.localeCompare(right.surface) || left.name.localeCompare(right.name));
}

export function createOperatorView(rows, input, { operatorId, savedAt = new Date().toISOString() } = {}) {
  const owner = operatorIdOf(operatorId);
  const surface = surfaceOf(input.surface);
  const name = String(input.name || "").trim();
  if (!name) throw new Error("Saved view name is required");
  if (name.length > 80) throw new Error("Saved view name must be 80 characters or fewer");
  const slug = operatorViewSlug(input.slug, name);
  const filters = normalizedFilters(surface, input.filters);
  const recorded = isoTimestamp(savedAt, "savedAt");
  const id = viewId(owner, surface, slug);
  const existing = operatorViewsFor(rows || [], owner, surface);
  if (!existing.some((view) => view.id === id) && existing.length >= MAX_VIEWS_PER_SURFACE) {
    throw new Error(`An operator may keep ${MAX_VIEWS_PER_SURFACE} saved views per surface`);
  }
  const prior = existing.find((view) => view.id === id);
  return {
    id,
    operator_id: owner,
    surface,
    slug,
    name,
    filters,
    status: "active",
    saved_at: prior?.saved_at || recorded,
    updated_at: recorded,
  };
}

export function createOperatorViewDeletion(rows, input, { operatorId, deletedAt = new Date().toISOString() } = {}) {
  const owner = operatorIdOf(operatorId);
  const surface = surfaceOf(input.surface);
  const slug = operatorViewSlug(input.slug, input.name);
  const id = viewId(owner, surface, slug);
  const existing = operatorViewsFor(rows || [], owner, surface).find((view) => view.id === id);
  if (!existing) throw new Error("Saved view does not exist for this operator");
  return {
    ...existing,
    status: "deleted",
    updated_at: isoTimestamp(deletedAt, "deletedAt"),
  };
}

function sameState(left, right) {
  return (
    left.id === right.id &&
    left.status === right.status &&
    left.name === right.name &&
    JSON.stringify(left.filters) === JSON.stringify(right.filters)
  );
}

export function appendOperatorView(view, { filePath = DEFAULT_OPERATOR_VIEW_LEDGER_PATH } = {}) {
  const rows = readOperatorViews(filePath);
  const current = [...rows].reverse().find((row) => row.id === view.id);
  // A retry that changes nothing returns the stored row instead of growing
  // the ledger with an identical state.
  if (current && sameState(current, view)) return { ...current, idempotent: true };
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.appendFileSync(filePath, `${JSON.stringify(view)}\n`);
  return { ...view, idempotent: false };
}

export function assertOperatorViews(rows) {
  for (const row of rows) {
    if (!row.id || !row.operator_id || !SURFACE_SET.has(row.surface) || !row.slug || !row.name) {
      throw new Error("Operator view row is missing routing data");
    }
    if (!["active", "deleted"].includes(row.status)) throw new Error("Operator view status must be active or deleted");
    if (row.id !== viewId(row.operator_id, row.surface, row.slug)) {
      throw new Error("Operator view id must be derived from its operator, surface, and slug");
    }
    isoTimestamp(row.saved_at, "saved_at");
    isoTimestamp(row.updated_at, "updated_at");
    normalizedFilters(row.surface, row.filters);
    if (["contact", "email", "message", "phone", "whatsapp", "viber"].some((field) => field in row)) {
      throw new Error("Operator views must not contain private contact data");
    }
  }
  return true;
}
