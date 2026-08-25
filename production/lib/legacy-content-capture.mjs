import fs from "node:fs";
import { fromRoot } from "./paths.mjs";

// The July review lifted listing bodies off the live pages with a roughly
// 900-character cap, which cut one description in five mid-word and published
// the fragment as page copy. The legacy content capture taken on 2026-07-29
// holds the same pages in full, so a stored description that is an exact prefix
// of a captured body and sits at the cap can be completed from the source.
export const DEFAULT_LEGACY_CONTENT_CAPTURE_PATH = fromRoot(
  "migration",
  "content-evidence",
  "20260729-legacy-content-review",
  "content-inventory.jsonl",
);

export const TRUNCATED_DESCRIPTION_MIN_CHARS = 880;

// The extracted page text runs on into the theme's share and enquiry chrome.
const CAPTURE_CHROME = " Tweet ";

function collapse(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

export function loadLegacyContentCaptures(filePath = DEFAULT_LEGACY_CONTENT_CAPTURE_PATH) {
  if (!fs.existsSync(filePath)) return new Map();
  const captures = new Map();
  for (const line of fs.readFileSync(filePath, "utf8").split("\n")) {
    if (!line.trim()) continue;
    const row = JSON.parse(line);
    if (row.url_type !== "listing" || Number(row.status) !== 200) continue;
    const body = collapse(row.extracted_body_text);
    if (!body) continue;
    for (const key of [row.url, row.final_url]) if (key) captures.set(String(key), body);
  }
  return captures;
}

function firstUrlOffset(text) {
  const match = /https?:\/\//.exec(text);
  return match ? match.index : -1;
}

/**
 * The completed description for a listing whose stored copy was cut at the
 * cap, or null when there is nothing to restore. A stored description that is
 * not an exact prefix of the capture is left alone: the page changed after the
 * description was taken, and rewriting it from a later capture would silently
 * republish different facts.
 */
export function restoredDescriptionFor(record, captures) {
  const description = collapse(record?.facts?.description);
  if (description.length < TRUNCATED_DESCRIPTION_MIN_CHARS) return null;
  const body = captures.get(String(record.source_url || "")) || captures.get(String(record.facts?.canonical || ""));
  if (!body) return null;
  const start = body.indexOf(description);
  if (start < 0) return null;
  const remainder = body.slice(start + description.length);
  // A bare video link marks the end of the prose in the captures that have one.
  const stops = [remainder.indexOf(CAPTURE_CHROME), firstUrlOffset(remainder)].filter((offset) => offset >= 0);
  const tail = collapse(stops.length ? remainder.slice(0, Math.min(...stops)) : remainder).replace(/[\s:–-]+$/, "");
  if (!tail) return null;
  return `${description} ${tail}`;
}
