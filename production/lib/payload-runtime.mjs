import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { isPayloadPrivatePath } from "../../workers/durable-case-authority.mjs";
import { fromRoot } from "./paths.mjs";
import { REALTY_CASE_PAYLOAD_COLLECTION_SLUGS } from "./realty-case-collections.mjs";

export const DEFAULT_PAYLOAD_RUNTIME_REPORT = fromRoot("production", "data", "payload-runtime-report.json");

const REQUIRED_ROUTE_FILES = [
  "app/admin/route.js",
  "app/admin/login/route.js",
  "app/admin/logout/route.js",
  "app/admin/team/route.js",
  "app/api/admin/team/route.js",
  "app/(payload)/api/[...slug]/route.js",
];
export const REQUIRED_PAYLOAD_COLLECTIONS = [
  "admins",
  "locales",
  "listings",
  "listing_translations",
  "media_assets",
  "listing_tours",
  ...REALTY_CASE_PAYLOAD_COLLECTION_SLUGS,
];
const REQUIRED_CHECK_IDS = [
  "payload_secret",
  "database_url",
  ...REQUIRED_ROUTE_FILES.map((file) => `route:${file}`),
  "payload_edge_boundary",
  "payload_config_import",
  "database_network_scope",
  "database_tcp",
];
const REQUIRED_CHECK_ID_SET = new Set(REQUIRED_CHECK_IDS);
const PAYLOAD_GRAPHQL_EDGE_PATHS = ["/graphql", "/graphql-playground", "/api/graphql"];
const PAYLOAD_GRAPHQL_ENCODED_EDGE_PATHS = [
  "/graph%71l",
  "/graph%2571l",
  "/graphql%2fquery",
  "/graphql%252fquery",
  "/graphql%2dplayground",
  "/graphql%252dplayground%252f",
  "/api%2fgraphql",
  "/api%252fgraphql%252f",
];
const PAYLOAD_RUNTIME_CHECK_STATUSES = new Set(["pass", "missing_env", "placeholder", "weak_secret", "fail"]);
const PAYLOAD_RUNTIME_SECRET_FIELD_NAMES = new Set(["apikey", "authorization", "databaseurl", "password", "payloadsecret", "secret", "token"]);
const PUBLIC_DATABASE_NETWORK_SCOPES = new Set(["public_dns", "public_ip"]);
const PRIVATE_DATABASE_NETWORK_SCOPES = new Set(["private_dns", "private_ip"]);
const REQUIRED_ENV_BY_CHECK = {
  payload_secret: "PAYLOAD_SECRET",
  database_url: "DATABASE_URL",
};

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
  if (!databaseUrl) return { status: "missing_env" };
  if (/replace-with|change-me|example/i.test(databaseUrl)) return { status: "placeholder" };
  try {
    databaseTarget(databaseUrl);
    return { status: "pass" };
  } catch (error) {
    return { error: error.message, status: "fail" };
  }
}

function hasSecretField(value) {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some(hasSecretField);
  return Object.entries(value).some(([key, nested]) => {
    const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, "");
    return PAYLOAD_RUNTIME_SECRET_FIELD_NAMES.has(normalized) || hasSecretField(nested);
  });
}

function normalizeDatabaseHost(value) {
  return String(value || "").toLowerCase().replace(/^\[|\]$/g, "");
}

function ipv4Octets(host) {
  const parts = host.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return null;
  return parts;
}

function databaseHostNetworkScope(value) {
  const host = normalizeDatabaseHost(value);
  const ipVersion = net.isIP(host);
  if (ipVersion === 4) {
    const octets = ipv4Octets(host);
    if (!octets) return "reserved";
    const [a, b, c] = octets;
    if (
      a === 0 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 192 && b === 0 && c === 2) ||
      (a === 198 && b === 51 && c === 100) ||
      (a === 203 && b === 0 && c === 113)
    ) {
      return "reserved";
    }
    if (a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127)) {
      return "private_ip";
    }
    return "public_ip";
  }
  if (ipVersion === 6) {
    if (host === "::" || host === "::1" || host.startsWith("fe80:")) return "reserved";
    if (host.startsWith("fc") || host.startsWith("fd")) return "private_ip";
    return "public_ip";
  }
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) return "reserved";
  if (host.endsWith(".internal") || host.endsWith(".corp") || host.endsWith(".lan") || host.endsWith(".private")) return "private_dns";
  return "public_dns";
}

