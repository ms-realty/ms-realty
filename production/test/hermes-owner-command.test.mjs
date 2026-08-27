import test from "node:test";
import assert from "node:assert/strict";
import {
  HERMES_OWNER_RECEIPT_COLLECTION,
  HermesOwnerCommandError,
  readHermesOwnerReceipts,
  runHermesOwnerCommand,
} from "../lib/hermes-owner-command.mjs";
import { openPrivateContactEnvelope } from "../lib/private-contact-vault.mjs";

const SECRET = "hermes-owner-command-test-secret-longer-than-thirty-two-characters";
const STARTED_AT = "2026-08-28T12:00:00.000Z";
const COMPLETED_AT = "2026-08-28T12:00:01.000Z";
const operator = { id: "payload-owner", roles: ["admin"], workspace_ids: [] };

function fakePayload(seed = []) {
  const docs = seed.map((doc, index) => ({ id: index + 1, ...doc }));
  return {
    docs,
    async find({ where, limit = 10 }) {
      let rows = [...docs];
      const key = where?.idempotency_key?.equals;
      const operatorId = where?.operator_id?.equals;
      if (key) rows = rows.filter((doc) => doc.idempotency_key === key);
      if (operatorId) rows = rows.filter((doc) => doc.operator_id === operatorId);
      rows.sort((left, right) => String(right.started_at).localeCompare(String(left.started_at)));
      return { docs: rows.slice(0, limit) };
    },
    async create({ data }) {
      assert.equal(data.status, "requested", "the durable fence exists before the model runs");
      if (docs.some((doc) => doc.idempotency_key === data.idempotency_key)) throw new Error("duplicate");
      const doc = { id: docs.length + 1, ...data };
      docs.push(doc);
      return doc;
    },
    async update({ id, data }) {
      const index = docs.findIndex((doc) => doc.id === id);
      if (index < 0) throw new Error("missing receipt");
      docs[index] = { ...docs[index], ...data };
      return docs[index];
    },
  };
}

function command(overrides = {}) {
  return {
    idempotencyKey: "hermes-owner-0001",
    command: "Prepare a review plan for today's enquiries.",
    locale: "en",
    ...overrides,
  };
}

function safePlan() {
  return {
    summary: "Review today's enquiry work before drafting any follow-up.",
    steps: [
      {
        title: "Open the work queue",
        why: "The authenticated queue is the source for the next review.",
        destination: "work",
        mode: "review",
        evidence: ["authenticated_owner_scope", "admin_destination_map"],
      },
    ],
    questions: ["Which enquiries should be prioritised?"],
  };
}

test("Hermes owner commands persist an encrypted fence, return a non-executing plan, and retry idempotently", async () => {
  const payload = fakePayload();
  let providerCalls = 0;
  const timestamps = [STARTED_AT, COMPLETED_AT];
  const options = {
    operator,
    payload,
    secret: SECRET,
    provider: async ({ evidence, destinations }) => {
      providerCalls += 1;
      assert.equal(payload.docs.length, 1);
      assert.equal(payload.docs[0].status, "requested");
      assert.ok(evidence.some((row) => row.id === "hermes_guardrails"));
      assert.equal(destinations.length, 7);
      return safePlan();
    },
    now: () => timestamps.shift() || COMPLETED_AT,
  };

  const result = await runHermesOwnerCommand(command(), options);
  assert.equal(result.status, "planned");
  assert.equal(result.plan.steps[0].admin_path, "/admin/leads");
  assert.equal(result.plan.steps[0].requires_human_approval, true);
  assert.equal(result.plan.steps[0].can_execute, false);
  assert.equal(providerCalls, 1);
  assert.doesNotMatch(JSON.stringify(payload.docs[0]), /Prepare a review plan|Open the work queue/);

  const opened = openPrivateContactEnvelope(payload.docs[0].receipt_envelope, {
    secret: SECRET,
    secretName: "MS_REALTY_PROVIDER_TOKEN_KEY",
  });
  assert.equal(opened.payload.command, command().command);
  assert.equal(opened.payload.plan.summary, safePlan().summary);

  const repeated = await runHermesOwnerCommand(command(), { ...options, now: () => COMPLETED_AT });
  assert.equal(repeated.idempotent, true);
  assert.equal(providerCalls, 1);
  assert.deepEqual(await readHermesOwnerReceipts({ payload, operatorId: operator.id, secret: SECRET }), [
    { ...result, idempotent: false },
  ]);
});

test("Hermes owner command rejects provider tool calls and records only a fixed failure code", async () => {
  const payload = fakePayload();
  const timestamps = [STARTED_AT, COMPLETED_AT];
  await assert.rejects(
    runHermesOwnerCommand(command({ idempotencyKey: "hermes-owner-tools" }), {
      operator,
      payload,
      secret: SECRET,
      env: {
        HERMES_PROVIDER_MODE: "self_hosted",
        HERMES_CHAT_COMPLETIONS_URL: "https://hermes.example/v1/chat/completions",
        HERMES_API_KEY: "not-rendered",
      },
      fetchImpl: async (_url, init) => {
        assert.equal(init.signal.aborted, false);
        return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(safePlan()), tool_calls: [{ id: "unsafe" }] } }] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
      now: () => timestamps.shift() || COMPLETED_AT,
    }),
    (error) => error instanceof HermesOwnerCommandError && error.code === "hermes_invalid_plan" && error.status === 502,
  );
  assert.equal(payload.docs[0].status, "failed");
  assert.equal(payload.docs[0].failure_code, "hermes_invalid_plan");
  assert.doesNotMatch(JSON.stringify(payload.docs[0]), /unsafe|not-rendered/);
});

test("Hermes owner command fails before the model without a durable receipt key", async () => {
  let providerCalls = 0;
  await assert.rejects(
    runHermesOwnerCommand(command(), {
      operator,
      payload: fakePayload(),
      secret: "short",
      provider: async () => {
        providerCalls += 1;
        return safePlan();
      },
    }),
    (error) => error instanceof HermesOwnerCommandError && error.code === "hermes_receipt_unavailable",
  );
  assert.equal(providerCalls, 0);
  assert.equal(HERMES_OWNER_RECEIPT_COLLECTION.slug, "hermes_owner_receipts");
  assert.equal(HERMES_OWNER_RECEIPT_COLLECTION.access.read(), false);
  assert.equal(HERMES_OWNER_RECEIPT_COLLECTION.access.create(), false);
});

test("Hermes owner command receipts cannot be replayed across operators", async () => {
  const payload = fakePayload();
  const timestamps = [STARTED_AT, COMPLETED_AT];
  await runHermesOwnerCommand(command(), {
    operator,
    payload,
    secret: SECRET,
    provider: async () => safePlan(),
    now: () => timestamps.shift() || COMPLETED_AT,
  });

  let providerCalls = 0;
  await assert.rejects(
    runHermesOwnerCommand(command(), {
      operator: { ...operator, id: "another-owner" },
      payload,
      secret: SECRET,
      provider: async () => {
        providerCalls += 1;
        return safePlan();
      },
      now: () => COMPLETED_AT,
    }),
    (error) => error instanceof HermesOwnerCommandError && error.code === "idempotency_conflict" && error.status === 409,
  );
  assert.equal(providerCalls, 0);
});
