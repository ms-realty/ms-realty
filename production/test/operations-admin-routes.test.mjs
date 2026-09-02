import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { appAdminConfigFromEnv, renderAppAdminResponse } from "../lib/app-admin-adapter.mjs";
import { createHttpApp, dispatchHttp } from "../lib/http.mjs";
import { automationConfirmation } from "../lib/operations-durable-store.mjs";

const WORKSPACE = "workspace-parity";
const OPERATOR = { id: "operations-owner", source: "credential_registry", can_mutate: true, roles: ["admin"], workspace_ids: [WORKSPACE] };

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function matches(value, where) {
  if (!where || !Object.keys(where).length) return true;
  if (where.and) return where.and.every((clause) => matches(value, clause));
  return Object.entries(where).every(([key, rule]) => rule?.equals === undefined || value[key] === rule.equals);
}

function fakePayload() {
  const rows = { tasks: [], automation_rules: [], automation_runs: [], automation_run_failures: [], hermes_owner_receipts: [] };
  let nextId = 1;
  let snapshot = null;
  let transaction = 0;
  return {
    rows,
    db: {
      async beginTransaction() {
        snapshot = clone(rows);
        return `operations-tx-${++transaction}`;
      },
      async commitTransaction() {
        snapshot = null;
      },
      async rollbackTransaction() {
        for (const key of Object.keys(rows)) rows[key] = clone(snapshot[key]);
        snapshot = null;
      },
    },
    async find({ collection, where, sort, limit }) {
      const docs = rows[collection].filter((row) => matches(row, where)).map(clone);
      const field = String(sort || "").replace(/^-/, "");
      const direction = String(sort || "").startsWith("-") ? -1 : 1;
      if (field) docs.sort((left, right) => String(left[field] || "").localeCompare(String(right[field] || "")) * direction);
      return { docs: docs.slice(0, limit || docs.length) };
    },
    async create({ collection, data }) {
      const document = { id: nextId++, ...clone(data) };
      rows[collection].push(document);
      return clone(document);
    },
    async update({ collection, id, data }) {
      const document = rows[collection].find((row) => row.id === id);
      if (!document) throw new Error("missing document");
      Object.assign(document, clone(data));
      return clone(document);
    },
  };
}

function appConfig(payload, auditLogPath, hermesAuditPath) {
  return {
    ...appAdminConfigFromEnv({
      NODE_ENV: "test",
      MS_REALTY_WORKSPACE_ID: WORKSPACE,
      MS_REALTY_OPERATIONS_DURABLE_STORE_ENABLED: "true",
      PAYLOAD_SECRET: "operations-parity-payload-secret",
      DATABASE_URL: "postgres://operations-parity",
    }),
    workspaceId: WORKSPACE,
    workspaceSettingsWorkspaceId: WORKSPACE,
    operationsPayload: payload,
    payloadListingRuntime: payload,
    adminPrincipal: OPERATOR,
    auditLogPath,
    hermesAuditPath,
    reviewedAt: "2026-09-03T09:00:00.000Z",
  };
}

