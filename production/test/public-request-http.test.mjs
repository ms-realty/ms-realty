import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHttpApp, dispatchHttp } from "../lib/http.mjs";
import { readAuditLog } from "../lib/audit-log.mjs";
import { readPublicRequestOutcomes } from "../lib/public-request-outcomes.mjs";

const TOKEN = "public-request-http-test-token-00001";
const SECRET = "public-request-http-contact-secret-00001";

function emptyLedger(directory, name) {
  const filePath = path.join(directory, `${name}.jsonl`);
  fs.writeFileSync(filePath, "");
  return filePath;
}

async function withCredentials(fn) {
  const previous = process.env.MS_REALTY_ADMIN_CREDENTIALS_JSON;
  process.env.MS_REALTY_ADMIN_CREDENTIALS_JSON = JSON.stringify([{ id: "broker_http", token: TOKEN, roles: ["broker"] }]);
  try {
    return await fn();
  } finally {
    if (previous === undefined) delete process.env.MS_REALTY_ADMIN_CREDENTIALS_JSON;
    else process.env.MS_REALTY_ADMIN_CREDENTIALS_JSON = previous;
  }
}

test("HTTP runtime carries public requests from intake through broker completion", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ms-realty-public-request-http-"));
  const paths = Object.fromEntries(
    [
      "leadLedgerPath",
      "leadContactVaultPath",
      "publicContactVaultPath",
      "replyOutboxPath",
      "languageRequestPath",
      "translationLedgerPath",
      "listingEditLedgerPath",
      "viewingLedgerPath",
      "viewingFollowUpLedgerPath",
      "savedSearchLedgerPath",
      "publicRequestOutcomeLedgerPath",
      "sellerPipelinePath",
      "sellerPipelineOutcomeLedgerPath",
      "dealLedgerPath",
      "brokerContactLedgerPath",
      "tourApprovalLedgerPath",
      "eventLedgerPath",
      "consentLedgerPath",
      "auditLogPath",
    ].map((name) => [name, emptyLedger(directory, name)]),
  );
  const app = createHttpApp({
    ...paths,
    leadContactKey: SECRET,
    publicContactKey: SECRET,
    savedAt: "2026-07-18T10:00:00.000Z",
    requestedAt: "2026-07-18T11:00:00.000Z",
    receivedAt: "2026-07-19T09:00:00.000Z",
    reviewedAt: "2026-07-19T09:00:00.000Z",
    publicRequestOutcomeAt: "2026-07-19T09:00:00.000Z",
  });

  await withCredentials(async () => {
    const saved = await dispatchHttp(app, {
      method: "POST",
      url: "/api/saved-searches",
      body: {
        id: "saved-search-http-review",
        locale: "ru",
        query: "Sandanski",
        filters: { property_type: "apartment" },
        contact: { name: "Elena Petrova", email: "elena-http@example.test" },
        contactPreference: "email",
        alertConsent: true,
        alertFrequency: "daily",
        owner: "broker_http",
      },
    });
    assert.equal(saved.status, 201);
    assert.equal(saved.body.contactVault.encrypted, true);
    assert.equal(saved.body.contact, undefined);

    const language = await dispatchHttp(app, {
      method: "POST",
      url: "/api/language-requests",
      body: {
        id: "language-request-http-review",
        requestedLocale: "he",
        requestedPath: "/he/properties/MS-CRAWL-0114",
        contact: { name: "Noa Levi", phone: "+359 888 333 222" },
        message: "Please notify me when Hebrew is reviewed.",
      },
    });
    assert.equal(language.status, 201);
    assert.equal(language.body.contactVault.encrypted, true);
    assert.equal(language.body.message, undefined);

    const queue = await dispatchHttp(app, {
      url: "/api/admin/requests?locale=en",
      headers: { authorization: `Bearer ${TOKEN}` },
    });
    assert.equal(queue.status, 200);
    assert.equal(queue.headers["cache-control"], "no-store");
    assert.equal(queue.body.kind, "admin_requests");
    assert.equal(queue.body.publicRequestQueue.summary.open, 2);
    assert.equal(queue.body.publicRequestQueue.rows.find((row) => row.request_type === "saved_search").contact.email, "elena-http@example.test");
    assert.equal(
      queue.body.publicRequestQueue.rows.find((row) => row.request_type === "language_request").message,
      "Please notify me when Hebrew is reviewed.",
    );

    const completed = await dispatchHttp(app, {
      method: "POST",
      url: "/api/admin/public-requests/outcome",
      headers: { authorization: `Bearer ${TOKEN}` },
      body: {
        requestType: "saved_search",
        requestId: saved.body.id,
        action: "complete",
        note: "Customer confirmed the search is complete.",
      },
    });
    assert.equal(completed.status, 201);
    assert.equal(completed.body.outcome.actor, "broker_http");
    assert.equal(completed.body.request.status, "completed");

    const updated = await dispatchHttp(app, {
      url: "/admin/requests",
      headers: { authorization: `Bearer ${TOKEN}`, accept: "text/html" },
    });
    assert.equal(updated.status, 200);
    assert.match(updated.body, /data-public-request-history="true"/);
    assert.match(updated.body, /elena-http@example\.test/);
    assert.equal(readPublicRequestOutcomes(paths.publicRequestOutcomeLedgerPath).length, 1);
    assert.equal(readAuditLog(paths.auditLogPath)[0].actor, "broker_http");
  });
});
