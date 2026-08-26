import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { readAuditLog } from "../lib/audit-log.mjs";
import { createHttpApp, dispatchHttp } from "../lib/http.mjs";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function tempLedger(name) {
  const filePath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), `ms-realty-${name}-`)), `${name}.jsonl`);
  fs.writeFileSync(filePath, "");
  return filePath;
}

function fakePayload({ failOnCreate = null } = {}) {
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
  const calls = { begin: 0, commit: 0, rollback: 0 };
  const matches = (document, where) => Object.entries(where || {}).every(([key, rule]) => document[key] === rule.equals);
  return {
    calls,
    rows,
    payload: {
      db: {
        async beginTransaction() {
          calls.begin += 1;
          snapshot = clone(rows);
          return `transaction-${calls.begin}`;
        },
        async commitTransaction() {
          calls.commit += 1;
          snapshot = null;
        },
        async rollbackTransaction() {
          calls.rollback += 1;
          for (const collection of Object.keys(rows)) rows[collection] = clone(snapshot[collection]);
          snapshot = null;
        },
      },
      async find({ collection, where }) {
        return { docs: rows[collection].filter((document) => matches(document, where)).map(clone) };
      },
      async create({ collection, data, req }) {
        assert.match(req.transactionID, /^transaction-/);
        if (collection === failOnCreate) throw new Error(`forced ${collection} failure`);
        const document = { id: nextId++, ...clone(data) };
        rows[collection].push(document);
        return clone(document);
      },
      async update({ collection, data, id, req }) {
        assert.match(req.transactionID, /^transaction-/);
        const document = rows[collection].find((row) => row.id === id);
        if (!document) throw new Error("missing document");
        Object.assign(document, clone(data));
        return clone(document);
      },
    },
  };
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
    { id: "broker_bg", token: "broker-authority-token-012345678", roles: ["broker"], workspace_ids: ["workspace-sandanski"] },
  ]);
  try {
    await fn({ authorization: "Bearer broker-authority-token-012345678" });
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

function caseInput(id) {
  return {
    id,
    jurisdiction: "BG",
    caseType: "buyer_purchase",
    assetKind: "residential",
    clientRef: `contact-${id}`,
    propertyRef: `property-${id}`,
    executionMode: "autonomous",
    assuranceRef: "assurance://reliable-agents/profile-1",
    mandate: {
      ref: `mandate-${id}`,
      grantedByRef: `contact-${id}`,
      signedAt: "2026-07-30T08:00:00.000Z",
      signedEvidenceRef: `evidence://mandate-${id}`,
      capabilities: ["case:*"],
    },
  };
}

test("standalone HTTP case routes use Payload authority without local case ledgers", async () => {
  await withCredentials(async (auth) => {
    const realtyCaseLedgerPath = tempLedger("authority-http-cases");
    const realtyCaseConditionLedgerPath = tempLedger("authority-http-conditions");
    const auditLogPath = tempLedger("authority-http-audit");
    const target = fakePayload();
    const app = createHttpApp({
      redirects: [],
      realtyCaseLedgerPath,
      realtyCaseConditionLedgerPath,
      auditLogPath,
      realtyCaseRecordedAt: "2026-07-30T09:00:00.000Z",
      realtyCasePayloadAuthorityEnabled: true,
      realtyCaseWorkspaceId: "workspace-sandanski",
      realtyCasePayload: target.payload,
    });
    const caseId = "authority-http-case";

    const opened = await dispatchHttp(app, {
      method: "POST",
      url: "/api/admin/cases",
      headers: auth,
      body: caseInput(caseId),
    });
    assert.equal(opened.status, 201);
    assert.equal(opened.body.event.actor, "broker_bg");
    assert.equal(Object.hasOwn(opened.body, "projection"), false);

    const advanced = await dispatchHttp(app, {
      method: "POST",
      url: "/api/admin/cases/actions",
      headers: auth,
      body: {
        id: "authority-http-lead-intake",
        caseId,
        action: "step_completed",
        stepKey: "lead_intake",
        evidenceRefs: [{ ref: "lead-authority-1", type: "lead_record", producerKind: "agent" }],
      },
    });
    assert.equal(advanced.status, 201);
    assert.equal(advanced.body.event.actor, "broker_bg");

    const condition = await dispatchHttp(app, {
      method: "POST",
      url: "/api/admin/cases/conditions",
      headers: auth,
      body: {
        eventId: "authority-http-condition-opened",
        caseId,
        conditionId: "title-clearance",
        type: "title_clearance",
        dueAt: "2026-07-31T09:00:00.000Z",
        requiredEvidenceProducerRefs: ["registry://property-register"],
      },
    });
    assert.equal(condition.status, 201);
    assert.equal(condition.body.event.actor, "broker_bg");

    const blocked = await dispatchHttp(app, {
      method: "POST",
      url: "/api/admin/cases/conditions/actions",
      headers: auth,
      body: {
        eventId: "authority-http-condition-blocked",
        caseId,
        conditionId: "title-clearance",
        action: "condition_blocked",
        reasonCode: "awaiting_registry_reply",
      },
    });
    assert.equal(blocked.status, 201);
    assert.equal(blocked.body.condition.status, "blocked");

    const cases = await dispatchHttp(app, { url: "/api/admin/cases?locale=en", headers: auth });
    assert.equal(cases.status, 200);
    assert.deepEqual(cases.body.realtyCaseQueue.cases.map((row) => row.id), [caseId]);
    const intents = await dispatchHttp(app, { url: "/api/admin/cases/intents", headers: auth });
    assert.equal(intents.status, 200);
    assert.deepEqual(intents.body.intents.map((intent) => intent.case_id), [caseId]);
    const conditions = await dispatchHttp(app, { url: "/api/admin/cases/conditions", headers: auth });
    assert.equal(conditions.status, 200);
    assert.equal(conditions.body.summary.blocked, 1);

    assert.equal(fs.readFileSync(realtyCaseLedgerPath, "utf8"), "");
    assert.equal(fs.readFileSync(realtyCaseConditionLedgerPath, "utf8"), "");
    assert.equal(target.rows.realty_case_events.length, 2);
    assert.equal(target.rows.realty_case_condition_events.length, 2);
    assert.equal(target.calls.commit, 4);
    assert.equal(readAuditLog(auditLogPath).filter((row) => row.action.startsWith("realty_case_")).length, 4);
  });
});

test("standalone HTTP authority fails closed before local case writes", async () => {
  await withCredentials(async (auth) => {
    const configLedger = tempLedger("authority-http-config");
    const configApp = createHttpApp({
      redirects: [],
      realtyCaseLedgerPath: configLedger,
      realtyCasePayloadAuthorityEnabled: true,
      realtyCaseRequestProjectionEnabled: true,
      realtyCaseWorkspaceId: "workspace-sandanski",
      realtyCasePayload: fakePayload().payload,
    });
    const configFailure = await dispatchHttp(configApp, {
      method: "POST",
      url: "/api/admin/cases",
      headers: auth,
      body: caseInput("authority-http-config"),
    });
    assert.equal(configFailure.status, 503);
    assert.deepEqual(configFailure.body, { kind: "realty_case_authority_unavailable", source_recorded: false });
    assert.equal(fs.readFileSync(configLedger, "utf8"), "");

    const runtimeLedger = tempLedger("authority-http-runtime");
    const target = fakePayload({ failOnCreate: "realty_case_events" });
    const runtimeApp = createHttpApp({
      redirects: [],
      realtyCaseLedgerPath: runtimeLedger,
      realtyCasePayloadAuthorityEnabled: true,
      realtyCaseWorkspaceId: "workspace-sandanski",
      realtyCasePayload: target.payload,
    });
    const runtimeFailure = await dispatchHttp(runtimeApp, {
      method: "POST",
      url: "/api/admin/cases",
      headers: auth,
      body: caseInput("authority-http-runtime"),
    });
    assert.equal(runtimeFailure.status, 503);
    assert.deepEqual(runtimeFailure.body, { kind: "realty_case_authority_unavailable", source_recorded: false });
    assert.equal(fs.readFileSync(runtimeLedger, "utf8"), "");
    assert.equal(target.rows.realty_cases.length, 0);
    assert.equal(target.calls.rollback, 1);
  });
});
