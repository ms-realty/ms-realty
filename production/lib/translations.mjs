import crypto from "node:crypto";

export const TRANSLATION_STATES = Object.freeze([
  "missing",
  "hermes_drafted",
  "human_edited",
  "approved",
  "published",
  "stale",
]);

export function contentHash(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function assertTranslationState(state) {
  if (!TRANSLATION_STATES.includes(state)) throw new Error(`Invalid translation state: ${state}`);
  return true;
}

export function markStaleWhenSourceChanges(sourceHash, translation) {
  assertTranslationState(translation.status);
  if (translation.source_hash !== sourceHash && translation.status !== "missing") {
    return { ...translation, status: "stale", public_indexable: false, review_task_required: true };
  }
  return translation;
}

export function approveHumanTranslation(translation, reviewer, approvedAt = new Date().toISOString()) {
  assertTranslationState(translation.status);
  if (translation.status === "missing") throw new Error("Cannot approve missing translation");
  return {
    ...translation,
    status: "approved",
    human_approved: true,
    reviewer,
    approved_at: approvedAt,
  };
}
