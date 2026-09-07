import { publishedListingTranslationCopy } from "./content.mjs";
import { publicSeedFor } from "./public-inventory.mjs";
import { contentHash } from "./translations.mjs";
import { listingPath } from "./seo.mjs";
import { deriveTasks, openTask, planOpenTask, readTaskEvents } from "./tasks.mjs";
import { appendAuditLog, createAuditLogEntry } from "./audit-log.mjs";
import { agentRuntimeMetadata, openAiCompatibleHermesProvider, providerMetadataFromEnv } from "./hermes-draft-worker.mjs";

const FACT_FIELDS = ["location", "property_type", "offer_type", "price_eur", "area_sqm", "land_area_sqm", "bedrooms", "listing_status"];
const FACT_LABELS = { location: "Location", property_type: "Property type", offer_type: "Offer", price_eur: "Price (EUR)", area_sqm: "Area (m²)", land_area_sqm: "Land area (m²)", bedrooms: "Bedrooms", listing_status: "Availability" };

// This capability selects source wording. It never produces a translation or
// a model-written factual claim, and it uses the existing operator task ledger.
export function sourceReviewSnapshot({ seed, registry, listingId, now = new Date().toISOString() }) {
  const record = publicSeedFor(seed, { now }).records.find((row) => row.collection === "listings" && row.id === listingId);
  if (!record) throw new Error("An approved public listing is required for source review");
  const translation = record.translations?.find((row) => row.locale === record.source_locale);
  const copy = publishedListingTranslationCopy(translation);
  const sourceHash = contentHash(record.facts);
  if (!copy || translation.listing !== record.id || translation.source_locale !== record.source_locale ||
      translation.source_hash !== sourceHash || translation.translated_hash !== contentHash(copy) ||
      [translation.approved_at, translation.publication_authorized_at, translation.published_at].some((value) => Date.parse(value) > Date.parse(now))) {
    throw new Error("Current human-approved source wording is unavailable");
  }
  const url = new URL(record.source_url);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) throw new Error("A canonical listing source URL is required");
  const facts = Object.fromEntries(FACT_FIELDS.map((field) => [field, record.facts[field] ?? null]));
  const passages = [copy.title, ...copy.description.split(/\n+/u)].filter((text) => text && text.length <= 450 && !/<[^>]*>/u.test(text))
    .slice(0, 8).map((quote, index) => ({ id: `passage-${index + 1}`, quote }));
  if (!passages.length) throw new Error("No bounded source passage is available for review");
  return {
    listing_id: record.id, source_locale: record.source_locale, source_hash: sourceHash,
    approval_hash: contentHash(translation), facts, passages,
    canonical_url: listingPath(registry, record.source_locale, record.id), source_url: record.source_url,
    reviewer: translation.reviewer, reviewed_at: translation.approved_at,
  };
}

export function sourceReviewSelection(snapshot, response) {
  if (!response || typeof response !== "object" || Array.isArray(response) || Object.keys(response).length !== 1 || !Array.isArray(response.selected_passage_ids) || response.selected_passage_ids.length !== 1) {
    throw new Error("Hermes must select exactly one supplied passage without adding text");
  }
  const selected = snapshot.passages.find((row) => row.id === response.selected_passage_ids[0]);
  if (!selected) throw new Error("Hermes selected an unknown source passage");
  return selected;
}

function taskNote(snapshot, selected, reason) {
  // Unknown values stay unknown. The provider cannot supply or modify these.
  const facts = Object.entries(snapshot.facts).map(([field, value]) => `${FACT_LABELS[field]}: ${value === null || value === "" ? "unknown" : value}`).join("; ");
  const note = `Source review draft (${snapshot.source_locale}). Human review pending; no translation performed.\nReason: ${reason}\n“${selected.quote}”\n${facts}\nListing: ${snapshot.canonical_url}\nSource: ${snapshot.source_url}\nSource version: ${snapshot.source_hash}`;
  if (note.length > 1000) throw new Error("The source review exceeds the task note limit; choose a shorter source passage");
  return note;
}

