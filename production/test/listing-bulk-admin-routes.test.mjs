import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import { appAdminConfigFromEnv, renderAppAdminResponse } from "../lib/app-admin-adapter.mjs";
import { readAuditLog } from "../lib/audit-log.mjs";
import { createHttpApp, dispatchHttp } from "../lib/http.mjs";
import { readListingEdits } from "../lib/listing-edits.mjs";

function tempWorkspace(prefix) {
  const directory = fs.mkdtempSync(`${os.tmpdir()}/ms-realty-${prefix}-`);
  const paths = {
    listingEdits: `${directory}/listing-edits.jsonl`,
    translations: `${directory}/translation-tasks.jsonl`,
    audit: `${directory}/audit-log.jsonl`,
  };
  for (const file of Object.values(paths)) fs.writeFileSync(file, "");
  return paths;
}

async function withNamedOperator(fn) {
  const previous = {
    NODE_ENV: process.env.NODE_ENV,
    MS_REALTY_ADMIN_TOKEN: process.env.MS_REALTY_ADMIN_TOKEN,
    MS_REALTY_ADMIN_ACTOR: process.env.MS_REALTY_ADMIN_ACTOR,
    MS_REALTY_ADMIN_CREDENTIALS_JSON: process.env.MS_REALTY_ADMIN_CREDENTIALS_JSON,
  };
  try {
    process.env.NODE_ENV = "production";
    delete process.env.MS_REALTY_ADMIN_TOKEN;
    delete process.env.MS_REALTY_ADMIN_ACTOR;
    process.env.MS_REALTY_ADMIN_CREDENTIALS_JSON = JSON.stringify([
      { id: "listing_operations", token: "listing-operations-token-0123456789" },
    ]);
    return await fn({ authorization: "Bearer listing-operations-token-0123456789" });
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test("Next listing manager bulk status changes are selected, attributed, audited, and retry-safe", async () => {
  await withNamedOperator(async (auth) => {
    const paths = tempWorkspace("next-listing-bulk");
    const config = appAdminConfigFromEnv({
      MS_REALTY_LISTING_EDIT_LEDGER_PATH: paths.listingEdits,
      MS_REALTY_TRANSLATION_LEDGER_PATH: paths.translations,
      MS_REALTY_AUDIT_LOG_PATH: paths.audit,
      MS_REALTY_EDITED_AT: "2026-07-19T08:00:00.000Z",
    });

    const page = await renderAppAdminResponse(
      new Request("https://example.test/admin/listings?q=MS-CRAWL-0001", { headers: auth }),
      { config },
    );
    const html = await page.text();
    assert.equal(page.status, 200);
    assert.match(html, /data-listing-bulk-form="true"/);
    assert.match(html, /action="\/api\/admin\/listings\/status"/);
    assert.match(html, /name="listingIds" value="MS-CRAWL-0001"/);

    const spoofed = await renderAppAdminResponse(
      new Request("https://example.test/api/admin/listings/status", {
        method: "POST",
        headers: { ...auth, "content-type": "application/json" },
        body: JSON.stringify({
          listingIds: ["MS-CRAWL-0001", "MS-CRAWL-0002"],
          targetStatus: "reserved",
          editor: "somebody_else",
        }),
      }),
      { config },
    );
    assert.equal(spoofed.status, 400);
    assert.equal(readListingEdits(paths.listingEdits).length, 0);

    const request = () =>
      renderAppAdminResponse(
        new Request("https://example.test/api/admin/listings/status", {
          method: "POST",
          headers: { ...auth, "content-type": "application/json" },
          body: JSON.stringify({ listingIds: ["MS-CRAWL-0001", "MS-CRAWL-0002"], targetStatus: "reserved" }),
        }),
        { config },
      );
    const first = await request();
    const firstBody = await first.json();
    assert.equal(first.status, 201);
    assert.equal(firstBody.updated, 2);
    assert.equal(firstBody.edits.every((edit) => edit.editor === "listing_operations"), true);
    assert.equal(readListingEdits(paths.listingEdits).length, 2);
    assert.equal(readAuditLog(paths.audit).length, 2);
    assert.equal(readAuditLog(paths.audit).every((row) => row.actor === "listing_operations"), true);

    const retry = await request();
    const retryBody = await retry.json();
    assert.equal(retry.status, 200);
    assert.equal(retryBody.updated, 0);
    assert.equal(retryBody.unchanged, 2);
    assert.equal(readListingEdits(paths.listingEdits).length, 2);
    assert.equal(readAuditLog(paths.audit).length, 2);

    const json = await renderAppAdminResponse(
      new Request("https://example.test/api/admin/listings?q=MS-CRAWL-0001", { headers: auth }),
      { config },
    );
    assert.equal((await json.json()).listings[0].listing_status, "reserved");
  });
});

test("HTTP adapter preserves repeated form selections for bulk listing status changes", async () => {
  await withNamedOperator(async (auth) => {
    const paths = tempWorkspace("http-listing-bulk");
    const app = createHttpApp({
      listingEditLedgerPath: paths.listingEdits,
      translationLedgerPath: paths.translations,
      auditLogPath: paths.audit,
      editedAt: "2026-07-19T08:00:00.000Z",
    });
    const response = await dispatchHttp(app, {
      method: "POST",
      url: "/api/admin/listings/status",
      headers: { ...auth, "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams([
        ["listingIds", "MS-CRAWL-0001"],
        ["listingIds", "MS-CRAWL-0002"],
        ["targetStatus", "sold"],
        ["editor", "listing_operations"],
      ]).toString(),
    });
    assert.equal(response.status, 201);
    assert.equal(response.body.requested, 2);
    assert.equal(response.body.updated, 2);
    assert.equal(readListingEdits(paths.listingEdits).length, 2);
    assert.equal(readAuditLog(paths.audit).length, 2);
  });
});

