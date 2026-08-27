import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import { createHttpApp, dispatchHttp } from "../lib/http.mjs";
import { readAuditLog } from "../lib/audit-log.mjs";
import { readAdminSessionEvents } from "../lib/admin-sessions.mjs";
import { readOperatorTwoFactorEvents } from "../lib/operator-two-factor.mjs";
import { renderAdminLoginPage } from "../lib/admin-login.mjs";
import { totpCode } from "../lib/totp.mjs";
import { fromRoot } from "../lib/paths.mjs";

const TWO_FACTOR_KEY = "b6-http-two-factor-key-0123456789abcdef";
const START = "2026-08-23T12:00:00.000Z";
const CHROME_MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0 Safari/537.36";

const TOKENS = {
  owner: "b6-owner-bearer-token-0123456789ab",
  broker: "b6-broker-bearer-token-0123456789ab",
  forced: "b6-forced-bearer-token-0123456789ab",
};

function tempFile(directory, name) {
  const filePath = `${directory}/${name}`;
  fs.writeFileSync(filePath, "");
  return filePath;
}

async function withWorkspace(fn, { credentials } = {}) {
  const previous = {
    NODE_ENV: process.env.NODE_ENV,
    MS_REALTY_ADMIN_TOKEN: process.env.MS_REALTY_ADMIN_TOKEN,
    MS_REALTY_ADMIN_ACTOR: process.env.MS_REALTY_ADMIN_ACTOR,
    MS_REALTY_ADMIN_CREDENTIALS_JSON: process.env.MS_REALTY_ADMIN_CREDENTIALS_JSON,
  };
  const directory = fs.mkdtempSync(`${os.tmpdir()}/ms-realty-b6-routes-`);
  try {
    process.env.NODE_ENV = "production";
    delete process.env.MS_REALTY_ADMIN_TOKEN;
    delete process.env.MS_REALTY_ADMIN_ACTOR;
    process.env.MS_REALTY_ADMIN_CREDENTIALS_JSON = JSON.stringify(
      credentials || [
        { id: "owner", token: TOKENS.owner, roles: ["admin"] },
        { id: "broker_ivan", token: TOKENS.broker, roles: ["broker"] },
      ],
    );
    const clock = { at: Date.parse(START) };
    const paths = {
      auditLogPath: tempFile(directory, "audit-log.jsonl"),
      adminSessionLedgerPath: tempFile(directory, "admin-sessions.jsonl"),
      operatorTwoFactorPath: tempFile(directory, "operator-two-factor.jsonl"),
      workspaceExportLedgerPath: tempFile(directory, "workspace-exports.jsonl"),
      workspaceExportDir: `${directory}/exports`,
      leadLedgerPath: fromRoot("production", "data", "lead-ledger.jsonl"),
    };
    const app = createHttpApp({
      ...paths,
      operatorTwoFactorKey: TWO_FACTOR_KEY,
      securityAt: () => new Date(clock.at).toISOString(),
    });
    return await fn({ app, paths, clock, directory });
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

function headers(token, extra = {}) {
  return { authorization: `Bearer ${token}`, "user-agent": CHROME_MAC, ...extra };
}

async function enrolAndActivate(app, token, clock) {
  const enrolled = await dispatchHttp(app, { method: "POST", url: "/api/admin/security/two-factor/enrol", headers: headers(token), body: {} });
  assert.equal(enrolled.status, 201);
  const activated = await dispatchHttp(app, {
    method: "POST",
    url: "/api/admin/security/two-factor/activate",
    headers: headers(token),
    body: { code: totpCode(enrolled.body.secret, { timestamp: clock.at }) },
  });
  assert.equal(activated.status, 200, JSON.stringify(activated.body));
  return enrolled.body;
}

async function stepUp(app, token, secret, clock) {
  clock.at += 60_000;
  const verified = await dispatchHttp(app, {
    method: "POST",
    url: "/api/admin/security/two-factor/verify",
    headers: headers(token),
    body: { code: totpCode(secret, { timestamp: clock.at }) },
  });
  assert.equal(verified.status, 201, JSON.stringify(verified.body));
  return verified.body;
}

test("every role manages its own second factor, but only an admin may export workspace data", async () => {
  await withWorkspace(async ({ app }) => {
    for (const token of [TOKENS.owner, TOKENS.broker]) {
      const status = await dispatchHttp(app, { url: "/api/admin/security/two-factor", headers: headers(token) });
      assert.equal(status.status, 200);
      assert.equal(status.body.status, "not_enrolled");
      assert.equal((await dispatchHttp(app, { url: "/api/admin/security/sessions", headers: headers(token) })).status, 200);
    }
    const brokerExport = await dispatchHttp(app, { url: "/api/admin/data-exports", headers: headers(TOKENS.broker) });
    assert.equal(brokerExport.status, 403);
    assert.equal(brokerExport.body.required_capability, "data:export");
    assert.equal(
      (await dispatchHttp(app, {
        method: "POST",
        url: "/api/admin/data-exports",
        headers: headers(TOKENS.broker),
        body: { datasets: ["audit"], from: "2026-07-01", to: "2026-07-31" },
      })).status,
      403,
    );
    assert.equal((await dispatchHttp(app, { url: "/api/admin/data-exports", headers: headers(TOKENS.owner) })).status, 200);

    // A broker sees only their own sessions unless they hold team:manage.
    const brokerAll = await dispatchHttp(app, { url: "/api/admin/security/sessions?scope=all", headers: headers(TOKENS.broker) });
    assert.equal(brokerAll.status, 403);
    assert.equal(brokerAll.body.required_capability, "team:manage");
    assert.equal((await dispatchHttp(app, { url: "/api/admin/security/sessions?scope=all", headers: headers(TOKENS.owner) })).status, 200);
  });
});

test("enrolment shows the secret once, then the bearer token alone stops being enough", async () => {
  await withWorkspace(async ({ app, paths, clock }) => {
    const enrolment = await enrolAndActivate(app, TOKENS.owner, clock);
    assert.match(enrolment.provisioning_uri, /^otpauth:\/\/totp\//);
    assert.equal(enrolment.recovery_codes.length, 10);
    assert.equal(enrolment.shown_once, true);

    // Nothing in the ledger repeats the secret or a recovery code.
    const ledger = fs.readFileSync(paths.operatorTwoFactorPath, "utf8");
    assert.ok(!ledger.includes(enrolment.secret));
    for (const code of enrolment.recovery_codes) assert.ok(!ledger.includes(code));
    // ...and neither does the audit log.
    const auditText = JSON.stringify(readAuditLog(paths.auditLogPath));
    assert.ok(!auditText.includes(enrolment.secret));
    for (const code of enrolment.recovery_codes) assert.ok(!auditText.includes(code));

    // Re-enrolling would silently replace a live factor.
    const again = await dispatchHttp(app, { method: "POST", url: "/api/admin/security/two-factor/enrol", headers: headers(TOKENS.owner), body: {} });
    assert.equal(again.status, 409);
    assert.equal(again.body.kind, "two_factor_already_enrolled");

    const gated = await dispatchHttp(app, { url: "/api/admin/activity", headers: headers(TOKENS.owner) });
    assert.equal(gated.status, 403);
    assert.equal(gated.body.kind, "two_factor_required");

    // A wrong code buys nothing.
    clock.at += 60_000;
    const rejected = await dispatchHttp(app, {
      method: "POST",
      url: "/api/admin/security/two-factor/verify",
      headers: headers(TOKENS.owner),
      body: { code: "000000" },
    });
    assert.equal(rejected.status, 403);
    assert.equal(rejected.body.kind, "two_factor_rejected");

    const session = await stepUp(app, TOKENS.owner, enrolment.secret, clock);
    assert.equal(session.step_up_header, "x-ms-admin-2fa");
    const allowed = await dispatchHttp(app, {
      url: "/api/admin/activity",
      headers: headers(TOKENS.owner, { "x-ms-admin-2fa": session.step_up_token }),
    });
    assert.equal(allowed.status, 200);

    // Another operator's step-up token does not travel.
    const otherSteal = await dispatchHttp(app, {
      url: "/api/admin/activity",
      headers: headers(TOKENS.broker, { "x-ms-admin-2fa": session.step_up_token }),
    });
    assert.equal(otherSteal.status, 200, "the broker has no second factor of their own, so the header is irrelevant");

    assert.deepEqual(
      readAuditLog(paths.auditLogPath).map((row) => row.action),
      ["two_factor_enrolment_started", "two_factor_activated", "two_factor_verified"],
    );
    assert.ok(readAuditLog(paths.auditLogPath).every((row) => row.actor === "owner"));
  });
});

test("a required second factor gates the workspace without locking the operator out of enrolling", async () => {
  await withWorkspace(
    async ({ app, clock }) => {
      const blocked = await dispatchHttp(app, { url: "/api/admin/activity", headers: headers(TOKENS.forced) });
      assert.equal(blocked.status, 403);
      assert.equal(blocked.body.kind, "two_factor_enrolment_required");

      const status = await dispatchHttp(app, { url: "/api/admin/security/two-factor", headers: headers(TOKENS.forced) });
      assert.equal(status.status, 200);
      assert.equal(status.body.required, true);

      const enrolment = await enrolAndActivate(app, TOKENS.forced, clock);
      const stillBlocked = await dispatchHttp(app, { url: "/api/admin/activity", headers: headers(TOKENS.forced) });
      assert.equal(stillBlocked.body.kind, "two_factor_required");

      const session = await stepUp(app, TOKENS.forced, enrolment.secret, clock);
      assert.equal(
        (await dispatchHttp(app, { url: "/api/admin/activity", headers: headers(TOKENS.forced, { "x-ms-admin-2fa": session.step_up_token }) })).status,
        200,
      );
    },
    { credentials: [{ id: "forced_operator", token: TOKENS.forced, roles: ["admin"], require_two_factor: true }] },
  );
});

test("the requirement is off by default so shipping the feature locks nobody out", async () => {
  await withWorkspace(async ({ app }) => {
    const status = await dispatchHttp(app, { url: "/api/admin/security/two-factor", headers: headers(TOKENS.owner) });
    assert.equal(status.body.required, false);
    assert.equal((await dispatchHttp(app, { url: "/api/admin/activity", headers: headers(TOKENS.owner) })).status, 200);
  });
});

test("the session list marks the current session and revoking it stops the token server-side", async () => {
  await withWorkspace(async ({ app, paths, clock }) => {
    const enrolment = await enrolAndActivate(app, TOKENS.owner, clock);
    const first = await stepUp(app, TOKENS.owner, enrolment.secret, clock);
    const second = await stepUp(app, TOKENS.owner, enrolment.secret, clock);
    const authed = headers(TOKENS.owner, { "x-ms-admin-2fa": second.step_up_token });

    const listed = await dispatchHttp(app, { url: "/api/admin/security/sessions", headers: authed });
    assert.equal(listed.status, 200);
    assert.equal(listed.body.current_session_id, second.session_id);
    assert.equal(listed.body.sessions.length, 2);
    const current = listed.body.sessions.find((session) => session.current);
    assert.equal(current.session_id, second.session_id);
    assert.equal(current.client, "Chrome on macOS");
    assert.ok(current.created_at && current.last_seen_at);
    assert.ok(listed.body.sessions.every((session) => !("fingerprint" in session)));

    const others = await dispatchHttp(app, { method: "POST", url: "/api/admin/security/sessions/revoke", headers: authed, body: { scope: "others" } });
    assert.equal(others.status, 200);
    assert.deepEqual(others.body.revoked_session_ids, [first.session_id]);
    assert.equal(others.body.revoked_current, false);
    // The revoked token is refused, the caller's own still works.
    assert.equal(
      (await dispatchHttp(app, { url: "/api/admin/activity", headers: headers(TOKENS.owner, { "x-ms-admin-2fa": first.step_up_token }) })).body.kind,
      "two_factor_required",
    );
    assert.equal((await dispatchHttp(app, { url: "/api/admin/activity", headers: authed })).status, 200);

    const self = await dispatchHttp(app, {
      method: "POST",
      url: "/api/admin/security/sessions/revoke",
      headers: authed,
      body: { session_id: second.session_id },
    });
    assert.equal(self.body.revoked_current, true);
    // This caller authenticated with a bearer token plus a step-up header, so
    // the credential the revocation invalidates is the step-up one.
    assert.match(String(self.headers["set-cookie"]), /^ms_admin_2fa=; Max-Age=0/);
    assert.equal((await dispatchHttp(app, { url: "/api/admin/activity", headers: authed })).body.kind, "two_factor_required");

    // Revocation is not just a client-side cookie delete: the ledger holds it.
    const sessionRows = readAdminSessionEvents(paths.adminSessionLedgerPath);
    assert.equal(sessionRows.filter((row) => row.event === "session_revoked").length, 2);
    assert.equal(readAuditLog(paths.auditLogPath).filter((row) => row.action === "admin_session_revoked").length, 2);
  });
});

test("a workspace export is audited, masked, and downloadable exactly once", async () => {
  await withWorkspace(async ({ app, paths }) => {
    const requested = await dispatchHttp(app, {
      method: "POST",
      url: "/api/admin/data-exports",
      headers: headers(TOKENS.owner),
      body: { datasets: ["enquiries", "contacts", "listings", "audit"], from: "2026-07-01", to: "2026-08-31" },
    });
    assert.equal(requested.status, 201, JSON.stringify(requested.body));
    assert.equal(requested.body.single_use, true);
    assert.ok(requested.body.counts.enquiries > 0);
    assert.ok(requested.body.redactions.length > 0);
    assert.match(requested.body.redaction_policy, /never included in a bulk export/);

    // The request itself is the accountable act and names requester and scope.
    const requestEntry = readAuditLog(paths.auditLogPath).find((row) => row.action === "workspace_export_requested");
    assert.equal(requestEntry.actor, "owner");
    assert.equal(requestEntry.object_id, requested.body.job_id);
    assert.equal(requestEntry.metadata.from, "2026-07-01");
    assert.equal(requestEntry.metadata.to, "2026-08-31");
    assert.deepEqual(requestEntry.metadata.datasets, ["audit", "contacts", "enquiries", "listings"]);

    // Someone else's link is refused before the file is read.
    const stolen = await dispatchHttp(app, { url: requested.body.download_url, headers: headers(TOKENS.broker) });
    assert.equal(stolen.status, 403);

    const downloaded = await dispatchHttp(app, { url: requested.body.download_url, headers: headers(TOKENS.owner) });
    assert.equal(downloaded.status, 200);
    assert.match(String(downloaded.headers["content-disposition"]), /attachment; filename="workspace-export-/);
    assert.equal(downloaded.headers["cache-control"], "no-store");
    const document = JSON.parse(downloaded.body);
    assert.equal(document.requested_by, "owner");
    assert.equal(document.kind, "ms_realty_workspace_export");
    // Nothing the vault holds masked reaches the file.
    assert.equal(
      document.datasets.enquiries.rows.some((row) => "contact" in row || "email" in row || "message_original" in row),
      false,
    );
    assert.ok(document.redactions.some((entry) => entry.reason === "lead_contact_vault" && entry.explanation));

    const twice = await dispatchHttp(app, { url: requested.body.download_url, headers: headers(TOKENS.owner) });
    assert.equal(twice.status, 410);
    assert.equal(twice.body.kind, "export_already_downloaded");

    const listed = await dispatchHttp(app, { url: "/api/admin/data-exports", headers: headers(TOKENS.owner) });
    assert.equal(listed.body.exports[0].status, "downloaded");
    assert.equal("download_token_hash" in listed.body.exports[0], false);
    assert.equal("file_path" in listed.body.exports[0], false);
    assert.deepEqual(
      readAuditLog(paths.auditLogPath).map((row) => row.action),
      ["workspace_export_requested", "workspace_export_downloaded"],
    );
  });
});

test("an export refuses an unbounded or unknown scope", async () => {
  await withWorkspace(async ({ app, paths }) => {
    for (const body of [
      { datasets: ["audit"] },
      { datasets: [], from: "2026-07-01", to: "2026-07-31" },
      { datasets: ["passwords"], from: "2026-07-01", to: "2026-07-31" },
      { datasets: ["audit"], from: "2026-08-31", to: "2026-07-01" },
    ]) {
      const refused = await dispatchHttp(app, { method: "POST", url: "/api/admin/data-exports", headers: headers(TOKENS.owner), body });
      assert.equal(refused.status, 400, JSON.stringify(body));
    }
    assert.equal(readAuditLog(paths.auditLogPath).length, 0, "a refused request must not be audited as performed");
  });
});

test("audit retention is previewed read-only and never applied by a request", async () => {
  await withWorkspace(async ({ app, paths }) => {
    await dispatchHttp(app, {
      method: "POST",
      url: "/api/admin/data-exports",
      headers: headers(TOKENS.owner),
      body: { datasets: ["audit"], from: "2026-07-01", to: "2026-07-31" },
    });
    const before = readAuditLog(paths.auditLogPath).length;

    const preview = await dispatchHttp(app, { url: "/api/admin/security/audit-retention", headers: headers(TOKENS.owner) });
    assert.equal(preview.status, 200);
    assert.equal(preview.body.kind, "admin_audit_retention");
    assert.equal(preview.body.applied_on_read, false);
    assert.equal(preview.body.apply_command, "npm run audit:retention -- --apply");
    assert.equal(preview.body.retention_days, 2555);
    assert.ok(Array.isArray(preview.body.scanned_artifacts) && preview.body.scanned_artifacts.length > 0);
    // The preview never ships the rows themselves.
    assert.equal("retained_rows" in preview.body, false);
    assert.equal("prunable_rows" in preview.body, false);
    assert.equal(readAuditLog(paths.auditLogPath).length, before, "reading the plan must not prune");

    // There is no route that applies it.
    const post = await dispatchHttp(app, { method: "POST", url: "/api/admin/security/audit-retention", headers: headers(TOKENS.owner), body: {} });
    assert.equal(post.status, 405);
    // A broker can read the plan; the capability is activity:read.
    assert.equal((await dispatchHttp(app, { url: "/api/admin/security/audit-retention", headers: headers(TOKENS.broker) })).status, 200);
  });
});

test("a workspace security action refuses rather than proceeding unaudited", async () => {
  await withWorkspace(async ({ paths }) => {
    // Same ledgers, but no audit log configured.
    const app = createHttpApp({
      adminSessionLedgerPath: paths.adminSessionLedgerPath,
      operatorTwoFactorPath: paths.operatorTwoFactorPath,
      operatorTwoFactorKey: TWO_FACTOR_KEY,
      workspaceExportLedgerPath: paths.workspaceExportLedgerPath,
      workspaceExportDir: paths.workspaceExportDir,
      securityAt: () => START,
    });
    const enrol = await dispatchHttp(app, { method: "POST", url: "/api/admin/security/two-factor/enrol", headers: headers(TOKENS.owner), body: {} });
    assert.equal(enrol.status, 503);
    assert.equal(enrol.body.kind, "audit_log_unavailable");
    assert.equal(readOperatorTwoFactorEvents(paths.operatorTwoFactorPath).length, 0);

    const exported = await dispatchHttp(app, {
      method: "POST",
      url: "/api/admin/data-exports",
      headers: headers(TOKENS.owner),
      body: { datasets: ["audit"], from: "2026-07-01", to: "2026-07-31" },
    });
    assert.equal(exported.status, 503);
    assert.equal(exported.body.kind, "audit_log_unavailable");
  });
});

test("the security routes refuse an unattributable shared token and unknown methods", async () => {
  const previous = {
    NODE_ENV: process.env.NODE_ENV,
    MS_REALTY_ADMIN_TOKEN: process.env.MS_REALTY_ADMIN_TOKEN,
    MS_REALTY_ADMIN_CREDENTIALS_JSON: process.env.MS_REALTY_ADMIN_CREDENTIALS_JSON,
  };
  try {
    process.env.NODE_ENV = "development";
    process.env.MS_REALTY_ADMIN_TOKEN = "b6-shared-token-0123456789abcdef";
    delete process.env.MS_REALTY_ADMIN_CREDENTIALS_JSON;
    const directory = fs.mkdtempSync(`${os.tmpdir()}/ms-realty-b6-shared-`);
    const app = createHttpApp({
      auditLogPath: tempFile(directory, "audit-log.jsonl"),
      adminSessionLedgerPath: tempFile(directory, "admin-sessions.jsonl"),
      operatorTwoFactorPath: tempFile(directory, "operator-two-factor.jsonl"),
      operatorTwoFactorKey: TWO_FACTOR_KEY,
      workspaceExportLedgerPath: tempFile(directory, "workspace-exports.jsonl"),
      workspaceExportDir: `${directory}/exports`,
      securityAt: () => START,
    });
    const shared = { authorization: "Bearer b6-shared-token-0123456789abcdef" };
    // A shared token has no operator identity, so it may not own a second factor.
    assert.equal((await dispatchHttp(app, { url: "/api/admin/security/two-factor", headers: shared })).body.kind, "operator_identity_required");
    assert.equal(
      (await dispatchHttp(app, { method: "POST", url: "/api/admin/security/two-factor/enrol", headers: shared, body: {} })).body.kind,
      "operator_identity_required",
    );
    assert.equal((await dispatchHttp(app, { url: "/api/admin/security/sessions", headers: shared })).body.kind, "operator_identity_required");
    assert.equal(
      (await dispatchHttp(app, { method: "POST", url: "/api/admin/security/two-factor", headers: shared, body: {} })).status,
      405,
    );
    assert.equal((await dispatchHttp(app, { url: "/api/admin/security/two-factor/enrol", headers: shared })).status, 405);
    assert.equal((await dispatchHttp(app, { url: "/api/admin/security/sessions/revoke", headers: shared })).status, 405);
    assert.equal((await dispatchHttp(app, { method: "POST", url: "/api/admin/data-exports/download", headers: shared, body: {} })).status, 405);
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test("the sign-in page offers an optional authenticator code and names a rejected one", () => {
  const page = renderAdminLoginPage({});
  assert.match(page, /name="code"/);
  assert.match(page, /autocomplete="one-time-code"/);
  assert.doesNotMatch(page, /class="error"/);
  assert.match(renderAdminLoginPage({ error: "2fa" }), /Кодът от приложението не беше приет/);
  // The plain refusal still says nothing about which half failed.
  assert.match(renderAdminLoginPage({ error: true }), /Данните не бяха приети/);
  assert.doesNotMatch(renderAdminLoginPage({ error: true }), /Кодът от приложението не беше приет/);
});

// --- Settings screen wiring --------------------------------------------------
// The Security and Data sections were shipped visibly disabled by the settings
// package. These prove they are now driven by this package's backend, and that
// they fall back to the disabled treatment when its ledgers are absent.

function browserSession() {
  const jar = new Map();
  return {
    header(extra = {}) {
      return {
        authorization: `Bearer ${TOKENS.owner}`,
        accept: "text/html",
        "user-agent": CHROME_MAC,
        cookie: [...jar].map(([name, value]) => `${name}=${value}`).join("; "),
        ...extra,
      };
    },
    form(extra = {}) {
      return this.header({ "content-type": "application/x-www-form-urlencoded", ...extra });
    },
    absorb(response) {
      const raw = response.headers?.["set-cookie"];
      if (raw) {
        const [name, value] = String(raw).split(";")[0].split("=");
        if (/Max-Age=0/.test(String(raw))) jar.delete(name);
        else jar.set(name, value);
      }
      return response;
    },
    cookies() {
      return [...jar.keys()];
    },
  };
}

test("the settings screen renders the Security and Data sections from live state", async () => {
  await withWorkspace(async ({ app, directory }) => {
    const settingsPath = `${directory}/workspace-settings.json`;
    fs.copyFileSync(fromRoot("production", "data", "workspace-settings.json"), settingsPath);
    const wired = createHttpApp({
      auditLogPath: `${directory}/audit-log.jsonl`,
      adminSessionLedgerPath: `${directory}/admin-sessions.jsonl`,
      operatorTwoFactorPath: `${directory}/operator-two-factor.jsonl`,
      operatorTwoFactorKey: TWO_FACTOR_KEY,
      workspaceExportLedgerPath: `${directory}/workspace-exports.jsonl`,
      workspaceExportDir: `${directory}/exports`,
      workspaceSettingsPath: settingsPath,
      securityAt: () => START,
    });
    void app;

    const page = await dispatchHttp(wired, { url: "/admin/settings", headers: headers(TOKENS.owner, { accept: "text/html" }) });
    assert.equal(page.status, 200);
    // Live, not the "not connected" panel.
    assert.match(page.body, /data-settings-section="security"[^>]*data-settings-live="true"/);
    assert.match(page.body, /data-settings-section="data"[^>]*data-settings-live="true"/);
    assert.doesNotMatch(page.body, /data-settings-planned="true"[^>]*data-planned-control="workspace_settings_security"/);
    assert.match(page.body, /data-two-factor-status="not_enrolled"/);
    assert.match(page.body, /data-admin-sessions-empty="true"/);
    assert.match(page.body, /data-export-form="true"/);
    assert.match(page.body, /data-audit-retention="true"/);
    assert.match(page.body, /action="\/api\/admin\/security\/two-factor\/enrol"/);
    assert.match(page.body, /action="\/api\/admin\/data-exports"/);
    // The prune command is shown, not offered as a button.
    assert.match(page.body, /npm run audit:retention -- --apply/);

    // A broker keeps Security but never sees the export controls.
    const brokerPage = await dispatchHttp(wired, { url: "/admin/settings", headers: headers(TOKENS.broker, { accept: "text/html" }) });
    assert.equal(brokerPage.status, 200);
    assert.match(brokerPage.body, /data-two-factor-status="not_enrolled"/);
    assert.doesNotMatch(brokerPage.body, /data-export-form="true"/);
  });
});

test("without the workspace-security ledgers unavailable sections stay out of the task flow", async () => {
  await withWorkspace(async ({ directory }) => {
    const settingsPath = `${directory}/workspace-settings-bare.json`;
    fs.copyFileSync(fromRoot("production", "data", "workspace-settings.json"), settingsPath);
    const bare = createHttpApp({ workspaceSettingsPath: settingsPath, securityAt: () => START });
    const page = await dispatchHttp(bare, { url: "/admin/settings", headers: headers(TOKENS.owner, { accept: "text/html" }) });
    assert.equal(page.status, 200);
    assert.doesNotMatch(page.body, /data-settings-section="security"/);
    assert.doesNotMatch(page.body, /data-settings-section="data"/);
    assert.doesNotMatch(page.body, /data-planned-control=/);
    assert.doesNotMatch(page.body, /data-settings-live="true"/);
    assert.doesNotMatch(page.body, /action="\/api\/admin\/security\/two-factor\/enrol"/);
  });
});

test("a browser drives enrolment, step-up, export and revoke with forms and cookies alone", async () => {
  await withWorkspace(async ({ app, paths, clock, directory }) => {
    const settingsPath = `${directory}/workspace-settings-live.json`;
    fs.copyFileSync(fromRoot("production", "data", "workspace-settings.json"), settingsPath);
    const wired = createHttpApp({
      ...paths,
      workspaceSettingsPath: settingsPath,
      operatorTwoFactorKey: TWO_FACTOR_KEY,
      securityAt: () => new Date(clock.at).toISOString(),
    });
    void app;
    const browser = browserSession();

    // Enrolment answers with a one-time page, never a redirect carrying a secret.
    const enrolled = await dispatchHttp(wired, {
      method: "POST",
      url: "/api/admin/security/two-factor/enrol",
      headers: browser.form(),
      body: "locale=en",
    });
    assert.equal(enrolled.status, 201);
    assert.match(String(enrolled.headers["content-type"]), /text\/html/);
    assert.equal(enrolled.headers["cache-control"], "no-store");
    assert.equal(enrolled.headers["referrer-policy"], "no-referrer");
    assert.equal(enrolled.headers.location, undefined, "a secret must never travel in a redirect URL");
    const secret = /data-two-factor-secret="true">([A-Z2-7]+)</.exec(enrolled.body)?.[1];
    assert.ok(secret, "the one-time page shows the secret");
    assert.equal((enrolled.body.match(/<li>[A-Z0-9]{5}-[A-Z0-9]{5}-[A-Z0-9]{5}<\/li>/g) || []).length, 10);

    const activated = await dispatchHttp(wired, {
      method: "POST",
      url: "/api/admin/security/two-factor/activate",
      headers: browser.form(),
      body: `locale=en&code=${totpCode(secret, { timestamp: clock.at })}`,
    });
    assert.equal(activated.status, 303);
    assert.equal(activated.headers.location, "/admin/settings?security=two_factor_active#settings-security");

    // Gated everywhere except the settings screen, which is where the fix lives.
    assert.equal((await dispatchHttp(wired, { url: "/api/admin/activity", headers: browser.header() })).status, 403);
    const gatedSettings = await dispatchHttp(wired, { url: "/admin/settings", headers: browser.header() });
    assert.equal(gatedSettings.status, 200);
    assert.match(gatedSettings.body, /data-step-up="required"/);
    assert.match(gatedSettings.body, /action="\/api\/admin\/security\/two-factor\/verify"/);

    clock.at += 60_000;
    const verified = browser.absorb(
      await dispatchHttp(wired, {
        method: "POST",
        url: "/api/admin/security/two-factor/verify",
        headers: browser.form(),
        body: `locale=en&code=${totpCode(secret, { timestamp: clock.at })}`,
      }),
    );
    assert.equal(verified.status, 303);
    assert.equal(verified.headers.location, "/admin/settings?security=two_factor_verified#settings-security");
    // The step-up rides in an HttpOnly cookie so a browser behind a bearer
    // proxy, which cannot set a header, is never locked out.
    assert.deepEqual(browser.cookies(), ["ms_admin_2fa"]);
    assert.match(String(verified.headers["set-cookie"]), /HttpOnly; Secure; SameSite=Lax/);
    assert.equal((await dispatchHttp(wired, { url: "/api/admin/activity", headers: browser.header() })).status, 200);

    const confirmed = await dispatchHttp(wired, { url: "/admin/settings?security=two_factor_verified", headers: browser.header() });
    assert.match(confirmed.body, /data-step-up="active"/);
    assert.match(confirmed.body, /data-security-notice="two_factor_verified"/);
    assert.match(confirmed.body, /data-admin-sessions="true"/);
    assert.match(confirmed.body, /data-session-current="true"/);

    // The export form answers with its own one-time page and a working link.
    const exported = await dispatchHttp(wired, {
      method: "POST",
      url: "/api/admin/data-exports",
      headers: browser.form(),
      body: "locale=en&datasets=enquiries&datasets=audit&from=2026-07-01&to=2026-08-31",
    });
    assert.equal(exported.status, 201);
    assert.match(String(exported.headers["content-type"]), /text\/html/);
    assert.match(exported.body, /data-export-redactions="true"/);
    const href = /href="([^"]*data-exports\/download[^"]*)"/.exec(exported.body)?.[1];
    assert.ok(href);
    const downloaded = await dispatchHttp(wired, {
      url: href.replaceAll("&#38;", "&").replaceAll("&amp;", "&"),
      headers: browser.header(),
    });
    assert.equal(downloaded.status, 200);
    assert.equal(JSON.parse(downloaded.body).kind, "ms_realty_workspace_export");
    const listedAgain = await dispatchHttp(wired, { url: "/admin/settings", headers: browser.header() });
    assert.match(listedAgain.body, /data-export-status="downloaded"/);

    // Revoking the current step-up clears its cookie and closes the gate again.
    const sessions = await dispatchHttp(wired, {
      url: "/api/admin/security/sessions",
      headers: browser.header({ accept: "application/json" }),
    });
    const revoked = browser.absorb(
      await dispatchHttp(wired, {
        method: "POST",
        url: "/api/admin/security/sessions/revoke",
        headers: browser.form(),
        body: `locale=en&session_id=${sessions.body.current_session_id}`,
      }),
    );
    assert.equal(revoked.status, 303);
    assert.deepEqual(browser.cookies(), []);
    assert.equal((await dispatchHttp(wired, { url: "/api/admin/activity", headers: browser.header() })).body.kind, "two_factor_required");

    // Nothing in this flow wrote to the committed workspace settings document.
    assert.equal(
      fs.readFileSync(settingsPath, "utf8"),
      fs.readFileSync(fromRoot("production", "data", "workspace-settings.json"), "utf8"),
    );
  });
});

test("a rejected form action returns to the settings screen with a named notice", async () => {
  await withWorkspace(async ({ app, clock }) => {
    const enrolment = await enrolAndActivate(app, TOKENS.owner, clock);
    void enrolment;
    const rejected = await dispatchHttp(app, {
      method: "POST",
      url: "/api/admin/security/two-factor/verify",
      headers: headers(TOKENS.owner, { "content-type": "application/x-www-form-urlencoded" }),
      body: "locale=en&code=000000",
    });
    assert.equal(rejected.status, 303);
    assert.equal(rejected.headers.location, "/admin/settings?security=two_factor_rejected#settings-security");

    const duplicate = await dispatchHttp(app, {
      method: "POST",
      url: "/api/admin/security/two-factor/enrol",
      headers: headers(TOKENS.owner, { "content-type": "application/x-www-form-urlencoded" }),
      body: "locale=en",
    });
    assert.equal(duplicate.status, 303);
    assert.equal(duplicate.headers.location, "/admin/settings?security=two_factor_already_enrolled#settings-security");
  });
});