function appRequest(pathname, { method = "GET", body, config } = {}) {
  return renderAppAdminResponse(
    new Request(`https://example.test${pathname}`, {
      method,
      headers: { accept: "application/json", ...(body ? { "content-type": "application/json" } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    }),
    { config },
  );
}

test("nested automation and Hermes history routes resolve the shared Next adapter", async () => {
  for (const route of [
    "../../app/api/admin/automations/runs/route.js",
    "../../app/api/admin/automations/runs/[runId]/route.js",
    "../../app/api/admin/hermes/runs/route.js",
    "../../app/api/admin/hermes/runs/[runId]/route.js",
  ]) {
    const module = await import(route);
    assert.equal(typeof module.GET, "function", route);
  }
});

test("Node and Next operations API paths share task and Hermes read behavior", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ms-realty-operations-parity-"));
  const hermesAuditPath = path.join(directory, "hermes-audit.jsonl");
  fs.writeFileSync(
    hermesAuditPath,
    [
      {
        recorded_at: "2026-09-03T09:00:00.000Z",
        task_id: "hermes-task-parity",
        object_type: "listing",
        object_id: "listing-parity",
        source_locale: "bg",
        target_locale: "en",
        status: "hermes_drafted",
        provider_mode: "self_hosted",
        workspace_id: WORKSPACE,
        source_hash: "a".repeat(64),
        draft_hash: "b".repeat(64),
        has_output: true,
        public_indexable: false,
        human_approved: false,
        can_publish: false,
        can_mark_indexable: false,
      },
      {
        recorded_at: "2026-09-03T08:59:00.000Z",
        task_id: "legacy-hermes-task-parity",
        object_type: "listing",
        object_id: "listing-legacy-parity",
        source_locale: "bg",
        target_locale: "en",
        status: "hermes_drafted",
        provider_mode: "self_hosted",
        source_hash: "c".repeat(64),
        draft_hash: "d".repeat(64),
        has_output: true,
        public_indexable: false,
        human_approved: false,
        can_publish: false,
        can_mark_indexable: false,
      },
    ]
      .map(JSON.stringify)
      .join("\n") + "\n",
  );
  const appPayload = fakePayload();
  const httpPayload = fakePayload();
  const app = appConfig(appPayload, path.join(directory, "next-audit.jsonl"), hermesAuditPath);
  const previous = {
    NODE_ENV: process.env.NODE_ENV,
    MS_REALTY_ADMIN_TOKEN: process.env.MS_REALTY_ADMIN_TOKEN,
    MS_REALTY_ADMIN_ACTOR: process.env.MS_REALTY_ADMIN_ACTOR,
    MS_REALTY_ADMIN_CREDENTIALS_JSON: process.env.MS_REALTY_ADMIN_CREDENTIALS_JSON,
  };
  process.env.NODE_ENV = "test";
  process.env.MS_REALTY_ADMIN_TOKEN = "operations-parity-token";
  process.env.MS_REALTY_ADMIN_ACTOR = OPERATOR.id;
  delete process.env.MS_REALTY_ADMIN_CREDENTIALS_JSON;
  try {
    const standalone = createHttpApp({
      workspaceId: WORKSPACE,
      operationsDurableStore: {
        operationsDurableStoreEnabled: true,
        payloadSecret: "operations-parity-payload-secret",
        databaseUrl: "postgres://operations-parity",
        workspaceId: WORKSPACE,
      },
      operationsPayload: httpPayload,
      payloadListingRuntime: httpPayload,
      auditLogPath: path.join(directory, "http-audit.jsonl"),
      hermesAuditPath,
      reviewedAt: "2026-09-03T09:00:00.000Z",
    });
    const taskInput = { task_id: "parity-task", idempotency_key: "parity-task-key", title: "Review listing", source_type: "listing", source_id: "listing-parity" };
    const nextCreated = await appRequest("/api/admin/tasks", { method: "POST", body: taskInput, config: app });
    const nodeCreated = await dispatchHttp(standalone, {
      url: "/api/admin/tasks",
      method: "POST",
      headers: { authorization: "Bearer operations-parity-token", accept: "application/json" },
      body: taskInput,
    });
    assert.equal(nextCreated.status, nodeCreated.status);
    assert.equal(nextCreated.status, 201);
    const nextCreatedBody = await nextCreated.json();
    assert.deepEqual(nextCreatedBody.task, nodeCreated.body.task);

    const nextList = await appRequest("/api/admin/tasks", { config: app });
    const nodeList = await dispatchHttp(standalone, { url: "/api/admin/tasks", headers: { authorization: "Bearer operations-parity-token", accept: "application/json" } });
    assert.deepEqual(await nextList.json(), nodeList.body);

    const nextHermes = await appRequest("/api/admin/hermes/runs", { config: app });
    const nodeHermes = await dispatchHttp(standalone, { url: "/api/admin/hermes/runs", headers: { authorization: "Bearer operations-parity-token", accept: "application/json" } });
    assert.deepEqual(await nextHermes.json(), nodeHermes.body);
    assert.equal(nodeHermes.body.runs[0].can_publish, false);
    assert.equal(Object.hasOwn(nodeHermes.body.runs[0], "prompt"), false);
    assert.equal(nodeHermes.body.runs.some((run) => run.run_id === "legacy-hermes-task-parity" && run.workspace_id === WORKSPACE), true);

    const nextAlias = await appRequest("/api/admin/automation-rules", { config: app });
    const nodeAlias = await dispatchHttp(standalone, { url: "/api/admin/automation-rules", headers: { authorization: "Bearer operations-parity-token", accept: "application/json" } });
    assert.notEqual(nextAlias.status, 200);
    assert.notEqual(nodeAlias.status, 200);

    const broker = { ...OPERATOR, id: "operations-broker", roles: ["broker"] };
    const brokerConfig = { ...app, adminPrincipal: broker };
    const nextCrossWorkspace = await appRequest("/api/admin/hermes/runs?workspace_id=another-workspace", { config: brokerConfig });
    assert.equal(nextCrossWorkspace.status, 403);
    const brokerToken = "operations-broker-credential-token";
    process.env.MS_REALTY_ADMIN_CREDENTIALS_JSON = JSON.stringify([
      { id: broker.id, token: brokerToken, roles: broker.roles, workspace_ids: [WORKSPACE] },
    ]);
    const nodeCrossWorkspace = await dispatchHttp(standalone, {
      url: "/api/admin/hermes/runs?workspace_id=another-workspace",
      headers: { authorization: `Bearer ${brokerToken}`, accept: "application/json" },
    });
    assert.equal(nodeCrossWorkspace.status, 403);

    const ruleInput = {
      rule_id: "route-retry-rule",
      idempotency_key: "route-retry-rule-key",
      name: "Route retry rule",
      rule_type: "saved_search_alerts",
      schedule: "manual",
    };
    const nextRule = await appRequest("/api/admin/automations", { method: "POST", body: ruleInput, config: app });
    assert.equal(nextRule.status, 201);
    const nextEnabled = await appRequest("/api/admin/automations/route-retry-rule", {
      method: "PATCH",
      body: { enabled: true, confirmation: automationConfirmation("enable", ruleInput.rule_id) },
      config: app,
    });
    assert.equal(nextEnabled.status, 200);
    const missingRunKey = await appRequest("/api/admin/automations/route-retry-rule/run", {
      method: "POST",
      body: { confirmation: automationConfirmation("run", ruleInput.rule_id) },
      config: app,
    });
    assert.equal(missingRunKey.status, 400);
    const runInput = { idempotency_key: "route-retry-run-key", confirmation: automationConfirmation("run", ruleInput.rule_id) };
    const firstRun = await appRequest("/api/admin/automations/route-retry-rule/run", { method: "POST", body: runInput, config: app });
    assert.ok([201, 502].includes(firstRun.status));
    const retriedRun = await appRequest("/api/admin/automations/route-retry-rule/run", { method: "POST", body: runInput, config: app });
    assert.equal(retriedRun.status, 200);
    assert.equal((await retriedRun.json()).idempotent, true);
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test("both adapters refuse durable operations when the feature flag is disabled", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ms-realty-operations-disabled-"));
  const disabledStore = {
    operationsDurableStoreEnabled: false,
    payloadSecret: "operations-parity-payload-secret",
    databaseUrl: "postgres://operations-parity",
    workspaceId: WORKSPACE,
  };
  const app = appConfig(fakePayload(), path.join(directory, "next-audit.jsonl"), path.join(directory, "hermes-audit.jsonl"));
  const disabledApp = { ...app, operationsDurableStore: disabledStore };
  const next = await appRequest("/api/admin/tasks", { config: disabledApp });
  assert.equal(next.status, 503);
  assert.equal((await next.json()).kind, "operations_store_unavailable");

  const previous = {
    NODE_ENV: process.env.NODE_ENV,
    MS_REALTY_ADMIN_TOKEN: process.env.MS_REALTY_ADMIN_TOKEN,
    MS_REALTY_ADMIN_ACTOR: process.env.MS_REALTY_ADMIN_ACTOR,
    MS_REALTY_ADMIN_CREDENTIALS_JSON: process.env.MS_REALTY_ADMIN_CREDENTIALS_JSON,
  };
  process.env.NODE_ENV = "test";
  process.env.MS_REALTY_ADMIN_TOKEN = "operations-disabled-token";
  process.env.MS_REALTY_ADMIN_ACTOR = OPERATOR.id;
  delete process.env.MS_REALTY_ADMIN_CREDENTIALS_JSON;
  try {
    const standalone = createHttpApp({
      workspaceId: WORKSPACE,
      operationsDurableStore: disabledStore,
      operationsPayload: fakePayload(),
      hermesAuditPath: path.join(directory, "hermes-audit.jsonl"),
    });
    const node = await dispatchHttp(standalone, {
      url: "/api/admin/tasks",
      headers: { authorization: "Bearer operations-disabled-token", accept: "application/json" },
    });
    assert.equal(node.status, 503);
    assert.equal(node.body.kind, "operations_store_unavailable");
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
