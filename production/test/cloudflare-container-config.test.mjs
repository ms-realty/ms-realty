import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fromRoot } from "../lib/paths.mjs";
import { readBuildMarker } from "../lib/build-marker.mjs";
import {
  PAYLOAD_ADMIN_CRUD_COLLECTIONS,
  allowsPayloadAdminMutation,
  allowsPayloadAdminServerAction,
  allowsDurableCaseAuthorityMutation,
  allowsLeadProbeMutation,
  allowsMcpRequest,
  isPayloadFirstRegisterPath,
} from "../../workers/durable-case-authority.mjs";

const workerSource = fs.readFileSync(fromRoot("workers", "index.js"), "utf8");
const ciWorkflow = fs.readFileSync(fromRoot(".github", "workflows", "ci.yml"), "utf8");
const autoMergeWorkflow = fs.readFileSync(fromRoot(".github", "workflows", "auto-merge.yml"), "utf8");
const dockerfile = fs.readFileSync(fromRoot("Dockerfile"), "utf8");
const wranglerConfig = fs.readFileSync(fromRoot("wrangler.jsonc"), "utf8");
const CONTAINER_RUNTIME_BINDINGS = [
  "MS_REALTY_ADMIN_CREDENTIALS_JSON",
  "MS_REALTY_ADMIN_TOKEN",
  "MS_REALTY_LEAD_CONTACT_KEY",
  "MS_REALTY_LEAD_DURABLE_STORE_ENABLED",
  "MS_REALTY_PUBLIC_CONTACT_KEY",
  "MS_REALTY_ALLOW_PRIVATE_DATABASE_HOST",
  "MS_REALTY_CASE_PAYLOAD_AUTHORITY_ENABLED",
  "MS_REALTY_CASE_REQUEST_PROJECTION_ENABLED",
  "MS_REALTY_WORKSPACE_ID",
  "PAYLOAD_SECRET",
  "DATABASE_URL",
  "TYPESENSE_URL",
  "TYPESENSE_API_KEY",
  "TYPESENSE_COLLECTION",
  "MEILI_URL",
  "MEILI_API_KEY",
  "MEILI_INDEX",
  "HERMES_CHAT_COMPLETIONS_URL",
  "HERMES_API_KEY",
  "HERMES_MODEL",
  "HERMES_PROVIDER_MODE",
  "MS_REALTY_RATE_LIMIT_WINDOW_MS",
  "MS_REALTY_RATE_LIMIT_MAX",
  "MS_REALTY_RATE_LIMIT_DISABLED",
  "MS_REALTY_TRUSTED_WRITE_ORIGINS",
  "MS_REALTY_MCP_ALLOWED_ORIGINS",
  "MS_REALTY_PUBLIC_ORIGIN",
  "MS_REALTY_MAX_BODY_BYTES",
];

// Directories a forwarded binding may legitimately be read from. workers/ and
// production/test/ are excluded on purpose: forwarding a name and asserting
// that it is forwarded is circular, and that circularity is what let
// MS_REALTY_ADMIN_OPERATORS_JSON reach production as a Cloudflare secret that
// no code ever read, while admin-auth.mjs looked for
// MS_REALTY_ADMIN_CREDENTIALS_JSON and every admin request 401'd.
const BINDING_CONSUMER_ROOTS = ["production/lib", "production/scripts", "app", "payload.config.js"];
const SOURCE_EXTENSIONS = new Set([".mjs", ".js", ".jsx", ".ts", ".tsx"]);

function sourceFilesUnder(target) {
  if (!fs.statSync(target).isDirectory()) return SOURCE_EXTENSIONS.has(path.extname(target)) ? [target] : [];
  return fs
    .readdirSync(target, { withFileTypes: true })
    .flatMap((entry) =>
      entry.isDirectory()
        ? sourceFilesUnder(path.join(target, entry.name))
        : SOURCE_EXTENSIONS.has(path.extname(entry.name))
          ? [path.join(target, entry.name)]
          : [],
    );
}

