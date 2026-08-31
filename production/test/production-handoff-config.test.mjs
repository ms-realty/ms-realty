import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fromRoot } from "../lib/paths.mjs";

const caddy = fs.readFileSync(fromRoot("production", "Caddyfile.production-review"), "utf8");
const compose = fs.readFileSync(fromRoot("production", "docker-compose.production-review.yml"), "utf8");
const localCompose = fs.readFileSync(fromRoot("production", "docker-compose.local-production.yml"), "utf8");
const dockerfile = fs.readFileSync(fromRoot("production", "Dockerfile"), "utf8");
const cloudflareDockerfile = fs.readFileSync(fromRoot("Dockerfile"), "utf8");
const deployScript = fs.readFileSync(fromRoot("production", "scripts", "deploy-production-review.sh"), "utf8");
const ciWorkflow = fs.readFileSync(fromRoot(".github", "workflows", "ci.yml"), "utf8");
const searchSyncCli = fs.readFileSync(fromRoot("production", "scripts", "run-search-engine-sync.mjs"), "utf8");
const searchQueryCli = fs.readFileSync(fromRoot("production", "scripts", "run-search-engine-query.mjs"), "utf8");
const liveServiceEvidenceCli = fs.readFileSync(fromRoot("production", "scripts", "run-live-service-evidence.mjs"), "utf8");
const worker = fs.readFileSync(fromRoot("workers", "index.js"), "utf8");
const previewHost = fs.readFileSync(fromRoot("workers", "preview-host.mjs"), "utf8");
const wrangler = fs.readFileSync(fromRoot("wrangler.jsonc"), "utf8");
const deploymentGuide = fs.readFileSync(fromRoot("production", "DEPLOYMENT.md"), "utf8");
const packageJson = JSON.parse(fs.readFileSync(fromRoot("package.json"), "utf8"));

test("generic validation preserves live launch authority artifacts", () => {
  assert.doesNotMatch(packageJson.scripts.validate, /npm run launch:(?:readiness|inputs)/);
  assert.match(packageJson.scripts.validate, /node production\/scripts\/validate-foundation\.mjs/);
  assert.match(packageJson.scripts["launch:readiness"], /build-launch-readiness\.mjs/);
  assert.match(packageJson.scripts["launch:inputs"], /build-launch-input-checklist\.mjs/);
});

test("deployment guide names the workers.dev authority and separates baseline from runtime proof", () => {
  assert.match(deploymentGuide, /sole public authority is `https:\/\/ms-realty\.ms-realty-bg\.workers\.dev`/);
  assert.match(deploymentGuide, /Committed baseline/);
  assert.match(deploymentGuide, /Runtime materialized evidence/);
  assert.match(deploymentGuide, /`build_marker` and `origin_build_marker` must both equal the exact[\s\S]*40-character release SHA/);
  assert.match(deploymentGuide, /`GET \/api\/ready` must return HTTP 200 with `status: "ready"` and[\s\S]*`blockers: \[\]`/);
  assert.doesNotMatch(
    deploymentGuide,
    /Audited state \(2026-08-09\)|Phase 1 .*repair Worker secrets|MS_REALTY_ADMIN_CREDENTIALS_JSON|Payload admin unreachable|Known gaps & accepted risks|Fast-follow code changes|Definition of "shipped today"|custom-domain|\bDNS\b/,
  );
});

