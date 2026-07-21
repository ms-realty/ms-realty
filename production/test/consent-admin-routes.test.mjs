import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import { renderAppAdminResponse } from "../lib/app-admin-adapter.mjs";
import { readAuditLog } from "../lib/audit-log.mjs";
import { appendConsentRecord, createConsentRecord, readConsentLedger } from "../lib/consent-ledger.mjs";
import { createHttpApp, dispatchHttp } from "../lib/http.mjs";

const TOKEN = "consent-admin-token-0123456789abcdef";
const HEADERS = { authorization: `Bearer ${TOKEN}` };

function tempFile(name) {
  const file = `${fs.mkdtempSync(`${os.tmpdir()}/ms-realty-${name}-`)}/${name}.jsonl`;
  fs.writeFileSync(file, "");
  return file;
}

function paths() {
  const consentLedgerPath = tempFile("consent-admin-ledger");
  appendConsentRecord(
    createConsentRecord(
      {
        consentType: "saved_search_alerts",
        source: "website_saved_search",
        subjectId: "saved-search-consent-1",
        locale: "en",
        contact: { email: "private-buyer@example.test" },
        legalBasis: "consent",
      },
      "2026-07-19T09:00:00.000Z",
    ),
    { filePath: consentLedgerPath },
  );
  return {
    consentLedgerPath,
    auditLogPath: tempFile("consent-admin-audit"),
    reviewedAt: "2026-07-19T10:00:00.000Z",
  };
}

async function withAdmin(fn) {
  const previous = {
    NODE_ENV: process.env.NODE_ENV,
    MS_REALTY_ADMIN_TOKEN: process.env.MS_REALTY_ADMIN_TOKEN,
    MS_REALTY_ADMIN_ACTOR: process.env.MS_REALTY_ADMIN_ACTOR,
    MS_REALTY_ADMIN_CREDENTIALS_JSON: process.env.MS_REALTY_ADMIN_CREDENTIALS_JSON,
  };
  try {
    process.env.NODE_ENV = "production";
    process.env.MS_REALTY_ADMIN_TOKEN = TOKEN;
    process.env.MS_REALTY_ADMIN_ACTOR = "broker_ivan";
    delete process.env.MS_REALTY_ADMIN_CREDENTIALS_JSON;
    return await fn();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

const withdrawal = {
  subjectId: "saved-search-consent-1",
  consentType: "saved_search_alerts",
  reasonCode: "customer_request",
  actor: "broker_ivan",
  humanConfirmed: true,
};

test("standalone consent workspace exposes current privacy-safe state and records withdrawal", async () => {
  await withAdmin(async () => {
    const config = paths();
    const app = createHttpApp(config);
    const page = await dispatchHttp(app, { url: "/admin/consents?locale=en", headers: HEADERS });
    assert.equal(page.status, 200);
    assert.match(page.body, /data-react-admin-ui="consents"/);
    assert.match(page.body, /data-consent-row="true"/);
    assert.match(page.body, /data-consent-column="subject" data-label="Enquiry or subscription"/);
    assert.match(page.body, /data-consent-column="action" data-label="Action"/);
    assert.match(page.body, /saved-search-consent-1/);
    assert.doesNotMatch(page.body, /private-buyer@example\.test/);
    const response = await dispatchHttp(app, {
      method: "POST",
      url: "/api/admin/consents/withdraw",
      headers: HEADERS,
      body: withdrawal,
    });
    assert.equal(response.status, 201);
    assert.equal(response.body.record.actor, "broker_ivan");
    assert.equal(response.body.record.granted, false);
    assert.equal(readConsentLedger(config.consentLedgerPath).length, 2);
    assert.deepEqual(readAuditLog(config.auditLogPath).map((row) => row.action), ["consent_withdrawn"]);

    const retry = await dispatchHttp(app, {
      method: "POST",
      url: "/api/admin/consents/withdraw",
      headers: HEADERS,
      body: withdrawal,
    });
    assert.equal(retry.status, 200);
    assert.equal(retry.body.idempotent, true);
    assert.equal(readConsentLedger(config.consentLedgerPath).length, 2);
  });
});

test("Next consent route keeps the same human-attributed withdrawal contract", async () => {
  await withAdmin(async () => {
    const config = paths();
    const response = await renderAppAdminResponse(
      new Request("https://example.test/api/admin/consents/withdraw", {
        method: "POST",
        headers: { ...HEADERS, "content-type": "application/json" },
        body: JSON.stringify(withdrawal),
      }),
      { config },
    );
    assert.equal(response.status, 201);
    const body = await response.json();
    assert.equal(body.record.actor, "broker_ivan");
    assert.equal(body.record.source, "admin_withdrawal");
  });
});

test("consent withdrawal fails closed without human confirmation", async () => {
  await withAdmin(async () => {
    const config = paths();
    const app = createHttpApp(config);
    const response = await dispatchHttp(app, {
      method: "POST",
      url: "/api/admin/consents/withdraw",
      headers: HEADERS,
      body: { ...withdrawal, humanConfirmed: false },
    });
    assert.equal(response.status, 400);
    assert.match(response.body.message, /human confirmation/);
    assert.equal(readConsentLedger(config.consentLedgerPath).length, 1);
  });
});