test("Cloudflare Container forwards every production runtime binding", () => {
  assert.match(workerSource, /pingEndpoint = "localhost\/api\/health";/);

  for (const binding of CONTAINER_RUNTIME_BINDINGS) {
    assert.match(workerSource, new RegExp(`${binding}: this\\.env\\.${binding} \\?\\? ""`));
  }
});

test("every forwarded binding is actually read by the running app", () => {
  const forwarded = [...workerSource.matchAll(/^\s+(MS_REALTY_[A-Z0-9_]+|PAYLOAD_SECRET|DATABASE_URL|TYPESENSE_[A-Z_]+|MEILI_[A-Z_]+|HERMES_[A-Z_]+): this\.env\./gm)].map(
    ([, name]) => name,
  );
  assert.ok(forwarded.length > 0, "expected the Worker to forward runtime bindings");

  const dead = forwarded.filter((binding) => {
    const found = BINDING_CONSUMER_ROOTS.some((root) => {
      const target = fromRoot(...root.split("/"));
      if (!fs.existsSync(target)) return false;
      return sourceFilesUnder(target).some((file) => fs.readFileSync(file, "utf8").includes(binding));
    });
    return !found;
  });

  assert.deepEqual(dead, [], `Worker forwards bindings that nothing reads: ${dead.join(", ")}`);
});

test("Cloudflare Container allows only configured durable case-authority writes", () => {
  assert.match(workerSource, /const MUTATING_METHODS = new Set\(\["POST", "PUT", "PATCH", "DELETE"\]\);/);
  assert.match(workerSource, /allowsDurableCaseAuthorityMutation\(\{ method: request\.method, pathname: url\.pathname, env \}\)/);
  assert.match(workerSource, /status: 503,/);
  assert.match(workerSource, /"cache-control": "no-store"/);

  const env = {
    MS_REALTY_CASE_PAYLOAD_AUTHORITY_ENABLED: "true",
    MS_REALTY_CASE_REQUEST_PROJECTION_ENABLED: "false",
    MS_REALTY_WORKSPACE_ID: "workspace-sandanski",
    PAYLOAD_SECRET: "payload-secret",
    DATABASE_URL: "postgres://payload:secret@db.example.test:5432/ms_realty",
  };
  for (const pathname of [
    "/api/admin/cases",
    "/api/admin/cases/actions",
    "/api/admin/cases/conditions",
    "/api/admin/cases/conditions/actions",
  ]) {
    assert.equal(allowsDurableCaseAuthorityMutation({ method: "POST", pathname, env }), true);
  }
  assert.equal(allowsDurableCaseAuthorityMutation({ method: "PATCH", pathname: "/api/admin/cases", env }), false);
  assert.equal(allowsDurableCaseAuthorityMutation({ method: "POST", pathname: "/api/admin/cases/unknown", env }), false);
  assert.equal(
    allowsDurableCaseAuthorityMutation({
      method: "POST",
      pathname: "/api/admin/cases",
      env: { ...env, MS_REALTY_CASE_REQUEST_PROJECTION_ENABLED: "true" },
    }),
    false,
  );
  assert.equal(
    allowsDurableCaseAuthorityMutation({
      method: "POST",
      pathname: "/api/admin/cases",
      env: { ...env, DATABASE_URL: "" },
    }),
    false,
  );
  assert.equal(
    allowsDurableCaseAuthorityMutation({
      method: "POST",
      pathname: "/api/admin/cases",
      env: { ...env, MS_REALTY_WORKSPACE_ID: "" },
    }),
    false,
  );
  assert.equal(
    allowsDurableCaseAuthorityMutation({
      method: "POST",
      pathname: "/api/admin/cases",
      env: { ...env, MS_REALTY_CASE_PAYLOAD_AUTHORITY_ENABLED: "false" },
    }),
    false,
  );
});

