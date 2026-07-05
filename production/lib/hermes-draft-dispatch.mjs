import fs from "node:fs";
import path from "node:path";
import { createTranslationReviewTask } from "./admin-workflows.mjs";
import { loadLocaleRegistry } from "./locales.mjs";
import { loadCmsSeed } from "./runtime.mjs";
import { buildTranslationCoverageReport } from "./translation-coverage.mjs";
import { fromRoot } from "./paths.mjs";

export const DEFAULT_HERMES_DRAFT_DISPATCH_PATH = fromRoot("production", "data", "hermes-draft-dispatch.json");
export const DEFAULT_HERMES_DRAFT_BATCH_LIMIT = 25;

const DRAFTABLE_TASKS = new Set(["hermes_draft_required", "stale_review_required"]);

function sourceContent(record) {
  const facts = record.facts || {};
  return {
    title: facts.title || record.seo?.title || record.id,
    description: facts.description || record.seo?.description || facts.h1 || facts.title || record.id,
  };
}

function propertyFacts(record) {
  const facts = record.facts || {};
  const values = {
    id: record.id,
    location: facts.location,
    property_type: facts.property_type,
    offer_type: facts.offer_type,
    price_eur: facts.price_eur,
  };
  return Object.fromEntries(Object.entries(values).filter(([, value]) => value !== null && value !== undefined && value !== ""));
}

function draftableRows(report) {
  return report.rows
    .filter((row) => row.provider_mode === "hermes_draft" && DRAFTABLE_TASKS.has(row.task_type))
    .sort((a, b) => {
      const priority = Number(b.task_type === "stale_review_required") - Number(a.task_type === "stale_review_required");
      return priority || a.target_locale.localeCompare(b.target_locale) || a.listing_id.localeCompare(b.listing_id);
    });
}

function dispatchRow(registry, record, coverageRow) {
  const task = createTranslationReviewTask(registry, {
    objectType: "listing",
    objectId: record.id,
    sourceLocale: record.source_locale,
    targetLocale: coverageRow.target_locale,
    sourceContent: sourceContent(record),
    propertyFacts: propertyFacts(record),
  });

  return {
    id: task.id,
    status: "ready_for_hermes",
    task_type: coverageRow.task_type,
    object_type: task.object_type,
    object_id: task.object_id,
    source_locale: task.source_locale,
    target_locale: task.target_locale,
    target_direction: task.target_direction,
    reviewer_role: task.reviewer_role,
    provider_mode: task.provider_mode,
    public_indexable: false,
    requires_human_approval: true,
    can_publish: false,
    can_mark_indexable: false,
    source_hash: task.source_hash,
    draft_hash: task.draft_hash,
    admin_path: coverageRow.admin_path,
    prompt: task.hermes.prompt,
    source_snapshot: task.hermes.source_snapshot,
    citations: [
      { source: "cms_seed", object_id: record.id, fields: ["facts.title", "facts.description", "facts.location"] },
      { source: "translation_coverage", task_id: coverageRow.task.id },
    ],
  };
}

export function buildHermesDraftDispatch({
  registry = loadLocaleRegistry(),
  seed = loadCmsSeed(),
  translationCoverage = buildTranslationCoverageReport({ registry, seed }),
  limit = DEFAULT_HERMES_DRAFT_BATCH_LIMIT,
  generatedAt = new Date().toISOString(),
} = {}) {
  const records = new Map(seed.records.filter((record) => record.collection === "listings").map((record) => [record.id, record]));
  const rows = draftableRows(translationCoverage);
  const batch = rows.slice(0, limit).map((row) => {
    const record = records.get(row.listing_id);
    if (!record) throw new Error(`Missing CMS listing record for Hermes dispatch: ${row.listing_id}`);
    return dispatchRow(registry, record, row);
  });

  return {
    generated_at: generatedAt,
    summary: {
      eligible_tasks: rows.length,
      batch_limit: limit,
      batch_size: batch.length,
      remaining_after_batch: Math.max(rows.length - batch.length, 0),
      by_target_locale: batch.reduce((counts, row) => {
        counts[row.target_locale] = (counts[row.target_locale] || 0) + 1;
        return counts;
      }, {}),
    },
    rows: batch,
  };
}

export function assertHermesDraftDispatch(dispatch) {
  if (dispatch.summary.batch_size !== dispatch.rows.length) throw new Error("Hermes dispatch summary must match rows");
  if (dispatch.summary.batch_size > dispatch.summary.batch_limit) throw new Error("Hermes dispatch must respect batch limit");
  if (dispatch.summary.remaining_after_batch !== dispatch.summary.eligible_tasks - dispatch.rows.length) {
    throw new Error("Hermes dispatch remaining count must match eligible tasks");
  }
  for (const row of dispatch.rows) {
    if (row.status !== "ready_for_hermes" || row.provider_mode !== "hermes_draft") {
      throw new Error("Hermes dispatch rows must be model-ready Hermes draft tasks");
    }
    if (row.public_indexable !== false || row.requires_human_approval !== true || row.can_publish || row.can_mark_indexable) {
      throw new Error("Hermes dispatch rows must remain non-publishing and reviewer-gated");
    }
    if (!row.prompt?.sourceText || row.prompt.role !== "translation_draft" || !row.source_snapshot?.source_hash) {
      throw new Error("Hermes dispatch rows must include prompt and source snapshot");
    }
    if (!Array.isArray(row.citations) || row.citations.length < 2) {
      throw new Error("Hermes dispatch rows must cite source content and coverage task");
    }
  }
  return true;
}

export function writeHermesDraftDispatch(dispatch, filePath = DEFAULT_HERMES_DRAFT_DISPATCH_PATH) {
  assertHermesDraftDispatch(dispatch);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(dispatch, null, 2)}\n`);
  return filePath;
}
