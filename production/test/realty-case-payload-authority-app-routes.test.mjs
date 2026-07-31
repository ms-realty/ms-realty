import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { appAdminConfigFromEnv, renderAppAdminResponse } from "../lib/app-admin-adapter.mjs";
import { readAuditLog } from "../lib/audit-log.mjs";

function tempLedger(name) {
  const filePath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), `ms-realty-${name}-`)), `${name}.jsonl`);
  fs.writeFileSync(filePath, "");
  return filePath;
}

async function withCredentials(fn) {
  const previous = {
    NODE_ENV: process.env.NODE_ENV,
    MS_REALTY_ADMIN_CREDENTIALS_JSON: process.env.MS_REALTY_ADMIN_CREDENTIALS_JSON,
    MS_REALTY_ADMIN_TOKEN: process.env.MS_REALTY_ADMIN_TOKEN,
  };
  process.env.NODE_ENV = "production";
  delete process.env.MS_REALTY_ADMIN_TOKEN;
  process.env.MS_REALTY_ADMIN_CREDENTIALS_JSON = JSON.stringify([
    { id: "broker_bg", token: "broker-authority-token-0123456789", roles: ["broker"] },
  ]);
  try {
    await fn("Bearer broker-authority-token-0123456789");
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function fakePayload() {
  const rows = Object.fromEntries(
    [
      "realty_cases",
      "realty_case_events",
      "realty_case_mandate_versions",
      "realty_case_conditions",
      "realty_case_condition_events",
      "realty_case_outbox",
    ].map((collection) => [collection, []]),
  );
  let nextId = 1;
  let snapshot = null;
  const matches = (document, where) => Object.entries(where || {}).every(([key, rule]) => document[key] === rule.equals);
  return {
    rows,
    payload: {
      db: {
        async beginTransaction() {
          snapshot = clone(rows);
          return "authority-transaction";
        },
        async commitTransaction() {
          snapshot = null;
        },
        async rollbackTransaction() {
          for (const collection of Object.keys(rows)) rows[collection] = clone(snapshot[collection]);
          snapshot = null;
        },
      },
      async find({ collection, where }) {
        return { docs: rows[collection].filter((document) => matches(document, where)).map(clone) };
      },
      async create({ collection, data, req }) {
        assert.equal(req.transactionID, "authority-transaction");
        const document = { id: nextId++, ...clone(data) };
        rows[collection].push(document);
        return clone(document);
      },
      async update({ collection, data, id, req }) {
        assert.equal(req.transactionID, "authority-transaction");
        const document = rows[collection].find((row) => row.id === id);
        if (!document) throw new Error("missing document");
        Object.assign(document, clone(data));
        return clone(document);
      },
    },
  };
}

function caseInput(id) {
  return {
    id,
    jurisdiction: "BG",
    caseType: "buyer_purchase",
    assetKind: "residential",
    clientRef: `contact-${id}`,
    propertyRef: `property-${id}`,
    executionMode: "manual",
    mandate: {
      ref: `mandate-${id}`,
      grantedByRef: `contact-${id}`,
      signedAt: "2026-07-30T08:00:00.000Z",
      signedEvidenceRef: `evidence://mandate/${id}`,
      capabilities: ["case:*"],
    },
  };
}

function request(pathname, { method = "GET", authorization, body, config }) {
  return renderAppAdminResponse(
    new Request(`https://example.test${pathname}`, {
      method,
      headers: { authorization, ...(body ? { "content-type": "application/json" } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    }),
    { config },
  );
}

test("app admin case routes use Payload authority without local case ledgers or projection", async () => {
  await withCredentials(async (authorization) => {
    const target = fakePayload();
    const realtyCaseLedgerPath = tempLedger("app-authority-cases");
    const realtyCaseConditionLedgerPath = tempLedger("app-authority-conditions");
    const auditLogPath = tempLedger("app-authority-audit");
    let projectorCalled = false;
    const config = {
      ...appAdminConfigFromEnv({
        MS_REALTY_CASE_PAYLOAD_AUTHORITY_ENABLED: "true",
        MS_REALTY_WORKSPACE_ID: "workspace-sandanski",
        MS_REALTY_CASE_LEDGER_PATH: realtyCaseLedgerPath,
        MS_REALTY_CASE_CONDITION_LEDGER_PATH: realtyCaseConditionLedgerPath,
        MS_REALTY_AUDIT_LOG_PATH: auditLogPath,
        MS_REALTY_CASE_RECORDED_AT: "2026-07-30T09:00:00.000Z",
      }),
      realtyCasePayload: target.payload,
      realtyCasePayloadProjector: async () => {
        projectorCalled = true;
        throw new Error("authority must not project local ledgers");
      },
    };
    assert.equal(config.realtyCasePayloadAuthorityEnabled, true);

    const opened = await request("/api/admin/cases", {
      method: "POST",
      authorization,
      body: caseInput("app-authority-case"),
      config,
    });
    assert.equal(opened.status, 201);
    assert.equal((await opened.json()).event.actor, "broker_bg");

    const advanced = await request("/api/admin/cases/actions", {
      method: "POST",
      authorization,
      body: {
        id: "app-authority-case-lead-intake",
        caseId: "app-authority-case",
        action: "step_completed",
        stepKey: "lead_intake",
        evidenceRefs: [{ ref: "lead://app-authority-case", type: "lead_record", producerKind: "agency" }],
      },
      config,
    });
    assert.equal(advanced.status, 201);

    const openedCondition = await request("/api/admin/cases/conditions", {
      method: "POST",
      authorization,
      body: {
        eventId: "app-authority-condition-open",
        caseId: "app-authority-case",
        conditionId: "title-clearance",
        type: "title_clearance",
        dueAt: "2026-07-31T09:00:00.000Z",
        requiredEvidenceProducerRefs: ["registry://property-register"],
      },
      config,
    });
    assert.equal(openedCondition.status, 201);

    const blocked = await request("/api/admin/cases/conditions/actions", {
      method: "POST",
      authorization,
      body: {
        eventId: "app-authority-condition-blocked",
        caseId: "app-authority-case",
        conditionId: "title-clearance",
        action: "condition_blocked",
        reasonCode: "awaiting_registry_reply",
      },
      config,
    });
    assert.equal(blocked.status, 201);

    assert.equal(fs.readFileSync(realtyCaseLedgerPath, "utf8"), "");
    assert.equal(fs.readFileSync(realtyCaseConditionLedgerPath, "utf8"), "");
    assert.equal(projectorCalled, false);
    assert.equal(target.rows.realty_case_events.length, 2);
    assert.equal(target.rows.realty_case_condition_events.length, 2);

    const cases = await request("/api/admin/cases", { authorization, config });
    assert.equal(cases.status, 200);
    assert.equal((await cases.json()).realtyCaseQueue.summary.manual, 1);

    const intents = await request("/api/admin/cases/intents", { authorization, config });
    assert.equal(intents.status, 200);
    assert.equal((await intents.json()).summary.total_cases, 1);

    const conditions = await request("/api/admin/cases/conditions", { authorization, config });
    assert.equal(conditions.status, 200);
    assert.equal((await conditions.json()).summary.blocked, 1);

    const page = await request("/admin/cases?locale=en", { authorization, config });
    assert.equal(page.status, 200);
    assert.match(await page.text(), /data-realty-case="app-authority-case"/);

    const audit = readAuditLog(auditLogPath);
    assert.equal(audit.filter((row) => row.action === "realty_case_opened").length, 1);
    assert.equal(audit.filter((row) => row.action === "realty_case_action_recorded").length, 1);
    assert.equal(audit.filter((row) => row.action === "realty_case_condition_opened").length, 1);
    assert.equal(audit.filter((row) => row.action === "realty_case_condition_action_recorded").length, 1);

    const badLedgerPath = tempLedger("app-authority-bad-config");
    const badConfig = {
      ...appAdminConfigFromEnv({
        MS_REALTY_CASE_PAYLOAD_AUTHORITY_ENABLED: "true",
        MS_REALTY_CASE_REQUEST_PROJECTION_ENABLED: "true",
        MS_REALTY_WORKSPACE_ID: "workspace-sandanski",
        MS_REALTY_CASE_LEDGER_PATH: badLedgerPath,
      }),
      realtyCasePayload: target.payload,
    };
    const preflight = await request("/api/admin/cases", {
      method: "POST",
      authorization,
      body: caseInput("app-authority-bad-config"),
      config: badConfig,
    });
    assert.equal(preflight.status, 503);
    assert.deepEqual(await preflight.json(), { kind: "realty_case_authority_unavailable", source_recorded: false });
    assert.equal(fs.readFileSync(badLedgerPath, "utf8"), "");

    const badRead = await request("/api/admin/cases", { authorization, config: badConfig });
    assert.equal(badRead.status, 503);
    assert.deepEqual(await badRead.json(), { kind: "realty_case_authority_unavailable", source_recorded: false });
  });
});
