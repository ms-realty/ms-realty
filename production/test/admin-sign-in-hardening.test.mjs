import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import { appAdminConfigFromEnv, renderAppAdminResponse } from "../lib/app-admin-adapter.mjs";
import { createHttpApp, dispatchHttp } from "../lib/http.mjs";
import { readAuditLog } from "../lib/audit-log.mjs";
import { createSignInThrottle, recordSignInAttempt, signInClientKey } from "../lib/admin-sign-in-guard.mjs";
import {
  activateOperatorEnrolment,
  appendOperatorTwoFactorEvent,
  createOperatorEnrolment,
  readOperatorTwoFactorEvents,
} from "../lib/operator-two-factor.mjs";
import { totpCode } from "../lib/totp.mjs";

const HOST = "ms-realty.ms-realty-bg.workers.dev";
const BASE = `https://${HOST}`;
const TWO_FACTOR_KEY = "sign-in-hardening-two-factor-key-0123456789";
const OPERATOR_EMAIL = "peycheff.com@gmail.com";
const OPERATOR_PASSWORD = "correct-horse-battery";
const PRINCIPAL_ID = "payload-1";
const START = Date.parse("2026-08-25T09:00:00.000Z");
const NOW_SECONDS = Math.floor(START / 1000);

function workspace(prefix) {
  const directory = fs.mkdtempSync(`${os.tmpdir()}/ms-realty-${prefix}-`);
  const file = (name) => {
    const filePath = `${directory}/${name}`;
    fs.writeFileSync(filePath, "");
    return filePath;
  };
  return {
    directory,
    auditLogPath: file("audit-log.jsonl"),
    adminSessionLedgerPath: file("admin-sessions.jsonl"),
    operatorTwoFactorPath: file("operator-two-factor.jsonl"),
  };
}

function payloadSessionService() {
  const principal = {
    id: PRINCIPAL_ID,
    source: "payload_session",
    can_mutate: true,
    roles: ["admin"],
    workspace_ids: ["sandanski"],
    payload_user_id: 1,
    email: OPERATOR_EMAIL,
  };
  const service = {
    logins: [],
    logouts: [],
    async login({ email, password }) {
      service.logins.push(email);
      if (email !== OPERATOR_EMAIL || password !== OPERATOR_PASSWORD) throw new Error("invalid");
      return { token: "payload.browser.session", exp: NOW_SECONDS + 3600, principal, user: { id: 1 } };
    },
    async resolve(token) {
      return token === "payload.browser.session" ? { principal, user: { id: 1 } } : null;
    },
    async logout(token) {
      service.logouts.push(token);
      return true;
    },
  };
  return service;
}

// An operator who has enrolled a second factor and activated it, written
// straight into the ledger the runtime reads.
function enrolActiveSecondFactor(operatorTwoFactorPath, { operatorId = PRINCIPAL_ID, at = START } = {}) {
  const recordedAt = new Date(at).toISOString();
  const enrolment = createOperatorEnrolment({ operatorId }, { secret: TWO_FACTOR_KEY, recordedAt });
  appendOperatorTwoFactorEvent(enrolment.row, { filePath: operatorTwoFactorPath });
  const activated = activateOperatorEnrolment(
    readOperatorTwoFactorEvents(operatorTwoFactorPath),
    { operatorId, code: totpCode(enrolment.secret, { timestamp: at }) },
    { secret: TWO_FACTOR_KEY, recordedAt },
  );
  appendOperatorTwoFactorEvent(activated, { filePath: operatorTwoFactorPath });
  return enrolment.secret;
}

function loginBody({ code = "" } = {}) {
  const form = new URLSearchParams({ email: OPERATOR_EMAIL, password: OPERATOR_PASSWORD });
  if (code) form.set("code", code);
  return form.toString();
}

