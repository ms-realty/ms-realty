import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { readAuditLog } from "../lib/audit-log.mjs";
import { readDeals } from "../lib/deal-ledger.mjs";
import { createHttpApp, dispatchHttp } from "../lib/http.mjs";
import { createSellerPipelineItem } from "../lib/seller-pipeline.mjs";
import { readSellerPipelineOutcomes } from "../lib/seller-pipeline-outcomes.mjs";

function jsonl(directory, name, rows = []) {
  const filePath = path.join(directory, `${name}.jsonl`);
  fs.writeFileSync(filePath, rows.map((row) => JSON.stringify(row)).join("\n") + (rows.length ? "\n" : ""));
  return filePath;
}

function fixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ms-realty-seller-pipeline-routes-"));
  const lead = {
    lead_id: "seller-route-1",
    received_at: "2026-07-10T08:00:00.000Z",
    source: "website_seller_valuation",
    lead_type: "seller",
    listing_reference: null,
    original_language: "bg",
    admin_locale: "bg",
    contact_preference: "phone",
    assigned_broker: "broker_bg",
    broker_assignment: { broker_id: "broker_bg" },
    sla_due_at: "2026-07-10T08:15:00.000Z",
  };
  const sellerPipeline = createSellerPipelineItem(
    {
      lead: {
        id: lead.lead_id,
        source: lead.source,
        leadType: "seller",
        contact: { name: "Seller" },
        property: { location: "Sandanski", type: "house" },
      },
      original_language: lead.original_language,
      admin_locale: lead.admin_locale,
    },
    { createdAt: lead.received_at, owner: "broker_bg" },
  );
  return {
    sellerPipeline,
    paths: {
      leadLedgerPath: jsonl(directory, "leads", [lead]),
      sellerPipelinePath: jsonl(directory, "seller-pipeline", [sellerPipeline]),
      sellerPipelineOutcomeLedgerPath: jsonl(directory, "seller-pipeline-outcomes"),
      dealLedgerPath: jsonl(directory, "deals"),
      auditLogPath: jsonl(directory, "audit"),
    },
  };
}

async function withBroker(fn) {
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
      { id: "broker_bg", token: "seller-route-token-0123456789abcdef", roles: ["admin"] },
    ]);
    return await fn({ authorization: "Bearer seller-route-token-0123456789abcdef" });
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test("seller admin route remains actionable from valuation through publication, offer, sale, and aftercare", async () => {
  const { paths, sellerPipeline } = fixture();
  const appAt = (sellerPipelineOutcomeAt, extra = {}) =>
    createHttpApp({ ...paths, sellerPipelineOutcomeAt, ...extra });

  await withBroker(async (headers) => {
    const steps = [
      ["2026-07-10T09:00:00.000Z", { action: "callback_completed" }, "callback_completed"],
      [
        "2026-07-10T10:00:00.000Z",
        { action: "appraisal_scheduled", appraisalAt: "2026-07-11T10:00:00.000Z" },
        "appraisal_scheduled",
      ],
      ["2026-07-11T11:00:00.000Z", { action: "appraisal_completed" }, "appraisal_completed"],
      ["2026-07-12T09:00:00.000Z", { action: "mandate_signed" }, "mandate_signed"],
      [
        "2026-07-12T10:00:00.000Z",
        { action: "listing_draft_started", listingReference: "MS-SELLER-ROUTE-1" },
        "listing_draft_started",
      ],
      [
        "2026-07-13T09:00:00.000Z",
        {
          action: "listing_published",
          listingReference: "MS-SELLER-ROUTE-1",
          publicPath: "/bg/properties/MS-SELLER-ROUTE-1",
        },
        "published",
      ],
    ];

    for (const [recordedAt, input, expectedStage] of steps) {
      const response = await dispatchHttp(appAt(recordedAt), {
        method: "POST",
        url: "/api/admin/seller-pipeline/outcome",
        headers,
        body: { sellerPipelineId: sellerPipeline.id, ...input },
      });
      assert.equal(response.status, 201);
      assert.equal(response.body.outcome.actor, "broker_bg");
      assert.equal(response.body.seller_pipeline.stage, expectedStage);
    }

    const publishedQueue = await dispatchHttp(appAt("2026-07-13T09:05:00.000Z"), {
      url: "/api/admin/leads?locale=bg",
      headers,
    });
    assert.equal(publishedQueue.body.sellerPipelineQueue.rows[0].task, "listing_offer");
    const publishedPage = await dispatchHttp(appAt("2026-07-13T09:05:00.000Z"), {
      url: "/admin/leads?locale=bg",
      headers,
    });
    assert.match(publishedPage.body, /name="offerAmountEur"/);

    const prematureSale = await dispatchHttp(appAt("2026-07-13T09:10:00.000Z"), {
      method: "POST",
      url: "/api/admin/seller-pipeline/outcome",
      headers,
      body: { sellerPipelineId: sellerPipeline.id, action: "sale_completed", salePriceEur: 205000 },
    });
    assert.equal(prematureSale.status, 400);
    assert.match(prematureSale.body.message, /only after an offer/);

    const offer = await dispatchHttp(appAt("2026-07-14T09:00:00.000Z"), {
      method: "POST",
      url: "/api/admin/seller-pipeline/outcome",
      headers,
      body: { sellerPipelineId: sellerPipeline.id, action: "offer_received", offerAmountEur: 210000 },
    });
    assert.equal(offer.status, 201);
    assert.equal(offer.body.seller_pipeline.next_task.kind, "seller_close");

    const sale = await dispatchHttp(appAt("2026-07-20T12:00:00.000Z"), {
      method: "POST",
      url: "/api/admin/seller-pipeline/outcome",
      headers,
      body: {
        sellerPipelineId: sellerPipeline.id,
        action: "sale_completed",
        salePriceEur: 205000,
        commissionEur: 6150,
        note: "Notarial transfer completed.",
      },
    });
    assert.equal(sale.status, 201);
    assert.equal(sale.body.seller_pipeline.status, "completed");

    const deal = await dispatchHttp(appAt("2026-07-20T12:05:00.000Z", { dealClosedAt: "2026-07-21T12:00:00.000Z" }), {
      method: "POST",
      url: "/api/admin/deals/close",
      headers,
      body: { leadId: sellerPipeline.lead_id, listingReference: "MS-SELLER-ROUTE-1" },
    });
    assert.equal(deal.status, 201);
    assert.equal(readDeals(paths.dealLedgerPath).length, 1);
    assert.equal(readSellerPipelineOutcomes(paths.sellerPipelineOutcomeLedgerPath).length, 8);
    const auditActions = readAuditLog(paths.auditLogPath).map((row) => row.action);
    assert.equal(auditActions.filter((action) => action === "seller_pipeline_outcome_recorded").length, 8);
    assert.equal(auditActions.filter((action) => action === "deal_closed").length, 1);
  });
});
