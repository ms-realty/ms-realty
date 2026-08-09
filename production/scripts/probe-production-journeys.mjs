#!/usr/bin/env node
// Synthetic probe of the deployed site's real operator-visible journeys.
// /api/health only proves the process answers; a container can be "healthy"
// while the public pages 500, the search fallback breaks, or media stops
// resolving. Every check below asserts a CURRENT deliberate behaviour, so a
// failure means production drifted from what the runbook promises.
//
// Usage: MS_REALTY_PRODUCTION_URL=https://… node probe-production-journeys.mjs
const baseUrl = String(process.env.MS_REALTY_PRODUCTION_URL || process.argv[2] || "").replace(/\/+$/, "");
if (!baseUrl) {
  console.error("MS_REALTY_PRODUCTION_URL (or argv[1]) is required");
  process.exit(2);
}

const TIMEOUT_MS = 25_000;

async function fetchPath(path, { method = "GET", headers = {} } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      redirect: "manual",
      headers: { "cache-control": "no-cache", ...headers },
      signal: controller.signal,
    });
    return { status: response.status, headers: response.headers, text: await response.text() };
  } finally {
    clearTimeout(timer);
  }
}

const checks = [
  {
    id: "health",
    async run() {
      const { status, text } = await fetchPath("/api/health");
      const body = JSON.parse(text);
      if (status !== 200 || body.service !== "ms-realty" || body.status !== "ok") throw new Error(`unhealthy: ${status}`);
      if (!/^[0-9a-f]{40}$/i.test(String(body.build_marker || ""))) throw new Error("health must report a commit build marker");
      return { build_marker: body.build_marker };
    },
  },
  {
    id: "public_home",
    async run() {
      const { status, text } = await fetchPath("/bg");
      if (status !== 200) throw new Error(`home returned ${status}`);
      if (!text.includes("MS Realty")) throw new Error("home did not render the brand");
      // The verified agency line must stay reachable — it is the only working
      // contact channel while lead writes are disabled.
      if (!text.includes("tel:+359879696870")) throw new Error("home lost the agency phone link");
      return {};
    },
  },
  {
    id: "search_fails_closed_with_contact",
    async run() {
      const { status, text } = await fetchPath("/bg/tarsene?q=sandanski", { headers: { accept: "text/html" } });
      // 503 is the designed state until a search engine is provisioned; the
      // point of this check is that a HUMAN still gets a branded page with a
      // way to reach the agency, never raw JSON.
      if (status === 200) return { note: "search engine is live" };
      if (status !== 503) throw new Error(`search page returned ${status}`);
      if (!text.includes("search-unavailable")) throw new Error("search 503 is not the branded fallback page");
      if (!text.includes("tel:+359879696870")) throw new Error("search fallback lost the agency phone link");
      return {};
    },
  },
  {
    id: "admin_login_reachable",
    async run() {
      const { status, text } = await fetchPath("/admin/login");
      if (status !== 200) throw new Error(`admin login returned ${status}`);
      if (!text.includes("<form")) throw new Error("admin login page has no form");
      return {};
    },
  },
  {
    id: "admin_requires_auth",
    async run() {
      const { status } = await fetchPath("/api/admin/launch-readiness");
      if (status !== 401) throw new Error(`unauthenticated admin API returned ${status}, expected 401`);
      return {};
    },
  },
  {
    id: "legacy_media_served",
    async run() {
      const { status } = await fetchPath("/wp-content/uploads/2025/04/DJI_0696-680x383.jpg");
      if (status !== 200) throw new Error(`legacy media returned ${status}`);
      return {};
    },
  },
  {
    id: "preview_stays_noindex",
    async run() {
      const { headers } = await fetchPath("/bg");
      const robots = String(headers.get("x-robots-tag") || "");
      const isPreviewHost = /\.workers\.dev$/i.test(new URL(baseUrl).hostname);
      if (isPreviewHost && !robots.includes("noindex")) {
        throw new Error("preview host must serve noindex — search equity protection");
      }
      return { x_robots_tag: robots || null };
    },
  },
  {
    id: "readiness_reports_gates",
    async run() {
      const { status, text } = await fetchPath("/api/ready");
      const body = JSON.parse(text);
      // 503 while launch gates are blocked is correct and expected; this check
      // only fails if readiness stops answering in a parseable way.
      if (status !== 200 && status !== 503) throw new Error(`readiness returned ${status}`);
      if (status === 503 && !Array.isArray(body.blockers)) throw new Error("blocked readiness must list blockers");
      return { launch_ready: status === 200, blockers: body.blockers?.length ?? 0 };
    },
  },
];

const results = [];
let failed = 0;
for (const check of checks) {
  try {
    const detail = await check.run();
    results.push({ id: check.id, status: "pass", ...detail });
  } catch (error) {
    failed += 1;
    results.push({ id: check.id, status: "fail", error: error.message });
  }
}

console.log(JSON.stringify({ kind: "production_journey_probe", base_url: baseUrl, failed, checks: results }, null, 2));
process.exit(failed ? 1 : 0);
