import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fromRoot } from "../lib/paths.mjs";
import {
  ADMIN_ROUTE_COVERAGE,
  HERMES_TOOL_COVERAGE,
  OWNER_OPERATOR_PLUGIN_ID,
  assertOwnerOperatorCatalog,
} from "../lib/owner-operator-catalog.mjs";
import {
  OPERATOR_PROVIDER_COVERAGE,
  OWNER_CONNECTABLE_PROVIDERS,
} from "../lib/operator-provider-catalog.mjs";

const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"];

function routePathFromFile(root, file) {
  const relative = path.relative(root, file).split(path.sep);
  relative.pop();
  return `/api/admin/${relative
    .map((segment) => (segment.startsWith("[") && segment.endsWith("]") ? `{${segment.slice(1, -1)}}` : segment))
    .join("/")}`;
}
function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) return walk(file);
    return entry.isFile() && entry.name === "route.js" ? [file] : [];
  });
}

export function discoverAdminRoutes(root = fromRoot("app", "api", "admin")) {
  const rows = [];
  for (const file of walk(root).sort()) {
    const source = fs.readFileSync(file, "utf8");
    for (const method of METHODS) {
      if (new RegExp(`export\\s+(?:async\\s+)?function\\s+${method}\\b`).test(source)) {
        rows.push({ method, pathname: routePathFromFile(root, file), source_file: path.relative(fromRoot(), file) });
      }
    }
  }
  return rows.sort((a, b) => `${a.method} ${a.pathname}`.localeCompare(`${b.method} ${b.pathname}`));
}

function operationKey(method, pathname) {
  return `${method} ${pathname}`;
}

