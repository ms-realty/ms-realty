import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import { appAdminConfigFromEnv, renderAppAdminResponse } from "../lib/app-admin-adapter.mjs";
import { readAuditLog } from "../lib/audit-log.mjs";
import { createHttpApp, dispatchHttp } from "../lib/http.mjs";
import { loadCmsSeed } from "../lib/runtime.mjs";
import { readListingEdits } from "../lib/listing-edits.mjs";
import { buildListingPublicationScheduleQueue, readListingPublicationSchedules } from "../lib/listing-publication-schedules.mjs";
import { createPayloadDraftRuntime } from "./payload-draft-runtime.fixture.mjs";

function tempWorkspace(prefix) {
  const directory = fs.mkdtempSync(`${os.tmpdir()}/ms-realty-${prefix}-`);
  const paths = {
    listingEdits: `${directory}/listing-edits.jsonl`,
    translations: `${directory}/translation-tasks.jsonl`,
    audit: `${directory}/audit-log.jsonl`,
    publicationSchedules: `${directory}/listing-publication-schedules.jsonl`,
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
      { id: "listing_operations", token: "listing-operations-token-0123456789", roles: ["editor"] },
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
    const runtime = createPayloadDraftRuntime(loadCmsSeed());
    const config = {
      ...appAdminConfigFromEnv({
        MS_REALTY_LISTING_EDIT_LEDGER_PATH: paths.listingEdits,
        MS_REALTY_TRANSLATION_LEDGER_PATH: paths.translations,
        MS_REALTY_AUDIT_LOG_PATH: paths.audit,
        MS_REALTY_EDITED_AT: "2026-07-19T08:00:00.000Z",
      }),
      payloadListingRuntime: runtime.payload,
    };

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
    assert.equal(readListingEdits(paths.listingEdits).length, 0);
    assert.equal(runtime.currentRows().listings.find((row) => row.id === "MS-CRAWL-0001").facts.listing_status, "reserved");
    assert.equal(runtime.currentRows().listings.find((row) => row.id === "MS-CRAWL-0002").facts.listing_status, "reserved");
    assert.equal(readAuditLog(paths.audit).length, 2);
    assert.equal(readAuditLog(paths.audit).every((row) => row.actor === "listing_operations"), true);

    const retry = await request();
    const retryBody = await retry.json();
    assert.equal(retry.status, 200);
    assert.equal(retryBody.updated, 0);
    assert.equal(retryBody.idempotent, 2);
    assert.equal(readListingEdits(paths.listingEdits).length, 0);
    assert.equal(readAuditLog(paths.audit).length, 2);

    const json = await renderAppAdminResponse(
      new Request("https://example.test/api/admin/listings?q=MS-CRAWL-0001", { headers: auth }),
      { config },
    );
    assert.equal((await json.json()).listings[0].listing_status, "reserved");
  });
});

test("production listing edits keep a durable Payload receipt when supplemental audit logging is unavailable", async () => {
  await withNamedOperator(async (auth) => {
    const paths = tempWorkspace("next-listing-durable-audit");
    const runtime = createPayloadDraftRuntime(loadCmsSeed());
    const observed = [];
    const config = {
      ...appAdminConfigFromEnv({
        NODE_ENV: "production",
        MS_REALTY_LISTING_EDIT_LEDGER_PATH: paths.listingEdits,
        MS_REALTY_TRANSLATION_LEDGER_PATH: paths.translations,
        MS_REALTY_AUDIT_LOG_PATH: paths.audit,
        MS_REALTY_EDITED_AT: "2026-08-13T12:00:00.000Z",
      }),
      payloadListingRuntime: runtime.payload,
      durableListingAuditLogger: (line) => observed.push(JSON.parse(line)),
    };

    const edit = await renderAppAdminResponse(
      new Request("https://example.test/api/admin/listings/edit", {
        method: "POST",
        headers: { ...auth, "content-type": "application/json" },
        body: JSON.stringify({ listingId: "MS-CRAWL-0001", patch: { condition: "Production-reviewed condition" } }),
      }),
      { config },
    );
    assert.equal(edit.status, 201);
    assert.deepEqual(observed.map((entry) => [entry.kind, entry.authority, entry.receipt]), [
      ["durable_listing_mutation", "payload_postgres", "listing.workflow.last_edit_event"],
    ]);

    config.durableListingAuditLogger = () => {
      throw new Error("observability unavailable");
    };
    const status = await renderAppAdminResponse(
      new Request("https://example.test/api/admin/listings/status", {
        method: "POST",
        headers: { ...auth, "content-type": "application/json" },
        body: JSON.stringify({ listingIds: ["MS-CRAWL-0002"], targetStatus: "reserved" }),
      }),
      { config },
    );
    assert.equal(status.status, 201);
    assert.equal(readAuditLog(paths.audit).length, 0);

    const editReceipt = runtime.currentRows().listings.find((row) => row.id === "MS-CRAWL-0001").workflow.last_edit_event;
    assert.deepEqual(
      { actor: editReceipt.actor_id, source: editReceipt.auth_source, channel: editReceipt.channel, fields: editReceipt.changed_fields },
      { actor: "listing_operations", source: "credential_registry", channel: "admin", fields: ["condition"] },
    );
    const statusReceipt = runtime.currentRows().listings.find((row) => row.id === "MS-CRAWL-0002").workflow.last_edit_event;
    assert.deepEqual(
      { actor: statusReceipt.actor_id, source: statusReceipt.auth_source, channel: statusReceipt.channel, fields: statusReceipt.changed_fields },
      { actor: "listing_operations", source: "credential_registry", channel: "admin", fields: ["listing_status"] },
    );
  });
});

