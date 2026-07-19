import fs from "node:fs";
import path from "node:path";
import { fromRoot } from "./paths.mjs";

export const DEFAULT_DOCUMENT_CHECKLIST_LEDGER_PATH = fromRoot("production", "data", "document-checklist-outcomes.jsonl");

const STATUSES = new Set(["pending", "complete", "blocked", "not_applicable"]);

const TEMPLATES = Object.freeze({
  buyer: ["requirements_confirmed", "identity_review", "funding_review", "offer_record", "legal_due_diligence", "contract_review", "closing_handover"],
  renter: ["requirements_confirmed", "identity_review", "application_review", "lease_review", "deposit_terms", "closing_handover"],
  seller: ["authority_review", "property_document_review", "mandate_record", "legal_due_diligence", "offer_record", "contract_review", "closing_handover"],
  general: ["scope_confirmed", "identity_review", "next_process_confirmed"],
});

const LABELS = Object.freeze({
  en: {
    buyer: "Buyer process",
    renter: "Renter process",
    seller: "Seller process",
    general: "General enquiry process",
    foreign_process_scope: "Confirm whether foreign-buyer guidance applies",
    requirements_confirmed: "Requirements and timeline confirmed",
    identity_review: "Identity details reviewed by the responsible professional",
    funding_review: "Funding or proof-of-funds process reviewed",
    offer_record: "Offer or reservation record reviewed",
    legal_due_diligence: "Independent legal due-diligence step confirmed",
    contract_review: "Contract review responsibility confirmed",
    closing_handover: "Closing and handover evidence recorded",
    application_review: "Rental application reviewed",
    lease_review: "Lease review responsibility confirmed",
    deposit_terms: "Deposit terms confirmed",
    authority_review: "Seller identity and authority reviewed",
    property_document_review: "Property-document collection reviewed",
    mandate_record: "Agency mandate or instruction recorded",
    scope_confirmed: "Enquiry scope confirmed",
    next_process_confirmed: "Next responsible process confirmed",
  },
  bg: {
    buyer: "Процес за купувач",
    renter: "Процес за наемател",
    seller: "Процес за продавач",
    general: "Процес за общо запитване",
    foreign_process_scope: "Потвърдете дали се прилага процесът за чуждестранен купувач",
    requirements_confirmed: "Изискванията и срокът са потвърдени",
    identity_review: "Данните за самоличност са прегледани от отговорния специалист",
    funding_review: "Процесът за финансиране или доказване на средства е прегледан",
    offer_record: "Записът за оферта или резервация е прегледан",
    legal_due_diligence: "Потвърдена е независимата правна проверка",
    contract_review: "Потвърдена е отговорността за преглед на договора",
    closing_handover: "Записани са доказателствата за приключване и предаване",
    application_review: "Заявлението за наем е прегледано",
    lease_review: "Потвърдена е отговорността за преглед на договора за наем",
    deposit_terms: "Условията за депозита са потвърдени",
    authority_review: "Самоличността и представителната власт на продавача са прегледани",
    property_document_review: "Събирането на документите за имота е прегледано",
    mandate_record: "Посредническото възлагане е записано",
    scope_confirmed: "Обхватът на запитването е потвърден",
    next_process_confirmed: "Следващият отговорен процес е потвърден",
  },
  ru: {
    buyer: "Процесс покупателя",
    renter: "Процесс арендатора",
    seller: "Процесс продавца",
    general: "Процесс общего запроса",
    foreign_process_scope: "Подтвердите, применяется ли процесс для иностранного покупателя",
    requirements_confirmed: "Требования и сроки подтверждены",
    identity_review: "Данные личности проверены ответственным специалистом",
    funding_review: "Процесс финансирования или подтверждения средств проверен",
    offer_record: "Запись предложения или бронирования проверена",
    legal_due_diligence: "Подтвержден этап независимой юридической проверки",
    contract_review: "Ответственность за проверку договора подтверждена",
    closing_handover: "Доказательства закрытия и передачи зафиксированы",
    application_review: "Заявка на аренду проверена",
    lease_review: "Ответственность за проверку договора аренды подтверждена",
    deposit_terms: "Условия депозита подтверждены",
    authority_review: "Личность и полномочия продавца проверены",
    property_document_review: "Сбор документов на объект проверен",
    mandate_record: "Поручение агентству зафиксировано",
    scope_confirmed: "Объем запроса подтвержден",
    next_process_confirmed: "Следующий ответственный процесс подтвержден",
  },
});

function truthy(value) {
  return value === true || value === "true" || value === "on" || value === "1";
}

function bounded(value, label, max, required = false) {
  const text = String(value || "").trim();
  if (required && !text) throw new Error(`${label} is required`);
  if (text.length > max) throw new Error(`${label} must be ${max} characters or fewer`);
  return text || null;
}

function normalizedLocale(locale) {
  return ["bg", "ru", "en"].includes(locale) ? locale : "en";
}

function checklistKind(lead) {
  return TEMPLATES[lead.lead_type] ? lead.lead_type : "general";
}

function itemKeys(lead) {
  const keys = [...TEMPLATES[checklistKind(lead)]];
  if (lead.original_language && lead.original_language !== "bg") keys.unshift("foreign_process_scope");
  return keys;
}

function latestOutcomes(outcomes) {
  const latest = new Map();
  for (const outcome of outcomes) latest.set(`${outcome.lead_id}:${outcome.item_key}`, outcome);
  return latest;
}