function assertPayloadRuntimeReportHasNoSecrets(report) {
  if (hasSecretField(report) || /Bearer\s+|sk-[A-Za-z0-9_-]+|:\/\/[^/@\s]+:[^/@\s]+@/i.test(JSON.stringify(report))) {
    throw new Error("Payload runtime report must not persist secrets");
  }
}

export function assertProductionDatabaseHost(value) {
  const host = normalizeDatabaseHost(value);
  const networkScope = databaseHostNetworkScope(host);
  const reservedHosts = ["example.com", "example.net", "example.org", "localhost", "127.0.0.1", "0.0.0.0", "::1"];
  const reservedSuffixes = [".example", ".example.com", ".example.net", ".example.org", ".invalid", ".localhost", ".local", ".test"];
  if (!host || networkScope === "reserved" || reservedHosts.includes(host) || reservedSuffixes.some((suffix) => host.endsWith(suffix))) {
    throw new Error("Payload runtime database host must not use localhost or placeholder database hosts");
  }
}

function privateDatabaseHostAllowed(env) {
  return ["1", "true", "yes"].includes(String(env.MS_REALTY_ALLOW_PRIVATE_DATABASE_HOST || "").trim().toLowerCase());
}

function databaseNetworkScopeCheck(target, env) {
  const privateNetworkAllowed = privateDatabaseHostAllowed(env);
  const evidence = {
    host: target.host,
    network_scope: target.network_scope,
    private_network_allowed: privateNetworkAllowed,
  };
  if (PUBLIC_DATABASE_NETWORK_SCOPES.has(target.network_scope)) return check("database_network_scope", "pass", evidence);
  if (PRIVATE_DATABASE_NETWORK_SCOPES.has(target.network_scope)) {
    if (privateNetworkAllowed) return check("database_network_scope", "pass", evidence);
    return check("database_network_scope", "fail", {
      ...evidence,
      error: "Private database host requires MS_REALTY_ALLOW_PRIVATE_DATABASE_HOST=1 launch evidence",
    });
  }
  return check("database_network_scope", "fail", {
    ...evidence,
    error: "Payload runtime database host must be public or explicitly approved private network evidence",
  });
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
    network_scope: databaseHostNetworkScope(parsed.hostname),
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
    const missing = REQUIRED_PAYLOAD_COLLECTIONS.filter((slug) => !slugs.includes(slug));
    const admins = (config.collections || []).find((collection) => collection.slug === "admins");
    if (config.routes?.admin !== "/payload-admin") {
      return check("payload_config_import", "fail", { error: "Payload internal admin route must remain isolated at /payload-admin" });
    }
    if (missing.length) return check("payload_config_import", "fail", { missing_collections: missing });
    if (config.graphQL?.disable !== true || config.graphQL?.disablePlaygroundInProduction !== true) {
      return check("payload_config_import", "fail", { error: "Payload GraphQL and its production playground must remain disabled" });
    }
    if (
      config.admin?.user !== "admins" ||
      admins?.auth?.useSessions !== true ||
      admins?.auth?.cookies?.sameSite !== "Lax" ||
      admins?.auth?.tokenExpiration !== 2 * 60 * 60 ||
      admins?.auth?.maxLoginAttempts !== 5
    ) {
      return check("payload_config_import", "fail", { error: "Payload admins must provide the hardened database-backed identity session" });
    }
    return check("payload_config_import", "pass", {
      collections: REQUIRED_PAYLOAD_COLLECTIONS.length,
      graphql_disabled: true,
      graphql_playground_disabled_in_production: true,
      identity_collection: "admins",
      internal_admin_route: config.routes.admin,
      session_max_age_seconds: admins.auth.tokenExpiration,
      sessions: "database_backed",
    });
  } catch (error) {
    return check("payload_config_import", "fail", { error: error.message });
  }
}

