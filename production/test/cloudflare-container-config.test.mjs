import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fromRoot } from "../lib/paths.mjs";
import { readBuildMarker } from "../lib/build-marker.mjs";
import {
  allowsAdminSessionMutation,
  allowsDurableCaseAuthorityMutation,
  allowsDurableListingAuthorityMutation,
  allowsLeadProbeMutation,
  allowsMcpRequest,
  allowsProviderWebhookMutation,
  allowsPublicLeadMutation,
  hasAdminSessionCookie,
  isPublicAdminPath,
  isPayloadPrivatePath,
} from "../../workers/durable-case-authority.mjs";

const workerSource = fs.readFileSync(fromRoot("workers", "index.js"), "utf8");
const appAdminSource = fs.readFileSync(fromRoot("production", "lib", "app-admin-adapter.mjs"), "utf8");
const legacyHttpSource = fs.readFileSync(fromRoot("production", "lib", "http.mjs"), "utf8");
const ciWorkflow = fs.readFileSync(fromRoot(".github", "workflows", "ci.yml"), "utf8");
const autoMergeWorkflow = fs.readFileSync(fromRoot(".github", "workflows", "auto-merge.yml"), "utf8");
const dockerignore = fs.readFileSync(fromRoot(".dockerignore"), "utf8");
const dockerfile = fs.readFileSync(fromRoot("Dockerfile"), "utf8");
const httpSmokeSource = fs.readFileSync(fromRoot("production", "scripts", "build-http-smoke.mjs"), "utf8");
const wranglerConfig = fs.readFileSync(fromRoot("wrangler.jsonc"), "utf8");
const CONTAINER_RUNTIME_BINDINGS = [
  "MS_REALTY_ADMIN_CREDENTIALS_JSON",
  "MS_REALTY_ADMIN_TOKEN",
  "MS_REALTY_MCP_DURABLE_LISTING_WRITES",
  "MS_REALTY_LEAD_CONTACT_KEY",
  "MS_REALTY_LEAD_DURABLE_STORE_ENABLED",
  "MS_REALTY_PUBLIC_CONTACT_KEY",
  "MS_REALTY_RECOVERY_SIGNING_PUBLIC_KEY",
  "MS_REALTY_ALLOW_PRIVATE_DATABASE_HOST",
  "MS_REALTY_CASE_PAYLOAD_AUTHORITY_ENABLED",
  "MS_REALTY_CASE_REQUEST_PROJECTION_ENABLED",
  "MS_REALTY_WORKSPACE_ID",
  "PAYLOAD_SECRET",
  "DATABASE_URL",
  "HERMES_CHAT_COMPLETIONS_URL",
  "HERMES_API_KEY",
  "HERMES_MODEL",
  "HERMES_PROVIDER_MODE",
  "MS_REALTY_RATE_LIMIT_WINDOW_MS",
  "MS_REALTY_RATE_LIMIT_MAX",
  "MS_REALTY_RATE_LIMIT_DISABLED",
  "MS_REALTY_TRUSTED_WRITE_ORIGINS",
  "MS_REALTY_MCP_ALLOWED_ORIGINS",
  "MS_REALTY_MAX_BODY_BYTES",
  "MS_REALTY_PROVIDER_TOKEN_KEY",
  "MS_REALTY_PROVIDER_OAUTH_STATE_SECRET",
  "MS_REALTY_GOOGLE_OAUTH_CLIENT_ID",
  "MS_REALTY_GOOGLE_OAUTH_CLIENT_SECRET",
  "MS_REALTY_GITHUB_OAUTH_CLIENT_ID",
  "MS_REALTY_GITHUB_OAUTH_CLIENT_SECRET",
  "MS_REALTY_META_APP_ID",
  "MS_REALTY_META_APP_SECRET",
  "MS_REALTY_META_EMBEDDED_SIGNUP_CONFIG_ID",
  "MS_REALTY_META_GRAPH_VERSION",
  "MS_REALTY_META_WEBHOOK_VERIFY_TOKEN",
  "MS_REALTY_VIBER_COMMERCIAL_READY",
  "MS_REALTY_PROVIDER_WEBHOOK_MAX_BYTES",
  "MS_REALTY_VIEWING_DURABLE_STORE_ENABLED",
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
  assert.match(workerSource, /MS_REALTY_SEARCH_ENGINE: "postgres"/);
  assert.doesNotMatch(workerSource, /this\.env\.(?:TYPESENSE|MEILI)_/);

  for (const binding of CONTAINER_RUNTIME_BINDINGS) {
    assert.match(workerSource, new RegExp(`${binding}: this\\.env\\.${binding} \\?\\? ""`));
  }
  assert.match(
    workerSource,
    /MS_REALTY_PUBLIC_ORIGIN: this\.env\.MS_REALTY_WORKER_PUBLIC_ORIGIN \?\? ""/,
  );
  assert.doesNotMatch(workerSource, /OPENROUTER_API_KEY/);
});

