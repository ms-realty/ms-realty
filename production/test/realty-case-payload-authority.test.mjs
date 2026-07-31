import assert from "node:assert/strict";
import test from "node:test";
import { executeAutonomousRealtyCases } from "../lib/realty-case-executor.mjs";
import {
  appendRealtyCaseConditionActionInPayload,
  appendRealtyCaseActionInPayload,
  assertRealtyCasePayloadAuthorityConfig,
  openRealtyCaseConditionInPayload,
  openRealtyCaseInPayload,
  readRealtyCasePayloadAuthorityHistory,
} from "../lib/realty-case-payload-authority.mjs";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
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

function caseInput(id = "case-authority-1") {
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
    actor: "broker-sandanski-1",
    executorKind: "human",
  };
}

test("Payload authority records, reads, and retries RealtyCase and condition events without a ledger", async () => {
  const target = fakePayload();
  const options = { payload: target.payload, workspaceId: "workspace-sandanski" };
  const opened = await openRealtyCaseInPayload(caseInput(), { ...options, recordedAt: "2026-07-30T08:05:00.000Z" });
  assert.equal(opened.idempotent, false);
  assert.equal(target.rows.realty_cases.length, 1);
  assert.equal(target.rows.realty_case_events.length, 1);
  assert.equal(target.rows.realty_case_mandate_versions.length, 1);
  assert.equal(target.rows.realty_case_outbox.length, 1);

  const retriedOpen = await openRealtyCaseInPayload(caseInput(), { ...options, recordedAt: "2026-07-30T08:05:00.000Z" });
  assert.equal(retriedOpen.idempotent, true);
  assert.equal(target.rows.realty_case_events.length, 1);

  const openedCondition = await openRealtyCaseConditionInPayload(
    {
      eventId: "condition-authority-open",
      caseId: opened.case.id,
      conditionId: "title-clearance",
      type: "title_clearance",
      dueAt: "2026-07-31T09:00:00.000Z",
      requiredEvidenceProducerRefs: ["registry://property-register"],
      actor: "broker-sandanski-1",
      executorKind: "human",
    },
    { ...options, recordedAt: "2026-07-30T08:10:00.000Z" },
  );
  assert.equal(openedCondition.idempotent, false);

  const blocked = await appendRealtyCaseConditionActionInPayload(
    {
      eventId: "condition-authority-blocked",
      caseId: opened.case.id,
      conditionId: "title-clearance",
      action: "condition_blocked",
      reasonCode: "awaiting_registry_reply",
      actor: "broker-sandanski-1",
      executorKind: "human",
    },
    { ...options, recordedAt: "2026-07-30T08:15:00.000Z" },
  );
  assert.equal(blocked.condition.status, "blocked");
  const retriedBlocked = await appendRealtyCaseConditionActionInPayload(
    {
      eventId: "condition-authority-blocked",
      caseId: opened.case.id,
      conditionId: "title-clearance",
      action: "condition_blocked",
      reasonCode: "awaiting_registry_reply",
      actor: "broker-sandanski-1",
      executorKind: "human",
    },
    { ...options, recordedAt: "2026-07-30T08:15:00.000Z" },
  );
  assert.equal(retriedBlocked.idempotent, true);

  const frozen = await appendRealtyCaseActionInPayload(
    {
      id: "case-authority-frozen",
      caseId: opened.case.id,
      action: "case_frozen",
      authorityRef: "authority://client/instruction",
      reasonCode: "awaiting_client_instruction",
      actor: "broker-sandanski-1",
      executorKind: "human",
    },
    { ...options, recordedAt: "2026-07-30T08:20:00.000Z" },
  );
  assert.equal(frozen.case.status, "frozen");

  const history = await readRealtyCasePayloadAuthorityHistory(options);
  assert.deepEqual(history.caseEvents.map((event) => event.id), [opened.event.id, frozen.event.id]);
  assert.deepEqual(history.conditionEvents.map((event) => event.id), [openedCondition.event.id, blocked.event.id]);
  assert.equal(history.conditionEvents.at(-1).reason_code, "awaiting_registry_reply");
  assert.equal(target.rows.realty_case_condition_events.length, 2);
  assert.equal(target.rows.realty_case_outbox.length, 2);
});

test("Payload authority rolls back a failed first write and never reports a recorded source", async () => {
  const target = fakePayload({ failOnCreate: "realty_case_events" });
  await assert.rejects(
    () => openRealtyCaseInPayload(caseInput("case-authority-failure"), {
      payload: target.payload,
      workspaceId: "workspace-sandanski",
      recordedAt: "2026-07-30T08:05:00.000Z",
    }),
    (error) => error.status === 503,
  );
  assert.equal(target.calls.rollback, 1);
  assert.equal(target.rows.realty_cases.length, 0);
  assert.equal(target.rows.realty_case_events.length, 0);
  assert.equal(target.rows.realty_case_outbox.length, 0);
});

test("autonomous execution reads and records through Payload authority", async () => {
  const target = fakePayload();
  const options = { payload: target.payload, workspaceId: "workspace-sandanski" };
  await openRealtyCaseInPayload(
    {
      ...caseInput("case-authority-autonomous"),
      executionMode: "autonomous",
      assuranceRef: "assurance://trusted-executor/profile-1",
      actor: "trusted-agent-1",
      executorKind: "agent",
    },
    { ...options, recordedAt: "2026-07-30T08:00:00.000Z" },
  );
  let approvedIntentId = null;
  const execution = await executeAutonomousRealtyCases({
    ...options,
    payloadAuthority: true,
    actor: "trusted-executor-1",
    now: "2026-07-30T09:00:00.000Z",
    executor: (intent) => {
      if (approvedIntentId && intent.id !== approvedIntentId) return null;
      approvedIntentId = intent.id;
      return {
        action: "step_completed",
        evidenceRefs: [
          {
            ref: `evidence://${intent.case_id}/${intent.step_key}`,
            type: "case_step_record",
            producerKind: intent.accepted_evidence_producers[0],
          },
        ],
      };
    },
  });
  assert.equal(execution.recorded, 1);
  assert.equal(target.rows.realty_case_events.length, 2);
  assert.equal((await readRealtyCasePayloadAuthorityHistory(options)).caseEvents.at(-1).executor_kind, "agent");
});

test("Payload authority config rejects projection dual-write, missing prerequisites, and malformed runtimes", async () => {
  assert.throws(
    () =>
      assertRealtyCasePayloadAuthorityConfig({
        realtyCasePayloadAuthorityEnabled: true,
        realtyCaseRequestProjectionEnabled: true,
        realtyCaseWorkspaceId: "workspace-sandanski",
        realtyCasePayload: {},
      }),
    /cannot run with request-time case projection/,
  );
  assert.throws(
    () =>
      assertRealtyCasePayloadAuthorityConfig({
        realtyCasePayloadAuthorityEnabled: true,
        realtyCaseWorkspaceId: "workspace-sandanski",
      }),
    /PAYLOAD_SECRET and DATABASE_URL/,
  );
  await assert.rejects(
    () => openRealtyCaseInPayload(caseInput("case-authority-invalid-runtime"), {
      payload: {},
      workspaceId: "workspace-sandanski",
    }),
    (error) => error.status === 503,
  );
});
