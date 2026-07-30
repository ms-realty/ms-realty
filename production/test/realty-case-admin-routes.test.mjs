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
    { id: "broker_bg", token: "broker-case-token-012345678901", roles: ["broker"] },
    { id: "trusted_agent_1", token: "agent-case-token-0123456789012", roles: ["agent"] },
  ]);
  try {
    await fn({
      human: { authorization: "Bearer broker-case-token-012345678901" },
      agent: { authorization: "Bearer agent-case-token-0123456789012" },
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
      capabilities: ["case:*"],
    },
    ...(executionMode === "autonomous" ? { assuranceRef: "assurance://reliable-agents/profile-1" } : {}),
  };
}

test("admin case routes support human manual work and assured autonomous agents on one contract", async () => {
  await withCredentials(async (auth) => {
    const realtyCaseLedgerPath = tempLedger("admin-cases");
    const auditLogPath = tempLedger("admin-cases-audit");
    const config = appAdminConfigFromEnv({
      MS_REALTY_CASE_LEDGER_PATH: realtyCaseLedgerPath,
      MS_REALTY_AUDIT_LOG_PATH: auditLogPath,
      MS_REALTY_CASE_RECORDED_AT: "2026-07-30T09:00:00.000Z",
    });

    const manualOpen = await renderAppAdminResponse(
      new Request("https://example.test/api/admin/cases", {
        method: "POST",
        headers: { ...auth.human, "content-type": "application/json" },
        body: JSON.stringify(caseInput("manual-1", "manual")),
      }),
      { config },
    );
    assert.equal(manualOpen.status, 201);
    const manual = await manualOpen.json();
    assert.equal(manual.case.execution_mode, "manual");

    const agentOpen = await renderAppAdminResponse(
      new Request("https://example.test/api/admin/cases", {
        method: "POST",
        headers: { ...auth.agent, "content-type": "application/json" },
        body: JSON.stringify(caseInput("agent-created", "autonomous")),
      }),
      { config },
    );
    assert.equal(agentOpen.status, 403);
    assert.equal((await agentOpen.json()).required_capability, "human_case_control");

    const rejectedAgent = await renderAppAdminResponse(
      new Request("https://example.test/api/admin/cases/actions", {
        method: "POST",
        headers: { ...auth.agent, "content-type": "application/json" },
        body: JSON.stringify({
          caseId: "manual-1",
          action: "step_completed",
          stepKey: "lead_intake",
          evidenceRefs: [{ ref: "lead-1", type: "lead_record", producerKind: "agent" }],
        }),
      }),
      { config },
    );
    assert.equal(rejectedAgent.status, 400);
    assert.match((await rejectedAgent.json()).message, /human executor/i);

    const autonomousOpen = await renderAppAdminResponse(
      new Request("https://example.test/api/admin/cases", {
        method: "POST",
        headers: { ...auth.human, "content-type": "application/json" },
        body: JSON.stringify(caseInput("autonomous-1", "autonomous")),
      }),
      { config },
    );
    assert.equal(autonomousOpen.status, 201);

    const autonomousStep = await renderAppAdminResponse(
      new Request("https://example.test/api/admin/cases/actions", {
        method: "POST",
        headers: { ...auth.agent, "content-type": "application/json" },
        body: JSON.stringify({
          caseId: "autonomous-1",
          action: "step_completed",
          stepKey: "lead_intake",
          evidenceRefs: [{ ref: "lead-2", type: "lead_record", producerKind: "agent" }],
        }),
      }),
      { config },
    );
    assert.equal(autonomousStep.status, 201);
    const step = await autonomousStep.json();
    assert.equal(step.event.actor, "trusted_agent_1");
    assert.equal(step.event.executor_kind, "agent");
    assert.equal(step.case.progress_percent > 0, true);

    const agentFreeze = await renderAppAdminResponse(
      new Request("https://example.test/api/admin/cases/actions", {
        method: "POST",
        headers: { ...auth.agent, "content-type": "application/json" },
        body: JSON.stringify({
          caseId: "autonomous-1",
          action: "case_frozen",
          authorityRef: "authority://agent-must-not-control",
          reasonCode: "unsafe",
        }),
      }),
      { config },
    );
    assert.equal(agentFreeze.status, 403);
    assert.equal((await agentFreeze.json()).required_capability, "human_case_control");

    const page = await renderAppAdminResponse(
      new Request("https://example.test/admin/cases?locale=en", { headers: auth.human }),
      { config },
    );
    const html = await page.text();
    assert.equal(page.status, 200, html);
    assert.match(html, /data-kind="admin-realty-cases"/);
    assert.match(html, /data-realty-case="manual-1"/);
    assert.match(html, /data-realty-case="autonomous-1"/);

    const api = await renderAppAdminResponse(
      new Request("https://example.test/api/admin/cases?locale=en", { headers: auth.agent }),
      { config },
    );
    assert.equal(api.status, 200);
    const queue = (await api.json()).realtyCaseQueue;
    assert.equal(queue.summary.manual, 1);
    assert.equal(queue.summary.autonomous, 1);

    const intentsResponse = await renderAppAdminResponse(
      new Request("https://example.test/api/admin/cases/intents", { headers: auth.agent }),
      { config },
    );
    assert.equal(intentsResponse.status, 200);
    const intents = (await intentsResponse.json()).intents;
    assert.deepEqual(intents.map((intent) => intent.case_id), ["autonomous-1"]);
    assert.equal(intents[0].step_key, "requirements_brief");
    assert.equal(Object.hasOwn(intents[0], "client_ref"), false);

    const agentPage = await renderAppAdminResponse(
      new Request("https://example.test/admin/cases?locale=en", { headers: auth.agent }),
      { config },
    );
    const agentHtml = await agentPage.text();
    assert.equal(agentPage.status, 200, agentHtml);
    assert.doesNotMatch(agentHtml, /data-admin-mutation-form="realty-case-open"/);
    assert.match(agentHtml, /href="\/admin\/cases"/);

    const forbiddenReply = await renderAppAdminResponse(
      new Request("https://example.test/api/admin/replies", {
        method: "POST",
        headers: { ...auth.agent, "content-type": "application/json" },
        body: JSON.stringify({ leadId: "lead-1" }),
      }),
      { config },
    );
    assert.equal(forbiddenReply.status, 403);
    assert.equal((await forbiddenReply.json()).required_capability, "operations:write");

    const audit = readAuditLog(auditLogPath);
    assert.equal(audit.filter((row) => row.action === "realty_case_opened").length, 2);
    assert.equal(audit.filter((row) => row.action === "realty_case_action_recorded").length, 1);
  });
});