test("Cloudflare Container search depends only on Payload Postgres", () => {
  for (const binding of ["MS_REALTY_SEARCH_ENGINE", "TYPESENSE_URL", "TYPESENSE_API_KEY", "MEILI_URL", "MEILI_API_KEY"]) {
    assert.doesNotMatch(workerSource, new RegExp(`${binding}: this\\.env\\.`));
  }
  assert.match(workerSource, /PAYLOAD_SECRET: this\.env\.PAYLOAD_SECRET/);
  assert.match(workerSource, /DATABASE_URL: this\.env\.DATABASE_URL/);
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
  for (const pathname of [
    "/api/admin/cases/",
    "/api/admin/cases/unknown",
    "/api/admin/cases-extra",
    "/api/admin/cases%2Factions",
    "/api%2Fadmin%2Fcases",
    "/api%252Fadmin%252Fcases",
    "/api/admin/cases\\actions",
  ]) {
    assert.equal(allowsDurableCaseAuthorityMutation({ method: "POST", pathname, env }), false, pathname);
  }
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

test("main deploys automatically with coordinated Worker and origin rollback", () => {
  assert.match(ciWorkflow, /repository_dispatch:\n\s+types: \[auto_merge_deploy\]/);
  assert.doesNotMatch(ciWorkflow, /workflow_dispatch:/);
  assert.match(ciWorkflow, /github\.event_name == 'repository_dispatch'/);
  assert.match(ciWorkflow, /github\.event\.action == 'auto_merge_deploy'/);
  assert.match(ciWorkflow, /github\.event\.client_payload\.merge_sha == github\.sha/);
  assert.match(ciWorkflow, /CLOUDFLARE_API_TOKEN: \$\{\{ secrets\.CLOUDFLARE_API_TOKEN \}\}/);
  assert.match(ciWorkflow, /deploy_origin:\n\s+name: Deploy durable origin/);
  assert.match(ciWorkflow, /MS_REALTY_DEPLOY_SSH_PRIVATE_KEY: \$\{\{ secrets\.MS_REALTY_DEPLOY_SSH_PRIVATE_KEY \}\}/);
  assert.match(ciWorkflow, /MS_REALTY_DEPLOY_KNOWN_HOSTS: \$\{\{ secrets\.MS_REALTY_DEPLOY_KNOWN_HOSTS \}\}/);
  const deployJob = ciWorkflow.slice(ciWorkflow.indexOf("\n  deploy:"));
  assert.doesNotMatch(deployJob, /secrets\.DATABASE_URL|secrets\.PAYLOAD_SECRET|payload:migrate/);
  assert.match(ciWorkflow, /wrangler@4\.117\.0 deploy/);
  assert.match(deployJob, /needs: \[check, deploy_origin\]/);
  assert.match(ciWorkflow, /previous_release: \$\{\{ steps\.previous_origin\.outputs\.release \}\}/);
  assert.match(ciWorkflow, /Capture active origin release/);
  assert.match(deployJob, /secret list --name ms-realty --format json/);
  assert.match(deployJob, /name === "MS_REALTY_ORIGIN_TOKEN"/);
  assert.doesNotMatch(deployJob, /secret put MS_REALTY_ORIGIN_TOKEN/);
  assert.match(ciWorkflow, /wrangler@4\.117\.0 rollback/);
  assert.match(ciWorkflow, /accounts\/\$\{CLOUDFLARE_ACCOUNT_ID\}\/workers\/subdomain/);
  assert.match(ciWorkflow, /https:\/\/ms-realty\.\$\{subdomain\}\.workers\.dev\/api\/health/);
  assert.match(ciWorkflow, /--build-arg "MS_REALTY_BUILD_MARKER=\$GITHUB_SHA"/);
  assert.match(ciWorkflow, /d\.build_marker !== expected/);
  assert.match(ciWorkflow, /d\.origin_build_marker !== expected/);
  const captureBlock = ciWorkflow.slice(
    ciWorkflow.indexOf("- name: Capture active Worker version and image marker"),
    ciWorkflow.indexOf("- name: Set exact Container image marker"),
  );
  assert.doesNotMatch(captureBlock, /origin_build_marker/, "the old Worker is captured after the new origin activates");
  const verificationBlock = ciWorkflow.slice(
    ciWorkflow.indexOf("- name: Verify deployed Worker"),
    ciWorkflow.indexOf("- name: Roll back failed deployment"),
  );
  assert.match(verificationBlock, /for attempt in \$\(seq 1 100\); do/);
  assert.match(verificationBlock, /d\.origin_build_marker !== expected/);
  assert.match(verificationBlock, /\/api\/ready/);
  assert.match(verificationBlock, /d\.launch_ready !== true/);
  assert.match(verificationBlock, /d\.blockers\.length !== 0/);
  const rollbackBlock = ciWorkflow.slice(ciWorkflow.indexOf("- name: Roll back failed deployment"));
  assert.match(rollbackBlock, /needs\.deploy_origin\.outputs\.previous_release/);
  assert.match(rollbackBlock, /if \[ "\$version" != "\$previous_version" \]/);
  assert.match(rollbackBlock, /mv -Tf .*link.*\/opt\/ms-realty\/current/);
  assert.match(rollbackBlock, /d\.origin_build_marker !== origin/);
  assert.match(rollbackBlock, /rollback-ready\.json/);
  assert.match(rollbackBlock, /d\.launch_ready !== true/);
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
  assert.match(dockerignore, /^!workers\/index\.js$/m, "runtime evidence must be able to inspect the Worker boundary");
});

test("validation fixtures cannot become Container lead workflow state", () => {
  assert.doesNotMatch(httpSmokeSource, /fs\.copyFileSync\(/);
  for (const ledger of [
    "lead-ledger",
    "lead-contact-vault",
    "lead-assignments",
    "reply-outbox",
    "reply-delivery-outcomes",
    "lead-pipeline-outcomes",
    "viewings",
    "viewing-follow-ups",
    "seller-pipeline",
    "seller-pipeline-outcomes",
    "deals",
    "account-ledger",
    "document-checklist-outcomes",
    "consent-ledger",
    "audit-log",
  ]) {
    for (const suffix of [".jsonl", ".sqlite", ".sqlite-wal", ".sqlite-shm"]) {
      const file = `${ledger}${suffix}`;
      assert.match(dockerignore, new RegExp(`^production/data/${file.replaceAll(".", "\\.")}$`, "m"), file);
    }
  }
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
  assert.match(
    workerSource,
    /MS_REALTY_MCP_DURABLE_LISTING_WRITES: this\.env\.MS_REALTY_MCP_DURABLE_LISTING_WRITES \?\? ""/,
  );
  assert.doesNotMatch(wranglerConfig, /MS_REALTY_MCP_DURABLE_LISTING_WRITES/);
  assert.doesNotMatch(
    wranglerConfig,
    /"MS_REALTY_PUBLIC_ORIGIN"\s*:/,
    "strict deploy must not shadow the live remote secret",
  );

  const env = { MS_REALTY_WORKER_PUBLIC_ORIGIN: "https://ms-realty.example.workers.dev" };
  assert.equal(allowsMcpRequest({ method: "POST", pathname: "/mcp", env }), true);
  assert.equal(allowsMcpRequest({ method: "DELETE", pathname: "/mcp", env }), true);
  assert.equal(allowsMcpRequest({ method: "PATCH", pathname: "/mcp", env }), false);
  assert.equal(allowsMcpRequest({ method: "POST", pathname: "/mcp/extra", env }), false);
  assert.equal(allowsMcpRequest({ method: "POST", pathname: "/api/leads", env }), false);
  assert.equal(
    allowsMcpRequest({ method: "POST", pathname: "/mcp", env: { MS_REALTY_WORKER_PUBLIC_ORIGIN: "  " } }),
    false,
  );
  assert.equal(
    allowsMcpRequest({ method: "POST", pathname: "/mcp", env: { MS_REALTY_PUBLIC_ORIGIN: "https://legacy.invalid" } }),
    false,
  );
  assert.equal(allowsMcpRequest({ method: "POST", pathname: "/mcp", env: {} }), false);
});

test("Cloudflare Container admits only exact Payload-backed browser auth mutations", () => {
  assert.match(workerSource, /allowsAdminSessionMutation\(\{ request, method: request\.method, pathname: url\.pathname \}\)/);
  const request = (cookie = "") => new Request("https://ms-realty.example/admin", { headers: cookie ? { cookie } : {} });
  assert.equal(allowsAdminSessionMutation({ request: request(), method: "POST", pathname: "/admin/login" }), true);
  assert.equal(allowsAdminSessionMutation({ request: request(), method: "GET", pathname: "/admin/login" }), false);
  for (const pathname of [
    "/admin/login/",
    "/admin/login/extra",
    "/admin/logins",
    "/admin%2Flogin",
    "/admin/login%2Fextra",
    "/admin%252Flogin",
    "/admin\\login",
  ]) {
    assert.equal(allowsAdminSessionMutation({ request: request(), method: "POST", pathname }), false, pathname);
  }

  assert.equal(allowsAdminSessionMutation({ request: request(), method: "POST", pathname: "/admin/logout" }), false);
  assert.equal(
    allowsAdminSessionMutation({ request: request("ms_admin=session"), method: "POST", pathname: "/admin/logout" }),
    true,
  );
  assert.equal(
    allowsAdminSessionMutation({ request: request("ms_admin=session"), method: "POST", pathname: "/api/admin/team" }),
    true,
  );
  for (const pathname of [
    "/api/admin/team/",
    "/api/admin/team/extra",
    "/api/admin/teams",
    "/api/admin/team%2Fextra",
    "/api%2Fadmin%2Fteam",
    "/api%252Fadmin%252Fteam",
    "/api/admin/team\\extra",
  ]) {
    assert.equal(
      allowsAdminSessionMutation({ request: request("ms_admin=session"), method: "POST", pathname }),
      false,
      pathname,
    );
  }
  assert.equal(
    allowsAdminSessionMutation({ request: request("ms_admin=session"), method: "POST", pathname: "/api/admin/listings/edit" }),
    false,
  );
  assert.equal(
    allowsAdminSessionMutation({ request: request("other=session"), method: "POST", pathname: "/api/admin/team" }),
    false,
  );
  assert.equal(hasAdminSessionCookie("other=1; ms_admin=payload.jwt.session"), true);
  assert.equal(hasAdminSessionCookie("ms_admin=; other=1"), false);
  assert.equal(hasAdminSessionCookie("xms_admin=session"), false);
});

test("Cloudflare Container admits only exact Payload-backed listing mutations", () => {
  assert.match(
    workerSource,
    /allowsDurableListingAuthorityMutation\(\{ method: request\.method, pathname: url\.pathname, env \}\)/,
  );
  const env = {
    PAYLOAD_SECRET: "payload-secret",
    DATABASE_URL: "postgres://payload:secret@db.example.test:5432/ms_realty",
  };
  for (const pathname of ["/api/admin/listings/edit", "/api/admin/listings/status"]) {
    assert.equal(allowsDurableListingAuthorityMutation({ method: "POST", pathname, env }), true, pathname);
  }
  for (const pathname of [
    "/api/admin/listings/edit/",
    "/api/admin/listings/edit/extra",
    "/api/admin/listings/edits",
    "/api/admin/listings/edit%2Fextra",
    "/api%2Fadmin%2Flistings%2Fedit",
    "/api%252Fadmin%252Flistings%252Fedit",
    "/api/admin/listings\\edit",
    "/api/admin/listings/status/",
    "/api/admin/listings/status/extra",
    "/api/admin/listings/statuses",
  ]) {
    assert.equal(allowsDurableListingAuthorityMutation({ method: "POST", pathname, env }), false, pathname);
  }
  assert.equal(allowsDurableListingAuthorityMutation({ method: "PATCH", pathname: "/api/admin/listings/edit", env }), false);
  assert.equal(
    allowsDurableListingAuthorityMutation({ method: "POST", pathname: "/api/admin/listings/edit", env: { ...env, DATABASE_URL: "" } }),
    false,
  );
  assert.equal(
    allowsDurableListingAuthorityMutation({ method: "POST", pathname: "/api/admin/listings/status", env: { ...env, PAYLOAD_SECRET: "" } }),
    false,
  );
});

test("Cloudflare Container route matrix rejects every file-only admin mutation", () => {
  const env = {
    MS_REALTY_CASE_PAYLOAD_AUTHORITY_ENABLED: "true",
    MS_REALTY_CASE_REQUEST_PROJECTION_ENABLED: "false",
    MS_REALTY_WORKSPACE_ID: "workspace-sandanski",
    PAYLOAD_SECRET: "payload-secret",
    DATABASE_URL: "postgres://payload:secret@db.example.test:5432/ms_realty",
  };
  const request = new Request("https://ms-realty.example/admin", { headers: { cookie: "ms_admin=session" } });
  const discovered = new Set(
    [appAdminSource, legacyHttpSource].flatMap((source) =>
      [...source.matchAll(/request\.method === "POST" && url\.pathname === "(\/api\/admin\/[^"]+)"/g)].map((match) => match[1]),
    ),
  );
  const durable = new Set([
    "/api/admin/team",
    "/api/admin/listings/edit",
    "/api/admin/listings/status",
    "/api/admin/cases",
    "/api/admin/cases/actions",
    "/api/admin/cases/conditions",
    "/api/admin/cases/conditions/actions",
  ]);

  for (const pathname of durable) assert.equal(discovered.has(pathname), true, `missing live route ${pathname}`);
  for (const pathname of discovered) {
    const admitted =
      allowsAdminSessionMutation({ request, method: "POST", pathname }) ||
      allowsDurableListingAuthorityMutation({ method: "POST", pathname, env }) ||
      allowsDurableCaseAuthorityMutation({ method: "POST", pathname, env });
    assert.equal(admitted, durable.has(pathname), pathname);
  }
  assert.ok(discovered.size > durable.size, "matrix must exercise file-only routes");
});

test("Cloudflare Container hides every external Payload UI, identity REST, and GraphQL path variant", () => {
  for (const pathname of [
    "/payload-admin",
    "/payload-admin/",
    "/payload-admin/collections/admins",
    "/payload%2dadmin/collections/admins",
    "/payload%252dadmin%252fcollections%252fadmins",
    "/payload-admin%2f..%2fpayload-admin",
    "/api/admins",
    "/api/admins/first-register",
    "/api%2fadmins%2ffirst-register",
    "/api%252fadmins%252ffirst-register",
    "/graphql",
    "/graphql/",
    "/graphql/query",
    "/graph%71l",
    "/graph%2571l",
    "/graphql%2fquery",
    "/graphql%252fquery",
    "/graphql-playground",
    "/graphql-playground/",
    "/graphql%2dplayground",
    "/graphql%252dplayground%252f",
    "/api/graphql",
    "/api/graphql/",
    "/api%2fgraphql",
    "/api%252fgraphql%252f",
  ]) {
    assert.equal(isPayloadPrivatePath(pathname), true, pathname);
  }
  for (const pathname of [
    "/admin",
    "/admin/login",
    "/api/admin/team",
    "/api/admins-public",
    "/graphql-public",
    "/graphql-playground-public",
    "/api/graphql-public",
  ]) {
    assert.equal(isPayloadPrivatePath(pathname), false, pathname);
  }
  assert.match(workerSource, /isPayloadPrivatePath\(url\.pathname\)/);
});

test("production workers.dev forwards the custom admin while isolated drill hosts hide it", () => {
  assert.doesNotMatch(workerSource, /MS_REALTY_PREVIEW_ADMIN_KEY|previewAdminGate/);
  assert.match(workerSource, /if \(preview && isPublicAdminPath\(url\.pathname\)\) return payloadPrivateResponse\(\);/);
  assert.match(workerSource, /isPayloadPrivatePath\(url\.pathname\)/);
  for (const pathname of [
    "/admin",
    "/admin/login",
    "/admin%2Flogin",
    "/admin\\login",
    "/api/admin",
    "/api/admin/launch-readiness",
    "/api%2Fadmin%2Flaunch-readiness",
  ]) {
    assert.equal(isPublicAdminPath(pathname), true, pathname);
  }
  for (const pathname of ["/", "/bg", "/api/ready", "/api/admins", "/administrator"]) {
    assert.equal(isPublicAdminPath(pathname), false, pathname);
  }
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

test("Cloudflare Container admits public leads only with a complete durable runtime", () => {
  const complete = {
    MS_REALTY_LEAD_DURABLE_STORE_ENABLED: "true",
    PAYLOAD_SECRET: "p".repeat(32),
    DATABASE_URL: "postgres://payload:secret@db.example.test/ms_realty",
    MS_REALTY_LEAD_CONTACT_KEY: "c".repeat(32),
    MS_REALTY_WORKSPACE_ID: "workspace-sandanski",
  };
  const allowed = (env = complete, pathname = "/api/leads", method = "POST") =>
    allowsPublicLeadMutation({ env, method, pathname });

  assert.equal(allowed(), true);
  assert.equal(allowed(complete, "/api/leads/"), false);
  assert.equal(allowed(complete, "/api/leads/extra"), false);
  assert.equal(allowed(complete, "/api%2fleads"), false);
  assert.equal(allowed(complete, "/api/leads", "PUT"), false);
  for (const key of [
    "MS_REALTY_LEAD_DURABLE_STORE_ENABLED",
    "PAYLOAD_SECRET",
    "DATABASE_URL",
    "MS_REALTY_LEAD_CONTACT_KEY",
    "MS_REALTY_WORKSPACE_ID",
  ]) {
    assert.equal(allowed({ ...complete, [key]: "" }), false, key);
    assert.equal(allowed({ ...complete, [key]: "   " }), false, `${key} whitespace`);
  }
  const missingWorkspace = { ...complete };
  delete missingWorkspace.MS_REALTY_WORKSPACE_ID;
  assert.equal(allowed(missingWorkspace), false, "MS_REALTY_WORKSPACE_ID missing");
  assert.equal(allowed({ ...complete, MS_REALTY_LEAD_DURABLE_STORE_ENABLED: "false" }), false);
  assert.equal(allowed({ ...complete, MS_REALTY_LEAD_CONTACT_KEY: "short" }), false);
  assert.match(workerSource, /allowsPublicLeadMutation\(\{ method: request\.method, pathname: url\.pathname, env \}\)/);
});

test("Cloudflare Container admits public funnel events only through the same complete durable runtime", async () => {
  const { allowsPublicEventMutation } = await import("../../workers/durable-case-authority.mjs");
  const complete = {
    MS_REALTY_EVENT_DURABLE_STORE_ENABLED: "true",
    PAYLOAD_SECRET: "p".repeat(32),
    DATABASE_URL: "postgres://payload:secret@db.example.test/ms_realty",
  };
  assert.equal(allowsPublicEventMutation({ env: complete, method: "POST", pathname: "/api/events" }), true);
  assert.equal(allowsPublicEventMutation({ env: complete, method: "POST", pathname: "/api/events/" }), false);
  assert.equal(allowsPublicEventMutation({ env: complete, method: "GET", pathname: "/api/events" }), false);
  assert.equal(allowsPublicEventMutation({ env: { ...complete, DATABASE_URL: "" }, method: "POST", pathname: "/api/events" }), false);
  assert.match(workerSource, /allowsPublicEventMutation/);
});

test("Cloudflare Container admits only exact signed-provider webhook paths with durable storage", () => {
  const complete = {
    PAYLOAD_SECRET: "p".repeat(32),
    DATABASE_URL: "postgres://payload:secret@db.example.test/ms_realty",
    MS_REALTY_PROVIDER_TOKEN_KEY: "k".repeat(32),
    MS_REALTY_META_APP_SECRET: "m".repeat(16),
  };
  const allowed = (pathname, env = complete, method = "POST") =>
    allowsProviderWebhookMutation({ env, method, pathname });

  assert.equal(allowed("/api/webhooks/whatsapp"), true);
  assert.equal(allowed("/api/webhooks/viber"), true);
  assert.equal(allowed("/api/webhooks/whatsapp/"), false);
  assert.equal(allowed("/api/webhooks/whatsapp", complete, "GET"), false);
  assert.equal(allowed("/api/webhooks/whatsapp", { ...complete, MS_REALTY_META_APP_SECRET: "" }), false);
  assert.equal(allowed("/api/webhooks/viber", { ...complete, MS_REALTY_META_APP_SECRET: "" }), true);
  for (const key of ["PAYLOAD_SECRET", "DATABASE_URL", "MS_REALTY_PROVIDER_TOKEN_KEY"]) {
    assert.equal(allowed("/api/webhooks/viber", { ...complete, [key]: "" }), false, key);
  }
  assert.match(workerSource, /allowsProviderWebhookMutation/);
});