test("handoff keeps the governed app private behind the review host", () => {
  const reviewHost = caddy.indexOf("{$MS_REALTY_REVIEW_HOST}");
  const publicHealth = caddy.indexOf("@edge_health path /api/health", reviewHost);
  const reviewAuth = caddy.indexOf("basic_auth {", reviewHost);

  assert.match(caddy, /\{\$MS_REALTY_REVIEW_HOST\}/);
  assert.match(caddy, /basic_auth \{/);
  assert.ok(reviewHost >= 0 && publicHealth > reviewHost && reviewAuth > publicHealth);
  assert.match(caddy, /handle @edge_health \{\s+reverse_proxy app:3000/);
  assert.match(caddy, /import app_proxy/);
  assert.match(caddy, /trusted_proxies static 173\.245\.48\.0\/20[\s\S]*2c0f:f248::\/32/);
  assert.match(caddy, /client_ip_headers CF-Connecting-IP X-Forwarded-For/);
  assert.match(caddy, /header_up CF-Connecting-IP \{client_ip\}/);
  assert.match(caddy, /@worker_origin header X-MS-Realty-Origin-Token \{\$MS_REALTY_ORIGIN_TOKEN\}/);
  assert.match(caddy, /header_up -X-MS-Realty-Origin-Token/);
  const workerOrigin = caddy.slice(caddy.indexOf("handle @worker_origin"), caddy.indexOf("@edge_health"));
  assert.match(workerOrigin, /reverse_proxy app:3000/);
  assert.doesNotMatch(workerOrigin, /MS_REALTY_ADMIN_TOKEN|import app_proxy/);
  for (const domain of ["makler-realty.com", "www.makler-realty.com", "makler-realty.ru", "www.makler-realty.ru"]) {
    assert.doesNotMatch(caddy, new RegExp(`^${domain.replaceAll(".", "\\.")} \\{`, "m"));
  }
  assert.match(caddy, /@app_operator path \/admin \/admin\/\* \/api\/admin\/\*/);
  assert.match(caddy, /try_files \/makler-realty\.com\{path\} \/makler-realty\.ru\{path\}/);
});

test("production compose runs one durable app at the workers.dev public origin", () => {
  assert.doesNotMatch(compose, /review-app:/);
  assert.doesNotMatch(compose, /MS_REALTY_PRIVATE_REVIEW_MODE/);
  assert.equal(compose.match(/MS_REALTY_TRUST_PROXY: "1"/g)?.length, 1);
  assert.match(compose, /MS_REALTY_PUBLIC_ORIGIN: https:\/\/ms-realty\.ms-realty-bg\.workers\.dev/);
  assert.match(compose, /MS_REALTY_MCP_ALLOWED_ORIGINS: https:\/\/ms-realty\.ms-realty-bg\.workers\.dev/);
  assert.match(compose, /MS_REALTY_BUILD_MARKER: \$\{MS_REALTY_BUILD_MARKER:-unversioned\}/);
  assert.match(compose, /MS_REALTY_RUNTIME_DATA_AUTHORITY: payload/);
  assert.match(compose, /MS_REALTY_ADMIN_RUNTIME_VOLUME_ENABLED: "true"/);
  assert.match(compose, /MS_REALTY_LEAD_DURABLE_STORE_ENABLED: "true"/);
  assert.match(compose, /MS_REALTY_LEAD_OPS_DURABLE_STORE_ENABLED: "true"/);
  assert.match(compose, /MS_REALTY_EVENT_DURABLE_STORE_ENABLED: "true"/);
  assert.match(compose, /MS_REALTY_VIEWING_DURABLE_STORE_ENABLED: "true"/);
  assert.match(compose, /MS_REALTY_CASE_PAYLOAD_AUTHORITY_ENABLED: "true"/);
  assert.match(compose, /MS_REALTY_CASE_REQUEST_PROJECTION_ENABLED: "false"/);
  assert.match(compose, /MS_REALTY_MCP_DURABLE_LISTING_WRITES: "1"/);
  assert.match(compose, /MS_REALTY_WORKSPACE_ID: \$\{MS_REALTY_WORKSPACE_ID:-workspace-sandanski\}/);
  assert.match(compose, /MS_REALTY_PROVIDER_TOKEN_KEY: \$\{MS_REALTY_PROVIDER_TOKEN_KEY:\?/);
  assert.match(compose, /MS_REALTY_PROVIDER_OAUTH_STATE_SECRET: \$\{MS_REALTY_PROVIDER_OAUTH_STATE_SECRET:\?/);
  assert.match(compose, /MS_REALTY_RECOVERY_SIGNING_PUBLIC_KEY: \$\{MS_REALTY_RECOVERY_SIGNING_PUBLIC_KEY:\?/);
  assert.match(compose, /MS_REALTY_R2_MEDIA_COVERAGE_REPORT_PATH: \/app\/production\/data\/r2-media-coverage-report\.json/);
  assert.match(compose, /MS_REALTY_ORIGIN_TOKEN: \$\{MS_REALTY_ORIGIN_TOKEN:\?MS_REALTY_ORIGIN_TOKEN is required\}/);
  assert.match(compose, /MS_REALTY_MEDIA_UPLOAD_DRIVER: r2/);
  assert.match(compose, /MS_REALTY_MEDIA_UPLOAD_HOST: ms-realty\.ms-realty-bg\.workers\.dev/);
  assert.match(compose, /MS_REALTY_MEDIA_UPLOAD_R2_ENDPOINT: https:\/\/ms-realty\.ms-realty-bg\.workers\.dev\/__media\//);
  assert.match(dockerfile, /ARG MS_REALTY_BUILD_MARKER=unversioned[\s\S]*\.ms-realty-build-marker/);
  assert.match(cloudflareDockerfile, /MS_REALTY_R2_MEDIA_COVERAGE_REPORT_PATH=\/app\/production\/data\/r2-media-coverage-report\.json/);
  assert.match(compose, /\/opt\/ms-realty\/shared\/media:\/srv\/media:ro/);
  assert.doesNotMatch(worker, /MS_REALTY_ADMIN_RUNTIME_VOLUME_ENABLED/);
});

test("production compose forwards provider setup and canonical Hermes configuration", () => {
  const optionalBindings = [
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
  ];
  for (const binding of optionalBindings) {
    assert.ok(compose.includes(`${binding}: $` + `{${binding}:-}`), binding);
  }
  assert.ok(
    compose.includes("MS_REALTY_PROVIDER_WEBHOOK_MAX_BYTES: $" + "{MS_REALTY_PROVIDER_WEBHOOK_MAX_BYTES:-1048576}"),
  );
  assert.match(compose, /HERMES_API_KEY: \$\{HERMES_API_KEY:-\$\{HERMES_AGENT_API_SERVER_KEY:\?/);
  assert.match(compose, /HERMES_CHAT_COMPLETIONS_URL: \$\{HERMES_CHAT_COMPLETIONS_URL:-http:\/\/hermes-agent:8642\/v1\/chat\/completions\}/);
  const managedModel = compose.match(/HERMES_AGENT_MODEL: ([^\s]+)/)?.[1];
  assert.ok(managedModel, "managed Hermes model must be configured");
  assert.ok(compose.includes(`HERMES_MODEL: $` + `{HERMES_MODEL:-${managedModel}}`), "app and agent Hermes models must match");
  assert.match(compose, /HERMES_PROVIDER_MODE: \$\{HERMES_PROVIDER_MODE:-self_hosted\}/);
  assert.doesNotMatch(compose, /OPENROUTER_API_KEY/);
});

test("production handoff runs Hermes drafts against one private local model", () => {
  assert.match(compose, /image: ollama\/ollama@sha256:9d30908e41144b1f1da89b9d8e33c07e4aeb43ff41a8660241b1686e2cc330ad/);
  assert.match(compose, /command: \["pull", "qwen3\.5:0\.8b"\]/);
  assert.match(compose, /HERMES_AGENT_MODEL: qwen3\.5:0\.8b/);
  assert.match(compose, /HERMES_CHAT_COMPLETIONS_URL: \$\{HERMES_CHAT_COMPLETIONS_URL:-http:\/\/hermes-agent:8642\/v1\/chat\/completions\}/);
  assert.match(compose, /HERMES_AGENT_LLM_BASE_URL: http:\/\/ollama:11434\/v1/);
  assert.match(compose, /MS_REALTY_HERMES_AGENT_EVIDENCE_SCOPE: live/);
  assert.match(compose, /mem_limit: 2200m/);
  assert.match(compose, /name: ms-realty-production-review-ollama/);
  assert.doesNotMatch(compose, /- "11434:11434"/);
});

test("production search evidence uses one migrated Payload runtime", () => {
  const searchSeed = localCompose.slice(localCompose.indexOf("  search-seed:"), localCompose.indexOf("  runtime-init:"));
  assert.doesNotMatch(searchSeed, /NODE_ENV:\s*test/);
  assert.doesNotMatch(searchSyncCli, /loadPayloadApprovedSearchProjection/);
  assert.match(searchSyncCli, /runSearchEngineSync\(\{ generatedAt: new Date\(\)\.toISOString\(\) \}\)/);
  assert.match(searchSyncCli, /process\.exit\(exitCode\)/);
  assert.match(searchQueryCli, /process\.exit\(exitCode\)/);
  assert.match(liveServiceEvidenceCli, /process\.exit\(exitCode\)/);
});

test("workers.dev delegates dynamic traffic to the fixed origin and carries an exact edge marker", () => {
  assert.match(worker, /if \(env\.MS_REALTY_ORIGIN_URL\) return proxyDurableOrigin/);
  assert.match(worker, /requestForOrigin\(request, env\.MS_REALTY_ORIGIN_URL, env\.MS_REALTY_ORIGIN_TOKEN\)/);
  assert.match(worker, /if \(media\) return media;\n\s+if \(env\.MS_REALTY_ORIGIN_URL\) return proxyDurableOrigin/);
  assert.match(worker, /mediaCandidateKeys\(url\.hostname, url\.pathname\)/);
  assert.match(worker, /import \{ PREVIEW_NOINDEX, PRODUCTION_PUBLIC_HOST, isPreviewHost, mediaCandidateKeys \} from "\.\/preview-host\.mjs"/);
  assert.ok(previewHost.includes("`${PRODUCTION_PUBLIC_HOST}${pathname}`"));
  assert.ok(worker.includes("`${PRODUCTION_PUBLIC_HOST}/wp-content/`"));
  assert.match(wrangler, /"MS_REALTY_ORIGIN_URL": "https:\/\/ms-realty-review\.157-230-109-185\.sslip\.io"/);
  assert.match(wrangler, /"MS_REALTY_WORKER_PUBLIC_ORIGIN": "https:\/\/ms-realty\.ms-realty-bg\.workers\.dev"/);
  assert.doesNotMatch(wrangler, /"MS_REALTY_PUBLIC_ORIGIN"\s*:/);
  assert.equal(wrangler.split("__MS_REALTY_BUILD_MARKER__").length - 1, 2);
});

test("production deploy leaves the obsolete public-origin secret inert during strict upload", () => {
  assert.doesNotMatch(ciWorkflow, /secret (?:list|delete) .*MS_REALTY_PUBLIC_ORIGIN/);
  assert.doesNotMatch(ciWorkflow, /secret put MS_REALTY_ORIGIN_TOKEN/);
  assert.match(ciWorkflow, /wrangler@4\.117\.0 deploy[\s\S]*--strict/);
});

test("origin deployment is immutable, backup-first, and rolls back the active release", () => {
  const r2Capture = ciWorkflow.slice(
    ciWorkflow.indexOf("Capture exact-release R2 media coverage"),
    ciWorkflow.indexOf("Preserve exact R2 report for the Worker image"),
  );
  assert.match(deployScript, /^set -euo pipefail$/m);
  assert.doesNotMatch(deployScript, /^set -E/m);
  assert.match(deployScript, /\^\[0-9a-f\]\{40\}\$/);
  assert.match(deployScript, /tar -tzf "\$archive" \| awk/);
  assert.doesNotMatch(deployScript, /tar -tzf "\$archive" \| grep -q/);
  assert.match(deployScript, /run_stack "\$previous" docker:backup/);
  assert.match(deployScript, /run_stack "\$release" docker:status "\$release_id"/);
  assert.match(deployScript, /run_stack "\$release" docker:hermes:up "\$release_id" \|\| rollback "\$\?"/);
  assert.match(deployScript, /MS_REALTY_CMS_IMPORT_MODE=overwrite-existing/);
  assert.match(deployScript, /d\.build_marker !== process\.argv\[2\]/);
  assert.match(deployScript, /deployment failed; restoring \$previous/);
  assert.equal(deployScript.match(/^reclaim$/gm)?.length, 1);
  assert.match(deployScript, /local status="\$\{1:-1\}"/);
  assert.match(deployScript, /trap 'rollback "\$\?"' ERR/);
  assert.match(deployScript, /mv -Tf "\$base\/\.current-\$release_id" "\$current"/);
  assert.doesNotMatch(deployScript, /docker:reset|docker compose down --volumes/);
  assert.match(ciWorkflow, /scp .*production\/scripts\/deploy-production-review\.sh .*\$\{GITHUB_SHA\}\.deploy\.sh/);
  // -x traces the activation so a failing line names itself in the deploy log;
  // the script shields its token lines from the trace.
  assert.match(ciWorkflow, /bash -x '\/opt\/ms-realty\/incoming\/\$\{GITHUB_SHA\}\.deploy\.sh' '\$GITHUB_SHA' <\/dev\/null/);
  assert.match(deployScript, /set \+x/);
  assert.match(ciWorkflow, /readlink -f \/opt\/ms-realty\/current/);
  assert.doesNotMatch(ciWorkflow, /bash -s --/);
  assert.match(r2Capture, /--list-only/);
  assert.doesNotMatch(r2Capture, /--execute/);
  assert.match(ciWorkflow, /deploy_origin:[\s\S]*actions\/setup-node@v4[\s\S]*Capture exact-release R2 media coverage/);
  assert.match(ciWorkflow, /r2-media-coverage-\$\{\{ github\.sha \}\}/);
  assert.match(ciWorkflow, /Restore exact R2 report from the origin release/);
  assert.match(ciWorkflow, /previous_release: \$\{\{ steps\.previous_origin\.outputs\.release \}\}/);
  assert.match(ciWorkflow, /Capture active origin release/);
  assert.match(ciWorkflow, /ready_url="\$\{health_url%\/api\/health\}\/api\/ready"/);
  assert.match(ciWorkflow, /d\.launch_ready !== true/);
  assert.match(ciWorkflow, /needs\.deploy_origin\.outputs\.previous_release/);
  assert.match(ciWorkflow, /mv -Tf .*link.*\/opt\/ms-realty\/current/);
  assert.match(ciWorkflow, /d\.origin_build_marker !== origin/);
});

test("every public CMS media asset preserves one of the two historical source hosts", () => {
  const seed = JSON.parse(fs.readFileSync(fromRoot("production", "data", "cms-seed.json"), "utf8"));
  const assets = new Set(
    seed.records.flatMap((record) => (record.media || []).map((item) => item.asset_url).filter(Boolean)),
  );
  assert.ok(assets.size > 1_000);
  for (const asset of assets) {
    const url = new URL(asset);
    assert.equal(url.protocol, "https:");
    assert.ok(["makler-realty.com", "makler-realty.ru"].includes(url.hostname), asset);
    assert.match(url.pathname, /^\/wp-content\/uploads\//);
  }
});
