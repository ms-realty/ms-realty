import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { appAdminConfigFromEnv, renderAppAdminResponse } from "../lib/app-admin-adapter.mjs";
import { createHttpApp, dispatchHttp } from "../lib/http.mjs";

const SESSION_TOKEN = "payload.broker-roster.session";
const BROKER_PROFILES = Object.freeze([
  { id: "broker_bg", languages: ["bg"] },
  { id: "broker_ru", languages: ["ru"] },
  { id: "broker_international", languages: ["en"] },
]);

function payloadSession() {
  return {
    principal: {
      id: "payload-roster-admin",
      source: "payload_session",
      can_mutate: true,
      roles: ["admin"],
      workspace_ids: ["sandanski"],
    },
    user: { id: 1 },
  };
}

function payloadAdminAuth(listOperators) {
  const service = {
    async resolve(token) {
      return token === SESSION_TOKEN ? payloadSession() : null;
    },
  };
  if (listOperators) service.listOperators = listOperators;
  return service;
}

function sessionHeaders() {
  return {
    cookie: `ms_admin=${SESSION_TOKEN}`,
    host: "ms-realty.example",
    origin: "https://ms-realty.example",
    "sec-fetch-site": "same-origin",
  };
}

function files(t, prefix) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), `ms-realty-${prefix}-`));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const at = (name) => path.join(directory, name);
  for (const name of ["sessions", "availability", "viewings", "follow-ups"]) fs.writeFileSync(at(`${name}.jsonl`), "");
  return { directory, at };
}

function configuredHttpApp(t, listOperators) {
  const fixture = files(t, "broker-roster-http");
  return createHttpApp({
    adminSessionLedgerPath: fixture.at("sessions.jsonl"),
    brokerAvailabilityLedgerPath: fixture.at("availability.jsonl"),
    brokerAvailabilityAt: "2026-08-23T09:00:00.000Z",
    viewingLedgerPath: fixture.at("viewings.jsonl"),
    viewingFollowUpLedgerPath: fixture.at("follow-ups.jsonl"),
    payloadAdminAuth: payloadAdminAuth(listOperators),
    brokerProfiles: BROKER_PROFILES,
  });
}

function configuredAppRouter(t, listOperators) {
  const fixture = files(t, "broker-roster-app");
  return {
    ...appAdminConfigFromEnv({
      NODE_ENV: "test",
      MS_REALTY_ADMIN_SESSION_LEDGER_PATH: fixture.at("sessions.jsonl"),
      MS_REALTY_BROKER_AVAILABILITY_LEDGER_PATH: fixture.at("availability.jsonl"),
      MS_REALTY_BROKER_AVAILABILITY_AT: "2026-08-23T09:00:00.000Z",
      MS_REALTY_VIEWING_LEDGER_PATH: fixture.at("viewings.jsonl"),
      MS_REALTY_VIEWING_FOLLOW_UP_LEDGER_PATH: fixture.at("follow-ups.jsonl"),
    }),
    payloadAdminAuth: payloadAdminAuth(listOperators),
    brokerProfiles: BROKER_PROFILES,
  };
}

function assertHttpBrokerRoster(body) {
  assert.deepEqual(
    body.brokers.map((broker) => broker.broker_id).sort(),
    BROKER_PROFILES.map((profile) => profile.id).sort(),
  );
}

function assertAppBrokerRoster(body) {
  assert.deepEqual(
    body.brokers.map((broker) => broker.broker_id).sort(),
    BROKER_PROFILES.map((profile) => profile.id).sort(),
  );
}

const LIST_OPERATOR_CASES = [
  ["absent", undefined],
  ["empty", async () => []],
  ["non-assignable", async () => [{ id: "editor-1", role: "editor" }]],
  ["failure", async () => {
    throw new Error("Payload operator directory unavailable");
  }],
];

test("standalone admin availability and week keep configured brokers when Payload roster is unavailable", async (t) => {
  for (const [label, listOperators] of LIST_OPERATOR_CASES) {
    await t.test(label, async (subtest) => {
      const app = configuredHttpApp(subtest, listOperators);
      const availability = await dispatchHttp(app, {
        url: "/api/admin/availability",
        headers: sessionHeaders(),
      });
      assert.equal(availability.status, 200);
      assertHttpBrokerRoster(availability.body);

      const week = await dispatchHttp(app, {
        url: "/api/admin/viewings/week?week=2026-08-24",
        headers: sessionHeaders(),
      });
      assert.equal(week.status, 200);
      assert.deepEqual(
        week.body.week.brokers.map((broker) => broker.broker_id).sort(),
        BROKER_PROFILES.map((profile) => profile.id).sort(),
      );
    });
  }
});

test("App Router admin availability and week keep configured brokers when Payload roster is unavailable", async (t) => {
  for (const [label, listOperators] of LIST_OPERATOR_CASES) {
    await t.test(label, async (subtest) => {
      const config = configuredAppRouter(subtest, listOperators);
      const availability = await renderAppAdminResponse(
        new Request("https://ms-realty.example/api/admin/availability", { headers: sessionHeaders() }),
        { config },
      );
      assert.equal(availability.status, 200);
      assertAppBrokerRoster(await availability.json());

      const week = await renderAppAdminResponse(
        new Request("https://ms-realty.example/api/admin/viewings/week?week=2026-08-24", { headers: sessionHeaders() }),
        { config },
      );
      assert.equal(week.status, 200);
      const weekBody = await week.json();
      assert.deepEqual(
        weekBody.week.brokers.map((broker) => broker.broker_id).sort(),
        BROKER_PROFILES.map((profile) => profile.id).sort(),
      );
    });
  }
});
