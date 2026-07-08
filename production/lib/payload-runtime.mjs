import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { fromRoot } from "./paths.mjs";

export const DEFAULT_PAYLOAD_RUNTIME_REPORT = fromRoot("production", "data", "payload-runtime-report.json");

const REQUIRED_ROUTE_FILES = [
  "app/(payload)/payload-admin/[[...segments]]/page.js",
  "app/(payload)/api/[...slug]/route.js",
  "app/(payload)/graphql/route.js",
  "app/(payload)/graphql-playground/route.js",
];
const REQUIRED_CHECK_IDS = [
  "payload_secret",
  "database_url",
  ...REQUIRED_ROUTE_FILES.map((file) => `route:${file}`),
  "payload_config_import",
  "database_tcp",
];
const PAYLOAD_RUNTIME_CHECK_STATUSES = new Set(["pass", "missing_env", "placeholder", "weak_secret", "fail"]);

function check(id, status, evidence = {}) {
  return { id, status, ...evidence };
}

function configuredSecret(value) {
  const secret = String(value || "").trim();
  if (!secret) return "missing_env";
  if (/replace-with|change-me|example|local-payload-secret/i.test(secret)) return "placeholder";
  if (Buffer.byteLength(secret, "utf8") < 32) return "weak_secret";
  return "pass";
}

function configuredDatabaseUrl(value) {
  const databaseUrl = String(value || "").trim();
  if (!databaseUrl) return "missing_env";
  if (/replace-with|change-me|example/i.test(databaseUrl)) return "placeholder";
  return "pass";
}

function assertProductionDatabaseHost(value) {
  const host = String(value || "").toLowerCase().replace(/^\[|\]$/g, "");
  const reservedHosts = ["example.com", "example.net", "example.org", "localhost", "127.0.0.1", "0.0.0.0", "::1"];
  const reservedSuffixes = [".example", ".example.com", ".example.net", ".example.org", ".invalid", ".localhost", ".local", ".test"];
  if (!host || reservedHosts.includes(host) || reservedSuffixes.some((suffix) => host.endsWith(suffix))) {
    throw new Error("Payload runtime database host must not use localhost or placeholder database hosts");
  }
}

function databaseTarget(connectionString) {
  const parsed = new URL(connectionString);
  if (!["postgres:", "postgresql:"].includes(parsed.protocol)) {
    throw new Error("DATABASE_URL must use postgres:// or postgresql://");
  }
  const database = decodeURIComponent(parsed.pathname.replace(/^\//, "")).trim();
  if (!database) throw new Error("DATABASE_URL must include a database name");
  if (!parsed.hostname) throw new Error("DATABASE_URL must include a database host");
  assertProductionDatabaseHost(parsed.hostname);
  if (!parsed.username || !parsed.password) throw new Error("DATABASE_URL must include database credentials");
  return {
    credentials_configured: true,
    database,
    host: parsed.hostname,
    port: Number(parsed.port || 5432),
  };
}

function probeDatabaseTcp({ host, port, timeoutMs = 1500 }) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    const done = (status, error = "") => {
      socket.destroy();
      resolve({ error, status });
    };
    socket.setTimeout(timeoutMs, () => done("fail", `Timed out connecting to ${host}:${port}`));
    socket.once("connect", () => done("pass"));
    socket.once("error", (error) => done("fail", error.message));
  });
}

async function payloadConfigCheck() {
  const configPath = fromRoot("payload.config.js");
  if (!fs.existsSync(configPath)) return check("payload_config_import", "fail", { error: "payload.config.js missing" });
  try {
    const mod = await import(pathToFileURL(configPath).href);
    const config = await mod.default;
    const slugs = (config.collections || []).map((collection) => collection.slug);
    const required = ["admins", "locales", "listings", "listing_translations", "media_assets", "listing_tours"];
    const missing = required.filter((slug) => !slugs.includes(slug));
    if (config.routes?.admin !== "/payload-admin") {
      return check("payload_config_import", "fail", { error: "Payload admin route must be /payload-admin" });
    }
    if (missing.length) return check("payload_config_import", "fail", { missing_collections: missing });
    return check("payload_config_import", "pass", { admin_route: config.routes.admin, collections: required.length });
  } catch (error) {
    return check("payload_config_import", "fail", { error: error.message });
  }
}

