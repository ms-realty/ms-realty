import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import { close, jsonFetch, listen } from "../lib/node-server.mjs";
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
