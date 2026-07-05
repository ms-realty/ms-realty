import fs from "node:fs";
import path from "node:path";
import { fromRoot } from "./paths.mjs";

export const DEFAULT_LAUNCH_READINESS_OUTPUT = fromRoot("production", "data", "launch-readiness.json");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function packageState(filePath = fromRoot("package.json")) {
  const pkg = readJson(filePath);
  return {
    start_script: pkg.scripts?.start || "",
    production_server_entrypoint: fs.existsSync(fromRoot("production", "server.mjs")),
  };
}

function gate(id, status, evidence, message = "") {
  return { id, status, message, evidence };
}

function blockersFrom(gates) {
  return gates.filter((item) => item.status === "blocked").map((item) => item.id);
}

function warningsFrom(structuredData) {
  return Object.entries(structuredData.summary.warnings || {}).map(([id, count]) => ({ id, count }));
}

export function buildLaunchReadinessReport({
  generatedAt = new Date().toISOString(),
  migration = readJson(fromRoot("production", "data", "migration-records.json")),
  routeMap = readJson(fromRoot("production", "data", "legacy-route-map.json")),
  deployableRedirects = readJson(fromRoot("production", "data", "deployable-redirects.json")),
  sitemap = readJson(fromRoot("production", "data", "localized-sitemap.json")),
  structuredData = readJson(fromRoot("production", "data", "structured-data-report.json")),
  seoEvidence = readJson(fromRoot("production", "data", "seo-evidence.json")),
  httpSmoke = readJson(fromRoot("production", "data", "http-smoke.json")),
  nodeServerSmoke = readJson(fromRoot("production", "data", "node-server-smoke.json")),
  appState = packageState(),
} = {}) {
  const crawlPass =
    migration.summary.total === 457 &&
    migration.summary.byDomain?.["makler-realty.com"] === 278 &&
    migration.summary.byDomain?.["makler-realty.ru"] === 179 &&
    migration.summary.byStatus?.["200"] === 457;
  const redirectsReviewed = deployableRedirects.summary.total >= routeMap.summary.mappedListings;
  const seoExportsReady = (seoEvidence.summary.missing_required_sources || []).length === 0;
  const appLayerReady = appState.production_server_entrypoint && appState.start_script === "node production/server.mjs";

  const gates = [
    gate("crawl_inventory", crawlPass ? "pass" : "blocked", migration.summary),
    gate(
      "redirect_reviews",
      redirectsReviewed ? "pass" : "blocked",
      {
        mapped_listings: routeMap.summary.mappedListings,
        deployable_redirects: deployableRedirects.summary.total,
        homepage_targets: deployableRedirects.summary.homepageTargets,
      },
      redirectsReviewed ? "" : "Only reviewed same-content redirects may launch.",
    ),
    gate("localized_sitemap", sitemap.summary.entries === 194 && sitemap.summary.listing_entries === 167 ? "pass" : "blocked", sitemap.summary),
    gate(
      "structured_data",
      structuredData.summary.failing_entries === 0 ? "pass" : "blocked",
      structuredData.summary,
      "Schema can pass while content warnings remain separate.",
    ),
    gate(
      "external_seo_exports",
      seoExportsReady ? "pass" : "blocked",
      {
        missing_required_sources: seoEvidence.summary.missing_required_sources,
        privacy_events: seoEvidence.summary.sources.privacy_events,
      },
      seoExportsReady ? "" : "Search Console, Yandex, and backlink exports are required before launch.",
    ),
    gate(
      "runtime_smoke",
      httpSmoke.listing?.status === 200 && nodeServerSmoke.listing?.status === 200 ? "pass" : "blocked",
      {
        http_listing_status: httpSmoke.listing?.status,
        node_listing_status: nodeServerSmoke.listing?.status,
        node_server_port: nodeServerSmoke.server?.port || null,
      },
    ),
    gate(
      "production_app_layer",
      appLayerReady ? "pass" : "blocked",
      appState,
      appLayerReady ? "Node production adapter is present; framework migration can consume the same contract later." : "Production app adapter is not present.",
    ),
  ];

  const blockers = blockersFrom(gates);
  return {
    generated_at: generatedAt,
    launch_ready: blockers.length === 0,
    status: blockers.length ? "blocked" : "ready",
    blockers,
    warnings: warningsFrom(structuredData),
    gates,
    monitoring_plan: [
      { source: "privacy_events", status: seoEvidence.summary.sources.privacy_events.status },
      { source: "search_console", status: seoEvidence.summary.sources.search_console.status },
      { source: "yandex_webmaster", status: seoEvidence.summary.sources.yandex_webmaster.status },
      { source: "backlinks", status: seoEvidence.summary.sources.backlinks.status },
    ],
    rollback_plan: [
      "Keep legacy DNS/origin rollback available until post-launch crawl is stable.",
      "Disable reviewed redirect deployment before changing content routes if crawl parity fails.",
      "Republish previous sitemap and robots files if indexable route coverage regresses.",
      "Use migration review queue owners to triage failed old URLs before broad redirects.",
    ],
  };
}

export function assertLaunchReadinessReport(report) {
  if (!Array.isArray(report.gates) || report.gates.length < 7) throw new Error("Launch readiness report must include core gates");
  const gateBlockers = blockersFrom(report.gates);
  if (JSON.stringify(report.blockers || []) !== JSON.stringify(gateBlockers)) {
    throw new Error("Launch readiness blockers must match blocked gates");
  }
  if (report.launch_ready !== (gateBlockers.length === 0)) throw new Error("Launch readiness flag must match blockers");
  if (report.status !== (report.launch_ready ? "ready" : "blocked")) throw new Error("Launch readiness status must match blockers");
  if (report.blockers.includes("production_app_layer")) throw new Error("Production app layer should be covered by the Node adapter");
  if (!report.gates.find((item) => item.id === "crawl_inventory" && item.status === "pass")) {
    throw new Error("Launch readiness must prove crawl inventory passed");
  }
  if (!report.monitoring_plan.some((item) => item.source === "privacy_events" && item.status === "imported")) {
    throw new Error("Launch readiness must include privacy analytics monitoring");
  }
  if (!Array.isArray(report.rollback_plan) || report.rollback_plan.length < 3) {
    throw new Error("Launch readiness must include a rollback plan");
  }
  return true;
}

export function writeLaunchReadinessReport(report, outPath = DEFAULT_LAUNCH_READINESS_OUTPUT) {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  assertLaunchReadinessReport(report);
  fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);
  return outPath;
}
