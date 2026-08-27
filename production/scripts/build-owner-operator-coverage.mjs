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

export function buildOwnerOperatorCoverage({ adminRoot = fromRoot("app", "api", "admin"), hermesFile } = {}) {
  assertOwnerOperatorCatalog();
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
  }));
  return {
    schema_version: 1,
    plugin_id: OWNER_OPERATOR_PLUGIN_ID,
    generated_by: "production/scripts/build-owner-operator-coverage.mjs",
    summary: {
      admin_route_files: new Set(discovered.map((row) => row.source_file)).size,
      admin_methods: adminRoutes.length,
      hermes_tools: HERMES_TOOL_COVERAGE.length,
    },
    admin_routes: adminRoutes,
    hermes_tools: HERMES_TOOL_COVERAGE,
  };
}

const entrypoint = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === entrypoint) {
  const outputPath = fromRoot("production", "data", "owner-operator-coverage.json");
  const coverage = buildOwnerOperatorCoverage();
  fs.writeFileSync(outputPath, `${JSON.stringify(coverage, null, 2)}\n`);
  console.log(`Wrote ${outputPath} (${coverage.summary.admin_methods} admin methods, ${coverage.summary.hermes_tools} Hermes tools)`);
}
