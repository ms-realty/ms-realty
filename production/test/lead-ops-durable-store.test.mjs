import test from "node:test";
import assert from "node:assert/strict";
import {
  DURABLE_LEAD_OPERATION_PATHS,
  isFileBackedLeadMutationBlocked,
} from "../lib/lead-durable-boundary.mjs";
import {
  LEAD_OPERATIONS,
  LEAD_OPERATION_COLLECTION,
  LeadOperationStoreUnavailableError,
  appendLeadOperationDurably,
  isLeadOperationsDurableStoreEnabled,
  leadOperationsDurableStoreConfigFromEnv,
  readLeadOperationsDurably,
} from "../lib/lead-ops-durable-store.mjs";
import { productionRuntimeDataUnavailable } from "../lib/runtime-data-boundary.mjs";

// A minimal stand-in for the Payload runtime: enough to prove ordering,
// idempotency and workspace scoping without a database.
export function fakeOperationPayload({ failCreate = null } = {}) {
  const rows = [];
  const calls = { create: [], find: [] };
  let sequence = 0;
  const matches = (row, clause) => {
    if (!clause || !Object.keys(clause).length) return true;
    if (Array.isArray(clause.and)) return clause.and.every((nested) => matches(row, nested));
    return Object.entries(clause).every(([field, condition]) => {
      if (Object.hasOwn(condition || {}, "equals")) return row[field] === condition.equals;
      if (Array.isArray(condition?.in)) return condition.in.includes(row[field]);
      return false;
    });
  };
  return {
    calls,
    rows,
    async find(input) {
      calls.find.push(input);
      const docs = rows.filter((row) => matches(row, input.where));
      const sorted = input.sort === "id" ? [...docs].sort((left, right) => left.id - right.id) : docs;
      return { docs: input.limit ? sorted.slice(0, input.limit) : sorted };
    },
    async create(input) {
      calls.create.push(input);
      if (failCreate) throw failCreate;
      if (rows.some((row) => row.operation_key === input.data.operation_key)) {
        throw Object.assign(new Error("duplicate key"), { code: "23505" });
      }
      sequence += 1;
      const stored = { id: sequence, ...input.data };
      rows.push(stored);
      return stored;
    },
  };
}

const WORKSPACE = "workspace-sandanski";

const snoozeRow = (overrides = {}) => ({
  id: "lead-snooze-lead-1",
  lead_id: "lead-1",
  action: "snooze",
  actor: "broker-en",
  reason: "Buyer is travelling",
  until: "2026-09-01T09:00:00.000Z",
  snooze_id: null,
  recorded_at: "2026-08-25T09:00:00.000Z",
  human_confirmed: true,
  ...overrides,
});

test("the operations collection is append-only, server-owned, and keyed for idempotent retries", () => {
  assert.equal(LEAD_OPERATION_COLLECTION.slug, "lead_operations");
  for (const verb of ["create", "read", "update", "delete"]) {
    assert.equal(LEAD_OPERATION_COLLECTION.access[verb](), false, `${verb} must be denied`);
  }
  const key = LEAD_OPERATION_COLLECTION.fields.find((field) => field.name === "operation_key");
  assert.equal(key.unique, true);
  assert.equal(key.required, true);
});

test("the store is enabled only when the operator asked for it and the runtime is configured", () => {
  const complete = {
    MS_REALTY_LEAD_OPS_DURABLE_STORE_ENABLED: "true",
    PAYLOAD_SECRET: "payload-secret-for-test",
    DATABASE_URL: "postgres://test.invalid/ms_realty",
    MS_REALTY_WORKSPACE_ID: WORKSPACE,
  };
  assert.equal(isLeadOperationsDurableStoreEnabled(leadOperationsDurableStoreConfigFromEnv(complete)), true);
  for (const missing of ["PAYLOAD_SECRET", "DATABASE_URL", "MS_REALTY_WORKSPACE_ID"]) {
    const partial = { ...complete, [missing]: "" };
    assert.equal(
      isLeadOperationsDurableStoreEnabled(leadOperationsDurableStoreConfigFromEnv(partial)),
      false,
      `${missing} must be required`,
    );
  }
  assert.equal(
    isLeadOperationsDurableStoreEnabled(
      leadOperationsDurableStoreConfigFromEnv({ ...complete, MS_REALTY_LEAD_OPS_DURABLE_STORE_ENABLED: "" }),
    ),
    false,
  );
});

test("a written operation reads back verbatim, in append order, scoped to its workspace", async () => {
  const payload = fakeOperationPayload();
  const first = snoozeRow();
  const second = snoozeRow({ id: "lead-unsnooze-lead-1", action: "unsnooze", until: null, snooze_id: "lead-snooze-lead-1" });

  const created = await appendLeadOperationDurably({
    operation: LEAD_OPERATIONS.snooze,
    payload,
    row: first,
    workspaceId: WORKSPACE,
  });
  assert.equal(created.idempotent, false);
  assert.deepEqual(created.row, first);
  await appendLeadOperationDurably({ operation: LEAD_OPERATIONS.snooze, payload, row: second, workspaceId: WORKSPACE });

  // Another workspace's row must never join this read.
  await appendLeadOperationDurably({
    operation: LEAD_OPERATIONS.snooze,
    payload,
    row: snoozeRow({ id: "lead-snooze-other", lead_id: "lead-other" }),
    workspaceId: "workspace-other",
  });
  // Nor must another operation kind.
  await appendLeadOperationDurably({
    operation: LEAD_OPERATIONS.deal,
    payload,
    row: { id: "deal-lead-1", lead_id: "lead-1", broker: "broker-en", closed_at: "2026-08-25T10:00:00.000Z" },
    workspaceId: WORKSPACE,
  });

  const rows = await readLeadOperationsDurably({ operation: LEAD_OPERATIONS.snooze, payload, workspaceId: WORKSPACE });
  assert.deepEqual(rows, [first, second], "append order and content must survive the round trip");
});