export async function buildPayloadRuntimeReport({
  databaseProbe = probeDatabaseTcp,
  env = process.env,
  generatedAt = new Date().toISOString(),
} = {}) {
  const checks = [
    check("payload_secret", configuredSecret(env.PAYLOAD_SECRET), { env: "PAYLOAD_SECRET" }),
    check("database_url", configuredDatabaseUrl(env.DATABASE_URL), { env: "DATABASE_URL" }),
    ...REQUIRED_ROUTE_FILES.map((file) => check(`route:${file}`, fs.existsSync(fromRoot(file)) ? "pass" : "fail", { file })),
    await payloadConfigCheck(),
  ];

  const databaseUrlStatus = configuredDatabaseUrl(env.DATABASE_URL);
  let database = { status: databaseUrlStatus === "pass" ? "not_checked" : databaseUrlStatus };
  if (databaseUrlStatus === "pass") {
    try {
      const target = databaseTarget(env.DATABASE_URL);
      const probe = await databaseProbe(target);
      database = { ...target, ...probe };
      checks.push(
        check("database_tcp", probe.status, {
          credentials_configured: target.credentials_configured,
          database: target.database,
          host: target.host,
          port: target.port,
        }),
      );
    } catch (error) {
      database = { error: error.message, status: "fail" };
      checks.push(check("database_tcp", "fail", { error: error.message }));
    }
  } else {
    checks.push(check("database_tcp", databaseUrlStatus, { env: "DATABASE_URL" }));
  }

  const missingEnv = checks.filter((item) => item.status === "missing_env").map((item) => item.env);
  const placeholders = checks.filter((item) => item.status === "placeholder").map((item) => item.env).filter(Boolean);
  const weakEnv = checks.filter((item) => item.status === "weak_secret").map((item) => item.env).filter(Boolean);
  const ready = checks.every((item) => item.status === "pass");
  return {
    generated_at: generatedAt,
    ready,
    status: ready ? "ready" : "blocked",
    summary: {
      admin_route: "/payload-admin",
      checks: checks.length,
      database,
      missing_env: [...new Set(missingEnv)],
      placeholder_env: [...new Set(placeholders)],
      weak_env: [...new Set(weakEnv)],
      route_files: REQUIRED_ROUTE_FILES.length,
    },
    checks,
    next_actions: ready
      ? ["Run npm run launch:preflight with the same PAYLOAD_SECRET and DATABASE_URL."]
      : [
          "Set PAYLOAD_SECRET and DATABASE_URL in the production runtime.",
          "Run npm run payload:runtime to verify Payload config, routes, and database reachability.",
          "Run npm run payload:preflight before launch:preflight.",
        ],
  };
}

