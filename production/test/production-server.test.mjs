import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import { close, jsonFetch, listen } from "../lib/node-server.mjs";
import { readLeadLedger, resetLeadLedger } from "../lib/lead-ledger.mjs";
import { readReplyOutbox, resetReplyOutbox } from "../lib/lead-replies.mjs";
import { createProductionServer, productionServerConfig } from "../server.mjs";

test("production server entrypoint serves runtime routes with env config", async () => {
  const eventLedgerPath = `${fs.mkdtempSync(`${os.tmpdir()}/ms-realty-prod-events-`)}/events.jsonl`;
  const config = productionServerConfig({
    PORT: "0",
    HOST: "127.0.0.1",
    MS_REALTY_MAX_BODY_BYTES: "64",
    MS_REALTY_EVENT_LEDGER_PATH: eventLedgerPath,
  });
  assert.equal(config.port, 0);
  assert.equal(config.host, "127.0.0.1");
  assert.equal(config.maxBodyBytes, 64);

  const server = createProductionServer(config);
  const address = await listen(server, 0, "127.0.0.1");
  try {
    const response = await jsonFetch(`http://${address.address}:${address.port}`, "/he/properties/MS-CRAWL-0001");
    assert.equal(response.status, 200);
    assert.equal(response.body.kind, "listing");
    assert.equal(response.body.lang, "he");
  } finally {
    await close(server);
  }
});

test("production server config prefers explicit MS Realty env and rejects ambiguous numbers", () => {
  const config = productionServerConfig({
    PORT: "3000",
    HOST: "0.0.0.0",
    MS_REALTY_HOST: "127.0.0.1",
    MS_REALTY_PORT: "8080",
    MS_REALTY_MAX_BODY_BYTES: "1024",
  });

  assert.equal(config.port, 8080);
  assert.equal(config.host, "127.0.0.1");
  assert.equal(config.maxBodyBytes, 1024);
  assert.equal(productionServerConfig({ HOST: "" }).host, "0.0.0.0");
  assert.throws(() => productionServerConfig({ HOST: " 127.0.0.1" }), /HOST must be a non-empty/);
  assert.throws(() => productionServerConfig({ MS_REALTY_HOST: "127.0.0.1 " }), /HOST must be a non-empty/);
  assert.throws(() => productionServerConfig({ PORT: " 0" }), /PORT must be an integer/);
  assert.throws(() => productionServerConfig({ MS_REALTY_PORT: "3000.5" }), /PORT must be an integer/);
  assert.throws(() => productionServerConfig({ MS_REALTY_MAX_BODY_BYTES: "0" }), /positive integer/);
  assert.throws(() => productionServerConfig({ MS_REALTY_MAX_BODY_BYTES: "64kb" }), /positive integer/);
});

test("production server persists public leads and reviewed admin replies", async () => {
  const dir = fs.mkdtempSync(`${os.tmpdir()}/ms-realty-prod-ledgers-`);
  const eventLedgerPath = `${dir}/events.jsonl`;
  const leadLedgerPath = `${dir}/leads.jsonl`;
  const replyOutboxPath = `${dir}/replies.jsonl`;
  fs.writeFileSync(eventLedgerPath, "");
  resetLeadLedger(leadLedgerPath);
  resetReplyOutbox(replyOutboxPath);

  const config = productionServerConfig({
    PORT: "0",
    HOST: "127.0.0.1",
    MS_REALTY_EVENT_LEDGER_PATH: eventLedgerPath,
    MS_REALTY_LEAD_LEDGER_PATH: leadLedgerPath,
    MS_REALTY_REPLY_OUTBOX_PATH: replyOutboxPath,
  });
  const server = createProductionServer(config);
  const address = await listen(server, 0, "127.0.0.1");
  const baseUrl = `http://${address.address}:${address.port}`;
  try {
    const lead = await jsonFetch(baseUrl, "/api/leads", {
      method: "POST",
      body: JSON.stringify({
        id: "prod-lead-he-0001",
        leadType: "buyer",
        language: "he",
        listingReference: "MS-CRAWL-0001",
        contact: { name: "Noa Levi" },
        contact_preference: "whatsapp",
        message: "Interested in this property.",
      }),
    });
    assert.equal(lead.status, 201);
    assert.equal(readLeadLedger(leadLedgerPath).length, 1);

    const reply = await jsonFetch(baseUrl, "/api/admin/replies", {
      method: "POST",
      headers: { authorization: "Bearer local-admin-smoke" },
      body: JSON.stringify({
        leadId: "prod-lead-he-0001",
        language: "he",
        reviewedReply: "Reviewed reply approved by broker.",
        reviewer: "broker_en",
        approved: true,
      }),
    });
    assert.equal(reply.status, 201);
    assert.equal(readReplyOutbox(replyOutboxPath).length, 1);
  } finally {
    await close(server);
  }
});