test("main deploys automatically with image-marker rollback", () => {
  assert.match(ciWorkflow, /repository_dispatch:\n\s+types: \[auto_merge_deploy\]/);
  assert.doesNotMatch(ciWorkflow, /workflow_dispatch:/);
  assert.match(ciWorkflow, /github\.event_name == 'repository_dispatch'/);
  assert.match(ciWorkflow, /github\.event\.action == 'auto_merge_deploy'/);
  assert.match(ciWorkflow, /github\.event\.client_payload\.merge_sha == github\.sha/);
  assert.match(ciWorkflow, /CLOUDFLARE_API_TOKEN: \$\{\{ secrets\.CLOUDFLARE_API_TOKEN \}\}/);
  assert.match(ciWorkflow, /wrangler@4\.117\.0 deploy/);
  assert.match(ciWorkflow, /wrangler@4\.117\.0 rollback/);
  assert.match(ciWorkflow, /accounts\/\$\{CLOUDFLARE_ACCOUNT_ID\}\/workers\/subdomain/);
  assert.match(ciWorkflow, /https:\/\/ms-realty\.\$\{subdomain\}\.workers\.dev\/api\/health/);
  assert.match(ciWorkflow, /--build-arg "MS_REALTY_BUILD_MARKER=\$GITHUB_SHA"/);
  assert.match(ciWorkflow, /d\.build_marker !== expected/);
  const verificationBlock = ciWorkflow.slice(
    ciWorkflow.indexOf("- name: Verify deployed Worker"),
    ciWorkflow.indexOf("- name: Roll back failed deployment"),
  );
  assert.match(verificationBlock, /for attempt in \$\(seq 1 100\); do/);
  assert.doesNotMatch(ciWorkflow, /^\s+environment:/m);
});

test("health marker is baked into the Container image, not forwarded by the Worker", () => {
  const markerDirectory = fs.mkdtempSync(`${os.tmpdir()}/ms-realty-build-marker-`);
  const markerPath = `${markerDirectory}/marker`;
  const marker = "a".repeat(40);
  try {
    fs.writeFileSync(markerPath, `${marker}\n`);

    assert.equal(readBuildMarker(markerPath), marker);
    fs.writeFileSync(markerPath, "not-a-commit\n");
    assert.equal(readBuildMarker(markerPath), "unversioned");
    assert.match(dockerfile, /ARG MS_REALTY_BUILD_MARKER=unversioned/);
    assert.match(dockerfile, /printf '%s\\n' "\$MS_REALTY_BUILD_MARKER" > \.ms-realty-build-marker/);
    assert.match(wranglerConfig, /"image_vars": \{ "MS_REALTY_BUILD_MARKER": "__MS_REALTY_BUILD_MARKER__" \}/);
    assert.doesNotMatch(workerSource, /MS_REALTY_BUILD_MARKER/);
  } finally {
    fs.rmSync(markerDirectory, { recursive: true, force: true });
  }
});

test("Cloudflare Container refreshes Payload evidence before serving readiness", () => {
  const payloadEvidence = dockerfile.indexOf("node production/scripts/build-payload-runtime-report.mjs");
  const aggregateReadiness = dockerfile.indexOf("node production/scripts/build-launch-readiness.mjs");
  const nextRuntime = dockerfile.indexOf("exec ./node_modules/.bin/next start");

  assert.ok(payloadEvidence > 0, "container startup must capture current Payload evidence");
  assert.ok(aggregateReadiness > payloadEvidence, "aggregate readiness must consume the fresh Payload report");
  assert.ok(nextRuntime > aggregateReadiness, "Next must not serve stale readiness while startup evidence is rebuilding");
});

test("successful exact-head CI runs merge without a review gate", () => {
  assert.match(autoMergeWorkflow, /workflow_run:/);
  assert.match(autoMergeWorkflow, /pull\.head\.repo\?\.full_name !== `\$\{owner\}\/\$\{repo\}`/);
  assert.match(autoMergeWorkflow, /pull\.head\.sha !== context\.payload\.workflow_run\.head_sha/);
  assert.match(autoMergeWorkflow, /pull\.base\.sha !== reference\.base\.sha/);
  assert.match(autoMergeWorkflow, /github\.rest\.pulls\.updateBranch/);
  assert.match(autoMergeWorkflow, /merge_method: "squash"/);
  assert.doesNotMatch(autoMergeWorkflow, /actions: write/);
  assert.match(autoMergeWorkflow, /github\.rest\.repos\.createDispatchEvent/);
  assert.match(autoMergeWorkflow, /event_type: "auto_merge_deploy"/);
  assert.match(autoMergeWorkflow, /client_payload: \{ merge_sha: result\.sha \}/);
  assert.doesNotMatch(autoMergeWorkflow, /reviews|reviewers|approved/i);
});