export function assertPayloadRuntimeReport(report) {
  if (!report.generated_at || Number.isNaN(Date.parse(report.generated_at))) {
    throw new Error("Payload runtime report must include valid generated_at");
  }
  if (!Array.isArray(report.checks) || report.checks.length < 1) throw new Error("Payload runtime report must include checks");
  const checkIds = new Set();
  for (const item of report.checks) {
    if (!item?.id) throw new Error("Payload runtime report checks must include ids");
    if (!PAYLOAD_RUNTIME_CHECK_STATUSES.has(item.status)) throw new Error("Payload runtime report checks must use known statuses");
    if (checkIds.has(item.id)) throw new Error(`Payload runtime report has duplicate check ${item.id}`);
    checkIds.add(item.id);
  }
  for (const id of REQUIRED_CHECK_IDS) {
    if (!checkIds.has(id)) throw new Error(`Payload runtime report missing required check ${id}`);
  }
  const ready = report.checks.every((item) => item.status === "pass");
  if (report.ready !== ready) throw new Error("Payload runtime ready flag must match checks");
  if (report.status !== (ready ? "ready" : "blocked")) throw new Error("Payload runtime status must match ready flag");
  if (
    !report.summary ||
    !Array.isArray(report.summary.missing_env) ||
    !Array.isArray(report.summary.placeholder_env) ||
    !Array.isArray(report.summary.weak_env)
  ) {
    throw new Error("Payload runtime report must summarize missing, placeholder, and weak env");
  }
  if (report.summary.checks !== report.checks.length) throw new Error("Payload runtime summary check count must match checks");
  const missingEnv = [...new Set(report.checks.filter((item) => item.status === "missing_env").map((item) => item.env).filter(Boolean))];
  const placeholderEnv = [...new Set(report.checks.filter((item) => item.status === "placeholder").map((item) => item.env).filter(Boolean))];
  const weakEnv = [...new Set(report.checks.filter((item) => item.status === "weak_secret").map((item) => item.env).filter(Boolean))];
  if (JSON.stringify(report.summary.missing_env) !== JSON.stringify(missingEnv)) {
    throw new Error("Payload runtime missing env summary must match checks");
  }
  if (JSON.stringify(report.summary.placeholder_env) !== JSON.stringify(placeholderEnv)) {
    throw new Error("Payload runtime placeholder env summary must match checks");
  }
  if (JSON.stringify(report.summary.weak_env) !== JSON.stringify(weakEnv)) {
    throw new Error("Payload runtime weak env summary must match checks");
  }
  const databaseTcp = report.checks.find((item) => item.id === "database_tcp");
  if (report.summary.database?.status !== databaseTcp.status) {
    throw new Error("Payload runtime database summary must match database_tcp check");
  }
  if (
    databaseTcp.status === "pass" &&
    (report.summary.database.database !== databaseTcp.database ||
      report.summary.database.host !== databaseTcp.host ||
      report.summary.database.port !== databaseTcp.port ||
      report.summary.database.credentials_configured !== databaseTcp.credentials_configured)
  ) {
    throw new Error("Payload runtime database TCP target must match summary evidence");
  }
  if (report.summary.admin_route !== "/payload-admin" || report.summary.route_files !== REQUIRED_ROUTE_FILES.length) {
    throw new Error("Payload runtime report must include route summary evidence");
  }
  for (const file of REQUIRED_ROUTE_FILES) {
    const route = report.checks.find((item) => item.id === `route:${file}`);
    if (route?.file !== file) throw new Error("Payload runtime report must include route file evidence");
  }
  const config = report.checks.find((item) => item.id === "payload_config_import");
  if (
    config?.status === "pass" &&
    (config.admin_route !== "/payload-admin" || !Number.isInteger(config.collections) || config.collections < 6)
  ) {
    throw new Error("Payload runtime report must include Payload config evidence");
  }
  if (
    ready &&
    (!report.summary.database.database ||
      !report.summary.database.host ||
      !Number.isInteger(report.summary.database.port) ||
      report.summary.database.credentials_configured !== true ||
      !databaseTcp.database ||
      !databaseTcp.host ||
      !Number.isInteger(databaseTcp.port) ||
      databaseTcp.credentials_configured !== true)
  ) {
    throw new Error("Payload runtime ready report must include database TCP target evidence");
  }
  if (ready) {
    assertProductionDatabaseHost(report.summary.database.host);
    assertProductionDatabaseHost(databaseTcp.host);
  }
  return true;
}

export function writePayloadRuntimeReport(report, outPath = DEFAULT_PAYLOAD_RUNTIME_REPORT) {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  assertPayloadRuntimeReport(report);
  fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);
  return outPath;
}
