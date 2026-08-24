import fs from "node:fs";
import path from "node:path";
import { fromRoot } from "./paths.mjs";

// Workspace settings: agency profile, lead SLA targets, notification
// preferences, workbench defaults and public-site defaults.
//
// The committed JSON document at production/data/workspace-settings.json holds
// the defaults; the same file is the runtime ledger (override the path with
// MS_REALTY_WORKSPACE_SETTINGS_PATH). Every save rewrites the document
// atomically and appends a bounded revision entry, so the file stays readable
// as a history without growing without limit.

export const DEFAULT_WORKSPACE_SETTINGS_PATH = fromRoot("production", "data", "workspace-settings.json");
export const WORKSPACE_SETTINGS_VERSION = 1;
export const WORKSPACE_SETTINGS_SECTIONS = Object.freeze(["agency", "leads", "notifications", "workspace", "public_site"]);
export const WORKSPACE_TIMEZONES = Object.freeze([
  "Europe/Sofia",
  "Europe/Athens",
  "Europe/Bucharest",
  "Europe/Berlin",
  "Europe/Amsterdam",
  "Europe/London",
  "Europe/Moscow",
  "Asia/Jerusalem",
  "UTC",
]);
export const WORKSPACE_DATE_FORMATS = Object.freeze(["locale", "dd.mm.yyyy", "dd/mm/yyyy", "yyyy-mm-dd"]);
export const WORKSPACE_ADMIN_LOCALES = Object.freeze(["bg", "ru", "en"]);
// Lead types grouped into the buckets an operator assigns a default broker to.
export const DEFAULT_BROKER_LEAD_GROUPS = Object.freeze({
  buyer: Object.freeze(["buyer", "foreign_buyer", "investor"]),
  renter: Object.freeze(["renter"]),
  seller: Object.freeze(["seller"]),
  landlord: Object.freeze(["landlord"]),
});
export const MAX_WORKSPACE_SETTINGS_REVISIONS = 200;

const MAX_OFFICES = 10;
const MAX_DIGEST_RECIPIENTS = 10;
const MIN_FIRST_REPLY_MINUTES = 5;
const MAX_FIRST_REPLY_MINUTES = 24 * 60;
const MAX_ESCALATION_MINUTES = 7 * 24 * 60;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE = /^\+?[0-9][0-9 ()./-]{5,23}$/;

function deepFreeze(value) {
  if (value && typeof value === "object") {
    for (const nested of Object.values(value)) deepFreeze(nested);
    Object.freeze(value);
  }
  return value;
}

export const WORKSPACE_SETTINGS_DEFAULTS = deepFreeze({
  agency: {
    name: "MS Realty",
    phone: "",
    email: "",
    whatsapp: "",
    viber: "",
    offices: ["Sandanski"],
  },
  leads: {
    // Mirrors the historical ledger contract (15 minute reminder, 60 minute
    // manager escalation) so existing lead fixtures keep their deadlines.
    first_reply_target_minutes: 15,
    manager_escalation_minutes: 60,
    default_brokers: { buyer: "", renter: "", seller: "", landlord: "" },
  },
  notifications: {
    daily_digest_enabled: false,
    daily_digest_recipients: [],
    instant_new_lead_alerts: false,
  },
  workspace: {
    default_locale: "en",
    timezone: "Europe/Sofia",
    date_format: "locale",
  },
  public_site: {
    featured_listings_count: 6,
    show_price_on_request: true,
    saved_search_alerts_enabled: true,
  },
});

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function settingsError(message, field = null) {
  const error = new Error(message);
  error.status = 400;
  error.code = "invalid_workspace_settings";
  if (field) error.field = field;
  return error;
}

function text(value, { max = 160 } = {}) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function boolean(value) {
  if (value === true || value === 1) return true;
  return ["true", "on", "1", "yes"].includes(String(value ?? "").trim().toLowerCase());
}

function integer(value, { field, min, max, label }) {
  const raw = String(value ?? "").trim();
  if (!/^-?\d+$/.test(raw)) throw settingsError(`${label} must be a whole number`, field);
  const number = Number(raw);
  if (number < min || number > max) throw settingsError(`${label} must be between ${min} and ${max}`, field);
  return number;
}

function lines(value) {
  const raw = Array.isArray(value) ? value : String(value ?? "").split(/[\n,;]+/);
  return [...new Set(raw.map((entry) => text(entry, { max: 120 })).filter(Boolean))];
}

function phoneValue(value, field, label) {
  const normalized = text(value, { max: 32 });
  if (normalized && !PHONE.test(normalized)) throw settingsError(`${label} must be a phone number`, field);
  return normalized;
}

