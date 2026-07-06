import fs from "node:fs";
import { fromRoot } from "./paths.mjs";

export const DEFAULT_APPROVED_CMS_CONTENT_PATH = fromRoot("production", "data", "approved-cms-content.json");

export function readApprovedCmsContent(filePath = DEFAULT_APPROVED_CMS_CONTENT_PATH) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

export function approvedContentMatches(content, query, limit = 2) {
  const text = String(query || "").toLowerCase();
  return (content.documents || [])
    .filter((doc) => doc.status === "approved" && (doc.keywords || []).some((keyword) => text.includes(String(keyword).toLowerCase())))
    .slice(0, limit);
}

function normalizePath(pathname) {
  const path = String(pathname || "").trim();
  if (!path || path === "/") return "/";
  return path.replace(/\/+$/, "");
}

export function approvedContentDocumentsForPath(content, pathname) {
  const normalized = normalizePath(pathname);
  return (content.documents || []).filter((doc) => doc.status === "approved" && normalizePath(doc.path) === normalized);
}

export function approvedContentGuideGroups(content) {
  const groups = new Map();
  for (const doc of content.documents || []) {
    if (doc.status !== "approved" || doc.type !== "guide") continue;
    const path = normalizePath(doc.path);
    groups.set(path, [...(groups.get(path) || []), { ...doc, path }]);
  }
  return [...groups.entries()].map(([path, documents]) => ({ path, documents }));
}

export function assertApprovedCmsContent(content) {
  if (!Array.isArray(content.documents) || !content.documents.length) throw new Error("Approved CMS content must contain documents");
  for (const doc of content.documents) {
    if (doc.status !== "approved" || !doc.id || !doc.path?.startsWith("/") || !doc.title || !doc.reviewer) {
      throw new Error("Approved CMS content documents must be reviewed and routable");
    }
    if (!Array.isArray(doc.facts) || !doc.facts.length || !Array.isArray(doc.keywords) || !doc.keywords.length) {
      throw new Error("Approved CMS content documents must include facts and matching keywords");
    }
  }
  return true;
}
