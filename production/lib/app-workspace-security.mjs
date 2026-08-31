import { createHttpApp } from "./http.mjs";
import { signInGuardConfigFromEnv } from "./admin-sign-in-guard.mjs";
import { DEFAULT_ADMIN_SESSION_LEDGER_PATH } from "./admin-sessions.mjs";
import { DEFAULT_OPERATOR_TWO_FACTOR_PATH } from "./operator-two-factor.mjs";
import { DEFAULT_WORKSPACE_EXPORT_DIR, DEFAULT_WORKSPACE_EXPORT_LEDGER_PATH } from "./workspace-export.mjs";
import { DEFAULT_AUDIT_LOG_PATH } from "./audit-log.mjs";
import { DEFAULT_LEAD_LEDGER_PATH } from "./lead-ledger.mjs";
import { DEFAULT_WORKSPACE_SETTINGS_PATH } from "./workspace-settings.mjs";
import { adminRuntimeDataDurableOnlyFromEnv } from "./runtime-data-boundary.mjs";

// App Router handoff for the workspace security, data and sign-in routes.
//
// The Next admin adapter reimplements each admin route by hand. These were
// deliberately not copied there: authentication code that exists twice drifts,
// and the half that drifts is the half nobody notices. The App Router routes
// delegate to the one implementation in http.mjs instead, so the second-factor
// gate, the sign-in throttle, the server-side session revocation check and the
// export redaction are byte-identical on both runtimes.

const MAX_BODY_BYTES = 10 * 1024 * 1024;
// Small enough to stay honest about memory, large enough that the runtime and
// a test injecting its own auth service never evict each other. The entries
// hold the sign-in throttle's counters, so churn here would forget failures.
const APP_CACHE_LIMIT = 4;
const appCache = [];

function appConfig(env) {
  return {
    auditLogPath: env.MS_REALTY_AUDIT_LOG_PATH || DEFAULT_AUDIT_LOG_PATH,
    leadLedgerPath: env.MS_REALTY_LEAD_LEDGER_PATH || DEFAULT_LEAD_LEDGER_PATH,
    workspaceSettingsPath: env.MS_REALTY_WORKSPACE_SETTINGS_PATH || DEFAULT_WORKSPACE_SETTINGS_PATH,
    adminSessionLedgerPath: env.MS_REALTY_ADMIN_SESSION_LEDGER_PATH || DEFAULT_ADMIN_SESSION_LEDGER_PATH,
    operatorTwoFactorPath: env.MS_REALTY_OPERATOR_2FA_PATH || DEFAULT_OPERATOR_TWO_FACTOR_PATH,
    operatorTwoFactorKey: env.MS_REALTY_OPERATOR_2FA_KEY,
    operatorTwoFactorStepUpSeconds: env.MS_REALTY_OPERATOR_2FA_STEP_UP_SECONDS,
    workspaceExportLedgerPath: env.MS_REALTY_WORKSPACE_EXPORT_LEDGER_PATH || DEFAULT_WORKSPACE_EXPORT_LEDGER_PATH,
    workspaceExportDir: env.MS_REALTY_WORKSPACE_EXPORT_DIR || DEFAULT_WORKSPACE_EXPORT_DIR,
    workspaceExportTtlSeconds: env.MS_REALTY_WORKSPACE_EXPORT_TTL_SECONDS,
    auditRetentionWindowDays: env.MS_REALTY_AUDIT_RETENTION_DAYS,
    runtimeDataDurableOnly: adminRuntimeDataDurableOnlyFromEnv(env),
    // The sign-in throttle needs to know whether a forwarded client address
    // may be believed; behind Cloudflare it may, and the deployment says so.
    trustProxy: env.MS_REALTY_TRUST_PROXY === "1",
    signInRateLimit: signInGuardConfigFromEnv(env),
  };
}

function sameFunctions(left, right) {
  const names = new Set([...Object.keys(left), ...Object.keys(right)]);
  for (const name of names) if (left[name] !== right[name]) return false;
  return true;
}

// One app per distinct configuration. Values that serialize identify the
// entry; injected functions (an auth service, a pinned clock) are compared by
// reference, because a caller that keeps the same service must keep the same
// app or the throttle's memory resets on every request.
function workspaceSecurityApp(env, overrides = null) {
  const config = { ...appConfig(env), ...(overrides || {}) };
  const plain = {};
  const functions = {};
  for (const [name, value] of Object.entries(config)) {
    if (typeof value === "function") functions[name] = value;
    else plain[name] = value;
  }
  const key = JSON.stringify(plain);
  const hit = appCache.find((entry) => entry.key === key && sameFunctions(entry.functions, functions));
  if (hit) return hit.app;
  const app = createHttpApp(config);
  appCache.unshift({ key, functions, app });
  if (appCache.length > APP_CACHE_LIMIT) appCache.length = APP_CACHE_LIMIT;
  return app;
}

async function bodyText(request) {
  if (!request.body || ["GET", "HEAD"].includes(request.method)) return "";
  const text = await request.text();
  if (Buffer.byteLength(text) > MAX_BODY_BYTES) {
    const error = new Error("Request body too large");
    error.status = 413;
    throw error;
  }
  return text;
}

export async function renderAppWorkspaceSecurityResponse(request, { env = process.env, overrides = null } = {}) {
  let body;
  try {
    body = await bodyText(request);
  } catch (error) {
    if (error.status !== 413) throw error;
    return new Response(JSON.stringify({ kind: "request_too_large" }), {
      status: 413,
      headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
    });
  }
  const url = new URL(request.url);
  const result = await workspaceSecurityApp(env, overrides)({
    method: request.method,
    url: `${url.pathname}${url.search}`,
    headers: Object.fromEntries(request.headers.entries()),
    body,
  });
  const payload = typeof result.body === "string" ? result.body : JSON.stringify(result.body);
  // A 303 carries its destination in the Location header and no body.
  return new Response(result.status === 204 || result.status === 303 ? null : payload, {
    status: result.status,
    headers: result.headers,
  });
}
