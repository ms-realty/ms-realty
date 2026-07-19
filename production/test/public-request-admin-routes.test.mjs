import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { appAdminConfigFromEnv, renderAppAdminResponse } from "../lib/app-admin-adapter.mjs";
import { readAuditLog } from "../lib/audit-log.mjs";
import { appendPublicContact } from "../lib/public-contact-vault.mjs";
import { readPublicRequestOutcomes } from "../lib/public-request-outcomes.mjs";

const TOKEN = "public-request-route-test-token-0001";
const AUTH = { authorization: `Bearer ${TOKEN}` };
const SECRET = "public-request-contact-key-for-tests-0001";

function jsonl(directory, name, rows = []) {
  const filePath = path.join(directory, `${name}.jsonl`);
  fs.writeFileSync(filePath, rows.map((row) => JSON.stringify(row)).join("\n") + (rows.length ? "\n" : ""));
  return filePath;
}

async function withCredentials(fn) {
  const previous = process.env.MS_REALTY_ADMIN_CREDENTIALS_JSON;
  process.env.MS_REALTY_ADMIN_CREDENTIALS_JSON = JSON.stringify([{ id: "broker_anna", token: TOKEN, roles: ["broker"] }]);
  try {
    return await fn();
  } finally {
    if (previous === undefined) delete process.env.MS_REALTY_ADMIN_CREDENTIALS_JSON;
    else process.env.MS_REALTY_ADMIN_CREDENTIALS_JSON = previous;
  }
}

function fixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ms-realty-public-requests-admin-"));
  const savedSearch = {
    saved_at: "2026-07-18T10:00:00.000Z",
    id: "saved-search-ru-review",
    requested_locale: "ru",
    locale: "ru",
    fallback_used: false,
    query: "Sandanski",
    filters: { property_type: "apartment", bedrooms_min: 2 },
    contact_ref: "saved-search-ru-review",
    contact_available: true,
    contact_preference: "email",
    alert_consent: true,
    match_count: 14,
    price_snapshot: {},
    alert_frequency: "daily",
    status: "active",
    alert_task: { id: "alert-ru-review", status: "open", owner: "broker_anna" },
  };
  const languageRequest = {
    requested_at: "2026-07-18T11:00:00.000Z",
    id: "language-request-he-review",
    requested_locale: "he",
    requested_path: "/he/properties/MS-CRAWL-0114",
    fallback_locale: "en",
    admin_locale: "en",
    public_indexable: false,
    notification_requested: true,
    contact_ref: "language-request-he-review",
    contact_available: true,
    message_available: true,
  };
  const paths = {
    auditLogPath: jsonl(directory, "audit"),
    brokerContactLedgerPath: jsonl(directory, "broker-contacts"),
    dealLedgerPath: jsonl(directory, "deals"),
    languageRequestPath: jsonl(directory, "language-requests", [languageRequest]),
    leadLedgerPath: jsonl(directory, "leads"),
    leadContactVaultPath: jsonl(directory, "lead-contacts"),
    publicContactVaultPath: jsonl(directory, "public-contacts"),
    publicRequestOutcomeLedgerPath: jsonl(directory, "public-request-outcomes"),
    replyOutboxPath: jsonl(directory, "replies"),
    listingEditLedgerPath: jsonl(directory, "listing-edits"),
    savedSearchLedgerPath: jsonl(directory, "saved-searches", [savedSearch]),
    sellerPipelinePath: jsonl(directory, "seller-pipeline"),
    sellerPipelineOutcomeLedgerPath: jsonl(directory, "seller-pipeline-outcomes"),
    translationLedgerPath: jsonl(directory, "translations"),
    viewingLedgerPath: jsonl(directory, "viewings"),
    viewingFollowUpLedgerPath: jsonl(directory, "viewing-follow-ups"),
  };
  appendPublicContact(
    {
      subjectType: "saved_search",
      subjectId: savedSearch.id,
      contact: { name: "Elena Petrova", email: "elena@example.test" },
      contactPreference: "email",
    },
    { filePath: paths.publicContactVaultPath, secret: SECRET, storedAt: "2026-07-18T10:00:00.000Z" },
  );
  appendPublicContact(
    {
      subjectType: "language_request",
      subjectId: languageRequest.id,
      contact: { name: "Noa Levi", phone: "+359 888 111 222" },
      contactPreference: "phone",
      message: "Please tell me when this property is available in Hebrew.",
    },
    {
      filePath: paths.publicContactVaultPath,
      secret: SECRET,
      storedAt: "2026-07-18T11:00:00.000Z",
      includeMessage: true,
    },
  );
  return {
    config: {
      ...appAdminConfigFromEnv({}),
      ...paths,
      leadContactKey: SECRET,
      publicContactKey: SECRET,
      publicRequestOutcomeAt: "2026-07-19T09:00:00.000Z",
      reviewedAt: "2026-07-19T09:00:00.000Z",
    },
    paths,
    savedSearch,
    languageRequest,
  };
}