// The two runtimes disagreed here for a whole release: the standalone runtime
// verified the code, the deployed App Router adapter read only the email and
// the password. Both are asserted from one test so the next divergence fails
// here rather than in production.
test("a required second factor refuses a password-only sign-in on both runtimes", async () => {
  const paths = workspace("sign-in-2fa");
  const secret = enrolActiveSecondFactor(paths.operatorTwoFactorPath);
  // A later time step than activation used: a code already spent is replayed
  // in vain, which is the whole point of recording the counter.
  const at = START + 90_000;
  const clock = { at };
  const shared = {
    auditLogPath: paths.auditLogPath,
    adminSessionLedgerPath: paths.adminSessionLedgerPath,
    operatorTwoFactorPath: paths.operatorTwoFactorPath,
    operatorTwoFactorKey: TWO_FACTOR_KEY,
    runtimeDataDurableOnly: false,
    securityAt: () => new Date(clock.at).toISOString(),
    nowSeconds: () => NOW_SECONDS,
  };

  const httpService = payloadSessionService();
  const app = createHttpApp({ ...shared, payloadAdminAuth: httpService });
  const post = (body) =>
    dispatchHttp(app, { method: "POST", url: "/admin/login", headers: { "content-type": "application/x-www-form-urlencoded" }, body });

  const httpNoCode = await post(loginBody());
  assert.equal(httpNoCode.status, 303);
  assert.equal(httpNoCode.headers.location, "/admin/login?error=2fa");
  assert.equal(httpNoCode.headers["set-cookie"], undefined, "a refused sign-in hands out no session");
  assert.deepEqual(httpService.logouts, ["payload.browser.session"], "the session Payload issued is revoked again");

  const httpWrongCode = await post(loginBody({ code: "000000" }));
  assert.equal(httpWrongCode.headers.location, "/admin/login?error=2fa");

  const httpOk = await post(loginBody({ code: totpCode(secret, { timestamp: clock.at }) }));
  assert.equal(httpOk.status, 303);
  assert.equal(httpOk.headers.location, "/admin");
  assert.match(httpOk.headers["set-cookie"], /^ms_admin=/);

  const adapterService = payloadSessionService();
  const config = {
    ...appAdminConfigFromEnv({ NODE_ENV: "test" }),
    ...shared,
    payloadAdminAuth: adapterService,
  };
  const adapterPost = (body) =>
    renderAppAdminResponse(
      new Request(`${BASE}/admin/login`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded", origin: BASE, host: HOST },
        body,
      }),
      { config },
    );

  clock.at += 90_000;
  const adapterNoCode = await adapterPost(loginBody());
  assert.equal(adapterNoCode.status, 303, "the deployed runtime refuses a password-only sign-in too");
  assert.equal(adapterNoCode.headers.get("location"), "/admin/login?error=2fa");
  assert.equal(adapterNoCode.headers.get("set-cookie"), null);
  assert.deepEqual(adapterService.logouts, ["payload.browser.session"]);

  const adapterOk = await adapterPost(loginBody({ code: totpCode(secret, { timestamp: clock.at }) }));
  assert.equal(adapterOk.status, 303);
  assert.equal(adapterOk.headers.get("location"), "/admin");
  assert.match(adapterOk.headers.get("set-cookie"), /^ms_admin=/);

  // The refusal the adapter used to be unable to render at all.
  const page = await renderAppAdminResponse(new Request(`${BASE}/admin/login?error=2fa&locale=en`), { config });
  const html = await page.text();
  assert.match(html, /data-login-state="error-2fa"/);
  assert.match(html, /The authenticator code was not accepted/);
});

