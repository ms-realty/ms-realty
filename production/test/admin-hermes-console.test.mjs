import test from "node:test";
import assert from "node:assert/strict";
import { appAdminConfigFromEnv, renderAppAdminResponse } from "../lib/app-admin-adapter.mjs";
import { createHttpApp, dispatchHttp } from "../lib/http.mjs";

const ORIGIN = "https://ms-realty.ms-realty-bg.workers.dev";
const GENERATED_AT = "2026-08-27T16:30:00.000Z";
const RECEIPT_SECRET = "admin-hermes-receipt-test-secret-longer-than-thirty-two-characters";
const principal = {
  id: "payload-owner",
  source: "payload_session",
  can_mutate: true,
  roles: ["admin"],
  workspace_ids: [],
};

function appConfig(overrides = {}) {
  return {
    ...appAdminConfigFromEnv({ NODE_ENV: "test" }),
    adminPrincipal: principal,
    authEnv: { NODE_ENV: "test" },
    reviewedAt: GENERATED_AT,
    ...overrides,
  };
}

function healthyHermesFetch(calls) {
  return async (url, options = {}) => {
    calls.push({ url: String(url), authorization: options.headers?.authorization || "" });
    if (String(url).endsWith("/v1/capabilities")) {
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            platform: "hermes-agent",
            model: "Hermes-4-14B",
            auth: { type: "bearer", required: true },
            features: { chat_completions: true, responses_api: true, run_submission: true },
          };
        },
      };
    }
    return { ok: true, status: 200 };
  };
}

function fakeHermesReceiptPayload() {
  const docs = [];
  return {
    docs,
    async find({ where, limit = 10 }) {
      let rows = [...docs];
      if (where?.idempotency_key?.equals) rows = rows.filter((doc) => doc.idempotency_key === where.idempotency_key.equals);
      if (where?.operator_id?.equals) rows = rows.filter((doc) => doc.operator_id === where.operator_id.equals);
      return { docs: rows.slice(0, limit) };
    },
    async create({ data }) {
      const doc = { id: docs.length + 1, ...data };
      docs.push(doc);
      return doc;
    },
    async update({ id, where, data }) {
      const conditions = Array.isArray(where?.and) ? where.and : [];
      const idCondition = conditions.find((condition) => condition.id)?.id?.equals;
      const statusCondition = conditions.find((condition) => condition.status)?.status?.equals;
      const indexes = docs
        .map((doc, index) => ({ doc, index }))
        .filter(({ doc }) => (id === undefined ? idCondition === undefined || doc.id === idCondition : doc.id === id))
        .filter(({ doc }) => statusCondition === undefined || doc.status === statusCondition)
        .map(({ index }) => index);
      if (where) {
        for (const index of indexes) docs[index] = { ...docs[index], ...data };
        return { docs: indexes.map((index) => docs[index]), errors: [] };
      }
      const index = indexes[0];
      if (index === undefined) throw new Error("missing receipt");
      docs[index] = { ...docs[index], ...data };
      return docs[index];
    },
  };
}

function ownerPlan() {
  return {
    summary: "Review the authenticated work queue before preparing drafts.",
    steps: [
      {
        title: "Review current enquiries",
        why: "The work queue is the source of truth for follow-up.",
        destination: "work",
        mode: "review",
        evidence: ["authenticated_owner_scope", "admin_destination_map"],
      },
    ],
    questions: [],
  };
}

test("Hermes console loads a safe recovery state without probing when configuration is missing", async () => {
  let fetchCalls = 0;
  const config = appConfig({
    hermesAgentFetch: async () => {
      fetchCalls += 1;
      throw new Error("must not run");
    },
  });
  const response = await renderAppAdminResponse(
    new Request(`${ORIGIN}/admin/hermes?locale=en`, { headers: { accept: "text/html" } }),
    { config },
  );
  const html = await response.text();
  assert.equal(response.status, 200);
  assert.equal(fetchCalls, 0);
  assert.match(html, /data-react-admin-ui="hermes"/);
  assert.match(html, /data-hermes-runtime="blocked"/);
  assert.match(html, /HERMES_CHAT_COMPLETIONS_URL/);
  assert.match(html, /data-hermes-recovery="true"/);
  assert.match(html, /Recover the connection/);
  assert.match(html, /href="\/admin\/connect"/);
  assert.match(html, /data-hermes-tool="hermes_submit_draft"/);
  assert.match(html, /Hermes cannot publish, send customer messages, or mark content indexable/);
  assert.doesNotMatch(html, /password|payload-secret|database detail/i);

  const api = await renderAppAdminResponse(new Request(`${ORIGIN}/api/admin/hermes?locale=en`), { config });
  const body = await api.json();
  assert.equal(api.status, 200);
  assert.equal(body.kind, "admin_hermes");
  assert.equal(body.runtime.status, "blocked");
  assert.deepEqual(body.runtime.missing, ["HERMES_CHAT_COMPLETIONS_URL", "HERMES_API_KEY"]);
  assert.equal(body.queue.status, "ready");
  assert.equal(body.tools.length, 3);
  assert.deepEqual(body.tools.find((tool) => tool.operation === "hermes_submit_draft").confirmation, {
    kind: "signed_expiring_challenge",
    version: "c1",
    algorithm: "HMAC-SHA256",
    ttl_seconds: 120,
    binds: ["operator_id", "session_id", "operation", "input_hash"],
    operation: "hermes_submit_draft",
  });
});

