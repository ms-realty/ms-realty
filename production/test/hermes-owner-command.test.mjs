import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  HERMES_OWNER_RECEIPT_COLLECTION,
  HermesOwnerCommandError,
  readHermesOwnerReceipts,
  runHermesOwnerCommand as runHermesOwnerCommandWithoutWorkspace,
} from "../lib/hermes-owner-command.mjs";
import { createPrivateContactEnvelope, openPrivateContactEnvelope } from "../lib/private-contact-vault.mjs";

const SECRET = "hermes-owner-command-test-secret-longer-than-thirty-two-characters";
const STARTED_AT = "2026-08-28T12:00:00.000Z";
const COMPLETED_AT = "2026-08-28T12:00:01.000Z";
const TEST_WORKSPACE = "workspace-hermes-test";
const operator = { id: "payload-owner", roles: ["admin"], workspace_ids: [] };

function runHermesOwnerCommand(input, options = {}) {
  return runHermesOwnerCommandWithoutWorkspace(input, { workspaceId: TEST_WORKSPACE, ...options });
}

function fakePayload(seed = [], { receiptUniqueByWorkspace = false } = {}) {
  const docs = seed.map((doc, index) => ({ id: index + 1, ...doc }));
  return {
    docs,
    async find({ where, limit = 10 }) {
      let rows = [...docs];
      const provider = where?.provider?.equals;
      const key = where?.idempotency_key?.equals;
      const operatorId = where?.operator_id?.equals;
      const workspaceId = where?.workspace_id?.equals || where?.and?.find((clause) => clause.workspace_id)?.workspace_id?.equals;
      const scopedOperatorId = where?.and?.find((clause) => clause.operator_id)?.operator_id?.equals;
      if (provider) rows = rows.filter((doc) => doc.provider === provider);
      if (key) rows = rows.filter((doc) => doc.idempotency_key === key);
      if (operatorId || scopedOperatorId) rows = rows.filter((doc) => doc.operator_id === (operatorId || scopedOperatorId));
      if (workspaceId) rows = rows.filter((doc) => doc.workspace_id === workspaceId);
      rows.sort((left, right) => String(right.started_at).localeCompare(String(left.started_at)));
      return { docs: rows.slice(0, limit) };
    },
    async create({ data }) {
      assert.equal(data.status, "requested", "the durable fence exists before the model runs");
      if (
        docs.some(
          (doc) =>
            doc.idempotency_key === data.idempotency_key &&
            (!receiptUniqueByWorkspace || doc.workspace_id === data.workspace_id),
        )
      ) {
        throw Object.assign(new Error("duplicate key value violates unique constraint"), { code: "23505" });
      }
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

function connectedAiProvider({
  apiKey = "sk-or-v1-stored-openrouter-key-never-rendered",
  endpoint = "https://openrouter.ai/api/v1/chat/completions",
  model = "NousResearch/Hermes-4-14B",
} = {}) {
  return {
    provider: "ai",
    status: "connected",
    account_label: model,
    external_account_id: model,
    scopes: ["chat.completions"],
    metadata: { mode: "openrouter", endpoint, model },
    credential_envelope: createPrivateContactEnvelope(
      {
        subjectType: "provider_connection",
        subjectId: "ai",
        payload: { api_key: apiKey, endpoint, model },
      },
      { secret: SECRET, secretName: "MS_REALTY_PROVIDER_TOKEN_KEY", storedAt: STARTED_AT },
    ),
    last_verified_at: STARTED_AT,
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

function safeBusinessContext(overrides = {}) {
  return {
    generated_at: "2026-08-28T11:59:00.000Z",
    authoritative_state: { status: "available", source: "payload_postgres", authoritative: true },
    counts: { leads: 12, pipeline: 5, tasks: 9, listings: 144 },
    providers: [
      { id: "google", status: "connected", scopes: ["gmail.send", "calendar.events"], last_verified_at: "2026-08-28T11:00:00.000Z" },
      { id: "openrouter", status: "connected", scopes: ["chat.completions"], last_verified_at: "2026-08-28T11:30:00.000Z" },
    ],
    ...overrides,
  };
}

function storedReceipt(
  input,
  { status = "requested", failureCode = null, startedAt = STARTED_AT, plan = null, envelope = null, contextDigest = "sha256:none" } = {},
) {
  return {
    idempotency_key: input.idempotencyKey,
    operator_id: operator.id,
    workspace_id: TEST_WORKSPACE,
    status,
    command_digest: `sha256:${cryptoDigest(JSON.stringify({ command: input.command, locale: input.locale || "en", contextDigest }))}`,
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
          payload: { command: input.command, evidence: [], plan, locale: input.locale || "en", context_digest: contextDigest },
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
  assert.equal(result.duration_ms, 1_000);
  assert.equal(result.step_count, 1);
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

test("Hermes receipt observability remains safe for invalid timestamps and clock skew", async () => {
  const invalidInput = command({ idempotencyKey: "hermes-owner-invalid-duration" });
  const invalid = storedReceipt(invalidInput, { status: "failed", failureCode: "hermes_unavailable" });
  invalid.completed_at = "not-a-timestamp";
  const skewedInput = command({ idempotencyKey: "hermes-owner-clock-skew" });
  const skewed = storedReceipt(skewedInput, {
    status: "planned",
    startedAt: "2026-08-28T12:00:02.000Z",
    plan: safePlan(),
  });
  const receipts = await readHermesOwnerReceipts({
    payload: fakePayload([invalid, skewed]),
    operatorId: operator.id,
    secret: SECRET,
  });

  assert.equal(receipts.find((receipt) => receipt.idempotency_key === invalidInput.idempotencyKey).duration_ms, null);
  assert.equal(receipts.find((receipt) => receipt.idempotency_key === invalidInput.idempotencyKey).step_count, 0);
  assert.equal(receipts.find((receipt) => receipt.idempotency_key === skewedInput.idempotencyKey).duration_ms, 0);
  assert.equal(receipts.find((receipt) => receipt.idempotency_key === skewedInput.idempotencyKey).step_count, 1);
  assert.doesNotMatch(JSON.stringify(receipts), /Prepare a review plan/);
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

test("Hermes owner receipts are workspace-scoped and new commands persist their workspace", async () => {
  const workspaceA = "workspace-hermes-a";
  const workspaceB = "workspace-hermes-b";
  const firstInput = command({ idempotencyKey: "hermes-owner-workspace-a" });
  const secondInput = command({ idempotencyKey: "hermes-owner-workspace-b" });
  const payload = fakePayload([
    { ...storedReceipt(firstInput, { status: "planned", plan: safePlan() }), workspace_id: workspaceA },
    { ...storedReceipt(secondInput, { status: "planned", plan: safePlan() }), workspace_id: workspaceB },
  ]);
  const scoped = await readHermesOwnerReceipts({ payload, operatorId: operator.id, workspaceId: workspaceA, secret: SECRET });
  assert.deepEqual(scoped.map((receipt) => [receipt.idempotency_key, receipt.workspace_id]), [[firstInput.idempotencyKey, workspaceA]]);

  const createdPayload = fakePayload();
  await runHermesOwnerCommand(command({ idempotencyKey: "hermes-owner-workspace-new" }), {
    operator,
    workspaceId: workspaceB,
    payload: createdPayload,
    secret: SECRET,
    provider: async () => safePlan(),
    now: () => STARTED_AT,
  });
  assert.equal(createdPayload.docs[0].workspace_id, workspaceB);
});

test("Hermes receipt idempotency is scoped by workspace and global collisions are explicit", async () => {
  const workspaceA = "workspace-hermes-collision-a";
  const workspaceB = "workspace-hermes-collision-b";
  const input = command({ idempotencyKey: "hermes-owner-cross-workspace-key" });
  const run = (payload, workspaceId) =>
    runHermesOwnerCommand(input, {
      operator,
      workspaceId,
      payload,
      secret: SECRET,
      provider: async () => safePlan(),
      now: () => COMPLETED_AT,
    });

  const legacyGlobalPayload = fakePayload();
  await run(legacyGlobalPayload, workspaceA);
  await assert.rejects(
    run(legacyGlobalPayload, workspaceB),
    (error) => error instanceof HermesOwnerCommandError && error.code === "idempotency_conflict" && error.status === 409,
  );

  const workspaceScopedPayload = fakePayload([], { receiptUniqueByWorkspace: true });
  const first = await run(workspaceScopedPayload, workspaceA);
  const second = await run(workspaceScopedPayload, workspaceB);
  assert.equal(first.status, "planned");
  assert.equal(second.status, "planned");
  assert.deepEqual(
    workspaceScopedPayload.docs.map((doc) => [doc.idempotency_key, doc.workspace_id]),
    [
      [input.idempotencyKey, workspaceA],
      [input.idempotencyKey, workspaceB],
    ],
  );
});

test("Hermes owner commands refuse concurrent unscoped writes before fencing or provider work", async () => {
  const payload = fakePayload();
  let providerCalls = 0;
  const options = {
    operator,
    payload,
    secret: SECRET,
    provider: async () => {
      providerCalls += 1;
      return safePlan();
    },
    now: () => COMPLETED_AT,
  };
  const outcomes = await Promise.allSettled([
    runHermesOwnerCommandWithoutWorkspace(command({ idempotencyKey: "hermes-unscoped-race" }), options),
    runHermesOwnerCommandWithoutWorkspace(command({ idempotencyKey: "hermes-unscoped-race" }), options),
  ]);

  assert.deepEqual(
    outcomes.map((outcome) => [outcome.status, outcome.reason?.code, outcome.reason?.status]),
    [
      ["rejected", "hermes_workspace_required", 503],
      ["rejected", "hermes_workspace_required", 503],
    ],
  );
  assert.equal(providerCalls, 0);
  assert.equal(payload.docs.length, 0);
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

test("Hermes uses the encrypted owner OpenRouter connection when the managed runtime is not configured", async () => {
  const storedKey = "sk-or-v1-stored-openrouter-key-never-rendered";
  const payload = fakePayload([connectedAiProvider({ apiKey: storedKey })]);
  const timestamps = [STARTED_AT, COMPLETED_AT];
  let providerCalls = 0;
  const result = await runHermesOwnerCommand(command({ idempotencyKey: "hermes-owner-stored-openrouter" }), {
    operator,
    payload,
    secret: SECRET,
    env: {},
    fetchImpl: async (url, init) => {
      providerCalls += 1;
      assert.equal(url, "https://openrouter.ai/api/v1/chat/completions");
      assert.equal(init.headers.authorization, `Bearer ${storedKey}`);
      assert.match(init.body, /NousResearch\/Hermes-4-14B/);
      assert.doesNotMatch(init.body, /managed\/fallback-model/);
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(safePlan()) } }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
    now: () => timestamps.shift() || COMPLETED_AT,
  });
  assert.equal(providerCalls, 1);
  assert.equal(result.status, "planned");
  assert.equal(result.model, "NousResearch/Hermes-4-14B");
  assert.equal(JSON.stringify(payload.docs).includes(storedKey), false);
});

test("Hermes does not let an owner OpenRouter credential override the selected self-hosted runtime", async () => {
  const storedKey = "sk-or-v1-stored-openrouter-key-never-rendered";
  const payload = fakePayload([connectedAiProvider({ apiKey: storedKey })]);
  const timestamps = [STARTED_AT, COMPLETED_AT];
  const result = await runHermesOwnerCommand(command({ idempotencyKey: "hermes-owner-managed-policy" }), {
    operator,
    payload,
    secret: SECRET,
    env: {
      HERMES_PROVIDER_MODE: "self_hosted",
      HERMES_CHAT_COMPLETIONS_URL: "https://managed-hermes.example/v1/chat/completions",
      HERMES_API_KEY: "managed-runtime-key-not-rendered",
      HERMES_MODEL: "managed/runtime-model",
    },
    fetchImpl: async (url, init) => {
      assert.equal(url, "https://managed-hermes.example/v1/chat/completions");
      assert.equal(init.headers.authorization, "Bearer managed-runtime-key-not-rendered");
      assert.equal(init.body.includes(storedKey), false);
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(safePlan()) } }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
    now: () => timestamps.shift() || COMPLETED_AT,
  });
  assert.equal(result.status, "planned");
  assert.equal(result.model, "managed/runtime-model");
  assert.equal(JSON.stringify(payload.docs).includes(storedKey), false);
});

test("stored OpenRouter failures expose only a fixed code, never provider or key values", async () => {
  const storedKey = "sk-or-v1-rejected-openrouter-key-never-rendered";
  const payload = fakePayload([connectedAiProvider({ apiKey: storedKey })]);
  const timestamps = [STARTED_AT, COMPLETED_AT];
  let exposedError;
  try {
    await runHermesOwnerCommand(command({ idempotencyKey: "hermes-owner-stored-openrouter-failure" }), {
      operator,
      payload,
      secret: SECRET,
      env: { HERMES_PROVIDER_MODE: "openrouter" },
      fetchImpl: async () =>
        new Response(JSON.stringify({ error: { message: `provider rejected ${storedKey}` } }), {
          status: 401,
          headers: { "content-type": "application/json" },
        }),
      now: () => timestamps.shift() || COMPLETED_AT,
    });
  } catch (error) {
    exposedError = error;
  }
  assert.ok(exposedError instanceof HermesOwnerCommandError);
  assert.equal(exposedError.code, "hermes_provider_unauthorized");
  assert.equal(exposedError.status, 503);
  assert.equal(exposedError.message.includes(storedKey), false);
  const receipt = payload.docs.find((doc) => doc.idempotency_key === "hermes-owner-stored-openrouter-failure");
  assert.equal(receipt.failure_code, "hermes_provider_unauthorized");
  assert.equal(JSON.stringify(payload.docs).includes(storedKey), false);
});

test("a broken stored OpenRouter credential still leaves a terminal durable receipt", async () => {
  const payload = fakePayload([
    connectedAiProvider({ apiKey: "sk-or-v1-stored-under-a-different-secret" }),
  ]);
  const timestamps = [STARTED_AT, COMPLETED_AT];
  let exposedError;
  try {
    await runHermesOwnerCommand(command({ idempotencyKey: "hermes-owner-broken-stored-openrouter" }), {
      operator,
      payload,
      secret: "different-hermes-owner-secret-longer-than-thirty-two-characters",
      env: { HERMES_PROVIDER_MODE: "openrouter" },
      fetchImpl: async () => {
        throw new Error("provider must not be called");
      },
      now: () => timestamps.shift() || COMPLETED_AT,
    });
  } catch (error) {
    exposedError = error;
  }

  assert.ok(exposedError instanceof HermesOwnerCommandError);
  assert.equal(exposedError.code, "hermes_unavailable");
  const receipt = payload.docs.find((doc) => doc.idempotency_key === "hermes-owner-broken-stored-openrouter");
  assert.equal(receipt.status, "failed");
  assert.equal(receipt.failure_code, "hermes_unavailable");
});

test("Hermes owner command passes privacy-safe business context to the provider and binds it into the receipt", async () => {
  const payload = fakePayload();
  const timestamps = [STARTED_AT, COMPLETED_AT];
  const context = safeBusinessContext();
  let providerInput = null;

  const result = await runHermesOwnerCommand(command({ idempotencyKey: "hermes-owner-context" }), {
    operator,
    payload,
    secret: SECRET,
    provider: async (input) => {
      providerInput = input;
      return safePlan();
    },
    businessContext: context,
    requireBusinessContext: true,
    now: () => timestamps.shift() || COMPLETED_AT,
  });

  assert.equal(result.status, "planned");
  assert.deepEqual(providerInput.businessContext, {
    generated_at: context.generated_at,
    authoritative_state: context.authoritative_state,
    counts: context.counts,
    providers: [
      { id: "google", status: "connected", scopes: ["calendar.events", "gmail.send"], last_verified_at: "2026-08-28T11:00:00.000Z" },
      { id: "openrouter", status: "connected", scopes: ["chat.completions"], last_verified_at: "2026-08-28T11:30:00.000Z" },
    ],
  });
  assert.equal(providerInput.contextDigest.startsWith("sha256:"), true);
  assert.doesNotMatch(JSON.stringify(providerInput.businessContext), /office@|\\+359|peycheff/i);
  const opened = openPrivateContactEnvelope(payload.docs[0].receipt_envelope, {
    secret: SECRET,
    secretName: "MS_REALTY_PROVIDER_TOKEN_KEY",
  });
  assert.equal(opened.payload.locale, "en");
  assert.equal(opened.payload.context_digest, providerInput.contextDigest);
});

test("Hermes owner command fails before the model when authoritative business context is unavailable", async () => {
  const payload = fakePayload();
  let providerCalls = 0;

  await assert.rejects(
    runHermesOwnerCommand(command({ idempotencyKey: "hermes-owner-no-context" }), {
      operator,
      payload,
      secret: SECRET,
      provider: async () => {
        providerCalls += 1;
        return safePlan();
      },
      requireBusinessContext: true,
    }),
    (error) => error instanceof HermesOwnerCommandError && error.code === "hermes_context_unavailable" && error.status === 503,
  );
  assert.equal(providerCalls, 0);
  assert.equal(payload.docs.length, 0);

  await assert.rejects(
    runHermesOwnerCommand(command({ idempotencyKey: "hermes-owner-bad-context" }), {
      operator,
      payload: fakePayload(),
      secret: SECRET,
      provider: async () => safePlan(),
      businessContext: safeBusinessContext({
        authoritative_state: { status: "unavailable", source: "payload_postgres", authoritative: false, reason_key: "runtime_unavailable" },
      }),
      requireBusinessContext: true,
    }),
    (error) => error instanceof HermesOwnerCommandError && error.code === "hermes_context_unavailable" && error.status === 503,
  );
});

test("malformed business-context text and timestamps fail as hermes_context_unavailable", async () => {
  await assert.rejects(
    runHermesOwnerCommand(command({ idempotencyKey: "hermes-owner-bad-context-text" }), {
      operator,
      payload: fakePayload(),
      secret: SECRET,
      provider: async () => safePlan(),
      businessContext: safeBusinessContext({
        authoritative_state: { status: "", source: "payload_postgres", authoritative: true },
      }),
      requireBusinessContext: true,
    }),
    (error) => error instanceof HermesOwnerCommandError && error.code === "hermes_context_unavailable" && error.status === 503,
  );

  await assert.rejects(
    runHermesOwnerCommand(command({ idempotencyKey: "hermes-owner-bad-context-time" }), {
      operator,
      payload: fakePayload(),
      secret: SECRET,
      provider: async () => safePlan(),
      businessContext: safeBusinessContext({
        providers: [{ id: "google", status: "connected", scopes: ["gmail.send"], last_verified_at: "not-a-date" }],
      }),
      requireBusinessContext: true,
    }),
    (error) => error instanceof HermesOwnerCommandError && error.code === "hermes_context_unavailable" && error.status === 503,
  );
});

test("OpenRouter owner-command planning rejects raw contact data before provider execution", async () => {
  let providerCalls = 0;
  await assert.rejects(
    runHermesOwnerCommand(
      command({
        idempotencyKey: "hermes-owner-pii",
        command: "Email peycheff.com@gmail.com and call +359 888 123 456 about the lead.",
      }),
      {
        operator,
        payload: fakePayload(),
        secret: SECRET,
        env: {
          HERMES_PROVIDER_MODE: "openrouter",
          HERMES_API_KEY: "openrouter-test-key",
          HERMES_MODEL: "openrouter/test-model",
        },
        provider: async () => {
          providerCalls += 1;
          return safePlan();
        },
        providerMetadata: { mode: "openrouter" },
      },
    ),
    (error) => error instanceof HermesOwnerCommandError && error.code === "hermes_command_contains_sensitive_data" && error.status === 400,
  );
  assert.equal(providerCalls, 0);
});

test("the connected OpenRouter credential rejects raw contact data before any provider call", async () => {
  const payload = fakePayload([connectedAiProvider()]);
  let providerCalls = 0;
  await assert.rejects(
    runHermesOwnerCommand(
      command({
        idempotencyKey: "hermes-owner-connected-pii",
        command: "Prepare a plan for owner@example.com and +359 888 123 456.",
      }),
      {
        operator,
        payload,
        secret: SECRET,
        env: { HERMES_PROVIDER_MODE: "openrouter" },
        fetchImpl: async () => {
          providerCalls += 1;
          throw new Error("must not call OpenRouter");
        },
      },
    ),
    (error) => error instanceof HermesOwnerCommandError && error.code === "hermes_command_contains_sensitive_data" && error.status === 400,
  );
  assert.equal(providerCalls, 0);
  assert.equal(payload.docs.some((doc) => doc.idempotency_key === "hermes-owner-connected-pii"), false);
});

test("OpenRouter owner-command planning does not misclassify bare listing references as phone numbers", async () => {
  let providerCalls = 0;
  const result = await runHermesOwnerCommand(
    command({
      idempotencyKey: "hermes-owner-listing-ref",
      command: "Prepare a review plan for listing reference 12345678 and its translation queue.",
    }),
    {
      operator,
      payload: fakePayload(),
      secret: SECRET,
      provider: async () => {
        providerCalls += 1;
        return safePlan();
      },
      providerMetadata: { mode: "openrouter" },
      businessContext: safeBusinessContext(),
      requireBusinessContext: true,
    },
  );
  assert.equal(result.status, "planned");
  assert.equal(providerCalls, 1);
});

test("Hermes owner command idempotency conflicts when locale or business context changes", async () => {
  const payload = fakePayload();
  const timestamps = [STARTED_AT, COMPLETED_AT];
  const input = command({ idempotencyKey: "hermes-owner-context-conflict" });
  const context = safeBusinessContext();

  await runHermesOwnerCommand(input, {
    operator,
    payload,
    secret: SECRET,
    provider: async () => safePlan(),
    businessContext: context,
    requireBusinessContext: true,
    now: () => timestamps.shift() || COMPLETED_AT,
  });

  await assert.rejects(
    runHermesOwnerCommand({ ...input, locale: "bg" }, {
      operator,
      payload,
      secret: SECRET,
      provider: async () => safePlan(),
      businessContext: context,
      requireBusinessContext: true,
      now: () => COMPLETED_AT,
    }),
    (error) => error instanceof HermesOwnerCommandError && error.code === "idempotency_conflict" && error.status === 409,
  );

  await assert.rejects(
    runHermesOwnerCommand(input, {
      operator,
      payload,
      secret: SECRET,
      provider: async () => safePlan(),
      businessContext: safeBusinessContext({ counts: { leads: 13, pipeline: 5, tasks: 9, listings: 144 } }),
      requireBusinessContext: true,
      now: () => COMPLETED_AT,
    }),
    (error) => error instanceof HermesOwnerCommandError && error.code === "idempotency_conflict" && error.status === 409,
  );
});

test("OpenRouter owner-command planning maps provider status and transport failures to typed safe errors", async () => {
  const cases = [
    { idempotencyKey: "hermes-owner-401", fetchImpl: async () => new Response("nope", { status: 401 }), code: "hermes_provider_unauthorized" },
    { idempotencyKey: "hermes-owner-402", fetchImpl: async () => new Response("nope", { status: 402 }), code: "hermes_provider_payment_required" },
    { idempotencyKey: "hermes-owner-429", fetchImpl: async () => new Response("nope", { status: 429 }), code: "hermes_provider_rate_limited" },
    { idempotencyKey: "hermes-owner-503", fetchImpl: async () => new Response("nope", { status: 503 }), code: "hermes_provider_service_unavailable" },
    {
      idempotencyKey: "hermes-owner-timeout",
      fetchImpl: async () => {
        const error = new Error("request timed out");
        error.name = "TimeoutError";
        throw error;
      },
      code: "hermes_provider_timeout",
    },
    {
      idempotencyKey: "hermes-owner-network",
      fetchImpl: async () => {
        const error = new Error("fetch failed");
        error.code = "ENOTFOUND";
        throw error;
      },
      code: "hermes_provider_network",
    },
  ];

  for (const entry of cases) {
    const payload = fakePayload();
    const timestamps = [STARTED_AT, COMPLETED_AT];
    await assert.rejects(
      runHermesOwnerCommand(command({ idempotencyKey: entry.idempotencyKey }), {
        operator,
        payload,
        secret: SECRET,
        env: {
          HERMES_PROVIDER_MODE: "openrouter",
          HERMES_API_KEY: "openrouter-test-key",
          HERMES_MODEL: "openrouter/test-model",
        },
        fetchImpl: entry.fetchImpl,
        businessContext: safeBusinessContext(),
        requireBusinessContext: true,
        now: () => timestamps.shift() || COMPLETED_AT,
      }),
      (error) => error instanceof HermesOwnerCommandError && error.code === entry.code && error.status === 503,
    );
    assert.equal(payload.docs[0].status, "failed");
    assert.equal(payload.docs[0].failure_code, entry.code);
  }
});