function payloadEdgeBoundaryCheck() {
  try {
    const worker = fs.readFileSync(fromRoot("workers", "index.js"), "utf8");
    const guard = fs.readFileSync(fromRoot("workers", "durable-case-authority.mjs"), "utf8");
    const missingGraphqlPaths = [...PAYLOAD_GRAPHQL_EDGE_PATHS, ...PAYLOAD_GRAPHQL_ENCODED_EDGE_PATHS].filter(
      (pathname) => !isPayloadPrivatePath(pathname),
    );
    if (
      !worker.includes("isPayloadPrivatePath(url.pathname)") ||
      !guard.includes('first === "payload-admin"') ||
      !guard.includes('first === "api" && second === "admins"') ||
      missingGraphqlPaths.length
    ) {
      return check("payload_edge_boundary", "fail", {
        error: "Cloudflare must hide Payload admin UI, identity REST, and GraphQL routes",
        ...(missingGraphqlPaths.length ? { missing_graphql_paths: missingGraphqlPaths } : {}),
      });
    }
    return check("payload_edge_boundary", "pass", {
      custom_admin_route: "/admin",
      payload_admin_ui: "edge_hidden",
      payload_graphql_encoded_paths: PAYLOAD_GRAPHQL_ENCODED_EDGE_PATHS,
      payload_graphql_paths: PAYLOAD_GRAPHQL_EDGE_PATHS,
      payload_identity_rest: "edge_hidden",
    });
  } catch (error) {
    return check("payload_edge_boundary", "fail", { error: error.message });
  }
}

export async function buildPayloadRuntimeReport({
  databaseProbe = probeDatabaseTcp,
  env = process.env,
  generatedAt = new Date().toISOString(),
} = {}) {
  const databaseUrl = configuredDatabaseUrl(env.DATABASE_URL);
  const checks = [
    check("payload_secret", configuredSecret(env.PAYLOAD_SECRET), { env: "PAYLOAD_SECRET" }),
    check("database_url", databaseUrl.status, { env: "DATABASE_URL", ...(databaseUrl.error ? { error: databaseUrl.error } : {}) }),
    ...REQUIRED_ROUTE_FILES.map((file) => check(`route:${file}`, fs.existsSync(fromRoot(file)) ? "pass" : "fail", { file })),
    payloadEdgeBoundaryCheck(),
    await payloadConfigCheck(),
  ];

  let database = { status: databaseUrl.status === "pass" ? "not_checked" : databaseUrl.status };
  if (databaseUrl.error) database.error = databaseUrl.error;
  if (databaseUrl.status === "pass") {
    try {
      const target = databaseTarget(env.DATABASE_URL);
      const networkScope = databaseNetworkScopeCheck(target, env);
      checks.push(networkScope);
      if (networkScope.status !== "pass") {
        database = {
          ...target,
          private_network_allowed: networkScope.private_network_allowed,
          status: "fail",
          error: networkScope.error,
        };
        checks.push(
          check("database_tcp", "fail", {
            error: networkScope.error,
            host: target.host,
            network_scope: target.network_scope,
            port: target.port,
          }),
        );
      } else {
        const probe = await databaseProbe(target);
        database = { ...target, private_network_allowed: networkScope.private_network_allowed, ...probe };
        checks.push(
          check("database_tcp", probe.status, {
            credentials_configured: target.credentials_configured,
            database: target.database,
            host: target.host,
            network_scope: target.network_scope,
            port: target.port,
          }),
        );
      }
    } catch (error) {
      database = { error: error.message, status: "fail" };
      checks.push(check("database_network_scope", "fail", { error: error.message }));
      checks.push(check("database_tcp", "fail", { error: error.message }));
    }
  } else {
    checks.push(
      check("database_network_scope", databaseUrl.status, { env: "DATABASE_URL", ...(databaseUrl.error ? { error: databaseUrl.error } : {}) }),
    );
    checks.push(check("database_tcp", databaseUrl.status, { env: "DATABASE_URL", ...(databaseUrl.error ? { error: databaseUrl.error } : {}) }));
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
      admin_route: "/admin",
      checks: checks.length,
      database,
      identity_collection: "admins",
      missing_env: [...new Set(missingEnv)],
      payload_admin_ui: "edge_hidden",
      payload_identity_rest: "edge_hidden",
      placeholder_env: [...new Set(placeholders)],
      weak_env: [...new Set(weakEnv)],
      route_files: REQUIRED_ROUTE_FILES.length,
    },
    checks,
    next_actions: ready
      ? ["Import or mount the redacted Payload runtime report, then run npm run payload:preflight and npm run launch:preflight with the same PAYLOAD_SECRET and DATABASE_URL."]
      : [
          "Run npm run payload:bootstrap and configure a private env with PAYLOAD_SECRET and DATABASE_URL.",
          "Run npm run payload:runtime to verify Payload config, routes, and database reachability.",
          "Run npm run payload:preflight before launch:preflight.",
        ],
  };
}