test("the admin surface carries frame, sniffing, referrer and content-security headers", async () => {
  const config = {
    ...appAdminConfigFromEnv({ NODE_ENV: "test" }),
    adminPrincipal: { id: "operations_lead", source: "credential_registry", can_mutate: true, roles: ["admin"] },
  };
  const pages = [
    await renderAppAdminResponse(new Request(`${BASE}/admin/login`), { config }),
    await renderAppAdminResponse(new Request(`${BASE}/admin/today?locale=en`, { headers: { accept: "text/html" } }), { config }),
  ];
  for (const page of pages) {
    assert.equal(page.status, 200);
    assert.match(page.headers.get("content-type"), /text\/html/);
    assert.equal(page.headers.get("x-frame-options"), "DENY");
    assert.equal(page.headers.get("x-content-type-options"), "nosniff");
    assert.equal(page.headers.get("referrer-policy"), "strict-origin-when-cross-origin");
    const csp = page.headers.get("content-security-policy");
    assert.match(csp, /default-src 'self'/);
    assert.match(csp, /frame-ancestors 'none'/);
    assert.match(csp, /form-action 'self'/);
    assert.match(csp, /object-src 'none'/);
    // The workbench's own assets have to keep working under it.
    assert.match(csp, /style-src [^;]*'unsafe-inline'/);
    assert.match(csp, /script-src [^;]*'unsafe-inline'/);
    assert.match(csp, /font-src [^;]*https:\/\/fonts\.gstatic\.com/);
  }
});

test("sign-in failures are throttled per address and a fresh address is not punished", async () => {
  const paths = workspace("sign-in-throttle");
  const service = payloadSessionService();
  const app = createHttpApp({
    auditLogPath: paths.auditLogPath,
    runtimeDataDurableOnly: false,
    payloadAdminAuth: service,
    signInRateLimit: { windowMs: 60_000, maxFailures: 2 },
    trustProxy: true,
    nowSeconds: () => NOW_SECONDS,
  });
  const attempt = (ip, password) =>
    dispatchHttp(app, {
      method: "POST",
      url: "/admin/login",
      headers: { "content-type": "application/x-www-form-urlencoded", "cf-connecting-ip": ip },
      body: new URLSearchParams({ email: OPERATOR_EMAIL, password }).toString(),
    });

  assert.equal((await attempt("203.0.113.7", "wrong-one")).headers.location, "/admin/login?error=1");
  assert.equal((await attempt("203.0.113.7", "wrong-two")).headers.location, "/admin/login?error=1");

  const blocked = await attempt("203.0.113.7", "wrong-three");
  assert.equal(blocked.status, 429);
  assert.ok(Number(blocked.headers["retry-after"]) >= 1);
  assert.equal(blocked.headers["cache-control"], "no-store");
  assert.match(blocked.body, /data-login-state="error-throttled"/);
  // The refusal never reaches the credential check, so no attempt is spent
  // against the account Payload is counting for its own lockout.
  assert.equal(service.logins.length, 2, "a throttled attempt is not forwarded to Payload");

  // Payload's own per-account lock is the control this one sits in front of;
  // one address must not be able to spend another operator's attempts.
  const other = await attempt("203.0.113.8", "wrong-one");
  assert.equal(other.status, 303, "a different address still gets its own attempts");

  // A correct password from an address that has not failed still works, which
  // is why the throttle counts failures rather than sign-ins.
  const good = await attempt("203.0.113.9", OPERATOR_PASSWORD);
  assert.equal(good.status, 303);
  assert.equal(good.headers.location, "/admin");
});

test("an unidentifiable caller is never bucketed with everyone else", () => {
  // Without a trusted proxy and without a socket peer there is no address to
  // key on. Throttling then would put every operator into one bucket, which
  // is the lockout this guard exists to prevent.
  assert.equal(signInClientKey({ headers: { "x-forwarded-for": "203.0.113.1" } }), "");
  assert.equal(signInClientKey({ headers: { "x-forwarded-for": "203.0.113.1" } }, { trustProxy: true }), "203.0.113.1");
  assert.equal(signInClientKey({ headers: {}, remoteAddress: "198.51.100.4" }), "198.51.100.4");

  const throttle = createSignInThrottle({ windowMs: 60_000, maxFailures: 1 });
  throttle.recordFailure("");
  throttle.recordFailure("");
  assert.equal(throttle.check("").allowed, true);
  assert.equal(throttle.size(), 0);
});

