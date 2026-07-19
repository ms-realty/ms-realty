import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fromRoot } from "./paths.mjs";

export const DEFAULT_ACCOUNT_LEDGER_PATH = fromRoot("production", "data", "account-ledger.jsonl");

const ACCOUNT_TYPES = new Set(["family", "company"]);
const ACCOUNT_ID = /^account-[a-z0-9][a-z0-9._-]{1,79}$/i;
const CONTACT_ID = /^contact-[a-z0-9][a-z0-9._-]{1,127}$/i;

function confirmed(value) {
  return value === true || value === "true" || value === "on" || value === "1";
}

function iso(value, label) {
  const text = String(value || "").trim();
  if (!text || Number.isNaN(Date.parse(text))) throw new Error(`${label} must be an ISO timestamp`);
  return new Date(text).toISOString();
}

function bounded(value, label, max, { required = false } = {}) {
  const text = String(value || "").trim();
  if (required && !text) throw new Error(`${label} is required`);
  if (text.length > max) throw new Error(`${label} must be ${max} characters or fewer`);
  return text || null;
}

export function resetAccountLedger(filePath = DEFAULT_ACCOUNT_LEDGER_PATH) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, "");
}

export function readAccountLedger(filePath = DEFAULT_ACCOUNT_LEDGER_PATH) {
  if (!fs.existsSync(filePath)) return [];
  return fs
    .readFileSync(filePath, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function appendEvent(event, filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.appendFileSync(filePath, `${JSON.stringify(event)}\n`);
  return event;
}

function sameCreation(left, right) {
  return left.action === right.action && left.account_id === right.account_id && left.account_type === right.account_type && left.label === right.label;
}

function sameLink(left, right) {
  return left.action === right.action && left.account_id === right.account_id && left.contact_id === right.contact_id;
}

export function appendAccountCreation(input, { filePath = DEFAULT_ACCOUNT_LEDGER_PATH, recordedAt = new Date().toISOString() } = {}) {
  const accountType = String(input.accountType || input.account_type || "").trim().toLowerCase();
  if (!ACCOUNT_TYPES.has(accountType)) throw new Error("accountType must be family or company");
  const label = bounded(input.label, "Account label", 120, { required: true });
  const generatedId = `account-${accountType}-${crypto.createHash("sha256").update(`${accountType}:${label.toLowerCase()}`).digest("hex").slice(0, 12)}`;
  const accountId = String(input.accountId || input.account_id || generatedId).trim();
  if (!ACCOUNT_ID.test(accountId)) throw new Error("accountId must begin with account- and contain only safe identifier characters");
  const actor = bounded(input.actor, "Account actor", 80, { required: true });
  if (!confirmed(input.humanConfirmed ?? input.human_confirmed)) throw new Error("Human confirmation is required to create an account");
  const row = {
    id: `account-event-${accountId}-created`,
    action: "account_created",
    account_id: accountId,
    account_type: accountType,
    label,
    actor,
    note: bounded(input.note, "Account note", 1000),
    human_confirmed: true,
    recorded_at: iso(recordedAt, "recordedAt"),
  };
  const rows = readAccountLedger(filePath);
  const existing = rows.find((event) => event.account_id === accountId && event.action === "account_created");
  if (existing) {
    if (!sameCreation(existing, row)) throw new Error("Account id already belongs to another account");
    return { ...existing, idempotent: true };
  }
  return { ...appendEvent(row, filePath), idempotent: false };
}

export function deriveAccounts(rows = []) {
  const accounts = new Map();
  const contactOwners = new Map();
  for (const event of rows) {
    if (event.action === "account_created") {
      if (!accounts.has(event.account_id)) {
        accounts.set(event.account_id, {
          id: event.account_id,
          type: event.account_type,
          label: event.label,
          created_at: event.recorded_at,
          created_by: event.actor,
          contact_ids: [],
          events: [event],
        });
      }
      continue;
    }
    if (event.action === "contact_linked") {
      const account = accounts.get(event.account_id);
      if (!account) continue;
      const prior = contactOwners.get(event.contact_id);
      if (!prior) {
        account.contact_ids.push(event.contact_id);
        contactOwners.set(event.contact_id, account.id);
      }
      account.events.push(event);
    }
  }
  return [...accounts.values()].map((account) => ({ ...account, contact_count: account.contact_ids.length }));
}

export function appendAccountContactLink(
  contacts,
  input,
  { filePath = DEFAULT_ACCOUNT_LEDGER_PATH, recordedAt = new Date().toISOString() } = {},
) {
  const accountId = String(input.accountId || input.account_id || "").trim();
  const contactId = String(input.contactId || input.contact_id || "").trim();
  if (!ACCOUNT_ID.test(accountId)) throw new Error("A known accountId is required");
  if (!CONTACT_ID.test(contactId) || !contacts.some((contact) => contact.id === contactId)) {
    throw new Error("A known contactId is required");
  }
  const actor = bounded(input.actor, "Link actor", 80, { required: true });
  const reason = bounded(input.reason, "Link reason", 1000, { required: true });
  if (!confirmed(input.linkConfirmed ?? input.link_confirmed)) throw new Error("Human confirmation is required to link a contact");
  const rows = readAccountLedger(filePath);
  const accounts = deriveAccounts(rows);
  if (!accounts.some((account) => account.id === accountId)) throw new Error("A known accountId is required");
  const currentOwner = accounts.find((account) => account.contact_ids.includes(contactId));
  const row = {
    id: `account-event-${accountId}-${contactId}-linked`,
    action: "contact_linked",
    account_id: accountId,
    contact_id: contactId,
    actor,
    reason,
    human_confirmed: true,
    recorded_at: iso(recordedAt, "recordedAt"),
  };
  const existing = rows.find((event) => event.id === row.id);
  if (existing) {
    if (!sameLink(existing, row)) throw new Error("Account link id already belongs to another contact");
    return { ...existing, idempotent: true };
  }
  if (currentOwner && currentOwner.id !== accountId) throw new Error("Contact already belongs to another account");
  return { ...appendEvent(row, filePath), idempotent: false };
}

export function assertAccountLedger(rows) {
  if (!rows.length) throw new Error("Account ledger must contain at least one row");
  const ids = new Set();
  const created = new Set();
  const linked = new Set();
  for (const row of rows) {
    if (!row.id || ids.has(row.id) || !row.actor || row.human_confirmed !== true || Number.isNaN(Date.parse(row.recorded_at))) {
      throw new Error("Account ledger row is missing audit data");
    }
    ids.add(row.id);
    if (row.action === "account_created") {
      if (!ACCOUNT_ID.test(row.account_id) || !ACCOUNT_TYPES.has(row.account_type) || !row.label) throw new Error("Account creation is invalid");
      created.add(row.account_id);
    } else if (row.action === "contact_linked") {
      if (!created.has(row.account_id) || !CONTACT_ID.test(row.contact_id) || linked.has(row.contact_id)) {
        throw new Error("Account contact link is invalid or duplicated");
      }
      linked.add(row.contact_id);
    } else {
      throw new Error("Unknown account ledger action");
    }
  }
  return true;
}