test("Cloudflare Container admits authenticated MCP without opening ledger writes", () => {
  assert.match(workerSource, /allowsMcpRequest\(\{ method: request\.method, pathname: url\.pathname, env \}\)/);
  assert.match(workerSource, /MS_REALTY_MCP_WRITES_DISABLED: "1"/);

  const env = { MS_REALTY_PUBLIC_ORIGIN: "https://ms-realty.example.workers.dev" };
  assert.equal(allowsMcpRequest({ method: "POST", pathname: "/mcp", env }), true);
  assert.equal(allowsMcpRequest({ method: "DELETE", pathname: "/mcp", env }), true);
  assert.equal(allowsMcpRequest({ method: "PATCH", pathname: "/mcp", env }), false);
  assert.equal(allowsMcpRequest({ method: "POST", pathname: "/mcp/extra", env }), false);
  assert.equal(allowsMcpRequest({ method: "POST", pathname: "/api/leads", env }), false);
  assert.equal(allowsMcpRequest({ method: "POST", pathname: "/mcp", env: { MS_REALTY_PUBLIC_ORIGIN: "  " } }), false);
  assert.equal(allowsMcpRequest({ method: "POST", pathname: "/mcp", env: {} }), false);
});

test("Cloudflare Container admits only the required Payload admin auth and session-backed CRUD mutations", () => {
  assert.match(workerSource, /allowsPayloadAdminMutation\(\{ request, pathname: url\.pathname \}\)/);
  assert.match(workerSource, /allowsPayloadAdminServerAction\(\{ request, pathname: url\.pathname \}\)/);
  assert.match(workerSource, /isPayloadFirstRegisterPath\(url\.pathname\)/);

  const request = (pathname, { method = "POST", cookie = "", override = "" } = {}) =>
    new Request(`https://ms-realty.example${pathname}`, {
      method,
      headers: {
        ...(cookie ? { cookie } : {}),
        ...(override ? { "x-payload-http-method-override": override } : {}),
      },
    });
  const allows = (pathname, options) =>
    allowsPayloadAdminMutation({ request: request(pathname, options), pathname });
  const session = "payload-token=valid-looking-session";

  assert.equal(allows("/api/admins/login"), true, "login is the sole anonymous Payload mutation");
  assert.equal(allows("/api/admins/logout"), false);
  assert.equal(allows("/api/admins/logout", { cookie: session }), true);
  assert.equal(allows("/api/admins/refresh-token", { cookie: session }), true);
  assert.equal(allows("/api/admins/me", { method: "GET", cookie: session }), false, "me is read-only and bypasses the mutation gate");

  assert.equal(allows("/api/admins", { cookie: session }), true, "an authenticated admin may create an operator");
  assert.equal(allows("/api/admins"), false, "anonymous operator creation never reaches Payload");
  assert.equal(allows("/api/admins/operator-1", { method: "PATCH", cookie: session }), true);
  assert.equal(allows("/api/admins/operator-1", { method: "DELETE", cookie: session }), true);

  assert.equal(isPayloadFirstRegisterPath("/api/admins/first-register"), true);
  assert.equal(isPayloadFirstRegisterPath("/api/admins/%66irst-register"), true);
  assert.equal(isPayloadFirstRegisterPath("/api/admins/%2566irst-register"), true);
  for (const pathname of ["/api/admins/first-register", "/api/admins/first-register/", "/api/admins/%66irst-register", "/api/admins/%2566irst-register"]) {
    assert.equal(allows(pathname, { cookie: session }), false, `${pathname} must remain permanently closed`);
  }
  for (const pathname of ["/api/admins/forgot-password", "/api/admins/reset-password", "/api/admins/unlock", "/api/admins/verify/token"]) {
    assert.equal(allows(pathname, { cookie: session }), false, `${pathname} is outside the production auth contract`);
  }

  for (const [pathname, options] of [
    ["/api/listings", { cookie: session }],
    ["/api/listings/MS-CRAWL-0001", { method: "PATCH", cookie: session }],
    ["/api/listings/MS-CRAWL-0001/duplicate", { cookie: session }],
    ["/api/listings/versions/version-1", { cookie: session }],
    ["/api/listings/access/MS-CRAWL-0001", { cookie: session }],
    ["/api/listings/MS-CRAWL-0001", { cookie: session, override: "GET" }],
    ["/api/payload-preferences/collection-listings", { cookie: session }],
    ["/api/payload-preferences/collection-listings", { method: "DELETE", cookie: session }],
  ]) {
    assert.equal(allows(pathname, options), true, `${options.method || "POST"} ${pathname} should be admitted`);
  }

  assert.equal(PAYLOAD_ADMIN_CRUD_COLLECTIONS.has("listings"), true);
  assert.equal(PAYLOAD_ADMIN_CRUD_COLLECTIONS.has("admins"), true);
  assert.equal(PAYLOAD_ADMIN_CRUD_COLLECTIONS.has("search_outbox"), false);
  assert.equal(PAYLOAD_ADMIN_CRUD_COLLECTIONS.has("listing_enrichment_tasks"), false);
  for (const pathname of ["/api/search_outbox", "/api/listing_enrichment_tasks", "/api/lead_contacts", "/api/admin/cases"]) {
    assert.equal(allows(pathname, { cookie: session }), false, `${pathname} is not a browser-managed Payload collection`);
  }
});