// The allowlist in audit-log.mjs is not advisory: an action missing from it
// throws at the moment of the write. This test drives the real recorder into
// a real ledger and reads the rows back, so a shape-only assertion can never
// stand in for the allowlist again.
test("every sign-in attempt lands in the audit ledger through the real allowlist", async () => {
  const paths = workspace("sign-in-audit");
  const service = payloadSessionService();
  const app = createHttpApp({
    auditLogPath: paths.auditLogPath,
    runtimeDataDurableOnly: false,
    payloadAdminAuth: service,
    signInRateLimit: { windowMs: 60_000, maxFailures: 1 },
    trustProxy: true,
    nowSeconds: () => NOW_SECONDS,
    securityAt: new Date(START).toISOString(),
  });
  const attempt = (password, ip = "203.0.113.10") =>
    dispatchHttp(app, {
      method: "POST",
      url: "/admin/login",
      headers: { "content-type": "application/x-www-form-urlencoded", "cf-connecting-ip": ip },
      body: new URLSearchParams({ email: OPERATOR_EMAIL, password }).toString(),
    });

  await attempt("wrong-one");
  await attempt("wrong-two");
  await attempt(OPERATOR_PASSWORD, "203.0.113.11");

  const rows = readAuditLog(paths.auditLogPath);
  assert.equal(rows.length, 3, "a refusal, a throttled refusal and a success are all recorded");
  assert.deepEqual(
    rows.map((row) => [row.action, row.status, row.metadata.reason]),
    [
      ["admin_sign_in_failed", "failed", "rejected"],
      ["admin_sign_in_failed", "failed", "throttled"],
      ["admin_signed_in", "succeeded", undefined],
    ],
  );
  assert.equal(rows[2].actor, PRINCIPAL_ID);
  assert.equal(rows[0].actor, "anonymous", "a rejected password establishes no identity to name");
  for (const row of rows) {
    assert.equal(row.object_type, "admin_sign_in");
    assert.match(row.object_id, /^[0-9a-f]{16}$/, "the address attempted is a fingerprint, never the address itself");
    assert.match(row.metadata.client_hash, /^[0-9a-f]{16}$/);
    const serialized = JSON.stringify(row);
    assert.equal(serialized.includes(OPERATOR_EMAIL), false, "no email address in the clear");
    assert.equal(serialized.includes("203.0.113."), false, "no client address in the clear");
  }
  // Attempts against one address group together; a different source does not.
  assert.equal(rows[0].object_id, rows[2].object_id);
  assert.notEqual(rows[0].metadata.client_hash, rows[2].metadata.client_hash);
});

test("a sign-in record survives a ledger that cannot be written", () => {
  const lines = [];
  const entry = recordSignInAttempt(
    { outcome: "failed", email: OPERATOR_EMAIL, clientKey: "203.0.113.12", reason: "rejected" },
    { auditLogPath: "/nonexistent-directory/ms-realty/audit.jsonl", logger: (line) => lines.push(line) },
  );
  assert.equal(entry.action, "admin_sign_in_failed");
  assert.equal(lines.length, 1, "an unwritable ledger falls back to the log, it does not throw");
  assert.match(lines[0], /"kind":"admin_sign_in_attempt"/);

  // The durable-only runtime has an ephemeral disk, so the log is the sink.
  const durable = [];
  recordSignInAttempt(
    { outcome: "succeeded", email: OPERATOR_EMAIL, clientKey: "203.0.113.12", operatorId: PRINCIPAL_ID },
    { auditLogPath: "/tmp/never-written.jsonl", durableOnly: true, logger: (line) => durable.push(line) },
  );
  assert.match(durable[0], /"action":"admin_signed_in"/);
  assert.equal(durable[0].includes(OPERATOR_EMAIL), false);
});