function sourceHermesTools(file = fromRoot("production", "scripts", "hermes-mcp-server.mjs")) {
  const source = fs.readFileSync(file, "utf8");
  return [...source.matchAll(/registerTool\(\s*["']([^"']+)["']/g)].map((match) => match[1]).sort();
}

function adminWorkflowReachability(row) {
  return row.execution === "browser_session"
    ? "admin_ui_and_signed_in_webmcp_open"
    : row.read_only
      ? "delegated_mcp_and_signed_in_webmcp_read"
      : "signed_delegated_mcp_and_human_admin_ui";
}

function hermesWorkflowReachability() {
  return "owner_plugin_mcp";
}

function assertProviderCoverage() {
  const enabled = OPERATOR_PROVIDER_COVERAGE.filter((row) => row.enabled).map((row) => row.provider);
  if (JSON.stringify(enabled) !== JSON.stringify(OWNER_CONNECTABLE_PROVIDERS)) {
    throw new Error(`Owner provider coverage mismatch: enabled=${JSON.stringify(enabled)}, connectable=${JSON.stringify(OWNER_CONNECTABLE_PROVIDERS)}`);
  }
  for (const row of OPERATOR_PROVIDER_COVERAGE) {
    if (row.owner_secret_fields !== false) throw new Error(`${row.provider} exposes owner secret fields`);
    if (row.enabled) {
      if (!["oauth_authorization_code", "provider_embedded_signup"].includes(row.authorization)) {
        throw new Error(`${row.provider} is enabled without a provider-authorized handoff`);
      }
      if (!row.owner_action || row.downstream_consumers.length === 0) {
        throw new Error(`${row.provider} is enabled without an owner action and downstream consumer`);
      }
    } else if (row.owner_action) {
      throw new Error(`${row.provider} exposes an owner action while ${row.state}`);
    }
    if (row.state === "disabled" && !row.reason) throw new Error(`${row.provider} is disabled without a reason`);
    for (const consumer of row.downstream_consumers) {
      const source = fs.readFileSync(fromRoot(...consumer.source_file.split("/")), "utf8");
      if (!new RegExp(`export\\s+(?:async\\s+)?function\\s+${consumer.symbol}\\b`).test(source)) {
        throw new Error(`${row.provider} consumer ${consumer.symbol} is missing from ${consumer.source_file}`);
      }
    }
  }
}

export function buildOwnerOperatorCoverage({ adminRoot = fromRoot("app", "api", "admin"), hermesFile } = {}) {
  assertOwnerOperatorCatalog();
  assertProviderCoverage();
  const discovered = discoverAdminRoutes(adminRoot);
  const catalogByKey = new Map(ADMIN_ROUTE_COVERAGE.map((row) => [operationKey(row.method, row.pathname), row]));
  const discoveredByKey = new Map(discovered.map((row) => [operationKey(row.method, row.pathname), row]));
  const missing = discovered.filter((row) => !catalogByKey.has(operationKey(row.method, row.pathname)));
  const extra = ADMIN_ROUTE_COVERAGE.filter((row) => !discoveredByKey.has(operationKey(row.method, row.pathname)));
  if (missing.length || extra.length) {
    throw new Error(
      `Owner/operator admin route coverage mismatch: missing=${JSON.stringify(missing)}, extra=${JSON.stringify(extra)}`,
    );
  }

  const sourceTools = sourceHermesTools(hermesFile);
  const catalogTools = HERMES_TOOL_COVERAGE.map((row) => row.operation).sort();
  if (JSON.stringify(sourceTools) !== JSON.stringify(catalogTools)) {
    throw new Error(`Owner/operator Hermes coverage mismatch: source=${JSON.stringify(sourceTools)}, catalog=${JSON.stringify(catalogTools)}`);
  }

  const adminRoutes = discovered.map((source) => ({
    ...catalogByKey.get(operationKey(source.method, source.pathname)),
    source_file: source.source_file,
    reachability: adminWorkflowReachability(catalogByKey.get(operationKey(source.method, source.pathname))),
  }));
  const hermesTools = HERMES_TOOL_COVERAGE.map((row) => ({
    ...row,
    reachability: hermesWorkflowReachability(row),
  }));
  const authorizedWorkflows = adminRoutes.length + hermesTools.length;
  const reachableWorkflows = [
    ...adminRoutes.map((row) => row.reachability),
    ...hermesTools.map((row) => row.reachability),
  ].filter(Boolean).length;
  return {
    schema_version: 2,
    plugin_id: OWNER_OPERATOR_PLUGIN_ID,
    generated_by: "production/scripts/build-owner-operator-coverage.mjs",
    summary: {
      admin_route_files: new Set(discovered.map((row) => row.source_file)).size,
      admin_methods: adminRoutes.length,
      hermes_tools: hermesTools.length,
      authorized_workflows: authorizedWorkflows,
      reachable_workflows: reachableWorkflows,
      reachability_percent: authorizedWorkflows ? (reachableWorkflows * 100) / authorizedWorkflows : 100,
      providers: OPERATOR_PROVIDER_COVERAGE.length,
      enabled_integrations: OPERATOR_PROVIDER_COVERAGE.filter((row) => row.state === "enabled").length,
      managed_systems: OPERATOR_PROVIDER_COVERAGE.filter((row) => row.state === "managed").length,
      disabled_integrations: OPERATOR_PROVIDER_COVERAGE.filter((row) => row.state === "disabled").length,
    },
    admin_routes: adminRoutes,
    hermes_tools: hermesTools,
    provider_matrix: OPERATOR_PROVIDER_COVERAGE,
  };
}

const entrypoint = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === entrypoint) {
  const outputPath = fromRoot("production", "data", "owner-operator-coverage.json");
  const coverage = buildOwnerOperatorCoverage();
  fs.writeFileSync(outputPath, `${JSON.stringify(coverage, null, 2)}\n`);
  console.log(
    `Wrote ${outputPath} (${coverage.summary.reachable_workflows}/${coverage.summary.authorized_workflows} workflows, ${coverage.summary.enabled_integrations} enabled integrations)`,
  );
}