test("standalone HTTP runtime serves the same autonomous case contract and admin workbench", async () => {
  await withCredentials(async (auth) => {
    const realtyCaseLedgerPath = tempLedger("http-cases");
    const auditLogPath = tempLedger("http-cases-audit");
    const app = createHttpApp({
      redirects: [],
      realtyCaseLedgerPath,
      auditLogPath,
      realtyCaseRecordedAt: "2026-07-30T10:00:00.000Z",
    });
    const form = new URLSearchParams({
      id: "http-autonomous-1",
      jurisdiction: "GR",
      caseType: "seller_sale",
      assetKind: "residential",
      clientRef: "contact-http-1",
      propertyRef: "property-http-1",
      executionMode: "autonomous",
      mandateRef: "mandate-http-1",
      mandateGrantedByRef: "contact-http-1",
      mandateSignedAt: "2026-07-30T08:00:00.000Z",
      mandateCapabilities: "case:*",
      assuranceRef: "assurance://reliable-agents/profile-1",
    }).toString();

    const opened = await dispatchHttp(app, {
      method: "POST",
      url: "/api/admin/cases",
      headers: { ...auth.human, "content-type": "application/x-www-form-urlencoded" },
      body: form,
    });
    assert.equal(opened.status, 201);
    assert.equal(opened.body.case.execution_mode, "autonomous");
    assert.equal(opened.body.case.jurisdiction, "GR");

    const advanced = await dispatchHttp(app, {
      method: "POST",
      url: "/api/admin/cases/actions",
      headers: auth.agent,
      body: {
        caseId: "http-autonomous-1",
        action: "step_completed",
        stepKey: "lead_intake",
        evidenceRefs: [{ ref: "lead-http-1", type: "lead_record", producerKind: "agent" }],
      },
    });
    assert.equal(advanced.status, 201);
    assert.equal(advanced.body.event.actor, "trusted_agent_1");
    assert.equal(advanced.body.event.executor_kind, "agent");

    const rejectedFreeze = await dispatchHttp(app, {
      method: "POST",
      url: "/api/admin/cases/actions",
      headers: auth.agent,
      body: {
        caseId: "http-autonomous-1",
        action: "case_frozen",
        authorityRef: "authority://agent-must-not-control",
        reasonCode: "unsafe",
      },
    });
    assert.equal(rejectedFreeze.status, 403);
    assert.equal(rejectedFreeze.body.required_capability, "human_case_control");

    const page = await dispatchHttp(app, { url: "/admin/cases?locale=en", headers: auth.human });
    assert.equal(page.status, 200);
    assert.match(page.body, /data-realty-case="http-autonomous-1"/);

    const api = await dispatchHttp(app, { url: "/api/admin/cases?locale=en", headers: auth.agent });
    assert.equal(api.status, 200);
    assert.equal(api.body.realtyCaseQueue.summary.autonomous, 1);
    const intents = await dispatchHttp(app, { url: "/api/admin/cases/intents", headers: auth.agent });
    assert.equal(intents.status, 200);
    assert.deepEqual(intents.body.intents.map((intent) => intent.case_id), ["http-autonomous-1"]);
    assert.equal(intents.body.intents[0].step_key, "sale_objective");
    assert.equal(readAuditLog(auditLogPath).filter((row) => row.action.startsWith("realty_case_")).length, 2);
  });
});