test("a retried write collapses onto the stored row instead of appending a second", async () => {
  const payload = fakeOperationPayload();
  const row = snoozeRow();
  const first = await appendLeadOperationDurably({
    operation: LEAD_OPERATIONS.snooze,
    payload,
    row,
    workspaceId: WORKSPACE,
  });
  const retry = await appendLeadOperationDurably({
    operation: LEAD_OPERATIONS.snooze,
    payload,
    row,
    workspaceId: WORKSPACE,
  });
  assert.equal(first.idempotent, false);
  assert.equal(retry.idempotent, true);
  assert.deepEqual(retry.row, row);
  assert.equal(payload.rows.length, 1);
});

test("a row that grew contact or message content is refused before it reaches Postgres", async () => {
  const payload = fakeOperationPayload();
  for (const leak of [{ email: "buyer@example.com" }, { phone: "+359" }, { message: "hello" }, { reviewed_reply: "hi" }]) {
    await assert.rejects(
      appendLeadOperationDurably({
        operation: LEAD_OPERATIONS.snooze,
        payload,
        row: { ...snoozeRow(), ...leak },
        workspaceId: WORKSPACE,
      }),
      /must not contain contact or message content/,
      `${Object.keys(leak)[0]} must be refused`,
    );
  }
  assert.equal(payload.rows.length, 0, "nothing may be written");
});

test("an unreachable runtime is reported as a store outage, never as a success", async () => {
  const payload = fakeOperationPayload({ failCreate: new Error("connection refused") });
  await assert.rejects(
    appendLeadOperationDurably({
      operation: LEAD_OPERATIONS.snooze,
      payload,
      row: snoozeRow(),
      workspaceId: WORKSPACE,
    }),
    (error) => error instanceof LeadOperationStoreUnavailableError && error.code === "lead_operation_store_unavailable",
  );
});

test("an unknown operation kind and a missing workspace are caller defects, not outages", async () => {
  const payload = fakeOperationPayload();
  await assert.rejects(
    appendLeadOperationDurably({ operation: "nonsense", payload, row: snoozeRow(), workspaceId: WORKSPACE }),
    /Unknown lead operation/,
  );
  await assert.rejects(
    readLeadOperationsDurably({ operation: LEAD_OPERATIONS.snooze, payload, workspaceId: "" }),
    /workspace_id is required/,
  );
});

test("both boundaries exempt the migrated paths only when the durable store is enabled", () => {
  const durableStore = { leadDurableStoreEnabled: true };
  for (const pathname of DURABLE_LEAD_OPERATION_PATHS) {
    assert.equal(
      isFileBackedLeadMutationBlocked({ durableStore, method: "POST", pathname }),
      true,
      `${pathname} must stay blocked while the store is off`,
    );
    assert.equal(
      isFileBackedLeadMutationBlocked({ durableLeadOperations: true, durableStore, method: "POST", pathname }),
      false,
      `${pathname} must be exempt once the store is on`,
    );
    assert.equal(
      productionRuntimeDataUnavailable({ durableOnly: true, method: "POST", pathname }),
      true,
      `${pathname} must stay blocked under the durable-only authority while the store is off`,
    );
    assert.equal(
      productionRuntimeDataUnavailable({ durableLeadOperations: true, durableOnly: true, method: "POST", pathname }),
      false,
      `${pathname} must be exempt under the durable-only authority once the store is on`,
    );
  }
});

test("paths without a durable writer still fail closed when the store is on", () => {
  const durableStore = { leadDurableStoreEnabled: true };
  for (const pathname of [
    "/api/admin/replies",
    "/api/admin/replies/draft",
    "/api/admin/accounts",
    "/api/admin/accounts/link",
    "/api/admin/documents/outcome",
    "/api/admin/consents/withdraw",
    "/api/admin/leads",
  ]) {
    assert.equal(
      isFileBackedLeadMutationBlocked({ durableLeadOperations: true, durableStore, method: "POST", pathname }),
      true,
      `${pathname} has no durable writer and must stay refused`,
    );
  }
});

test("both runtimes answer a blocked lead mutation with the same kind", () => {
  // The lead-store check runs first in http.mjs and app-admin-adapter.mjs
  // alike, so a request that both refuse is refused for the same stated reason.
  const pathname = "/api/admin/replies";
  const durableStore = { leadDurableStoreEnabled: true };
  assert.equal(isFileBackedLeadMutationBlocked({ durableStore, method: "POST", pathname }), true);
  assert.equal(productionRuntimeDataUnavailable({ durableOnly: true, method: "POST", pathname }), true);
});
