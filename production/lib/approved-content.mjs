import fs from "node:fs";
import { createHash } from "node:crypto";
import { fromRoot } from "./paths.mjs";

export const DEFAULT_APPROVED_CMS_CONTENT_PATH = fromRoot("production", "data", "approved-cms-content.json");

export function readApprovedCmsContent(filePath = DEFAULT_APPROVED_CMS_CONTENT_PATH) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function guideHashPayload(doc) {
  return {
    guide_key: doc.guide_key || "",
    locale: doc.locale || "",
    source_locale: doc.source_locale || "",
    source_document_id: doc.source_document_id || "",
    legacy_migration: doc.legacy_migration === true,
    title: doc.title || "",
    path: normalizePath(doc.path),
    keywords: doc.keywords || [],
    facts: doc.facts || [],
    sources: (doc.sources || []).map((source) => ({
      id: source.id || "",
      publisher: source.publisher || "",
      url: source.url || "",
      checked_at: source.checked_at || "",
      claim_ids: source.claim_ids || [],
    })),
  };
}

export function guideSourceHash(doc) {
  return createHash("sha256").update(JSON.stringify(guideHashPayload(doc))).digest("hex");
}

function hasCurrentSourceEvidence(doc) {
  return Array.isArray(doc.sources) && doc.sources.length > 0 && doc.sources.every((source) => {
    try {
      return Boolean(source.id && source.publisher && source.checked_at && Array.isArray(source.claim_ids) && new URL(source.url).protocol === "https:");
    } catch {
      return false;
    }
  });
}

export function isPublishableGuide(doc) {
  if (doc?.type !== "guide" || doc.status !== "approved") return false;
  if (!doc.guide_key || !doc.locale || !doc.source_locale || doc.human_approved !== true || !doc.approved_at) return false;
  if (Number.isNaN(Date.parse(doc.approved_at)) || doc.source_hash !== guideSourceHash(doc)) return false;
  if (doc.locale !== doc.source_locale && (!doc.source_document_id || doc.human_translation_approved !== true)) return false;
  return doc.legacy_migration === true || hasCurrentSourceEvidence(doc);
}

function isApprovedContentDocument(doc) {
  return doc?.status === "approved" && (doc.type !== "guide" || isPublishableGuide(doc));
}

export function approvedContentMatches(content, query, limit = 2) {
  const text = String(query || "").toLowerCase();
  return (content.documents || [])
    .filter((doc) => isApprovedContentDocument(doc) && (doc.keywords || []).some((keyword) => text.includes(String(keyword).toLowerCase())))
    .slice(0, limit);
}

function normalizePath(pathname) {
  const path = String(pathname || "").trim();
  if (!path || path === "/") return "/";
  return path.replace(/\/+$/, "");
}

export function approvedContentDocumentsForPath(content, pathname) {
  const normalized = normalizePath(pathname);
  return (content.documents || []).filter((doc) => isApprovedContentDocument(doc) && normalizePath(doc.path) === normalized);
}

export function approvedContentGuideGroups(content) {
  const groups = new Map();
  for (const doc of content.documents || []) {
    if (!isPublishableGuide(doc)) continue;
    const path = normalizePath(doc.path);
    groups.set(path, [...(groups.get(path) || []), { ...doc, path }]);
  }
  return [...groups.entries()].map(([path, documents]) => ({ path, documents }));
}

export function assertApprovedCmsContent(content) {
  if (!Array.isArray(content.documents) || !content.documents.length) throw new Error("Approved CMS content must contain documents");
  for (const doc of content.documents) {
    if (!isApprovedContentDocument(doc) || !doc.id || !doc.path?.startsWith("/") || !doc.title || !doc.reviewer) {
      throw new Error("Approved CMS content documents must be reviewed and routable");
    }
    if (!Array.isArray(doc.facts) || !doc.facts.length || !Array.isArray(doc.keywords) || !doc.keywords.length) {
      throw new Error("Approved CMS content documents must include facts and matching keywords");
    }
  }
  return true;
}
