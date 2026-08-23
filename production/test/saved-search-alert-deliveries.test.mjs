import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHttpApp, dispatchHttp } from "../lib/http.mjs";
import { loadCmsSeed } from "../lib/runtime.mjs";
import { approvedPublicSeedFixturePath } from "./approved-public-seed.fixture.mjs";
import { readAuditLog } from "../lib/audit-log.mjs";
import {
  assertSavedSearchAlertDeliveries,
  buildSavedSearchAlertDeliveryQueue,
  createSavedSearchAlertDelivery,
  queueDueSavedSearchAlerts,
  readSavedSearchAlertDeliveries,
  savedSearchAlertDue,
  withSavedSearchAlertState,
} from "../lib/saved-search-alert-deliveries.mjs";

const TOKEN = "saved-search-alert-delivery-test-token-1";
const VAULT_KEY = "saved-search-alert-delivery-vault-key-01";

function savedSearchRow(overrides = {}) {
  return {
    saved_at: "2026-07-04T00:07:00.000Z",
    id: "saved-search-alert-fixture",
    requested_locale: "he",
    locale: "he",
    fallback_used: false,
    query: "Sandanski",
    filters: { property_type: "apartment" },
    contact_preference: "whatsapp",
    alert_consent: true,
    match_count: 0,
    price_snapshot: {},
    alert_frequency: "weekly",
    status: "active",
    alert_task: { id: "alert-he-fixture", status: "open", owner: "broker_en" },
    contact_ref: "saved-search-alert-fixture",
    contact_available: true,
    ...overrides,
  };
}

const ALERT_ROW = {
  saved_search_id: "saved-search-alert-fixture",
  status: "new_matches",
  new_match_count: 3,
  price_change_count: 0,
  sample_listing_ids: ["MS-CRAWL-0001", "MS-CRAWL-0002"],
};

function emptyLedger(directory, name) {
  const filePath = path.join(directory, `${name}.jsonl`);
  fs.writeFileSync(filePath, "");
  return filePath;
}

async function withCredentials(fn) {
  const previous = process.env.MS_REALTY_ADMIN_CREDENTIALS_JSON;
  process.env.MS_REALTY_ADMIN_CREDENTIALS_JSON = JSON.stringify([
    { id: "broker_alerts", token: TOKEN, roles: ["broker"] },
  ]);
  try {
    return await fn();
  } finally {
    if (previous === undefined) delete process.env.MS_REALTY_ADMIN_CREDENTIALS_JSON;
    else process.env.MS_REALTY_ADMIN_CREDENTIALS_JSON = previous;
  }
}

test("a due saved search becomes a queued, human-sent alert record", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ms-realty-saved-search-alert-"));
  const filePath = path.join(directory, "deliveries.jsonl");
  const record = savedSearchRow();

  assert.equal(savedSearchAlertDue(record, { deliveries: [], now: "2026-07-04T00:07:00.000Z" }), false);
  assert.equal(savedSearchAlertDue(record, { deliveries: [], now: "2026-07-12T00:07:00.000Z" }), true);
  assert.equal(
    savedSearchAlertDue({ ...record, status: "paused" }, { deliveries: [], now: "2026-07-12T00:07:00.000Z" }),
    false,
  );

  const run = queueDueSavedSearchAlerts({
    savedSearches: [record],
    alertReport: { rows: [ALERT_ROW] },
    filePath,
    queuedAt: "2026-07-12T00:07:00.000Z",
  });
  assert.equal(run.summary.queued, 1);
  // Queued for a human. Nothing is delivered by this path, ever.
  assert.equal(run.summary.delivered, 0);
  assert.equal(run.summary.delivery_mode, "manual_human_send");
  const [delivery] = run.queued;
  assert.equal(delivery.status, "queued");
  assert.equal(delivery.human_approval_required, true);
  assert.equal(delivery.sent_at, null);
  assert.equal(delivery.owner, "broker_en");
  assert.equal(delivery.channel, "whatsapp");
  assert.equal(delivery.reason, "new_matches");
  assert.deepEqual(delivery.listing_ids, ["MS-CRAWL-0001", "MS-CRAWL-0002"]);
  // Routing only, never a contact value.
  assert.equal(delivery.contact, undefined);
  assert.equal(JSON.stringify(delivery).includes("@"), false);
  assert.equal(assertSavedSearchAlertDeliveries(readSavedSearchAlertDeliveries(filePath)), true);

  // An unsent alert is never duplicated: one person does not get a pile-up.
  const second = queueDueSavedSearchAlerts({
    savedSearches: [record],
    alertReport: { rows: [ALERT_ROW] },
    filePath,
    queuedAt: "2026-07-30T00:07:00.000Z",
  });
  assert.equal(second.summary.queued, 0);
  assert.equal(second.skipped[0].reason, "awaiting_human_send");
  assert.equal(readSavedSearchAlertDeliveries(filePath).length, 1);

  const quiet = queueDueSavedSearchAlerts({
    savedSearches: [savedSearchRow({ id: "saved-search-quiet" })],
    alertReport: { rows: [{ ...ALERT_ROW, saved_search_id: "saved-search-quiet", status: "no_new_matches" }] },
    filePath: path.join(directory, "quiet.jsonl"),
    queuedAt: "2026-07-30T00:07:00.000Z",
  });
  assert.equal(quiet.summary.queued, 0);
  assert.equal(quiet.skipped[0].reason, "no_new_matches");

  const queue = buildSavedSearchAlertDeliveryQueue({
    savedSearches: [record],
    deliveries: readSavedSearchAlertDeliveries(filePath),
    now: "2026-07-13T00:07:00.000Z",
  });
  assert.equal(queue.summary.awaiting_human_send, 1);
  assert.equal(queue.summary.sent, 0);
  assert.equal(queue.rows[0].query, "Sandanski");
  assert.equal(queue.rows[0].waiting_hours, 24);

  const withState = withSavedSearchAlertState([record], readSavedSearchAlertDeliveries(filePath));
  assert.equal(withState[0].alerts_queued, 1);
  assert.equal(withState[0].last_alert_queued_at, "2026-07-12T00:07:00.000Z");
});

