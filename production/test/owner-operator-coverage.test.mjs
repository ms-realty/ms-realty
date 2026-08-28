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
  OWNER_OPERATOR_CHALLENGE,
  assertOwnerOperatorCatalog,
  ownerOperatorCatalog,
  ownerOperatorConfirmation,
} from "../lib/owner-operator-catalog.mjs";
import {
  OPERATOR_PROVIDERS,
  OPERATOR_PROVIDER_COVERAGE,
  OWNER_CONNECTABLE_PROVIDERS,
} from "../lib/operator-provider-catalog.mjs";
import { buildOwnerOperatorCoverage, discoverAdminRoutes } from "../scripts/build-owner-operator-coverage.mjs";

const key = (row) => `${row.method} ${row.pathname}`;

test("owner/operator catalog covers every admin route method exactly once", () => {
  assert.equal(assertOwnerOperatorCatalog(), true);
  const discovered = discoverAdminRoutes();
  assert.equal(discovered.length, 117);
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
    else assert.deepEqual(row.confirmation, OWNER_OPERATOR_CHALLENGE);
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
  assert.deepEqual(
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
  assert.deepEqual(artifact.summary, {
    admin_route_files: 103,
    admin_methods: 117,
    hermes_tools: 3,
    authorized_workflows: 120,
    reachable_workflows: 120,
    reachability_percent: 100,
    providers: 10,
    enabled_integrations: 2,
    managed_systems: 3,
    disabled_integrations: 5,
  });
  const command = artifact.admin_routes.find((row) => row.method === "POST" && row.pathname === "/api/admin/hermes");
  assert.equal(command.sensitive, true);
  assert.equal(command.hermes_access, "draft_only");
  for (const row of HERMES_TOOL_COVERAGE) {
    const artifactRow = artifact.hermes_tools.find((entry) => entry.operation === row.operation);
    assert.ok(artifactRow, row.operation);
    assert.equal(artifactRow.reachability, "owner_plugin_mcp");
    assert.equal(row.tool, OWNER_OPERATOR_HERMES_TOOL);
    assert.equal(row.draft_only, true);
    assert.ok(row.prohibited_actions.includes("publish"));
    assert.ok(row.prohibited_actions.includes("send"));
    assert.ok(row.prohibited_actions.includes("mark_indexable"));
  }
});

test("every authorized workflow has an executable owner entrypoint", () => {
  const coverage = buildOwnerOperatorCoverage();
  assert.equal(coverage.admin_routes.length + coverage.hermes_tools.length, ADMIN_ROUTE_COVERAGE.length + HERMES_TOOL_COVERAGE.length);

  for (const row of ADMIN_ROUTE_COVERAGE) {
    const workflow = coverage.admin_routes.find((entry) => entry.operation === row.operation);
    assert.ok(workflow, row.operation);
    if (row.execution === "browser_session") {
      assert.equal(workflow.reachability, "admin_ui_and_signed_in_webmcp_open");
      assert.ok(workflow.ui_path?.startsWith("/admin"));
    } else {
      assert.equal(workflow.reachability, "delegated_mcp_and_signed_in_webmcp");
      assert.ok([OWNER_OPERATOR_ADMIN_READ_TOOL, OWNER_OPERATOR_ADMIN_WRITE_TOOL].includes(workflow.tool));
    }
  }
  assert.equal(coverage.hermes_tools.every((row) => row.reachability === "owner_plugin_mcp"), true);

  const client = fs.readFileSync(fromRoot("production", "lib", "ui", "client.mjs"), "utf8");
  for (const tool of ["ms_realty_admin_context", "ms_realty_admin_read", "ms_realty_admin_write", "ms_realty_admin_open"]) {
    assert.match(client, new RegExp(`name: ["']${tool}["']`), `${tool} must remain registered with WebMCP`);
  }
});

test("provider matrix enables only one-click connections with real consumers", () => {
  const coverage = buildOwnerOperatorCoverage();
  assert.deepEqual(coverage.provider_matrix, OPERATOR_PROVIDER_COVERAGE);
  assert.deepEqual(coverage.provider_matrix.map((row) => row.provider), [...OPERATOR_PROVIDERS]);
  assert.deepEqual(
    coverage.provider_matrix.filter((row) => row.enabled).map((row) => row.provider),
    [...OWNER_CONNECTABLE_PROVIDERS],
  );

  for (const row of coverage.provider_matrix) {
    assert.equal(row.owner_secret_fields, false, row.provider);
    if (row.enabled) {
      assert.ok(["oauth_authorization_code", "provider_embedded_signup"].includes(row.authorization), row.provider);
      assert.ok(row.owner_action, row.provider);
      assert.ok(row.downstream_consumers.length > 0, row.provider);
      assert.deepEqual(row.lifecycle, ["authorizing", "connected", "reauthorize", "error", "disconnected"]);
    } else {
      assert.equal(row.owner_action, null, row.provider);
      if (row.state === "disabled") assert.ok(row.reason, row.provider);
    }
  }

  assert.deepEqual(
    coverage.provider_matrix.filter((row) => row.state === "disabled").map((row) => row.provider),
    ["google_drive", "viber", "facebook", "instagram", "github"],
  );
  assert.deepEqual(
    coverage.provider_matrix.filter((row) => row.state === "managed").map((row) => row.provider),
    ["cloudflare", "neon", "ai"],
  );
});

test("operation inputs are fixed to registry metadata, never caller-supplied paths", () => {
  const source = fs.readFileSync(fromRoot("production", "lib", "owner-operator-catalog.mjs"), "utf8");
  assert.doesNotMatch(source, /input\.(?:path|pathname|method|url)/);
  assert.deepEqual(
    [...new Set(ADMIN_ROUTE_COVERAGE.map((row) => row.tool))].sort(),
    [OWNER_OPERATOR_ADMIN_READ_TOOL, OWNER_OPERATOR_ADMIN_WRITE_TOOL].sort(),
  );
});
