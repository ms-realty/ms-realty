// Route files and adapter branches have to stay in step in BOTH directions.
//
// The first test below catches a route that http.mjs serves and the App Router
// has no file for. The second catches the failure that actually reached
// production: a route file exists, its tests pass against http.mjs, and the
// adapter the route file calls has no branch for it — so the request falls
// through to the bare 405 at the end of the dispatcher and the feature simply
// does not exist on the runtime we ship.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { appAdminConfigFromEnv, renderAppAdminResponse } from "../lib/app-admin-adapter.mjs";
import { appApiConfigFromEnv, renderAppApiResponse } from "../lib/app-api-adapter.mjs";
import { fromRoot } from "../lib/paths.mjs";

function routeFile(route) {
  return fromRoot("app", ...route.split("/").filter(Boolean), "route.js");
}

function hasRouteFile(route) {
  if (fs.existsSync(routeFile(route))) return true;
  const segments = route.split("/").filter(Boolean);
  for (let depth = segments.length; depth > 0; depth -= 1) {
    if (fs.existsSync(fromRoot("app", ...segments.slice(0, depth), "[[...path]]", "route.js"))) return true;
  }
  return false;
}

test("App Router has handoff files for every explicit HTTP route", () => {
  const httpSource = fs.readFileSync(fromRoot("production", "lib", "http.mjs"), "utf8");
  const routes = [...httpSource.matchAll(/url\.pathname === "([^"]+)"/g)].map((match) => match[1]);
  const missing = [...new Set(routes)].filter((route) => !hasRouteFile(route));

  assert.deepEqual(missing, []);
});

// ---- the reverse direction: every route file reaches an adapter branch -----

// Which dispatcher a route file hands off to. Only the two allow-list
// dispatchers can fall through to a bare 405; the other shims delegate to
// implementations that answer for themselves.
const DISPATCHERS = { "api.js": "api", "admin.js": "admin" };

// A dynamic segment needs some value to dispatch on. The value is deliberately
// one that matches nothing, because this test asks whether a branch exists, not
// whether it finds a record.
const DYNAMIC_SEGMENT = "app-route-parity-probe";

function appRouteFiles(directory = fromRoot("app"), found = []) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) appRouteFiles(entryPath, found);
    else if (entry.name === "route.js") found.push(entryPath);
  }
  return found;
}

function declaredRoutes() {
  const root = fromRoot("app");
  return appRouteFiles()
    .map((file) => {
      const source = fs.readFileSync(file, "utf8");
      const shim = (source.match(/_ms-realty\/([a-z-]+)\.js/) || [])[1];
      const dispatcher = DISPATCHERS[`${shim}.js`];
      if (!dispatcher) return null;
      const segments = path.relative(root, path.dirname(file)).split(path.sep).filter(Boolean);
      // A group segment such as (payload) is routing metadata, not a path part.
      const pathname = `/${segments
        .filter((segment) => !segment.startsWith("("))
        .map((segment) => (segment.startsWith("[") ? DYNAMIC_SEGMENT : segment))
        .join("/")}`;
      return {
        file: path.relative(fromRoot("."), file),
        dispatcher,
        pathname,
        methods: [...source.matchAll(/export async function ([A-Z]+)\(/g)].map((match) => match[1]),
      };
    })
    .filter(Boolean);
}

// Every ledger and output path is redirected into a scratch directory, so a
// probe POST cannot append to a committed ledger. Seed and registry reads stay
// real: a route that fails to read them answers 400 or 500, which is still
// proof that its branch exists.
const READ_ONLY_KEYS = new Set(["cmsSeedPath", "localeRegistryPath", "launchReadinessOutputPath"]);

function sandboxed(config, directory) {
  const sandbox = { ...config };
  for (const [key, value] of Object.entries(sandbox)) {
    if (typeof value !== "string" || READ_ONLY_KEYS.has(key)) continue;
    if (!/(Path|Dir)$/.test(key)) continue;
    const extension = value.endsWith(".jsonl") ? ".jsonl" : value.endsWith(".json") ? ".json" : "";
    const target = path.join(directory, `${key}${extension}`);
    if (extension === ".jsonl") fs.writeFileSync(target, "");
    else if (extension === ".json") fs.writeFileSync(target, "{}");
    else fs.mkdirSync(target, { recursive: true });
    sandbox[key] = target;
  }
  return sandbox;
}

function scratch(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `ms-realty-${prefix}-`));
}

async function dispatch(route, method, configs) {
  const url = `http://localhost${route.pathname}`;
  const headers = {
    accept: "application/json",
    host: "localhost",
    origin: "http://localhost",
    "sec-fetch-site": "same-origin",
  };
  const init =
    method === "GET" || method === "HEAD"
      ? { method, headers }
      : { method, headers: { ...headers, "content-type": "application/json" }, body: "{}" };
  const request = new Request(url, init);
  try {
    return route.dispatcher === "api"
      ? await renderAppApiResponse(request, { config: configs.api })
      : await renderAppAdminResponse(request, { config: configs.admin });
  } catch (error) {
    // A throw is a bug in the handler, not a missing branch. It is still proof
    // that dispatch reached one, which is what this test asserts.
    return { status: 500, thrown: error };
  }
}

async function fellThroughToMethodNotAllowed(response) {
  if (response.status !== 405) return false;
  if (!response.json) return true;
  try {
    return (await response.json()).kind === "method_not_allowed";
  } catch {
    return true;
  }
}

test("every App Router route file reaches an adapter branch instead of the bare 405", async (t) => {
  const routes = declaredRoutes();
  // A guard on the guard: if the walk stops finding route files, this test
  // would pass by asserting nothing.
  assert.ok(routes.length >= 100, `expected the App Router to declare many routes, found ${routes.length}`);
  assert.ok(routes.some((route) => route.dispatcher === "api"));
  assert.ok(routes.some((route) => route.dispatcher === "admin"));

  const configs = {
    api: sandboxed({ ...appApiConfigFromEnv(), rateLimit: null }, scratch("parity-api")),
    admin: sandboxed(
      {
        ...appAdminConfigFromEnv(),
        // Fully capable, so a capability refusal never stands in for a branch.
        adminPrincipal: {
          id: "operations_lead",
          source: "credential_registry",
          can_mutate: true,
          roles: ["admin"],
          capabilities: ["*"],
        },
        // Payload is not running in a unit test; team routes answer for
        // themselves rather than hanging on a bootstrap, and the provider store
        // answers empty rather than dialling Postgres after the test ends.
        payloadAdminAuth: null,
        readProviderConnections: async () => [],
        readProviderCredentials: async () => [],
      },
      scratch("parity-admin"),
    ),
  };

  const unreachable = [];
  let checked = 0;
  for (const route of routes) {
    for (const method of route.methods) {
      checked += 1;
      const response = await dispatch(route, method, configs);
      if (await fellThroughToMethodNotAllowed(response)) unreachable.push(`${method} ${route.pathname} (${route.file})`);
    }
  }

  t.diagnostic(`checked ${checked} declared route/method pairs across ${routes.length} route files`);
  assert.deepEqual(unreachable, []);
});
