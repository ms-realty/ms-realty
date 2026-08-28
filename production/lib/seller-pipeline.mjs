import fs from "node:fs";
import path from "node:path";
import { fromRoot } from "./paths.mjs";

export const DEFAULT_SELLER_PIPELINE_PATH = fromRoot("production", "data", "seller-pipeline.jsonl");

export function resetSellerPipeline(filePath = DEFAULT_SELLER_PIPELINE_PATH) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, "");
}

export function readSellerPipeline(filePath = DEFAULT_SELLER_PIPELINE_PATH) {
  if (!fs.existsSync(filePath)) return [];
  return fs
    .readFileSync(filePath, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

export function createSellerPipelineItem(lead, { createdAt = new Date().toISOString(), owner = "unassigned" } = {}) {
  if (lead.lead?.leadType !== "seller") throw new Error("Seller pipeline requires a seller lead");
  if (!lead.lead?.id || !lead.lead?.contact?.name) throw new Error("Seller lead id and contact.name are required");
  const assignedOwner = String(owner || "").trim() || "unassigned";

  return {
    created_at: createdAt,
    id: `seller-pipeline-${lead.lead.id}`,
    lead_id: lead.lead.id,
    source: lead.lead.source,
    contact_name: lead.lead.contact.name,
    property: lead.lead.property || {},
    original_language: lead.original_language,
    admin_locale: lead.admin_locale,
    stage: "valuation_requested",
    status: "open",
    owner: assignedOwner,
    checklist: {
      callback: "open",
      appraisal: "not_started",
      mandate: "not_started",
      draft_listing: "not_started",
      publication: "not_started",
      offer: "not_started",
      close: "not_started",
    },
    next_task: {
      id: `seller-callback-${lead.lead.id}`,
      kind: "seller_callback",
      owner: assignedOwner,
      status: "open",
    },
  };
}

export function appendSellerPipeline(item, { filePath = DEFAULT_SELLER_PIPELINE_PATH } = {}) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.appendFileSync(filePath, `${JSON.stringify(item)}\n`);
  return item;
}

export function assertSellerPipeline(rows) {
  if (!rows.length) throw new Error("Seller pipeline must contain at least one row");
  for (const row of rows) {
    if (!row.lead_id || !row.contact_name || row.stage !== "valuation_requested") {
      throw new Error("Seller pipeline row is missing valuation request data");
    }
    if (row.status !== "open") throw new Error("Seller pipeline row must stay open");
    if (row.next_task?.status !== "open") throw new Error("Seller pipeline row must create an open callback task");
  }
  return true;
}
