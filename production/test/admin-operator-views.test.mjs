import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import { createHttpApp, dispatchHttp } from "../lib/http.mjs";
import { readAuditLog } from "../lib/audit-log.mjs";
import { requiredAdminCapability } from "../lib/admin-auth.mjs";
import {
  OPERATOR_VIEW_SURFACES,
  appendOperatorView,
  assertOperatorViews,
  createOperatorView,
  createOperatorViewDeletion,
  operatorViewsFor,
  readOperatorViews,
  resetOperatorViews,
} from "../lib/operator-views.mjs";

// A saved view is one operator's named set of list filters. Ownership comes
// from the authenticated principal and never from the request body.

const NOW = "2026-07-19T12:00:00.000Z";

function tempFile(prefix) {
  const file = `${fs.mkdtempSync(`${os.tmpdir()}/ms-realty-${prefix}-`)}/${prefix}.jsonl`;
  fs.writeFileSync(file, "");
  return file;
}

function workspace() {
  const operatorViewLedgerPath = tempFile("operator-views");
  const auditLogPath = tempFile("operator-view-audit");
  resetOperatorViews(operatorViewLedgerPath);
  const app = createHttpApp({
    leadDurableStore: { leadDurableStoreEnabled: false },
    operatorViewLedgerPath,
    auditLogPath,
    reviewedAt: NOW,
    leadSnoozeAt: NOW,
  });
  return { app, operatorViewLedgerPath, auditLogPath };
}

async function withNamedOperator(id, run) {
  const previous = process.env.MS_REALTY_ADMIN_ACTOR;
  process.env.MS_REALTY_ADMIN_ACTOR = id;
  try {
    return await run();
  } finally {
    if (previous === undefined) delete process.env.MS_REALTY_ADMIN_ACTOR;
    else process.env.MS_REALTY_ADMIN_ACTOR = previous;
  }
}

const AUTH = { authorization: "Bearer local-admin-smoke" };
const JSON_AUTH = { ...AUTH, "content-type": "application/json" };

test("saved views are capability gated: read to look, write to change", () => {
  assert.equal(requiredAdminCapability("GET", "/api/admin/views"), "operations:read");
  assert.equal(requiredAdminCapability("POST", "/api/admin/views"), "operations:write");
  assert.equal(requiredAdminCapability("DELETE", "/api/admin/views"), "operations:write");
});

test("a saved view only stores filters its surface actually offers", () => {
  const filePath = tempFile("operator-view-module");
  const view = createOperatorView([], { surface: "leads", name: "Overdue Bulgarian", filters: { queue: "sla", broker: "broker_bg" } }, { operatorId: "operations_lead", savedAt: NOW });
  assert.equal(view.id, "operator-view-operations_lead-leads-overdue-bulgarian");
  assert.deepEqual(view.filters, { broker: "broker_bg", queue: "sla" });
  assert.equal(view.status, "active");
  assert.equal(assertOperatorViews([view]), true);

  assert.throws(() => createOperatorView([], { surface: "billing", name: "x", filters: { queue: "sla" } }, { operatorId: "operations_lead" }), /surface must be one of/);
  assert.throws(() => createOperatorView([], { surface: "leads", name: "x", filters: { secretNote: "y" } }, { operatorId: "operations_lead" }), /not a filter of the leads surface/);
  assert.throws(() => createOperatorView([], { surface: "leads", name: "x", filters: {} }, { operatorId: "operations_lead" }), /at least one filter/);
  assert.throws(() => createOperatorView([], { surface: "leads", name: "", filters: { queue: "sla" } }, { operatorId: "operations_lead" }), /name is required/);
  assert.throws(() => createOperatorView([], { surface: "leads", name: "x", filters: { queue: "sla" } }, { operatorId: "" }), /authenticated operator id/);
  assert.throws(() => assertOperatorViews([{ ...view, email: "leak@example.com" }]), /private contact data/);

  // Re-saving one view replaces its state instead of adding a second row.
  const stored = appendOperatorView(view, { filePath });
  assert.equal(stored.idempotent, false);
  assert.equal(appendOperatorView(view, { filePath }).idempotent, true);
  assert.equal(readOperatorViews(filePath).length, 1);

  const tombstone = createOperatorViewDeletion(readOperatorViews(filePath), { surface: "leads", slug: "overdue-bulgarian" }, { operatorId: "operations_lead", deletedAt: NOW });
  appendOperatorView(tombstone, { filePath });
  assert.deepEqual(operatorViewsFor(readOperatorViews(filePath), "operations_lead", "leads"), []);
  // The ledger is append-only: the tombstone is a row, not an erasure.
  assert.equal(readOperatorViews(filePath).length, 2);
});