test("authenticated request workspace joins private contacts without leaking them into safe ledgers", async () => {
  const { config, paths } = fixture();
  await withCredentials(async () => {
    const unauthorized = await renderAppAdminResponse(new Request("http://local/api/admin/requests"), { config });
    assert.equal(unauthorized.status, 401);

    const response = await renderAppAdminResponse(
      new Request("http://local/api/admin/requests?locale=ru", { headers: AUTH }),
      { config },
    );
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    const body = await response.json();
    assert.equal(body.kind, "admin_requests");
    assert.equal(body.workspace.operator_id, "broker_anna");
    assert.equal(body.publicRequestQueue.summary.open, 2);
    assert.equal(body.publicRequestQueue.summary.contacts_available, 2);
    assert.equal(body.publicRequestQueue.rows.find((row) => row.request_type === "saved_search").contact.email, "elena@example.test");
    assert.equal(
      body.publicRequestQueue.rows.find((row) => row.request_type === "language_request").message,
      "Please tell me when this property is available in Hebrew.",
    );

    const htmlResponse = await renderAppAdminResponse(
      new Request("http://local/admin/requests?locale=ru", { headers: AUTH }),
      { config },
    );
    const html = await htmlResponse.text();
    assert.match(html, /Заявки и уведомления/);
    assert.match(html, /data-public-request-outcome-form="true"/);
    assert.match(html, /mailto:elena@example\.test/);
    assert.match(html, /data-private-request-message="true"/);

    assert.doesNotMatch(fs.readFileSync(paths.savedSearchLedgerPath, "utf8"), /elena@example\.test/);
    assert.doesNotMatch(fs.readFileSync(paths.languageRequestPath, "utf8"), /Noa Levi|Please tell me/);
  });
});

test("request outcomes bind the authenticated operator, update the queue, and append an audit row", async () => {
  const { config, paths, savedSearch } = fixture();
  await withCredentials(async () => {
    const spoofed = await renderAppAdminResponse(
      new Request("http://local/api/admin/public-requests/outcome", {
        method: "POST",
        headers: { ...AUTH, "content-type": "application/json" },
        body: JSON.stringify({ requestType: "saved_search", requestId: savedSearch.id, actor: "another_broker", action: "complete", note: "Done" }),
      }),
      { config },
    );
    assert.equal(spoofed.status, 400);

    const completed = await renderAppAdminResponse(
      new Request("http://local/api/admin/public-requests/outcome", {
        method: "POST",
        headers: { ...AUTH, "content-type": "application/json" },
        body: JSON.stringify({ requestType: "saved_search", requestId: savedSearch.id, action: "complete", note: "Customer asked us to stop alerts." }),
      }),
      { config },
    );
    assert.equal(completed.status, 201);
    const completedBody = await completed.json();
    assert.equal(completedBody.outcome.actor, "broker_anna");
    assert.equal(completedBody.request.status, "completed");

    const queueResponse = await renderAppAdminResponse(
      new Request("http://local/api/admin/requests", { headers: AUTH }),
      { config },
    );
    const queue = await queueResponse.json();
    assert.equal(queue.publicRequestQueue.summary.open, 1);
    assert.equal(queue.publicRequestQueue.summary.completed, 1);
    assert.equal(queue.publicRequestQueue.states.find((row) => row.request_id === savedSearch.id).status, "completed");

    const outcomes = readPublicRequestOutcomes(paths.publicRequestOutcomeLedgerPath);
    assert.equal(outcomes.length, 1);
    assert.equal(outcomes[0].actor, "broker_anna");
    assert.doesNotMatch(fs.readFileSync(paths.publicRequestOutcomeLedgerPath, "utf8"), /elena@example\.test/);
    const audit = readAuditLog(paths.auditLogPath);
    assert.equal(audit.length, 1);
    assert.equal(audit[0].action, "public_request_outcome_recorded");
    assert.equal(audit[0].actor, "broker_anna");
    assert.equal(audit[0].metadata.status, "completed");
  });
});
