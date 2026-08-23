import { createHttpApp } from "./http.mjs";
import { DEFAULT_ADMIN_SESSION_LEDGER_PATH } from "./admin-sessions.mjs";
import { DEFAULT_OPERATOR_TWO_FACTOR_PATH } from "./operator-two-factor.mjs";
import { DEFAULT_WORKSPACE_EXPORT_DIR, DEFAULT_WORKSPACE_EXPORT_LEDGER_PATH } from "./workspace-export.mjs";
import { DEFAULT_AUDIT_LOG_PATH } from "./audit-log.mjs";
import { DEFAULT_LEAD_LEDGER_PATH } from "./lead-ledger.mjs";
import { DEFAULT_WORKSPACE_SETTINGS_PATH } from "./workspace-settings.mjs";

// App Router handoff for the workspace security and data routes.
//
// The Next admin adapter reimplements each admin route by hand. These ten were
// deliberately not copied there: authentication code that exists twice drifts,
// and the half that drifts is the half nobody notices. The App Router routes
// delegate to the one implementation in http.mjs instead, so the second-factor
// gate, the server-side session revocation check and the export redaction are
// byte-identical on both runtimes.

const MAX_BODY_BYTES = 10 * 1024 * 1024;
let cachedApp = null;
let cachedKey = "";

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
    runtimeDataDurableOnly: env.NODE_ENV === "production" && env.MS_REALTY_RUNTIME_DATA_AUTHORITY === "payload",
  };
}

function workspaceSecurityApp(env) {
  const config = appConfig(env);
  const key = JSON.stringify(config);
  if (!cachedApp || cachedKey !== key) {
    cachedApp = createHttpApp(config);
    cachedKey = key;
  }
  return cachedApp;
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

export async function renderAppWorkspaceSecurityResponse(request, { env = process.env } = {}) {
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
  const result = await workspaceSecurityApp(env)({
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