test("Hermes console proves authenticated runtime capabilities without exposing the API key", async () => {
  const calls = [];
  const apiKey = "hermes-secret-never-rendered";
  const hermesEnv = {
    NODE_ENV: "production",
    HERMES_CHAT_COMPLETIONS_URL: "https://hermes.example/v1/chat/completions",
    HERMES_API_KEY: apiKey,
    MS_REALTY_HERMES_AGENT_EVIDENCE_SCOPE: "live",
  };
  const config = appConfig({ authEnv: hermesEnv, hermesAgentFetch: healthyHermesFetch(calls) });
  const response = await renderAppAdminResponse(new Request(`${ORIGIN}/api/admin/hermes?locale=en`), { config });
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.runtime.status, "ready");
  assert.equal(body.runtime.model, "Hermes-4-14B");
  assert.deepEqual(body.runtime.checks.map((check) => check.status), ["pass", "pass"]);
  assert.equal(body.runtime.endpoint, "https://hermes.example/v1/chat/completions");
  assert.equal(calls.length, 2);
  assert.equal(calls[0].authorization, "");
  assert.equal(calls[1].authorization, `Bearer ${apiKey}`);
  assert.doesNotMatch(JSON.stringify(body), new RegExp(apiKey));
  assert.ok(body.queue.rows.every((row) => row.requires_human_approval && row.can_publish === false));

  const standalone = await dispatchHttp(
    createHttpApp({
      reviewedAt: GENERATED_AT,
      hermesEnv,
      hermesAgentFetch: healthyHermesFetch([]),
    }),
    { url: "/admin/hermes?locale=en", headers: { authorization: "Bearer local-admin-smoke" } },
  );
  assert.equal(standalone.status, 200);
  assert.match(standalone.body, /data-hermes-runtime="ready"/);
  assert.doesNotMatch(standalone.body, new RegExp(apiKey));

  const htmlRoute = await import("../../app/admin/hermes/route.js");
  const apiRoute = await import("../../app/api/admin/hermes/route.js");
  assert.equal(typeof htmlRoute.GET, "function");
  assert.equal(typeof htmlRoute.POST, "function");
  assert.equal(typeof apiRoute.GET, "function");
  assert.equal(typeof apiRoute.POST, "function");
});

test("Hermes owner command renders the same guarded durable plan in Next and standalone admin runtimes", async () => {
  const payload = fakeHermesReceiptPayload();
  const config = appConfig({
    hermesOwnerCommandProvider: async () => ownerPlan(),
    hermesReceiptPayload: payload,
    hermesReceiptSecret: RECEIPT_SECRET,
  });
  const form = new URLSearchParams({
    idempotencyKey: "hermes-admin-form-0001",
    command: "Prepare a safe plan for today's enquiries.",
    locale: "en",
  });
  const response = await renderAppAdminResponse(
    new Request(`${ORIGIN}/admin/hermes?locale=en`, {
      method: "POST",
      headers: {
        accept: "text/html",
        "content-type": "application/x-www-form-urlencoded",
        "sec-fetch-site": "same-origin",
      },
      body: form,
    }),
    { config },
  );
  const html = await response.text();
  assert.equal(response.status, 200);
  assert.match(html, /data-hermes-command-result="planned"/);
  assert.match(html, /Review the authenticated work queue before preparing drafts/);
  assert.match(html, /href="\/admin\/leads"/);
  assert.match(html, /Nothing was executed automatically/);
  assert.doesNotMatch(html, new RegExp(RECEIPT_SECRET));
  assert.equal(payload.docs.length, 1);

  const api = await renderAppAdminResponse(
    new Request(`${ORIGIN}/api/admin/hermes`, {
      method: "POST",
      headers: { "content-type": "application/json", "sec-fetch-site": "same-origin" },
      body: JSON.stringify(Object.fromEntries(form)),
    }),
    { config },
  );
  const apiBody = await api.json();
  assert.equal(api.status, 201);
  assert.equal(apiBody.receipt.idempotent, true);

  const standalonePayload = fakeHermesReceiptPayload();
  const standalone = await dispatchHttp(
    createHttpApp({
      reviewedAt: GENERATED_AT,
      hermesOwnerCommandProvider: async () => ownerPlan(),
      hermesReceiptPayload: standalonePayload,
      hermesReceiptSecret: RECEIPT_SECRET,
    }),
    {
      method: "POST",
      url: "/api/admin/hermes",
      headers: { authorization: "Bearer local-admin-smoke", "content-type": "application/json" },
      body: JSON.stringify({
        idempotencyKey: "hermes-standalone-0001",
        command: "Prepare a safe plan for today's enquiries.",
        locale: "en",
      }),
    },
  );
  assert.equal(standalone.status, 201);
  assert.equal(standalone.body.receipt.status, "planned");
  assert.equal(standalone.body.receipt.plan.steps[0].can_execute, false);
  assert.equal(standalonePayload.docs.length, 1);
});