test("an operator reads and writes only their own views", () => {
  const filePath = tempFile("operator-view-owners");
  appendOperatorView(createOperatorView([], { surface: "leads", name: "Mine", filters: { queue: "sla" } }, { operatorId: "broker_one", savedAt: NOW }), { filePath });
  appendOperatorView(createOperatorView([], { surface: "leads", name: "Theirs", filters: { queue: "all" } }, { operatorId: "broker_two", savedAt: NOW }), { filePath });
  const rows = readOperatorViews(filePath);

  assert.deepEqual(operatorViewsFor(rows, "broker_one").map((view) => view.name), ["Mine"]);
  assert.deepEqual(operatorViewsFor(rows, "broker_two").map((view) => view.name), ["Theirs"]);
  // Another operator's view is not deletable, because it is not visible.
  assert.throws(() => createOperatorViewDeletion(rows, { surface: "leads", slug: "theirs" }, { operatorId: "broker_one" }), /does not exist for this operator/);
});

test("GET, POST and DELETE /api/admin/views round-trip one operator's views", async () => {
  await withNamedOperator("operations_lead", async () => {
    const { app, operatorViewLedgerPath, auditLogPath } = workspace();

    const empty = await dispatchHttp(app, { url: "/api/admin/views?surface=leads", headers: AUTH });
    assert.equal(empty.status, 200);
    assert.equal(empty.body.kind, "operator_views");
    assert.equal(empty.body.operator_id, "operations_lead");
    assert.deepEqual(empty.body.surfaces, OPERATOR_VIEW_SURFACES);
    assert.deepEqual(empty.body.views, []);

    const body = { surface: "leads", name: "Overdue Bulgarian", filters: { queue: "sla", broker: "broker_bg" } };
    const created = await dispatchHttp(app, { url: "/api/admin/views", method: "POST", headers: JSON_AUTH, body: JSON.stringify(body) });
    assert.equal(created.status, 201);
    assert.equal(created.body.kind, "operator_view");
    assert.equal(created.body.operator_id, "operations_lead");
    assert.equal(created.body.slug, "overdue-bulgarian");

    // A retried save changes nothing and returns the stored view.
    const retried = await dispatchHttp(app, { url: "/api/admin/views", method: "POST", headers: JSON_AUTH, body: JSON.stringify(body) });
    assert.equal(retried.status, 200);
    assert.equal(readOperatorViews(operatorViewLedgerPath).length, 1);

    const listed = await dispatchHttp(app, { url: "/api/admin/views", headers: AUTH });
    assert.deepEqual(listed.body.views.map((view) => view.name), ["Overdue Bulgarian"]);

    const removed = await dispatchHttp(app, {
      url: "/api/admin/views",
      method: "DELETE",
      headers: JSON_AUTH,
      body: JSON.stringify({ surface: "leads", slug: "overdue-bulgarian" }),
    });
    assert.equal(removed.status, 200);
    assert.equal(removed.body.status, "deleted");
    const afterDelete = await dispatchHttp(app, { url: "/api/admin/views", headers: AUTH });
    assert.deepEqual(afterDelete.body.views, []);

    const audit = readAuditLog(auditLogPath);
    assert.deepEqual(
      audit.filter((row) => row.action.startsWith("operator_view")).map((row) => row.action),
      ["operator_view_saved", "operator_view_deleted"],
    );
    assert.equal(audit.find((row) => row.action === "operator_view_saved").actor, "operations_lead");
    // The audit entry names the filter keys, never a customer value.
    assert.deepEqual(audit.find((row) => row.action === "operator_view_saved").metadata.filter_keys, ["broker", "queue"]);
    assertOperatorViews(readOperatorViews(operatorViewLedgerPath));
  });
});

test("the views routes refuse an unauthenticated caller, a foreign operator, and bad input", async () => {
  await withNamedOperator("operations_lead", async () => {
    const { app, operatorViewLedgerPath } = workspace();

    const unauthenticated = await dispatchHttp(app, { url: "/api/admin/views" });
    assert.equal(unauthenticated.status, 401);

    // Ownership is taken from the principal; a disagreeing body is refused.
    const impersonated = await dispatchHttp(app, {
      url: "/api/admin/views",
      method: "POST",
      headers: JSON_AUTH,
      body: JSON.stringify({ surface: "leads", name: "Theirs", operatorId: "someone_else", filters: { queue: "all" } }),
    });
    assert.equal(impersonated.status, 400);
    assert.match(impersonated.body.message, /must match the authenticated operator/);

    for (const [body, pattern] of [
      [{ surface: "billing", name: "x", filters: { queue: "sla" } }, /surface must be one of/],
      [{ surface: "leads", name: "x", filters: { secretNote: "y" } }, /not a filter of the leads surface/],
      [{ surface: "leads", name: "x", filters: {} }, /at least one filter/],
      [{ surface: "leads", filters: { queue: "sla" } }, /name is required/],
    ]) {
      const refused = await dispatchHttp(app, { url: "/api/admin/views", method: "POST", headers: JSON_AUTH, body: JSON.stringify(body) });
      assert.equal(refused.status, 400, JSON.stringify(body));
      assert.match(refused.body.message, pattern);
    }
    assert.equal(readOperatorViews(operatorViewLedgerPath).length, 0);
  });
});

test("a token with no operator identity cannot own saved views", async () => {
  const { app } = workspace();
  const anonymous = await dispatchHttp(app, { url: "/api/admin/views", headers: AUTH });
  assert.equal(anonymous.status, 403);
  assert.equal(anonymous.body.kind, "operator_identity_required");
});
