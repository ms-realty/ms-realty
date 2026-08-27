import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fromRoot } from "../lib/paths.mjs";
import {
  ADMIN_ROUTE_COVERAGE,
  HERMES_TOOL_COVERAGE,
  OWNER_OPERATOR_ADMIN_READ_TOOL,
  OWNER_OPERATOR_ADMIN_WRITE_TOOL,
  OWNER_OPERATOR_BROWSER_OPERATIONS,
  OWNER_OPERATOR_HERMES_TOOL,
  OWNER_OPERATOR_OPERATIONS,
  OWNER_OPERATOR_REMOTE_OPERATIONS,
  OWNER_OPERATOR_WRITE_CONFIRMATION,
  assertOwnerOperatorCatalog,
  ownerOperatorCatalog,
  ownerOperatorConfirmation,
} from "../lib/owner-operator-catalog.mjs";
import { buildOwnerOperatorCoverage, discoverAdminRoutes } from "../scripts/build-owner-operator-coverage.mjs";

const key = (row) => `${row.method} ${row.pathname}`;

test("owner/operator catalog covers every admin route method exactly once", () => {
  assert.equal(assertOwnerOperatorCatalog(), true);
  const discovered = discoverAdminRoutes();
  assert.equal(discovered.length, 116);
  assert.equal(new Set(discovered.map((row) => key(row))).size, discovered.length);
  assert.equal(ADMIN_ROUTE_COVERAGE.length, discovered.length);
  assert.deepEqual(
    new Set(ADMIN_ROUTE_COVERAGE.map(key)),
    new Set(discovered.map(key)),
  );
  for (const row of ADMIN_ROUTE_COVERAGE) {
    assert.ok(row.operation.startsWith("admin_"));
    assert.ok([OWNER_OPERATOR_ADMIN_READ_TOOL, OWNER_OPERATOR_ADMIN_WRITE_TOOL].includes(row.tool));
    assert.ok(row.capability, `${row.operation} must carry its existing admin capability`);
    if (row.read_only) assert.equal(row.confirmation, null);
    else assert.equal(row.confirmation, OWNER_OPERATOR_WRITE_CONFIRMATION);
    assert.ok(["browser_session", "mcp_delegated"].includes(row.execution));
  }
  assert.equal(OWNER_OPERATOR_BROWSER_OPERATIONS.length + OWNER_OPERATOR_REMOTE_OPERATIONS.length, discovered.length);
  assert.ok(OWNER_OPERATOR_BROWSER_OPERATIONS.some((row) => row.pathname === "/api/admin/security/two-factor"));
  assert.ok(OWNER_OPERATOR_BROWSER_OPERATIONS.some((row) => row.pathname === "/api/admin/connections/agent-config"));
  assert.ok(OWNER_OPERATOR_REMOTE_OPERATIONS.some((row) => row.pathname === "/api/admin/listings"));
  assert.equal(OWNER_OPERATOR_BROWSER_OPERATIONS.every((row) => row.ui_path?.startsWith("/admin")), true);
  const adminCatalog = ownerOperatorCatalog({ id: "owner", roles: ["admin"] });
  assert.equal(adminCatalog.summary.total, discovered.length);
  assert.equal(adminCatalog.operations.length, discovered.length);
  assert.equal(
    adminCatalog.operations.find((row) => row.operation === "admin_post_listings_status").confirmation,
    ownerOperatorConfirmation("admin_post_listings_status"),
  );
});

test("owner/operator operations include each Hermes tool exactly once", () => {
  const hermes = OWNER_OPERATOR_OPERATIONS.filter((row) => row.source_kind === "hermes_tool");
  assert.equal(hermes.length, HERMES_TOOL_COVERAGE.length);
  assert.equal(new Set(hermes.map((row) => row.operation)).size, hermes.length);
  assert.deepEqual(
    hermes.map((row) => row.operation),
    HERMES_TOOL_COVERAGE.map((row) => row.operation),
  );
});

test("generated matrix is source-derived and includes Hermes tool coverage", () => {
  const coverage = buildOwnerOperatorCoverage();
  const artifact = JSON.parse(fs.readFileSync(fromRoot("production", "data", "owner-operator-coverage.json"), "utf8"));
  assert.deepEqual(artifact, coverage);
  assert.deepEqual(artifact.summary, { admin_route_files: 103, admin_methods: 116, hermes_tools: 3 });
  assert.deepEqual(artifact.hermes_tools, HERMES_TOOL_COVERAGE);
  for (const row of HERMES_TOOL_COVERAGE) {
    assert.equal(row.tool, OWNER_OPERATOR_HERMES_TOOL);
    assert.equal(row.draft_only, true);
    assert.ok(row.prohibited_actions.includes("publish"));
    assert.ok(row.prohibited_actions.includes("send"));
    assert.ok(row.prohibited_actions.includes("mark_indexable"));
  }
});

test("operation inputs are fixed to registry metadata, never caller-supplied paths", () => {
  const source = fs.readFileSync(fromRoot("production", "lib", "owner-operator-catalog.mjs"), "utf8");
  assert.doesNotMatch(source, /input\.(?:path|pathname|method|url)/);
  assert.deepEqual(
    [...new Set(ADMIN_ROUTE_COVERAGE.map((row) => row.tool))].sort(),
    [OWNER_OPERATOR_ADMIN_READ_TOOL, OWNER_OPERATOR_ADMIN_WRITE_TOOL].sort(),
  );
});