test("Cloudflare Container admits only authenticated Payload Admin server actions", () => {
  const action = "60b8a7da0666a0842c71c00e7403343f1dab3ab0";
  const request = ({ pathname = "/payload-admin", method = "POST", cookie = "payload-token=session", nextAction = action } = {}) =>
    new Request(`https://ms-realty.example${pathname}`, {
      method,
      headers: {
        ...(cookie ? { cookie } : {}),
        ...(nextAction ? { "next-action": nextAction } : {}),
      },
    });
  const allows = (options = {}) => {
    const candidate = request(options);
    return allowsPayloadAdminServerAction({ request: candidate, pathname: new URL(candidate.url).pathname });
  };

  assert.equal(allows(), true);
  assert.equal(allows({ pathname: "/payload-admin/collections/listings" }), true);
  assert.equal(allows({ cookie: "" }), false, "anonymous server actions remain closed");
  assert.equal(allows({ nextAction: "" }), false);
  assert.equal(allows({ nextAction: "not-a-next-action" }), false);
  assert.equal(allows({ method: "PATCH" }), false);
  assert.equal(allows({ pathname: "/admin" }), false, "the legacy workbench is not a Payload server-action prefix");
  assert.equal(allows({ pathname: "/payload-admin/create-first-user" }), false);
});

test("Cloudflare Container admits only the secret-backed durable lead probe", async () => {
  const env = { MS_REALTY_LEAD_PROBE_TOKEN: "launch-probe-secret" };
  const request = (method = "POST", token = "launch-probe-secret") =>
    new Request("https://ms-realty.example/api/leads", {
      method,
      headers: { "x-ms-realty-lead-probe": token },
    });

  assert.equal(await allowsLeadProbeMutation({ request: request(), pathname: "/api/leads", env }), true);
  assert.equal(await allowsLeadProbeMutation({ request: request("POST", "wrong"), pathname: "/api/leads", env }), false);
  assert.equal(await allowsLeadProbeMutation({ request: request("GET"), pathname: "/api/leads", env }), false);
  assert.equal(await allowsLeadProbeMutation({ request: request(), pathname: "/api/leads/extra", env }), false);
  assert.equal(await allowsLeadProbeMutation({ request: request(), pathname: "/api/leads", env: {} }), false);
  assert.match(workerSource, /await allowsLeadProbeMutation\(\{ request, pathname: url\.pathname, env \}\)/);
  assert.match(workerSource, /headers\.delete\(LEAD_PROBE_HEADER\)/);
});
