import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  HERMES_OWNER_RECEIPT_COLLECTION,
  HermesOwnerCommandError,
  readHermesOwnerReceipts,
  runHermesOwnerCommand,
} from "../lib/hermes-owner-command.mjs";
import { createPrivateContactEnvelope, openPrivateContactEnvelope } from "../lib/private-contact-vault.mjs";

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

function storedReceipt(input, { status = "requested", failureCode = null, startedAt = STARTED_AT, plan = null, envelope = null } = {}) {
  return {
    idempotency_key: input.idempotencyKey,
    operator_id: operator.id,
    status,
    command_digest: `sha256:${cryptoDigest(input.command)}`,
    model: "injected",
    evidence_refs: [],
    started_at: startedAt,
    completed_at: status === "requested" ? null : COMPLETED_AT,
    failure_code: failureCode,
    receipt_envelope:
      envelope ||
      createPrivateContactEnvelope(
        {
          subjectType: "hermes_owner_command",
          subjectId: input.idempotencyKey,
          payload: { command: input.command, evidence: [], plan },
        },
        { secret: SECRET, secretName: "MS_REALTY_PROVIDER_TOKEN_KEY", storedAt: startedAt },
      ),
  };
}

function cryptoDigest(value) {
  return createHash("sha256").update(value).digest("hex");
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

test("failed receipts are terminal and return their stored failure", async () => {
  const input = command({ idempotencyKey: "hermes-owner-failed" });
  const payload = fakePayload([storedReceipt(input, { status: "failed", failureCode: "hermes_invalid_plan" })]);
  let providerCalls = 0;

  await assert.rejects(
    runHermesOwnerCommand(input, {
      operator,
      payload,
      secret: SECRET,
      provider: async () => {
        providerCalls += 1;
        return safePlan();
      },
      now: () => COMPLETED_AT,
    }),
    (error) =>
      error instanceof HermesOwnerCommandError &&
      error.code === "hermes_invalid_plan" &&
      error.status === 502 &&
      error.receipt?.status === "failed" &&
      error.receipt?.failure_code === "hermes_invalid_plan",
  );
  assert.equal(providerCalls, 0);
  assert.equal((await readHermesOwnerReceipts({ payload, operatorId: operator.id, secret: SECRET }))[0].failure_code, "hermes_invalid_plan");
});

test("stale requested receipts expire to a bounded terminal failure", async () => {
  const input = command({ idempotencyKey: "hermes-owner-stale" });
  const payload = fakePayload([storedReceipt(input)]);
  let providerCalls = 0;

  await assert.rejects(
    runHermesOwnerCommand(input, {
      operator,
      payload,
      secret: SECRET,
      provider: async () => {
        providerCalls += 1;
        return safePlan();
      },
      now: () => "2026-08-28T12:01:01.000Z",
    }),
    (error) =>
      error instanceof HermesOwnerCommandError &&
      error.code === "hermes_command_expired" &&
      error.status === 502 &&
      error.receipt?.status === "failed" &&
      error.receipt?.failure_code === "hermes_command_expired",
  );
  assert.equal(providerCalls, 0);
  assert.equal(payload.docs[0].status, "failed");
  assert.equal(payload.docs[0].failure_code, "hermes_command_expired");
});

test("corrupt receipt envelopes fail closed without invoking Hermes", async () => {
  const input = command({ idempotencyKey: "hermes-owner-corrupt" });
  const payload = fakePayload([storedReceipt(input, { envelope: { algorithm: "aes-256-gcm", ciphertext: "corrupt" } })]);
  let providerCalls = 0;

  await assert.rejects(
    runHermesOwnerCommand(input, {
      operator,
      payload,
      secret: SECRET,
      provider: async () => {
        providerCalls += 1;
        return safePlan();
      },
    }),
    (error) => error instanceof HermesOwnerCommandError && error.code === "hermes_receipt_unavailable" && error.status === 503,
  );
  assert.equal(providerCalls, 0);
  await assert.rejects(
    readHermesOwnerReceipts({ payload, operatorId: operator.id, secret: SECRET }),
    (error) => error instanceof HermesOwnerCommandError && error.code === "hermes_receipt_unavailable" && error.status === 503,
  );
});

test("create races re-read the durable receipt instead of running a duplicate", async () => {
  const input = command({ idempotencyKey: "hermes-owner-create-race" });
  const raced = storedReceipt(input, { status: "failed", failureCode: "hermes_invalid_plan" });
  const payload = fakePayload([raced]);
  let providerCalls = 0;
  const originalCreate = payload.create;
  payload.create = async ({ data }) => {
    // Simulate another request winning the unique idempotency-key insert.
    assert.equal(data.idempotency_key, input.idempotencyKey);
    await originalCreate({ data }).catch(() => {});
    throw new Error("duplicate");
  };

  await assert.rejects(
    runHermesOwnerCommand(input, {
      operator,
      payload,
      secret: SECRET,
      provider: async () => {
        providerCalls += 1;
        return safePlan();
      },
      now: () => COMPLETED_AT,
    }),
    (error) => error instanceof HermesOwnerCommandError && error.code === "hermes_invalid_plan" && error.receipt?.status === "failed",
  );
  assert.equal(providerCalls, 0);
  assert.equal(payload.docs.filter((doc) => doc.idempotency_key === input.idempotencyKey).length, 1);
});

test("update races re-read a terminal receipt and return the winning plan", async () => {
  const payload = fakePayload();
  const timestamps = [STARTED_AT, COMPLETED_AT];
  let updateCalls = 0;
  const originalUpdate = payload.update;
  payload.update = async (args) => {
    updateCalls += 1;
    const result = await originalUpdate(args);
    if (args.data.status === "planned") throw new Error("stale update response");
    return result;
  };

  const result = await runHermesOwnerCommand(command({ idempotencyKey: "hermes-owner-update-race" }), {
    operator,
    payload,
    secret: SECRET,
    provider: async () => safePlan(),
    now: () => timestamps.shift() || COMPLETED_AT,
  });

  assert.equal(updateCalls, 1);
  assert.equal(result.status, "planned");
  assert.equal(result.idempotent, false);
  assert.equal(payload.docs[0].status, "planned");
});

test("conditional receipt transitions do not overwrite a plan won by a stale expiry", async () => {
  const input = command({ idempotencyKey: "hermes-owner-conditional-race" });
  const requested = storedReceipt(input);
  const winningPlan = storedReceipt(input, { status: "planned", plan: safePlan() });
  const payload = fakePayload([requested]);
  const originalUpdate = payload.update;
  payload.update = async (args) => {
    if (args.data.status === "failed") {
      payload.docs[0] = { ...payload.docs[0], ...winningPlan };
    }
    return originalUpdate(args);
  };

  const result = await runHermesOwnerCommand(input, {
    operator,
    payload,
    secret: SECRET,
    provider: async () => {
      throw new Error("a stale request must not invoke Hermes");
    },
    now: () => "2026-08-28T12:01:01.000Z",
  });

  assert.equal(result.status, "planned");
  assert.equal(result.idempotent, true);
  assert.equal(payload.docs[0].status, "planned");
});

test("OpenRouter owner-command planning uses the provisioned hosted endpoint", async () => {
  const payload = fakePayload();
  const timestamps = [STARTED_AT, COMPLETED_AT];
  let calledUrl = null;
  const result = await runHermesOwnerCommand(command({ idempotencyKey: "hermes-owner-openrouter" }), {
    operator,
    payload,
    secret: SECRET,
    env: {
      HERMES_PROVIDER_MODE: "openrouter",
      HERMES_API_KEY: "openrouter-test-key",
      HERMES_MODEL: "openrouter/test-model",
    },
    fetchImpl: async (url, init) => {
      calledUrl = url;
      assert.equal(init.headers.authorization, "Bearer openrouter-test-key");
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(safePlan()) } }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
    now: () => timestamps.shift() || COMPLETED_AT,
  });

  assert.equal(result.status, "planned");
  assert.equal(calledUrl, "https://openrouter.ai/api/v1/chat/completions");
  assert.equal(result.model, "openrouter/test-model");
});