export function readSourceReviewTask(taskId, filePath) {
  const task = deriveTasks(readTaskEvents(filePath)).find((row) => row.task_id === taskId && row.kind === "source_review");
  if (!task) throw new Error("Source review task not found");
  return task;
}

export async function runHermesSourceReview({
  loadSeed, registry, listingId, taskId, actor, owner, reason, humanConfirmed,
  filePath, auditLogPath, provider = openAiCompatibleHermesProvider(), providerMetadata = providerMetadataFromEnv(),
  now = () => new Date().toISOString(),
}) {
  if (!filePath || !auditLogPath) throw new Error("Source review requires explicit task and audit ledger paths");
  if (providerMetadata.mode !== "self_hosted") throw new Error("Source review requires the existing private Hermes provider");
  if (typeof reason !== "string" || !reason.trim() || reason.length > 160) throw new Error("A source review reason of 1–160 characters is required");
  const generatedAt = now();
  const events = readTaskEvents(filePath);
  if (events.some((row) => row.task_id === taskId)) throw new Error("This task already exists; read it before starting another review");
  const taskInput = { taskId, taskType: "source_review", subjectRef: listingId, actor, owner, humanConfirmed, note: reason, priority: "normal" };
  // Confirming task creation does not approve its contents or publish anything.
  planOpenTask(taskInput, { events, recordedAt: generatedAt });
  const snapshot = sourceReviewSnapshot({ seed: await loadSeed(), registry, listingId, now: generatedAt });
  const persisted = [];
  const rejected = [];
  let output = null;
  try {
    const response = await provider({ prompt: { role: "source_review_selection", passages: snapshot.passages.map(({ id, quote }) => ({ id, text: quote })) } });
    const selected = sourceReviewSelection(snapshot, response);
    const current = sourceReviewSnapshot({ seed: await loadSeed(), registry, listingId, now: now() });
    if (contentHash(current) !== contentHash(snapshot)) throw new Error("The source or its approval changed during review; start a new task");
    const note = taskNote(snapshot, selected, reason.trim());
    openTask({ ...taskInput, note, reference: `source-review:${snapshot.source_hash}` }, { filePath, recordedAt: now() });
    const task = readSourceReviewTask(taskId, filePath);
    if (task.note !== note || task.subject_ref !== listingId || task.status !== "open" || task.opened_by !== actor || task.owner !== owner) {
      throw new Error("Source review task readback did not match the requested draft");
    }
    output = {
      kind: "source_review_draft", task_id: taskId, source: snapshot,
      passages: [selected], model_generated_claims: false, translation_performed: false,
      human_approved: false, public_indexable: false, can_publish: false,
      operator_task: { path: "/admin/tasks", status: task.status, note: task.note },
    };
    persisted.push({ id: taskId, task_type: "source_review", status: task.status, source_hash: snapshot.source_hash, public_indexable: false, human_approved: false, durable_readback: true });
  } catch (error) {
    rejected.push({ id: taskId, error: error.message });
  }
  appendAuditLog(createAuditLogEntry({
    action: "hermes_model_call", actor, objectType: "source_review_task", objectId: taskId,
    locale: snapshot.source_locale, status: persisted.length ? "persisted" : "rejected",
    metadata: { capability: "source_review", model: providerMetadata.model, source_hash: snapshot.source_hash, result: persisted.length ? "persisted" : "rejected" },
  }, now()), { filePath: auditLogPath });
  return {
    generated_at: generatedAt, capability: "source_review", translation_status: "not_validated",
    agent_runtime: agentRuntimeMetadata(),
    provider: { mode: providerMetadata.mode, model: providerMetadata.model, endpoint: providerMetadata.endpoint, tool_call_parser: "hermes", sensitive_data_allowed: true },
    ledger_path: filePath, audit_log_path: auditLogPath, audit_log_rows: 1,
    summary: { attempted: 1, persisted: persisted.length, rejected: rejected.length },
    persisted, rejected, output,
  };
}
