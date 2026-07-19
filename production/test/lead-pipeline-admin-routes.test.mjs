import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHttpApp, dispatchHttp } from "../lib/http.mjs";
import { readAuditLog } from "../lib/audit-log.mjs";
import { readDeals } from "../lib/deal-ledger.mjs";
import { readLeadPipelineOutcomes } from "../lib/lead-pipeline-outcomes.mjs";
import { readViewings } from "../lib/viewing-ledger.mjs";

function fixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ms-realty-lead-pipeline-routes-"));
  const jsonl = (name, rows = []) => {
    const filePath = path.join(directory, `${name}.jsonl`);
    fs.writeFileSync(filePath, rows.map((row) => JSON.stringify(row)).join("\n") + (rows.length ? "\n" : ""));
    return filePath;
  };
  const lead = {
    lead_id: "pipeline-buyer-1",
    received_at: "2026-07-18T10:00:00.000Z",
    source: "website_listing_detail",
    lead_type: "buyer",
    listing_reference: "MS-CRAWL-0114",
    original_language: "en",
    admin_locale: "en",
    contact_preference: "email",
    assigned_broker: "broker_en",
    broker_assignment: { broker_id: "broker_en" },
    sla_due_at: "2026-07-18T10:15:00.000Z",
  };
  return {
    paths: {
      leadLedgerPath: jsonl("leads", [lead]),
      leadPipelineOutcomeLedgerPath: jsonl("lead-pipeline-outcomes"),
      viewingLedgerPath: jsonl("viewings"),
      viewingFollowUpLedgerPath: jsonl("viewing-follow-ups"),
      dealLedgerPath: jsonl("deals"),
      auditLogPath: jsonl("audit"),
      replyOutboxPath: jsonl("replies"),
      replyDeliveryOutcomeLedgerPath: jsonl("reply-delivery"),
      sellerPipelinePath: jsonl("seller-pipeline"),
      sellerPipelineOutcomeLedgerPath: jsonl("seller-pipeline-outcomes"),
      publicRequestOutcomeLedgerPath: jsonl("public-request-outcomes"),
    },
  };
}

async function withNamedAdmin(fn) {
  const previous = {
    NODE_ENV: process.env.NODE_ENV,
    MS_REALTY_ADMIN_CREDENTIALS_JSON: process.env.MS_REALTY_ADMIN_CREDENTIALS_JSON,
  };
  const token = "pipeline-admin-token-with-24-characters";
  process.env.NODE_ENV = "production";
  process.env.MS_REALTY_ADMIN_CREDENTIALS_JSON = JSON.stringify([{ id: "broker_en", token }]);
  try {
    return await fn({ authorization: `Bearer ${token}` });
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test("buyer pipeline route binds the operator, renders its workbench, and keeps retries idempotent", async () => {
  const { paths } = fixture();
  const app = createHttpApp({
    ...paths,
    leadPipelineOutcomeAt: "2026-07-18T10:05:00.000Z",
    bookedAt: "2026-07-18T10:10:00.000Z",
    dealClosedAt: "2026-07-22T10:00:00.000Z",
  });

  await withNamedAdmin(async (auth) => {
    assert.equal((await dispatchHttp(app, { url: "/api/admin/pipeline" })).status, 401);
    const page = await dispatchHttp(app, { url: "/admin/pipeline", headers: auth });
    assert.equal(page.status, 200);
    assert.match(page.body, /data-react-admin-ui="lead-pipeline"/);
    assert.match(page.body, /data-admin-mutation-form="lead-pipeline"/);
    assert.match(page.body, /pipeline-buyer-1/);

    const spoofed = await dispatchHttp(app, {
      method: "POST",
      url: "/api/admin/lead-pipeline/outcome",
      headers: auth,
      body: {
        leadId: "pipeline-buyer-1",
        actor: "manager",
        action: "qualify",
        budgetMaxEur: 150000,
        locations: "Sandanski",
        timeline: "This quarter",
      },
    });
    assert.equal(spoofed.status, 400);
    assert.match(spoofed.body.message, /authenticated operator/);

    const qualification = {
      leadId: "pipeline-buyer-1",
      action: "qualify",
      budgetMinEur: 100000,
      budgetMaxEur: 150000,
      locations: "Sandanski",
      propertyTypes: "apartment",
      bedroomsMin: 2,
      timeline: "This quarter",
      financeStatus: "preapproved",
      nextFollowUpAt: "2026-07-19T10:00:00.000Z",
    };
    const qualified = await dispatchHttp(app, {
      method: "POST",
      url: "/api/admin/lead-pipeline/outcome",
      headers: auth,
      body: qualification,
    });
    assert.equal(qualified.status, 201);
    assert.equal(qualified.body.outcome.actor, "broker_en");
    assert.equal(qualified.body.lead_pipeline.stage, "qualified");

    const retry = await dispatchHttp(app, {
      method: "POST",
      url: "/api/admin/lead-pipeline/outcome",
      headers: auth,
      body: qualification,
    });
    assert.equal(retry.status, 200);
    assert.equal(retry.body.idempotent, true);
    assert.equal(readLeadPipelineOutcomes(paths.leadPipelineOutcomeLedgerPath).length, 1);

    const viewingInput = {
      leadId: "pipeline-buyer-1",
      listingReference: "MS-CRAWL-0114",
      startsAt: "2026-07-20T10:00:00.000Z",
    };
    const viewing = await dispatchHttp(app, { method: "POST", url: "/api/admin/viewings", headers: auth, body: viewingInput });
    assert.equal(viewing.status, 201);
    assert.equal(viewing.body.broker, "broker_en");
    const viewingRetry = await dispatchHttp(app, { method: "POST", url: "/api/admin/viewings", headers: auth, body: viewingInput });
    assert.equal(viewingRetry.status, 200);
    assert.equal(viewingRetry.body.idempotent, true);
    assert.equal(readViewings(paths.viewingLedgerPath).length, 1);

    const dealInput = { leadId: "pipeline-buyer-1", listingReference: "MS-CRAWL-0114" };
    const deal = await dispatchHttp(app, { method: "POST", url: "/api/admin/deals/close", headers: auth, body: dealInput });
    assert.equal(deal.status, 201);
    assert.equal(deal.body.broker, "broker_en");
    const dealRetry = await dispatchHttp(app, { method: "POST", url: "/api/admin/deals/close", headers: auth, body: dealInput });
    assert.equal(dealRetry.status, 200);
    assert.equal(dealRetry.body.idempotent, true);
    assert.equal(readDeals(paths.dealLedgerPath).length, 1);

    const auditActions = readAuditLog(paths.auditLogPath).map((row) => row.action);
    assert.equal(auditActions.filter((action) => action === "lead_pipeline_outcome_recorded").length, 1);
    assert.equal(auditActions.filter((action) => action === "viewing_booked").length, 1);
    assert.equal(auditActions.filter((action) => action === "deal_closed").length, 1);
  });
});
