#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isCanonicalPublicHost } from "../../workers/preview-host.mjs";

// Does the public site actually work, on the domain that carries the search
// equity, in every language it claims to speak?
//
// probe-production-journeys.mjs answers "is production alive" in eight checks
// and is what the hourly monitor and the deploy gate run. This answers the
// larger question a person would ask before calling the site finished: every
// public page type in every public locale, the SEO files, and a sample of each
// legacy URL decision class taken from the approved launch freeze — because a
// site that renders beautifully while a 301 breaks has still lost the asset.
//
// Usage: node production/scripts/probe-canonical-site.mjs [https://host]
//        MS_REALTY_PUBLIC_URL=https://makler-realty.com node …/probe-canonical-site.mjs

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const baseUrl = String(process.env.MS_REALTY_PUBLIC_URL || process.argv[2] || "https://makler-realty.com").replace(/\/+$/, "");
const TIMEOUT_MS = 25_000;
const origin = new URL(baseUrl).origin;
// The operational workers.dev origin is noindex on purpose and owns no legacy
// URLs, so those assertions belong to the canonical host alone. Running this
// against workers.dev still checks that every locale and page type renders,
// which is what makes it useful before the domain is reopened.
const canonical = isCanonicalPublicHost(new URL(baseUrl).hostname);

const registry = JSON.parse(fs.readFileSync(path.join(ROOT, "locales", "registry.json"), "utf8"));
const publicLocales = registry.locales.filter((locale) => locale.public_enabled && locale.indexable);

async function probe(pathname, { method = "GET", headers = {} } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(`${baseUrl}${pathname}`, {
      method,
      redirect: "manual",
      headers: { "cache-control": "no-cache", ...headers },
      signal: controller.signal,
    });
    const text = response.status === 204 ? "" : await response.text();
    return { status: response.status, headers: response.headers, text };
  } finally {
    clearTimeout(timer);
  }
}

const failures = [];
const rows = [];
function record(group, name, ok, detail) {
  rows.push({ group, name, status: ok ? "pass" : "fail", detail });
  if (!ok) failures.push(`${group} · ${name}: ${detail}`);
}

// ---- Every public page type, in every public locale -------------------------
// A locale that renders home but 500s on its own search route is not shipped.
for (const locale of publicLocales) {
  const segments = locale.route_segments || {};
  const pages = [
    ["home", `/${locale.code}`],
    ["search", `/${locale.code}/${segments.search}`],
    ["seller", `/${locale.code}/${segments.seller}`],
    ["contact", `/${locale.code}/${segments.contact}`],
  ];
  for (const [name, pathname] of pages) {
    try {
      const { status, text, headers } = await probe(pathname);
      if (status !== 200) {
        record(locale.code, name, false, `${pathname} returned ${status}`);
        continue;
      }
      if (!text.includes(`lang="${locale.code}"`)) {
        record(locale.code, name, false, `${pathname} did not render lang="${locale.code}"`);
        continue;
      }
      // Hebrew is a full right-to-left build, not a stylesheet flip.
      if (locale.direction === "rtl" && !text.includes('dir="rtl"')) {
        record(locale.code, name, false, `${pathname} lost its right-to-left direction`);
        continue;
      }
      const robots = String(headers.get("x-robots-tag") || "");
      if (canonical && robots.includes("noindex")) {
        record(locale.code, name, false, `${pathname} is noindex on the canonical domain`);
        continue;
      }
      if (canonical && text.includes(".workers.dev")) {
        record(locale.code, name, false, `${pathname} published an operational workers.dev origin`);
        continue;
      }
      record(locale.code, name, true, `${pathname} 200`);
    } catch (error) {
      record(locale.code, name, false, `${pathname} threw ${error.message}`);
    }
  }
}

// ---- Search actually answers with inventory ---------------------------------
try {
  const { status, text } = await probe("/api/search?locale=bg&q=Sandanski", { headers: { accept: "application/json" } });
  const body = status === 200 ? JSON.parse(text) : null;
  const total = Number(body?.search?.total_matches);
  record(
    "search",
    "api returns matches",
    status === 200 && Number.isFinite(total) && total > 0,
    status === 200 ? `${total} matches via ${body?.search?.backend?.engine || body?.search?.engines?.[0]}` : `status ${status}`,
  );
} catch (error) {
  record("search", "api returns matches", false, error.message);
}

