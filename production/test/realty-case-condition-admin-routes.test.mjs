import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { appAdminConfigFromEnv, renderAppAdminResponse } from "../lib/app-admin-adapter.mjs";
import { readAuditLog } from "../lib/audit-log.mjs";
import { createHttpApp, dispatchHttp } from "../lib/http.mjs";

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
    { id: "broker_bg", token: "broker-condition-token-012345678", roles: ["broker"] },
    { id: "trusted_agent_1", token: "agent-condition-token-0123456789", roles: ["agent"] },
  ]);
  try {
    await fn({
      human: { authorization: "Bearer broker-condition-token-012345678" },
      agent: { authorization: "Bearer agent-condition-token-0123456789" },
    });
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

function caseInput(id, executionMode) {
  return {
    id,
    jurisdiction: "BG",
    caseType: "buyer_purchase",
    assetKind: "residential",
    clientRef: `contact-${id}`,
    propertyRef: `property-${id}`,
    executionMode,
    mandate: {
      ref: `mandate-${id}`,
      grantedByRef: `contact-${id}`,
      signedAt: "2026-07-30T08:00:00.000Z",
      signedEvidenceRef: `evidence://mandate-${id}/signed`,
      capabilities: ["case:*"],
    },
    ...(executionMode === "autonomous" ? { assuranceRef: "assurance://reliable-agent/profile-1" } : {}),
  };
}

function conditionInput(caseId, conditionId) {
  return {
    caseId,
    conditionId,
    type: "title_clearance",
    dueAt: "2026-07-31T09:00:00.000Z",
    requiredEvidenceProducerRefs: ["lawyer://title-review", "registry://property-register"],
  };
}

test("Next admin condition routes bind actors and preserve manual and human-control boundaries", async () => {
  await withCredentials(async (auth) => {
    const realtyCaseLedgerPath = tempLedger("app-condition-cases");
    const realtyCaseConditionLedgerPath = tempLedger("app-conditions");
    const auditLogPath = tempLedger("app-condition-audit");
    const config = appAdminConfigFromEnv({
      MS_REALTY_CASE_LEDGER_PATH: realtyCaseLedgerPath,
      MS_REALTY_CASE_CONDITION_LEDGER_PATH: realtyCaseConditionLedgerPath,
      MS_REALTY_AUDIT_LOG_PATH: auditLogPath,
      MS_REALTY_CASE_RECORDED_AT: "2026-07-30T09:00:00.000Z",
    });
    const request = (pathname, method, headers, body) =>
      renderAppAdminResponse(
        new Request(`https://example.test${pathname}`, {
          method,
          headers: { ...headers, ...(body ? { "content-type": "application/json" } : {}) },
          ...(body ? { body: JSON.stringify(body) } : {}),
        }),
        { config },
      );

    assert.equal((await request("/api/admin/cases", "POST", auth.human, caseInput("manual-condition", "manual"))).status, 201);
    const manualAgent = await request(
      "/api/admin/cases/conditions",
      "POST",
      auth.agent,
      conditionInput("manual-condition", "manual-title"),
    );
    assert.equal(manualAgent.status, 400);
    assert.match((await manualAgent.json()).message, /manual case conditions require a human executor/i);

    assert.equal((await request("/api/admin/cases", "POST", auth.human, caseInput("autonomous-condition", "autonomous"))).status, 201);
    const opened = await request(
      "/api/admin/cases/conditions",
      "POST",
      auth.agent,
      conditionInput("autonomous-condition", "title-clearance"),
    );
    assert.equal(opened.status, 201);
    assert.equal((await opened.json()).event.actor, "trusted_agent_1");

    const waived = await request("/api/admin/cases/conditions/actions", "POST", auth.agent, {
      caseId: "autonomous-condition",
      conditionId: "title-clearance",
      action: "condition_waived",
      authorityRef: "authority://client/waiver",
      reasonCode: "client_waived",
    });
    assert.equal(waived.status, 403);
    assert.equal((await waived.json()).required_capability, "human_case_control");

    const satisfied = await request("/api/admin/cases/conditions/actions", "POST", auth.agent, {
      caseId: "autonomous-condition",
      conditionId: "title-clearance",
      action: "condition_satisfied",
      evidenceRefs: [
        { ref: "evidence://lawyer/title", producerRef: "lawyer://title-review" },
        { ref: "evidence://registry/title", producerRef: "registry://property-register" },
      ],
    });
    assert.equal(satisfied.status, 201);
    assert.equal((await satisfied.json()).condition.status, "satisfied");

    const queue = await request("/api/admin/cases/conditions", "GET", auth.agent);
    assert.equal(queue.status, 200);
    assert.equal((await queue.json()).summary.satisfied, 1);
    const audit = readAuditLog(auditLogPath);
    assert.equal(audit.filter((row) => row.action === "realty_case_condition_opened").length, 1);
    assert.equal(audit.filter((row) => row.action === "realty_case_condition_action_recorded").length, 1);
    assert.equal(audit.some((row) => JSON.stringify(row.metadata).includes("evidence://")), false);
  });
});

test("condition workbench renders unresolved states and validates JSON form evidence", async () => {
  await withCredentials(async (auth) => {
    const realtyCaseLedgerPath = tempLedger("app-condition-workbench-cases");
    const realtyCaseConditionLedgerPath = tempLedger("app-condition-workbench-conditions");
    const auditLogPath = tempLedger("app-condition-workbench-audit");
    const config = appAdminConfigFromEnv({
      MS_REALTY_CASE_LEDGER_PATH: realtyCaseLedgerPath,
      MS_REALTY_CASE_CONDITION_LEDGER_PATH: realtyCaseConditionLedgerPath,
      MS_REALTY_AUDIT_LOG_PATH: auditLogPath,
      MS_REALTY_CASE_RECORDED_AT: "2026-07-30T09:00:00.000Z",
    });
    const request = (pathname, method, headers, body, requestConfig = config) =>
      renderAppAdminResponse(
        new Request(`https://example.test${pathname}`, {
          method,
          headers: { ...headers, ...(body ? { "content-type": "application/json" } : {}) },
          ...(body ? { body: JSON.stringify(body) } : {}),
        }),
        { config: requestConfig },
      );

    assert.equal((await request("/api/admin/cases", "POST", auth.human, caseInput("manual-workbench", "manual"))).status, 201);
    const openWithFormValue = await request("/api/admin/cases/conditions", "POST", auth.human, {
      caseId: "manual-workbench",
      conditionId: "open-condition",
      conditionType: "title_clearance",
      dueAt: "2026-07-31T09:00:00.000Z",
      requiredEvidenceProducerRefsJson: JSON.stringify(["lawyer://title-review", "registry://property-register"]),
    });
    assert.equal(openWithFormValue.status, 201);

    for (const conditionId of ["blocked-condition", "expired-condition", "satisfied-condition"]) {
      assert.equal(
        (await request("/api/admin/cases/conditions", "POST", auth.human, conditionInput("manual-workbench", conditionId))).status,
        201,
      );
    }
    const blocked = await request("/api/admin/cases/conditions/actions", "POST", auth.human, {
      caseId: "manual-workbench",
      conditionId: "blocked-condition",
      action: "condition_blocked",
      reasonCode: "awaiting_registry_reply",
    });
    assert.equal(blocked.status, 201);

    const invalidEvidence = await request("/api/admin/cases/conditions/actions", "POST", auth.human, {
      caseId: "manual-workbench",
      conditionId: "open-condition",
      action: "condition_satisfied",
      evidenceRefsJson: "not-json",
    });
    assert.equal(invalidEvidence.status, 400);
    assert.match((await invalidEvidence.json()).message, /evidence refs must be valid JSON/i);

    const satisfied = await request("/api/admin/cases/conditions/actions", "POST", auth.human, {
      caseId: "manual-workbench",
      conditionId: "satisfied-condition",
      action: "condition_satisfied",
      evidenceRefsJson: JSON.stringify([
        { ref: "evidence://lawyer/title", producerRef: "lawyer://title-review" },
        { ref: "evidence://registry/title", producerRef: "registry://property-register" },
      ]),
    });
    assert.equal(satisfied.status, 201);
    assert.equal((await satisfied.json()).condition.status, "satisfied");

    const lateConfig = { ...config, realtyCaseRecordedAt: "2026-08-01T09:00:00.000Z" };
    const expired = await request(
      "/api/admin/cases/conditions/actions",
      "POST",
      auth.human,
      { caseId: "manual-workbench", conditionId: "expired-condition", action: "condition_expired" },
      lateConfig,
    );
    assert.equal(expired.status, 201);

    const humanPage = await request("/admin/cases?locale=en", "GET", auth.human, null, lateConfig);
    const humanHtml = await humanPage.text();
    assert.equal(humanPage.status, 200, humanHtml);
    assert.match(humanHtml, /data-realty-case-condition-workbench="true"/);
    assert.match(humanHtml, /data-realty-case-condition-create="true"/);
    assert.match(humanHtml, /data-realty-case-condition="open-condition"/);
    assert.match(humanHtml, /data-condition-status="open"/);
    assert.match(humanHtml, /data-condition-status="blocked"/);
    assert.match(humanHtml, /data-condition-status="expired"/);
    assert.match(humanHtml, /name="requiredEvidenceProducerRefsJson"/);
    assert.match(humanHtml, /name="evidenceRefsJson"/);
    assert.match(humanHtml, /data-admin-mutation-form="realty-case-condition-condition_satisfied"/);

    const agentPage = await request("/admin/cases?locale=en", "GET", auth.agent, null, lateConfig);
    const agentHtml = await agentPage.text();
    assert.equal(agentPage.status, 200, agentHtml);
    assert.match(agentHtml, /data-realty-case-condition="open-condition"/);
    assert.doesNotMatch(agentHtml, /data-realty-case-condition-create="true"/);
    assert.doesNotMatch(agentHtml, /data-admin-mutation-form="realty-case-condition-/);
  });
});

test("standalone HTTP condition routes match the trusted-agent contract", async () => {
  await withCredentials(async (auth) => {
    const realtyCaseLedgerPath = tempLedger("http-condition-cases");
    const realtyCaseConditionLedgerPath = tempLedger("http-conditions");
    const auditLogPath = tempLedger("http-condition-audit");
    const app = createHttpApp({
      redirects: [],
      realtyCaseLedgerPath,
      realtyCaseConditionLedgerPath,
      auditLogPath,
      realtyCaseRecordedAt: "2026-07-30T09:00:00.000Z",
    });
    const openedCase = await dispatchHttp(app, {
      method: "POST",
      url: "/api/admin/cases",
      headers: auth.human,
      body: caseInput("http-autonomous-condition", "autonomous"),
    });
    assert.equal(openedCase.status, 201);
    const openedCondition = await dispatchHttp(app, {
      method: "POST",
      url: "/api/admin/cases/conditions",
      headers: auth.agent,
      body: conditionInput("http-autonomous-condition", "registry-clearance"),
    });
    assert.equal(openedCondition.status, 201);
    assert.equal(openedCondition.body.event.actor, "trusted_agent_1");
    const blocked = await dispatchHttp(app, {
      method: "POST",
      url: "/api/admin/cases/conditions/actions",
      headers: auth.agent,
      body: {
        caseId: "http-autonomous-condition",
        conditionId: "registry-clearance",
        action: "condition_blocked",
        reasonCode: "awaiting_registry_reply",
      },
    });
    assert.equal(blocked.status, 201);
    assert.equal(blocked.body.condition.status, "blocked");
    const queue = await dispatchHttp(app, { url: "/api/admin/cases/conditions", headers: auth.agent });
    assert.equal(queue.status, 200);
    assert.equal(queue.body.summary.blocked, 1);
    assert.equal(readAuditLog(auditLogPath).filter((row) => row.action.startsWith("realty_case_condition_")).length, 2);
  });
});