test("Next listing manager schedules and executes retained-archive publication changes", async () => {
  await withNamedOperator(async (auth) => {
    const paths = tempWorkspace("next-listing-publication");
    const configAt = (time) =>
      appAdminConfigFromEnv({
        MS_REALTY_LISTING_EDIT_LEDGER_PATH: paths.listingEdits,
        MS_REALTY_LISTING_PUBLICATION_SCHEDULE_PATH: paths.publicationSchedules,
        MS_REALTY_TRANSLATION_LEDGER_PATH: paths.translations,
        MS_REALTY_AUDIT_LOG_PATH: paths.audit,
        MS_REALTY_LISTING_PUBLICATION_AT: time,
      });

    const initialPage = await renderAppAdminResponse(
      new Request("https://example.test/admin/listings?q=MS-CRAWL-0001", { headers: auth }),
      { config: configAt("2026-07-19T08:00:00.000Z") },
    );
    assert.match(await initialPage.text(), /data-publication-schedule-panel="true"/);

    const scheduled = await renderAppAdminResponse(
      new Request("https://example.test/api/admin/listings/publication-schedules", {
        method: "POST",
        headers: { ...auth, "content-type": "application/json" },
        body: JSON.stringify({
          id: "next-publication-unpublish-1",
          listingId: "MS-CRAWL-0001",
          action: "unpublish",
          scheduledAt: "2026-07-19T09:00:00.000Z",
        }),
      }),
      { config: configAt("2026-07-19T08:00:00.000Z") },
    );
    assert.equal(scheduled.status, 201);
    assert.equal((await scheduled.json()).schedule.actor, "listing_operations");

    fs.writeFileSync(paths.audit, "");
    const scheduledRetry = await renderAppAdminResponse(
      new Request("https://example.test/api/admin/listings/publication-schedules", {
        method: "POST",
        headers: { ...auth, "content-type": "application/json" },
        body: JSON.stringify({
          id: "next-publication-unpublish-1",
          listingId: "MS-CRAWL-0001",
          action: "unpublish",
          scheduledAt: "2026-07-19T09:00:00.000Z",
        }),
      }),
      { config: configAt("2026-07-19T08:05:00.000Z") },
    );
    assert.equal(scheduledRetry.status, 200);
    assert.deepEqual(readAuditLog(paths.audit).map((row) => row.action), ["listing_publication_scheduled"]);

    const run = await renderAppAdminResponse(
      new Request("https://example.test/api/admin/listings/publication-schedules/run-due", {
        method: "POST",
        headers: { ...auth, "content-type": "application/json" },
        body: "{}",
      }),
      { config: configAt("2026-07-19T09:00:00.000Z") },
    );
    const runBody = await run.json();
    assert.equal(run.status, 200);
    assert.equal(runBody.executed, 1);
    assert.equal(readListingEdits(paths.listingEdits)[0].patch.listing_status, "archived");
    assert.equal(
      buildListingPublicationScheduleQueue(readListingPublicationSchedules(paths.publicationSchedules), {
        now: "2026-07-19T09:00:00.000Z",
      }).summary.executed,
      1,
    );
    assert.deepEqual(readAuditLog(paths.audit).map((row) => row.action), [
      "listing_publication_scheduled",
      "listing_publication_executed",
    ]);

    fs.writeFileSync(paths.audit, `${JSON.stringify(readAuditLog(paths.audit)[0])}\n`);
    const runRetry = await renderAppAdminResponse(
      new Request("https://example.test/api/admin/listings/publication-schedules/run-due", {
        method: "POST",
        headers: { ...auth, "content-type": "application/json" },
        body: "{}",
      }),
      { config: configAt("2026-07-19T09:05:00.000Z") },
    );
    assert.equal(runRetry.status, 200);
    assert.equal((await runRetry.json()).executed, 0);
    assert.deepEqual(readAuditLog(paths.audit).map((row) => row.action), [
      "listing_publication_scheduled",
      "listing_publication_executed",
    ]);
  });
});