test("alert deliveries refuse to claim delivery or carry contact data", () => {
  const record = savedSearchRow();
  assert.throws(
    () => createSavedSearchAlertDelivery(record, { ...ALERT_ROW, status: "no_new_matches" }),
    /new matches or price changes/,
  );
  assert.throws(
    () => createSavedSearchAlertDelivery(record, { ...ALERT_ROW, new_match_count: 0, price_change_count: 0 }),
    /something to report/,
  );
  assert.throws(
    () => assertSavedSearchAlertDeliveries([{ ...createSavedSearchAlertDelivery(record, ALERT_ROW), id: "a", status: "sent" }]),
    /queued for a human sender/,
  );
  assert.throws(
    () =>
      assertSavedSearchAlertDeliveries([
        { ...createSavedSearchAlertDelivery(record, ALERT_ROW), id: "a", sent_at: "2026-07-12T00:00:00.000Z" },
      ]),
    /queued for a human sender/,
  );
  assert.throws(
    () =>
      assertSavedSearchAlertDeliveries([
        { ...createSavedSearchAlertDelivery(record, ALERT_ROW), id: "a", delivery_mode: "automatic" },
      ]),
    /automatic delivery/,
  );
  assert.throws(
    () =>
      assertSavedSearchAlertDeliveries([
        { ...createSavedSearchAlertDelivery(record, ALERT_ROW), id: "a", email: "leak@example.test" },
      ]),
    /raw contact fields/,
  );
});

test("the admin alert run queues broker work and never sends", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ms-realty-saved-search-alert-http-"));
  const paths = Object.fromEntries(
    [
      "leadLedgerPath",
      "publicContactVaultPath",
      "languageRequestPath",
      "savedSearchLedgerPath",
      "savedSearchManageEventLedgerPath",
      "savedSearchAlertDeliveryLedgerPath",
      "publicRequestOutcomeLedgerPath",
      "listingEditLedgerPath",
      "mediaReviewLedgerPath",
      "consentLedgerPath",
      "eventLedgerPath",
      "auditLogPath",
    ].map((name) => [name, emptyLedger(directory, name)]),
  );
  fs.writeFileSync(paths.savedSearchLedgerPath, `${JSON.stringify(savedSearchRow())}\n`);

  const app = createHttpApp({
    ...paths,
    // Alerts may only speak about listings that cleared the public-inventory
    // approval boundary, so the run reads the published seed.
    seed: loadCmsSeed(approvedPublicSeedFixturePath()),
    publicContactKey: VAULT_KEY,
    savedSearchManageSecret: "saved-search-alert-http-secret-000000001",
    savedSearchAlertQueuedAt: "2026-07-12T00:07:00.000Z",
    reviewedAt: "2026-07-12T00:07:00.000Z",
    receivedAt: "2026-07-12T00:07:00.000Z",
    savedAt: "2026-07-12T00:07:00.000Z",
    publicRequestOutcomeAt: "2026-07-12T00:07:00.000Z",
  });

  await withCredentials(async () => {
    const unauthorized = await dispatchHttp(app, { method: "POST", url: "/api/admin/saved-search-alerts/run-due" });
    assert.equal(unauthorized.status, 401);

    const run = await dispatchHttp(app, {
      method: "POST",
      url: "/api/admin/saved-search-alerts/run-due",
      headers: { authorization: `Bearer ${TOKEN}` },
    });
    assert.equal(run.status, 201);
    assert.equal(run.body.kind, "saved_search_alert_run");
    assert.equal(run.body.delivered, 0);
    assert.equal(run.body.summary.delivery_mode, "manual_human_send");
    assert.equal(run.body.summary.queued, 1);
    assert.equal(run.body.queued[0].status, "queued");
    assert.equal(run.body.queued[0].human_approval_required, true);
    assert.equal(run.body.queue.summary.awaiting_human_send, 1);

    const audit = readAuditLog(paths.auditLogPath).filter((row) => row.action === "saved_search_alerts_queued");
    assert.equal(audit.length, 1);
    assert.equal(audit[0].status, "queued");
    assert.equal(audit[0].object_id, "saved-search-alert-fixture");
    assert.equal(audit[0].metadata.delivery_mode, "manual_human_send");

    // The broker sees the queued alert on the requests screen payload.
    const requests = await dispatchHttp(app, {
      url: "/api/admin/requests?locale=en",
      headers: { authorization: `Bearer ${TOKEN}` },
    });
    assert.equal(requests.status, 200);
    assert.equal(requests.body.savedSearchAlertQueue.summary.awaiting_human_send, 1);
    assert.equal(requests.body.savedSearchAlertQueue.rows[0].saved_search_id, "saved-search-alert-fixture");

    // Re-running is safe: the unsent alert is not duplicated.
    const again = await dispatchHttp(app, {
      method: "POST",
      url: "/api/admin/saved-search-alerts/run-due",
      headers: { authorization: `Bearer ${TOKEN}` },
    });
    assert.equal(again.body.summary.queued, 0);
    assert.equal(readSavedSearchAlertDeliveries(paths.savedSearchAlertDeliveryLedgerPath).length, 1);
  });
});