export function buildDocumentChecklistQueue(leads = [], outcomes = [], { locale = "en" } = {}) {
  const selectedLocale = normalizedLocale(locale);
  const labels = LABELS[selectedLocale];
  const latest = latestOutcomes(outcomes);
  const rows = leads.map((lead) => {
    const kind = checklistKind(lead);
    const items = itemKeys(lead).map((key, index) => {
      const outcome = latest.get(`${lead.lead_id}:${key}`) || null;
      const status = outcome?.status || "pending";
      return {
        id: `document-item-${lead.lead_id}-${key}`,
        key,
        label: labels[key],
        ordinal: index + 1,
        status,
        blocked: status === "blocked",
        complete: status === "complete" || status === "not_applicable",
        outcome,
      };
    });
    const complete = items.filter((item) => item.complete).length;
    const blocked = items.filter((item) => item.blocked).length;
    return {
      id: `document-checklist-${lead.lead_id}`,
      lead_id: lead.lead_id,
      lead_type: lead.lead_type,
      listing_reference: lead.listing_reference || null,
      original_language: lead.original_language,
      assigned_broker: lead.broker_assignment?.broker_id || lead.assigned_broker || null,
      kind,
      title: labels[kind],
      items,
      item_count: items.length,
      completed_count: complete,
      blocked_count: blocked,
      open_count: items.length - complete,
      progress_percent: items.length ? Math.round((complete / items.length) * 100) : 0,
      next_item: items.find((item) => !item.complete) || null,
    };
  });
  return {
    rows,
    summary: {
      checklists: rows.length,
      open: rows.filter((row) => row.open_count > 0).length,
      blocked: rows.filter((row) => row.blocked_count > 0).length,
      complete: rows.filter((row) => row.open_count === 0).length,
      items: rows.reduce((total, row) => total + row.item_count, 0),
      items_complete: rows.reduce((total, row) => total + row.completed_count, 0),
    },
  };
}

export function resetDocumentChecklistOutcomes(filePath = DEFAULT_DOCUMENT_CHECKLIST_LEDGER_PATH) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, "");
}

export function readDocumentChecklistOutcomes(filePath = DEFAULT_DOCUMENT_CHECKLIST_LEDGER_PATH) {
  if (!fs.existsSync(filePath)) return [];
  return fs
    .readFileSync(filePath, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function sameOutcome(left, right) {
  return left.lead_id === right.lead_id && left.item_key === right.item_key && left.status === right.status && left.actor === right.actor && (left.note || null) === (right.note || null) && (left.reference || null) === (right.reference || null);
}

export function appendDocumentChecklistOutcome(
  leads,
  input,
  { filePath = DEFAULT_DOCUMENT_CHECKLIST_LEDGER_PATH, recordedAt = new Date().toISOString() } = {},
) {
  const leadId = bounded(input.leadId || input.lead_id, "leadId", 160, true);
  const lead = leads.find((row) => row.lead_id === leadId);
  if (!lead) throw new Error("Document checklist requires a known leadId");
  const itemKey = bounded(input.itemKey || input.item_key, "itemKey", 120, true);
  if (!itemKeys(lead).includes(itemKey)) throw new Error("Document checklist item does not belong to this lead");
  const status = String(input.status || "").trim().toLowerCase();
  if (!STATUSES.has(status) || status === "pending") throw new Error("Document outcome status must be complete, blocked, or not_applicable");
  const actor = bounded(input.actor, "Document outcome actor", 80, true);
  const note = bounded(input.note, "Document outcome note", 1000, status !== "complete" ? true : false);
  const reference = bounded(input.reference, "Document reference", 160, false);
  if (status === "complete" && !note && !reference) throw new Error("Completed document item requires a note or internal reference");
  if (!truthy(input.humanConfirmed ?? input.human_confirmed)) throw new Error("Human confirmation is required for document checklist outcomes");
  const recorded = new Date(recordedAt);
  if (Number.isNaN(recorded.getTime())) throw new Error("recordedAt must be an ISO timestamp");
  const rows = readDocumentChecklistOutcomes(filePath);
  const prior = [...rows].reverse().find((row) => row.lead_id === leadId && row.item_key === itemKey);
  const ordinal = rows.filter((row) => row.lead_id === leadId && row.item_key === itemKey).length + 1;
  const row = {
    id: String(input.id || `document-outcome-${leadId}-${itemKey}-${ordinal}`).trim(),
    lead_id: leadId,
    item_key: itemKey,
    status,
    actor,
    note,
    reference,
    human_confirmed: true,
    recorded_at: recorded.toISOString(),
  };
  const existing = rows.find((candidate) => candidate.id === row.id) || [...rows].reverse().find((candidate) => sameOutcome(candidate, row));
  if (existing) {
    if (!sameOutcome(existing, row)) throw new Error("Document outcome id already belongs to another action");
    return { outcome: existing, checklist: buildDocumentChecklistQueue([lead], rows, { locale: lead.admin_locale }).rows[0], idempotent: true };
  }
  if (prior && ["complete", "not_applicable"].includes(prior.status)) throw new Error("Completed document checklist items are immutable");
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.appendFileSync(filePath, `${JSON.stringify(row)}\n`);
  return { outcome: row, checklist: buildDocumentChecklistQueue([lead], [...rows, row], { locale: lead.admin_locale }).rows[0], idempotent: false };
}

export function assertDocumentChecklistOutcomes(rows) {
  if (!rows.length) throw new Error("Document checklist outcome ledger must contain at least one row");
  const ids = new Set();
  for (const row of rows) {
    if (!row.id || ids.has(row.id) || !row.lead_id || !row.item_key || !STATUSES.has(row.status) || row.status === "pending") {
      throw new Error("Document checklist outcome is missing routing data");
    }
    ids.add(row.id);
    if (!row.actor || row.human_confirmed !== true || Number.isNaN(Date.parse(row.recorded_at))) throw new Error("Document checklist outcome is missing audit data");
    if ("document" in row || "file" in row || "body" in row) throw new Error("Document checklist ledger must not store document contents");
  }
  return true;
}