function emailValue(value, field, label) {
  const normalized = text(value, { max: 160 }).toLowerCase();
  if (normalized && !EMAIL.test(normalized)) throw settingsError(`${label} must be an email address`, field);
  return normalized;
}

function assertSection(section) {
  const name = String(section || "").trim();
  if (!WORKSPACE_SETTINGS_SECTIONS.includes(name)) throw settingsError("Unknown settings section", "section");
  return name;
}

function mergeSection(section, stored) {
  const defaults = clone(WORKSPACE_SETTINGS_DEFAULTS[section]);
  if (!stored || typeof stored !== "object" || Array.isArray(stored)) return defaults;
  const merged = { ...defaults };
  for (const [key, fallback] of Object.entries(defaults)) {
    const value = stored[key];
    if (value === undefined || value === null) continue;
    if (Array.isArray(fallback)) merged[key] = Array.isArray(value) ? value.map((entry) => String(entry)) : fallback;
    else if (fallback && typeof fallback === "object") {
      merged[key] = { ...fallback };
      for (const nestedKey of Object.keys(fallback)) {
        if (typeof value?.[nestedKey] === "string") merged[key][nestedKey] = value[nestedKey];
      }
    } else if (typeof fallback === "boolean") merged[key] = Boolean(value);
    else if (typeof fallback === "number") merged[key] = Number.isFinite(Number(value)) ? Number(value) : fallback;
    else merged[key] = String(value);
  }
  return merged;
}

function emptyDocument() {
  return {
    kind: "workspace_settings",
    version: WORKSPACE_SETTINGS_VERSION,
    revision: 0,
    updated_at: null,
    updated_by: null,
    sections: clone(WORKSPACE_SETTINGS_DEFAULTS),
    section_updates: {},
    revisions: [],
  };
}

function normalizeDocument(raw) {
  const document = emptyDocument();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return document;
  const sections = raw.sections && typeof raw.sections === "object" ? raw.sections : {};
  for (const section of WORKSPACE_SETTINGS_SECTIONS) document.sections[section] = mergeSection(section, sections[section]);
  document.revision = Number.isInteger(raw.revision) && raw.revision >= 0 ? raw.revision : 0;
  document.updated_at = typeof raw.updated_at === "string" ? raw.updated_at : null;
  document.updated_by = typeof raw.updated_by === "string" ? raw.updated_by : null;
  if (raw.section_updates && typeof raw.section_updates === "object") {
    for (const section of WORKSPACE_SETTINGS_SECTIONS) {
      const entry = raw.section_updates[section];
      if (entry && typeof entry.updated_at === "string") {
        document.section_updates[section] = {
          updated_at: entry.updated_at,
          updated_by: typeof entry.updated_by === "string" ? entry.updated_by : null,
        };
      }
    }
  }
  document.revisions = Array.isArray(raw.revisions)
    ? raw.revisions.filter((entry) => entry && typeof entry === "object").slice(-MAX_WORKSPACE_SETTINGS_REVISIONS)
    : [];
  return document;
}

export function readWorkspaceSettings(filePath = DEFAULT_WORKSPACE_SETTINGS_PATH) {
  if (!fs.existsSync(filePath)) return emptyDocument();
  try {
    return normalizeDocument(JSON.parse(fs.readFileSync(filePath, "utf8")));
  } catch {
    // A damaged ledger must not take the workbench down; defaults apply until
    // the next successful save rewrites the document.
    return emptyDocument();
  }
}