test("a paused or deleted saved search stops producing alerts", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ms-realty-saved-search-alert-stop-"));
  const paths = Object.fromEntries(
    [
      "leadLedgerPath",
      "publicContactVaultPath",
      "languageRequestPath",
      "savedSearchLedgerPath",
      "savedSearchManageEventLedgerPath",
      "savedSearchAlertDeliveryLedgerPath",
      "publicRequestOutcomeLedgerPath",
      "listingEditLedgerPath",
      "mediaReviewLedgerPath",
      "consentLedgerPath",
      "eventLedgerPath",
      "auditLogPath",
    ].map((name) => [name, emptyLedger(directory, name)]),
  );
  fs.writeFileSync(paths.savedSearchLedgerPath, `${JSON.stringify(savedSearchRow())}\n`);
  fs.writeFileSync(
    paths.savedSearchManageEventLedgerPath,
    `${JSON.stringify({
      id: "saved-search-manage-saved-search-alert-fixture-1",
      saved_search_id: "saved-search-alert-fixture",
      action: "pause",
      actor: "saved_search_link",
      frequency: null,
      channel: null,
      recorded_at: "2026-07-05T00:00:00.000Z",
    })}\n`,
  );

  const app = createHttpApp({
    ...paths,
    seed: loadCmsSeed(approvedPublicSeedFixturePath()),
    publicContactKey: VAULT_KEY,
    savedSearchManageSecret: "saved-search-alert-stop-secret-0000000001",
    savedSearchAlertQueuedAt: "2026-07-12T00:07:00.000Z",
    reviewedAt: "2026-07-12T00:07:00.000Z",
    receivedAt: "2026-07-12T00:07:00.000Z",
    publicRequestOutcomeAt: "2026-07-12T00:07:00.000Z",
  });

  await withCredentials(async () => {
    const paused = await dispatchHttp(app, {
      method: "POST",
      url: "/api/admin/saved-search-alerts/run-due",
      headers: { authorization: `Bearer ${TOKEN}` },
    });
    assert.equal(paused.body.summary.queued, 0);
    assert.equal(paused.body.skipped[0].reason, "paused");

    // A paused search also drops out of the broker follow-up queue counts.
    const requests = await dispatchHttp(app, {
      url: "/api/admin/requests?locale=en",
      headers: { authorization: `Bearer ${TOKEN}` },
    });
    assert.equal(requests.body.savedSearchAlertQueue.summary.awaiting_human_send, 0);

    fs.appendFileSync(
      paths.savedSearchManageEventLedgerPath,
      `${JSON.stringify({
        id: "saved-search-manage-saved-search-alert-fixture-2",
        saved_search_id: "saved-search-alert-fixture",
        action: "delete",
        actor: "saved_search_link",
        frequency: null,
        channel: null,
        recorded_at: "2026-07-06T00:00:00.000Z",
      })}\n`,
    );
    const deleted = await dispatchHttp(app, {
      method: "POST",
      url: "/api/admin/saved-search-alerts/run-due",
      headers: { authorization: `Bearer ${TOKEN}` },
    });
    assert.equal(deleted.body.summary.considered, 0);
    assert.equal(deleted.body.summary.queued, 0);

    const afterDelete = await dispatchHttp(app, {
      url: "/api/admin/requests?locale=en",
      headers: { authorization: `Bearer ${TOKEN}` },
    });
    // The deleted saved search is gone from the broker's public-request queue too.
    assert.equal(
      afterDelete.body.publicRequestQueue.rows.some((row) => row.request_id === "saved-search-alert-fixture"),
      false,
    );
    assert.equal(afterDelete.body.summary.savedSearches, 0);
  });
});