export function assertPayloadRuntimeReport(report) {
  assertPayloadRuntimeReportHasNoSecrets(report);
  if (report.example === true || report.template === true) {
    throw new Error("Payload runtime example reports cannot be used as launch evidence");
  }
  if (!report.generated_at || Number.isNaN(Date.parse(report.generated_at))) {
    throw new Error("Payload runtime report must include valid generated_at");
  }
  if (!Array.isArray(report.checks) || report.checks.length < 1) throw new Error("Payload runtime report must include checks");
  const checkIds = new Set();
  for (const item of report.checks) {
    if (!item?.id) throw new Error("Payload runtime report checks must include ids");
    if (!REQUIRED_CHECK_ID_SET.has(item.id)) throw new Error(`Payload runtime report has unknown check ${item.id}`);
    if (!PAYLOAD_RUNTIME_CHECK_STATUSES.has(item.status)) throw new Error("Payload runtime report checks must use known statuses");
    if (checkIds.has(item.id)) throw new Error(`Payload runtime report has duplicate check ${item.id}`);
    if (REQUIRED_ENV_BY_CHECK[item.id] && item.env !== REQUIRED_ENV_BY_CHECK[item.id]) {
      throw new Error(`Payload runtime report ${item.id} check must reference ${REQUIRED_ENV_BY_CHECK[item.id]}`);
    }
    checkIds.add(item.id);
  }
  for (const id of REQUIRED_CHECK_IDS) {
    if (!checkIds.has(id)) throw new Error(`Payload runtime report missing required check ${id}`);
  }
  const ready = report.checks.every((item) => item.status === "pass");
  if (report.ready !== ready) throw new Error("Payload runtime ready flag must match checks");
  if (report.status !== (ready ? "ready" : "blocked")) throw new Error("Payload runtime status must match ready flag");
  if (!Array.isArray(report.next_actions) || report.next_actions.length === 0) {
    throw new Error("Payload runtime report must include next actions");
  }
  if (!ready && !report.next_actions.some((action) => action.includes("payload:bootstrap"))) {
    throw new Error("Payload runtime blocked report must point to payload:bootstrap");
  }
  if (
    ready &&
    !report.next_actions.some((action) => action.includes("payload:preflight") && action.includes("launch:preflight"))
  ) {
    throw new Error("Payload runtime ready report must point to payload:preflight before launch:preflight");
  }
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
  const databaseNetworkScope = report.checks.find((item) => item.id === "database_network_scope");
  if (report.summary.database?.status !== databaseTcp.status) {
    throw new Error("Payload runtime database summary must match database_tcp check");
  }
  if (
    databaseNetworkScope.status === "pass" &&
    (!databaseNetworkScope.host ||
      !databaseNetworkScope.network_scope ||
      ![...PUBLIC_DATABASE_NETWORK_SCOPES, ...PRIVATE_DATABASE_NETWORK_SCOPES].includes(databaseNetworkScope.network_scope) ||
      typeof databaseNetworkScope.private_network_allowed !== "boolean")
  ) {
    throw new Error("Payload runtime database network scope must include host, scope, and private-network evidence");
  }
  if (
    databaseNetworkScope.status === "pass" &&
    PRIVATE_DATABASE_NETWORK_SCOPES.has(databaseNetworkScope.network_scope) &&
    databaseNetworkScope.private_network_allowed !== true
  ) {
    throw new Error("Payload runtime private database network scope must include explicit private-network approval");
  }
  if (
    databaseTcp.status === "pass" &&
    (report.summary.database.database !== databaseTcp.database ||
      report.summary.database.host !== databaseTcp.host ||
      report.summary.database.network_scope !== databaseTcp.network_scope ||
      report.summary.database.port !== databaseTcp.port ||
      report.summary.database.credentials_configured !== databaseTcp.credentials_configured)
  ) {
    throw new Error("Payload runtime database TCP target must match summary evidence");
  }
  if (
    report.summary.admin_route !== "/admin" ||
    report.summary.identity_collection !== "admins" ||
    report.summary.payload_admin_ui !== "edge_hidden" ||
    report.summary.payload_identity_rest !== "edge_hidden" ||
    report.summary.route_files !== REQUIRED_ROUTE_FILES.length
  ) {
    throw new Error("Payload runtime report must include route summary evidence");
  }
  for (const file of REQUIRED_ROUTE_FILES) {
    const route = report.checks.find((item) => item.id === `route:${file}`);
    if (route?.file !== file) throw new Error("Payload runtime report must include route file evidence");
  }
  const config = report.checks.find((item) => item.id === "payload_config_import");
  if (
    config?.status === "pass" &&
    (
      config.identity_collection !== "admins" ||
      config.internal_admin_route !== "/payload-admin" ||
      config.graphql_disabled !== true ||
      config.graphql_playground_disabled_in_production !== true ||
      config.sessions !== "database_backed" ||
      config.session_max_age_seconds !== 2 * 60 * 60 ||
      !Number.isInteger(config.collections) ||
      config.collections < REQUIRED_PAYLOAD_COLLECTIONS.length
    )
  ) {
    throw new Error("Payload runtime report must include Payload config evidence");
  }
  const edgeBoundary = report.checks.find((item) => item.id === "payload_edge_boundary");
  if (
    edgeBoundary?.status === "pass" &&
    (edgeBoundary.custom_admin_route !== "/admin" ||
      edgeBoundary.payload_admin_ui !== "edge_hidden" ||
      JSON.stringify(edgeBoundary.payload_graphql_paths) !== JSON.stringify(PAYLOAD_GRAPHQL_EDGE_PATHS) ||
      JSON.stringify(edgeBoundary.payload_graphql_encoded_paths) !== JSON.stringify(PAYLOAD_GRAPHQL_ENCODED_EDGE_PATHS) ||
      edgeBoundary.payload_identity_rest !== "edge_hidden")
  ) {
    throw new Error("Payload runtime report must include the custom-admin edge boundary");
  }
  if (
    ready &&
    (!report.summary.database.database ||
      !report.summary.database.host ||
      !report.summary.database.network_scope ||
      !Number.isInteger(report.summary.database.port) ||
      report.summary.database.credentials_configured !== true ||
      !databaseTcp.database ||
      !databaseTcp.host ||
      !databaseTcp.network_scope ||
      !Number.isInteger(databaseTcp.port) ||
      databaseTcp.credentials_configured !== true)
  ) {
    throw new Error("Payload runtime ready report must include database TCP target evidence");
  }
  if (
    ready &&
    (databaseNetworkScope.status !== "pass" ||
      report.summary.database.host !== databaseNetworkScope.host ||
      report.summary.database.network_scope !== databaseNetworkScope.network_scope ||
      report.summary.database.private_network_allowed !== databaseNetworkScope.private_network_allowed)
  ) {
    throw new Error("Payload runtime ready report must include database network scope evidence");
  }
  if (report.summary.database.host) assertProductionDatabaseHost(report.summary.database.host);
  if (databaseTcp.host) assertProductionDatabaseHost(databaseTcp.host);
  return true;
}

export function payloadRuntimeImportSummary(report) {
  assertPayloadRuntimeReport(report);
  return {
    ready: report.ready === true,
    status: report.status,
    missingEnv: report.summary.missing_env,
    placeholderEnv: report.summary.placeholder_env,
    weakEnv: report.summary.weak_env,
    blockedChecks: report.checks.filter((item) => item.status !== "pass").map((item) => item.id),
    nextActions: report.next_actions,
  };
}

export function writePayloadRuntimeReport(report, outPath = DEFAULT_PAYLOAD_RUNTIME_REPORT) {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  assertPayloadRuntimeReport(report);
  fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);
  return outPath;
}