// ---- A real listing page, taken from what search just returned --------------
try {
  const { status, text } = await probe("/api/search?locale=bg&q=Sandanski", { headers: { accept: "application/json" } });
  const card = status === 200 ? JSON.parse(text).cards?.[0] : null;
  if (!card?.path) {
    record("listing", "detail page", false, "search returned no card to open");
  } else {
    const page = await probe(card.path);
    record("listing", "detail page", page.status === 200 && page.text.includes(card.id), `${card.path} → ${page.status}`);
  }
} catch (error) {
  record("listing", "detail page", false, error.message);
}

// ---- SEO files publish the canonical domain ---------------------------------
for (const [name, pathname, must] of canonical
  ? [
      ["sitemap", "/sitemap.xml", `<loc>${origin}/`],
      ["robots", "/robots.txt", "Sitemap:"],
    ]
  : []) {
  try {
    const { status, text } = await probe(pathname);
    const ok = status === 200 && text.includes(must) && !text.includes(".workers.dev");
    record("seo", name, ok, status === 200 ? (ok ? "publishes the canonical domain" : "wrong origin or missing entry") : `status ${status}`);
  } catch (error) {
    record("seo", name, false, error.message);
  }
}

// ---- Every legacy decision class still resolves the way it was approved -----
// The freeze is the reviewed authority for all 457 URLs; a sample of each class
// catches a routing regression that a rendered page never would.
try {
  if (!canonical) throw { skip: true };
  const freeze = JSON.parse(fs.readFileSync(path.join(ROOT, "production", "data", "launch-freeze.json"), "utf8"));
  const decisions = freeze.decisions || freeze.routes || freeze.entries || [];
  const host = new URL(baseUrl).host;
  const sample = new Map();
  for (const row of decisions) {
    const oldUrl = String(row.old_url || "");
    if (!oldUrl.includes(host)) continue;
    const key = String(row.status);
    if (!sample.has(key)) sample.set(key, row);
  }
  for (const [expected, row] of [...sample].sort()) {
    const url = new URL(row.old_url);
    const { status, headers } = await probe(`${url.pathname}${url.search}`);
    if (String(status) !== expected) {
      record("legacy", `${expected} decision`, false, `${url.pathname.slice(0, 48)} returned ${status}`);
      continue;
    }
    if (expected === "301") {
      const location = headers.get("location") || "";
      const hop = await probe(new URL(location, baseUrl).pathname);
      record("legacy", "301 decision", hop.status === 200 && location.endsWith(row.target_path), `→ ${location} → ${hop.status} (one hop)`);
      continue;
    }
    record("legacy", `${expected} decision`, true, `${url.pathname.slice(0, 48)} → ${status}`);
  }
  if (!sample.size && canonical) record("legacy", "decisions", false, `no freeze rows for ${host}`);
} catch (error) {
  if (!error?.skip) record("legacy", "decisions", false, error.message);
}

// ---- Legacy media still resolves at the edge --------------------------------
try {
  const { status } = await probe("/wp-content/uploads/2025/04/DJI_0696-680x383.jpg");
  record("media", "legacy upload", status === 200, `status ${status}`);
} catch (error) {
  record("media", "legacy upload", false, error.message);
}

// ---- The operator surface is reachable and closed ---------------------------
try {
  const login = await probe("/admin/login");
  record("admin", "login reachable", login.status === 200 && login.text.includes("<form"), `status ${login.status}`);
  const api = await probe("/api/admin/launch-readiness");
  record("admin", "api requires auth", api.status === 401, `status ${api.status}`);
  const robots = String(login.headers.get("x-robots-tag") || "");
  record("admin", "login stays noindex", robots.includes("noindex"), robots || "(no x-robots-tag)");
} catch (error) {
  record("admin", "surface", false, error.message);
}

const width = Math.max(...rows.map((row) => row.group.length + row.name.length)) + 3;
for (const row of rows) {
  const label = `${row.group} · ${row.name}`.padEnd(width);
  console.log(`${row.status === "pass" ? "pass" : "FAIL"}  ${label} ${row.detail}`);
}
console.log(`\n${rows.length - failures.length}/${rows.length} passed on ${baseUrl}`);
if (failures.length) {
  console.error(`\n${failures.length} failing:`);
  for (const failure of failures) console.error(`  ${failure}`);
  process.exit(1);
}
