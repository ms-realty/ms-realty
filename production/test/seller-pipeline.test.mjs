import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import {
  appendSellerPipeline,
  assertSellerPipeline,
  createSellerPipelineItem,
  readSellerPipeline,
  resetSellerPipeline,
} from "../lib/seller-pipeline.mjs";

test("seller pipeline requires seller lead and creates callback task", () => {
  const file = `${fs.mkdtempSync(`${os.tmpdir()}/ms-realty-seller-pipeline-`)}/seller-pipeline.jsonl`;
  resetSellerPipeline(file);
  const sellerLead = {
    lead: {
      id: "seller-lead-test",
      source: "website_seller_valuation",
      leadType: "seller",
      contact: { name: "Nikos Papadopoulos" },
    },
    original_language: "el",
    admin_locale: "en",
  };

  assert.throws(() => createSellerPipelineItem({ lead: { leadType: "buyer" } }), /seller lead/);

  appendSellerPipeline(createSellerPipelineItem(sellerLead, { createdAt: "2026-07-04T00:08:00Z" }), { filePath: file });

  const rows = readSellerPipeline(file);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].stage, "valuation_requested");
  assert.equal(rows[0].owner, "unassigned");
  assert.equal(rows[0].next_task.owner, "unassigned");
  assert.equal(rows[0].next_task.status, "open");
  assert.equal(assertSellerPipeline(rows), true);

  const assigned = createSellerPipelineItem(sellerLead, { owner: "payload-admin-123" });
  assert.equal(assigned.owner, "payload-admin-123");
  assert.equal(assigned.next_task.owner, "payload-admin-123");
});
