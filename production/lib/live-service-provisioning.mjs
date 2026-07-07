import fs from "node:fs";
import path from "node:path";
import {
  buildHermesProviderProvisioningReport,
} from "./hermes-provider-provisioning.mjs";
import { fromRoot } from "./paths.mjs";

export const DEFAULT_LIVE_SERVICE_PROVISIONING_REPORT = fromRoot(
  "production",
  "data",
  "live-service-provisioning-report.json",
);

function redactUrl(value) {
  if (!value) return null;
  const parsed = new URL(value);
  parsed.username = "";
  parsed.password = "";
  parsed.search = "";
  parsed.hash = "";
  return parsed.href.replace(/\/$/, "");
}

function envCheck(id, env, key) {
  return { id, env: key, status: env[key] ? "pass" : "missing_env" };
}

async function healthCheck({ fetchImpl, headers = {}, id, path: route, url }) {
  if (!url) return { id, status: "missing_env" };
  let redacted_url = null;
  try {
    redacted_url = redactUrl(url);
    const response = await fetchImpl(`${String(url).replace(/\/+$/, "")}${route}`, { headers, method: "GET" });
    return { id, redacted_url, status: response.ok ? "pass" : "fail", status_code: response.status };
  } catch (error) {
    return { error: error.message, id, redacted_url, status: "fail" };
  }
}

export async function buildLiveServiceProvisioningReport({
  env = process.env,
  fetchImpl = globalThis.fetch,
  generatedAt = new Date().toISOString(),
} = {}) {
  const checks = [
    envCheck("typesense_url", env, "TYPESENSE_URL"),
    envCheck("typesense_api_key", env, "TYPESENSE_API_KEY"),
    envCheck("meili_url", env, "MEILI_URL"),
    envCheck("meili_api_key", env, "MEILI_API_KEY"),
  ];

  if (env.TYPESENSE_URL && env.TYPESENSE_API_KEY) {
    checks.push(
      await healthCheck({
        fetchImpl,
        headers: { "x-typesense-api-key": env.TYPESENSE_API_KEY },
        id: "typesense_health",
        path: "/health",
        url: env.TYPESENSE_URL,
      }),
    );
  } else {
    checks.push({ id: "typesense_health", status: "missing_env" });
  }

  if (env.MEILI_URL && env.MEILI_API_KEY) {
    checks.push(
      await healthCheck({
        fetchImpl,
        headers: { authorization: `Bearer ${env.MEILI_API_KEY}` },
        id: "meilisearch_health",
        path: "/health",
        url: env.MEILI_URL,
      }),
    );
  } else {
    checks.push({ id: "meilisearch_health", status: "missing_env" });
  }

  const hermes = buildHermesProviderProvisioningReport({ env, generatedAt });
  checks.push({
    id: "hermes_provider",
    mode: hermes.provider.mode,
    status: hermes.ready ? "pass" : "missing_env",
    missing: hermes.missing,
  });

  const missingEnv = [
    ...checks.filter((check) => check.status === "missing_env").map((check) => check.env).filter(Boolean),
    ...hermes.missing,
  ];
  const ready = checks.every((check) => check.status === "pass");
  return {
    generated_at: generatedAt,
    ready,
    status: ready ? "ready" : "blocked",
    summary: {
      checks: checks.length,
      missing_env: [...new Set(missingEnv)],
      services: ["typesense", "meilisearch", "hermes"],
    },
    checks,
    hermes: {
      mode: hermes.provider.mode,
      endpoint: hermes.provider.endpoint,
      model: hermes.provider.model,
      ready: hermes.ready,
    },
    next_actions: ready
      ? ["Run npm run live:capture, then npm run live:preflight."]
      : [
          "Set TYPESENSE_URL, TYPESENSE_API_KEY, MEILI_URL, MEILI_API_KEY, and Hermes provider env.",
          "Run npm run live:provisioning until all service checks pass.",
          "Run npm run live:capture only after provisioning passes.",
        ],
  };
}

export function assertLiveServiceProvisioningReport(report) {
  if (!Array.isArray(report.checks) || report.checks.length < 1) {
    throw new Error("Live service provisioning report must include checks");
  }
  const ready = report.checks.every((check) => check.status === "pass");
  if (report.ready !== ready) throw new Error("Live service provisioning ready flag must match checks");
  if (report.status !== (ready ? "ready" : "blocked")) {
    throw new Error("Live service provisioning status must match ready flag");
  }
  const serialized = JSON.stringify(report);
  if (/secret|Bearer\s+|sk-[A-Za-z0-9_-]+|user:pass/i.test(serialized)) {
    throw new Error("Live service provisioning report must not persist secrets");
  }
  return true;
}

export function writeLiveServiceProvisioningReport(report, outPath = DEFAULT_LIVE_SERVICE_PROVISIONING_REPORT) {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  assertLiveServiceProvisioningReport(report);
  fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);
  return outPath;
}