export function writeWorkspaceSettings(document, filePath = DEFAULT_WORKSPACE_SETTINGS_PATH) {
  const normalized = normalizeDocument(document);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(normalized, null, 2)}\n`);
  fs.renameSync(temporary, filePath);
  return normalized;
}

export function resetWorkspaceSettings(filePath = DEFAULT_WORKSPACE_SETTINGS_PATH) {
  return writeWorkspaceSettings(emptyDocument(), filePath);
}

export function normalizeWorkspaceSettingsSection(
  section,
  input = {},
  { brokerIds = [], adminLocales = WORKSPACE_ADMIN_LOCALES } = {},
) {
  const name = assertSection(section);
  const source = input && typeof input === "object" ? input : {};
  if (name === "agency") {
    const agencyName = text(source.name, { max: 120 });
    if (!agencyName) throw settingsError("Agency name is required", "name");
    const offices = lines(source.offices);
    if (offices.length > MAX_OFFICES) throw settingsError(`List at most ${MAX_OFFICES} offices`, "offices");
    return {
      name: agencyName,
      phone: phoneValue(source.phone, "phone", "Phone"),
      email: emailValue(source.email, "email", "Email"),
      whatsapp: phoneValue(source.whatsapp, "whatsapp", "WhatsApp"),
      viber: phoneValue(source.viber, "viber", "Viber"),
      offices,
    };
  }
  if (name === "leads") {
    const firstReply = integer(source.first_reply_target_minutes, {
      field: "first_reply_target_minutes",
      min: MIN_FIRST_REPLY_MINUTES,
      max: MAX_FIRST_REPLY_MINUTES,
      label: "First reply target",
    });
    const escalation = integer(source.manager_escalation_minutes, {
      field: "manager_escalation_minutes",
      min: MIN_FIRST_REPLY_MINUTES,
      max: MAX_ESCALATION_MINUTES,
      label: "Manager escalation",
    });
    if (escalation <= firstReply) {
      throw settingsError("Manager escalation must come after the first reply target", "manager_escalation_minutes");
    }
    const defaultBrokers = {};
    const submitted =
      source.default_brokers && typeof source.default_brokers === "object" && !Array.isArray(source.default_brokers)
        ? source.default_brokers
        : {};
    for (const group of Object.keys(DEFAULT_BROKER_LEAD_GROUPS)) {
      const value = text(submitted[group] ?? source[`default_broker_${group}`], { max: 80 });
      if (value && !brokerIds.includes(value)) throw settingsError(`Unknown broker for ${group} leads`, `default_broker_${group}`);
      defaultBrokers[group] = value;
    }
    return {
      first_reply_target_minutes: firstReply,
      manager_escalation_minutes: escalation,
      default_brokers: defaultBrokers,
    };
  }
  if (name === "notifications") {
    const enabled = boolean(source.daily_digest_enabled);
    const recipients = lines(source.daily_digest_recipients).map((entry) => entry.toLowerCase());
    for (const recipient of recipients) {
      if (!EMAIL.test(recipient)) throw settingsError(`${recipient} is not an email address`, "daily_digest_recipients");
    }
    if (recipients.length > MAX_DIGEST_RECIPIENTS) {
      throw settingsError(`List at most ${MAX_DIGEST_RECIPIENTS} digest recipients`, "daily_digest_recipients");
    }
    if (enabled && !recipients.length) throw settingsError("Add at least one recipient for the daily digest", "daily_digest_recipients");
    return {
      daily_digest_enabled: enabled,
      daily_digest_recipients: recipients,
      instant_new_lead_alerts: boolean(source.instant_new_lead_alerts),
    };
  }
  if (name === "workspace") {
    const locale = text(source.default_locale, { max: 8 }).toLowerCase();
    if (!adminLocales.includes(locale)) throw settingsError("Default interface language must be one of the workbench languages", "default_locale");
    const timezone = text(source.timezone, { max: 64 });
    if (!WORKSPACE_TIMEZONES.includes(timezone)) throw settingsError("Unknown timezone", "timezone");
    const dateFormat = text(source.date_format, { max: 16 }).toLowerCase();
    if (!WORKSPACE_DATE_FORMATS.includes(dateFormat)) throw settingsError("Unknown date format", "date_format");
    return { default_locale: locale, timezone, date_format: dateFormat };
  }
  return {
    featured_listings_count: integer(source.featured_listings_count, {
      field: "featured_listings_count",
      min: 0,
      max: 24,
      label: "Featured listings count",
    }),
    show_price_on_request: boolean(source.show_price_on_request),
    saved_search_alerts_enabled: boolean(source.saved_search_alerts_enabled),
  };
}

function changedFields(previous, next) {
  return Object.keys(next).filter((key) => JSON.stringify(previous?.[key]) !== JSON.stringify(next[key]));
}

export function updateWorkspaceSettings({
  filePath = DEFAULT_WORKSPACE_SETTINGS_PATH,
  section,
  values,
  actor,
  recordedAt = new Date().toISOString(),
  brokerIds = [],
  adminLocales = WORKSPACE_ADMIN_LOCALES,
} = {}) {
  const name = assertSection(section);
  const operator = text(actor, { max: 80 });
  if (!operator) throw settingsError("Settings changes require an attributable operator", "actor");
  const normalized = normalizeWorkspaceSettingsSection(name, values, { brokerIds, adminLocales });
  const current = readWorkspaceSettings(filePath);
  const changes = changedFields(current.sections[name], normalized);
  if (!changes.length && current.section_updates[name]) {
    return { settings: current, section: name, values: normalized, changed_fields: [], revision: current.revision, idempotent: true };
  }
  const revision = current.revision + 1;
  const next = {
    ...current,
    revision,
    updated_at: recordedAt,
    updated_by: operator,
    sections: { ...current.sections, [name]: normalized },
    section_updates: { ...current.section_updates, [name]: { updated_at: recordedAt, updated_by: operator } },
    revisions: [
      ...current.revisions,
      { revision, recorded_at: recordedAt, actor: operator, section: name, changed_fields: changes },
    ].slice(-MAX_WORKSPACE_SETTINGS_REVISIONS),
  };
  const settings = writeWorkspaceSettings(next, filePath);
  return { settings, section: name, values: normalized, changed_fields: changes, revision, idempotent: false };
}

// The privacy-safe projection carried in admin page payloads.
export function workspaceSettingsView(settings = emptyDocument()) {
  const document = normalizeDocument(settings);
  return {
    revision: document.revision,
    updated_at: document.updated_at,
    updated_by: document.updated_by,
    section_updates: document.section_updates,
    sections: document.sections,
  };
}

export function leadSlaOptions(settings) {
  const leads = normalizeDocument(settings).sections.leads;
  return { slaMinutes: leads.first_reply_target_minutes, escalationMinutes: leads.manager_escalation_minutes };
}

export function defaultBrokerForLeadType(settings, leadType) {
  const brokers = normalizeDocument(settings).sections.leads.default_brokers;
  const type = String(leadType || "").trim();
  for (const [group, leadTypes] of Object.entries(DEFAULT_BROKER_LEAD_GROUPS)) {
    if (leadTypes.includes(type) && brokers[group]) return brokers[group];
  }
  return null;
}

// Re-routes a freshly created inbox item to the workspace default broker for
// its lead type. Manual overrides from a broker always win.
export function applyWorkspaceDefaultBroker(inboxItem, settings, brokerProfiles = []) {
  const brokerId = defaultBrokerForLeadType(settings, inboxItem?.lead?.leadType);
  const assignment = inboxItem?.broker_assignment;
  if (!brokerId || !assignment || assignment.method === "manual_override" || assignment.broker_id === brokerId) return inboxItem;
  if (brokerProfiles.length && !brokerProfiles.some((profile) => profile.id === brokerId)) return inboxItem;
  return {
    ...inboxItem,
    broker_assignment: {
      ...assignment,
      method: "workspace_default",
      broker_id: brokerId,
      criteria: { ...(assignment.criteria || {}), lead_type: inboxItem.lead.leadType, default_broker_rule: true },
    },
  };
}

export const WORKSPACE_ONBOARDING_ITEMS = Object.freeze([
  { id: "agency_profile", href: "/admin/settings#settings-agency" },
  { id: "lead_sla", href: "/admin/settings#settings-leads" },
  { id: "teammate", href: "/admin/team" },
  { id: "provider", href: "/admin/connect" },
  { id: "first_reply", href: "/admin/leads" },
]);

// Computed from real workspace state; the renderer only formats it.
export function buildWorkspaceOnboarding({
  settings = emptyDocument(),
  teamSize = 1,
  teamSizeKnown = false,
  providerConnections = [],
  replyDeliveryStates = [],
} = {}) {
  const document = normalizeDocument(settings);
  const agency = document.sections.agency;
  const agencySaved = Boolean(document.section_updates.agency);
  const state = {
    agency_profile: agencySaved && Boolean(agency.name) && Boolean(agency.phone || agency.email),
    lead_sla: Boolean(document.section_updates.leads),
    teammate: Number(teamSize) > 1,
    provider: (providerConnections || []).some((connection) => connection?.status === "connected" || connection?.connected === true),
    first_reply: (replyDeliveryStates || []).some((row) => row?.status === "sent"),
  };
  const items = WORKSPACE_ONBOARDING_ITEMS.map((item) => ({
    id: item.id,
    href: item.href,
    done: state[item.id] === true,
    ...(item.id === "teammate" ? { known: teamSizeKnown === true } : {}),
  }));
  const done = items.filter((item) => item.done).length;
  return { total: items.length, done, complete: done === items.length, items };
}

export function assertWorkspaceSettings(document) {
  const normalized = normalizeDocument(document);
  for (const section of WORKSPACE_SETTINGS_SECTIONS) {
    normalizeWorkspaceSettingsSection(section, normalized.sections[section], {
      brokerIds: Object.values(normalized.sections.leads.default_brokers).filter(Boolean),
    });
  }
  return true;
}
