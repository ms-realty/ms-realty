import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import { fromRoot } from "../lib/paths.mjs";
import { readBuildMarker } from "../lib/build-marker.mjs";
import { allowsDurableCaseAuthorityMutation } from "../../workers/durable-case-authority.mjs";

const workerSource = fs.readFileSync(fromRoot("workers", "index.js"), "utf8");
const ciWorkflow = fs.readFileSync(fromRoot(".github", "workflows", "ci.yml"), "utf8");
const autoMergeWorkflow = fs.readFileSync(fromRoot(".github", "workflows", "auto-merge.yml"), "utf8");
const dockerfile = fs.readFileSync(fromRoot("Dockerfile"), "utf8");
const wranglerConfig = fs.readFileSync(fromRoot("wrangler.jsonc"), "utf8");
const CONTAINER_RUNTIME_BINDINGS = [
  "MS_REALTY_SESSION_SECRET",
  "MS_REALTY_ADMIN_OPERATORS_JSON",
  "MS_REALTY_ADMIN_CREDENTIALS_JSON",
  "MS_REALTY_ADMIN_TOKEN",
  "MS_REALTY_LEAD_CONTACT_KEY",
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
  "MS_REALTY_ADDITIONAL_PUBLIC_ORIGINS",
  "MS_REALTY_MAX_BODY_BYTES",
];

test("Cloudflare Container forwards every production runtime binding", () => {
  assert.match(workerSource, /pingEndpoint = "localhost\/api\/health";/);

  for (const binding of CONTAINER_RUNTIME_BINDINGS) {
    assert.match(workerSource, new RegExp(`${binding}: this\\.env\\.${binding} \\?\\? ""`));
  }
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
  assert.match(ciWorkflow, /if: github\.event_name == 'push' && github\.ref == 'refs\/heads\/main'/);
  assert.match(ciWorkflow, /CLOUDFLARE_API_TOKEN: \$\{\{ secrets\.CLOUDFLARE_API_TOKEN \}\}/);
  assert.match(ciWorkflow, /wrangler@4\.117\.0 deploy/);
  assert.match(ciWorkflow, /wrangler@4\.117\.0 rollback/);
  assert.match(ciWorkflow, /accounts\/\$\{CLOUDFLARE_ACCOUNT_ID\}\/workers\/subdomain/);
  assert.match(ciWorkflow, /https:\/\/ms-realty\.\$\{subdomain\}\.workers\.dev\/api\/health/);
  assert.match(ciWorkflow, /--build-arg "MS_REALTY_BUILD_MARKER=\$GITHUB_SHA"/);
  assert.match(ciWorkflow, /d\.build_marker !== expected/);
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

test("successful exact-head CI runs merge without a review gate", () => {
  assert.match(autoMergeWorkflow, /workflow_run:/);
  assert.match(autoMergeWorkflow, /pull\.head\.repo\?\.full_name !== `\$\{owner\}\/\$\{repo\}`/);
  assert.match(autoMergeWorkflow, /pull\.head\.sha !== context\.payload\.workflow_run\.head_sha/);
  assert.match(autoMergeWorkflow, /pull\.base\.sha !== reference\.base\.sha/);
  assert.match(autoMergeWorkflow, /github\.rest\.pulls\.updateBranch/);
  assert.match(autoMergeWorkflow, /merge_method: "squash"/);
  assert.doesNotMatch(autoMergeWorkflow, /reviews|reviewers|approved/i);
});