test("HTTP listing publication schedule can be cancelled before it changes inventory", async () => {
  await withNamedOperator(async (auth) => {
    const paths = tempWorkspace("http-listing-publication");
    const app = createHttpApp({
      listingEditLedgerPath: paths.listingEdits,
      listingPublicationSchedulePath: paths.publicationSchedules,
      translationLedgerPath: paths.translations,
      auditLogPath: paths.audit,
      listingPublicationAt: "2026-07-19T08:00:00.000Z",
    });
    const scheduled = await dispatchHttp(app, {
      method: "POST",
      url: "/api/admin/listings/publication-schedules",
      headers: auth,
      body: {
        id: "http-publication-unpublish-1",
        listingId: "MS-CRAWL-0002",
        action: "unpublish",
        scheduledAt: "2026-07-20T09:00:00.000Z",
      },
    });
    assert.equal(scheduled.status, 201);
    const cancelled = await dispatchHttp(app, {
      method: "POST",
      url: "/api/admin/listings/publication-schedules/cancel",
      headers: auth,
      body: { scheduleId: "http-publication-unpublish-1", reason: "Owner requested a later date." },
    });
    assert.equal(cancelled.status, 201);
    assert.equal(readListingEdits(paths.listingEdits).length, 0);
    assert.equal(
      buildListingPublicationScheduleQueue(readListingPublicationSchedules(paths.publicationSchedules), {
        now: "2026-07-21T09:00:00.000Z",
      }).summary.cancelled,
      1,
    );
    assert.deepEqual(readAuditLog(paths.audit).map((row) => row.action), [
      "listing_publication_scheduled",
      "listing_publication_cancelled",
    ]);

    fs.writeFileSync(paths.audit, `${JSON.stringify(readAuditLog(paths.audit)[0])}\n`);
    const cancelledRetry = await dispatchHttp(app, {
      method: "POST",
      url: "/api/admin/listings/publication-schedules/cancel",
      headers: auth,
      body: { scheduleId: "http-publication-unpublish-1", reason: "Owner requested a later date." },
    });
    assert.equal(cancelledRetry.status, 200);
    assert.deepEqual(readAuditLog(paths.audit).map((row) => row.action), [
      "listing_publication_scheduled",
      "listing_publication_cancelled",
    ]);
  });
});

test("HTTP adapter preserves repeated form selections for bulk listing status changes", async () => {
  await withNamedOperator(async (auth) => {
    const paths = tempWorkspace("http-listing-bulk");
    const runtime = createPayloadDraftRuntime(loadCmsSeed());
    const app = createHttpApp({
      listingEditLedgerPath: paths.listingEdits,
      translationLedgerPath: paths.translations,
      auditLogPath: paths.audit,
      editedAt: "2026-07-19T08:00:00.000Z",
      payloadListingRuntime: runtime.payload,
    });
    const response = await dispatchHttp(app, {
      method: "POST",
      url: "/api/admin/listings/status",
      headers: { ...auth, "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams([
        ["listingIds", "MS-CRAWL-0001"],
        ["listingIds", "MS-CRAWL-0002"],
        ["targetStatus", "sold"],
      ]).toString(),
    });
    assert.equal(response.status, 201);
    assert.equal(response.body.requested, 2);
    assert.equal(response.body.updated, 2);
    assert.equal(readListingEdits(paths.listingEdits).length, 0);
    assert.equal(runtime.currentRows().listings.find((row) => row.id === "MS-CRAWL-0001").facts.listing_status, "sold");
    assert.equal(runtime.currentRows().listings.find((row) => row.id === "MS-CRAWL-0002").facts.listing_status, "sold");
    assert.equal(readAuditLog(paths.audit).length, 2);
  });
});
