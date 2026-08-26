import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { appApiConfigFromEnv, renderAppApiResponse } from "../lib/app-api-adapter.mjs";
import { DEFAULT_EVENT_LEDGER_PATH, readEventLedger } from "../lib/events.mjs";
import { createHttpApp, dispatchHttp } from "../lib/http.mjs";
import { fromRoot } from "../lib/paths.mjs";

function eventWorkspace(name) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), `ms-realty-${name}-`));
  const eventLedgerPath = path.join(directory, "events.jsonl");
  return {
    eventLedgerPath,
    config: appApiConfigFromEnv({
      ...process.env,
      NODE_ENV: "test",
      MS_REALTY_EVENT_LEDGER_PATH: eventLedgerPath,
      MS_REALTY_RATE_LIMIT_MAX: "30",
      MS_REALTY_RATE_LIMIT_WINDOW_MS: "60000",
    }),
  };
}

async function send(config, eventPath) {
  return renderAppApiResponse(
    new Request("https://ms-realty.test/api/events", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://ms-realty.test", "sec-fetch-site": "same-origin" },
      body: JSON.stringify({ type: "page_view", path: eventPath, locale: "bg" }),
    }),
    { config },
  );
}

test("ordinary browsing fits the shared budget while randomized abuse remains capped", async () => {
  const { config, eventLedgerPath } = eventWorkspace("analytics-ordinary");
  const crawlResponses = [];
  for (let index = 0; index < 25; index += 1) crawlResponses.push(await send(config, `/qa/page-${index}`));
  assert.equal(crawlResponses.filter((response) => response.status === 201).length, 25);
  assert.equal(crawlResponses.filter((response) => response.status === 429).length, 0);

  const abuseWorkspace = eventWorkspace("analytics-abuse");
  const abuseResponses = [];
  for (let index = 0; index < 500; index += 1) abuseResponses.push(await send(abuseWorkspace.config, `/qa/randomized-abuse-${index}`));
  assert.equal(abuseResponses.filter((response) => response.status === 201).length, 5);
  assert.equal(abuseResponses.filter((response) => response.status === 429).length, 495);
  assert.equal(readEventLedger(eventLedgerPath).length, 25);
  assert.equal(readEventLedger(abuseWorkspace.eventLedgerPath).length, 5);
});

test("the default analytics ledger is runtime-only and explicit fixture paths remain readable", () => {
  assert.equal(DEFAULT_EVENT_LEDGER_PATH, fromRoot("production", ".runtime", "events.jsonl"));
  assert.notEqual(DEFAULT_EVENT_LEDGER_PATH, fromRoot("production", "data", "events.jsonl"));
  assert.equal(readEventLedger(fromRoot("production", "data", "events.jsonl")).length > 0, true);
});

test("standalone HTTP analytics keeps randomized abuse on the shared limiter", async () => {
  const { eventLedgerPath } = eventWorkspace("standalone-analytics");
  const app = createHttpApp({ eventLedgerPath, rateLimit: { windowMs: 60_000, max: 30 } });
  const headers = { host: "ms-realty.test", origin: "https://ms-realty.test", "sec-fetch-site": "same-origin" };
  const crawl = [];
  for (let index = 0; index < 25; index += 1) {
    crawl.push(
      await dispatchHttp(app, {
        method: "POST",
        url: "https://ms-realty.test/api/events",
        headers,
        body: { type: "page_view", path: `/qa/standalone-${index}`, locale: "bg" },
      }),
    );
  }
  assert.equal(crawl.filter((response) => response.status === 201).length, 25);

  const abuseWorkspace = eventWorkspace("standalone-analytics-abuse");
  const abuseApp = createHttpApp({ eventLedgerPath: abuseWorkspace.eventLedgerPath, rateLimit: { windowMs: 60_000, max: 30 } });
  const abuse = [];
  for (let index = 0; index < 500; index += 1) {
    abuse.push(
      await dispatchHttp(abuseApp, {
        method: "POST",
        url: "https://ms-realty.test/api/events",
        headers,
        body: { type: "page_view", path: `/qa/standalone-randomized-abuse-${index}`, locale: "bg" },
      }),
    );
  }
  assert.equal(abuse.filter((response) => response.status === 201).length, 30);
  assert.equal(abuse.filter((response) => response.status === 429).length, 470);
});
