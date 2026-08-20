import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fromRoot } from "../lib/paths.mjs";

const caddy = fs.readFileSync(fromRoot("production", "Caddyfile.production-review"), "utf8");
const compose = fs.readFileSync(fromRoot("production", "docker-compose.production-review.yml"), "utf8");
const localCompose = fs.readFileSync(fromRoot("production", "docker-compose.local-production.yml"), "utf8");
const dockerfile = fs.readFileSync(fromRoot("production", "Dockerfile"), "utf8");
const deployScript = fs.readFileSync(fromRoot("production", "scripts", "deploy-production-review.sh"), "utf8");
const ciWorkflow = fs.readFileSync(fromRoot(".github", "workflows", "ci.yml"), "utf8");
const searchSyncCli = fs.readFileSync(fromRoot("production", "scripts", "run-search-engine-sync.mjs"), "utf8");
const searchQueryCli = fs.readFileSync(fromRoot("production", "scripts", "run-search-engine-query.mjs"), "utf8");
const liveServiceEvidenceCli = fs.readFileSync(fromRoot("production", "scripts", "run-live-service-evidence.mjs"), "utf8");
const worker = fs.readFileSync(fromRoot("workers", "index.js"), "utf8");
const wrangler = fs.readFileSync(fromRoot("wrangler.jsonc"), "utf8");

test("handoff puts the same governed app behind the private preview and final domains", () => {
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
    assert.match(caddy, new RegExp(domain.replaceAll(".", "\\.")));
  }
  assert.match(caddy, /@public_operator path \/admin \/admin\/\* \/api\/admin\/\*/);
  assert.match(caddy, /@payload_private path \/payload-admin/);
  assert.match(caddy, /try_files \/makler-realty\.com\{path\} \/makler-realty\.ru\{path\}/);
  assert.match(caddy, /root \* \/srv\/media\/makler-realty\.com/);
  assert.match(caddy, /root \* \/srv\/media\/makler-realty\.ru/);
});

test("production compose runs one durable app before and after DNS cutover", () => {
  assert.doesNotMatch(compose, /review-app:/);
  assert.doesNotMatch(compose, /MS_REALTY_PRIVATE_REVIEW_MODE/);
  assert.equal(compose.match(/MS_REALTY_TRUST_PROXY: "1"/g)?.length, 1);
  assert.match(compose, /MS_REALTY_PUBLIC_ORIGIN: https:\/\/makler-realty\.com/);
  assert.match(compose, /MS_REALTY_BUILD_MARKER: \$\{MS_REALTY_BUILD_MARKER:-unversioned\}/);
  assert.match(compose, /MS_REALTY_RUNTIME_DATA_AUTHORITY: payload/);
  assert.match(compose, /MS_REALTY_LEAD_DURABLE_STORE_ENABLED: "true"/);
  assert.match(compose, /MS_REALTY_EVENT_DURABLE_STORE_ENABLED: "true"/);
  assert.match(compose, /MS_REALTY_VIEWING_DURABLE_STORE_ENABLED: "true"/);
  assert.match(compose, /MS_REALTY_CASE_PAYLOAD_AUTHORITY_ENABLED: "true"/);
  assert.match(compose, /MS_REALTY_CASE_REQUEST_PROJECTION_ENABLED: "false"/);
  assert.match(compose, /MS_REALTY_MCP_DURABLE_LISTING_WRITES: "1"/);
  assert.match(compose, /MS_REALTY_WORKSPACE_ID: \$\{MS_REALTY_WORKSPACE_ID:-workspace-sandanski\}/);
  assert.match(compose, /MS_REALTY_PROVIDER_TOKEN_KEY: \$\{MS_REALTY_PROVIDER_TOKEN_KEY:\?/);
  assert.match(compose, /MS_REALTY_PROVIDER_OAUTH_STATE_SECRET: \$\{MS_REALTY_PROVIDER_OAUTH_STATE_SECRET:\?/);
  assert.match(compose, /MS_REALTY_RECOVERY_SIGNING_PUBLIC_KEY: \$\{MS_REALTY_RECOVERY_SIGNING_PUBLIC_KEY:\?/);
  assert.match(compose, /MS_REALTY_ORIGIN_TOKEN: \$\{MS_REALTY_ORIGIN_TOKEN:\?MS_REALTY_ORIGIN_TOKEN is required\}/);
  assert.match(dockerfile, /ARG MS_REALTY_BUILD_MARKER=unversioned[\s\S]*\.ms-realty-build-marker/);
  assert.match(compose, /\/opt\/ms-realty\/shared\/media:\/srv\/media:ro/);
});

test("production handoff runs Hermes drafts against one private local model", () => {
  assert.match(compose, /image: ollama\/ollama@sha256:9d30908e41144b1f1da89b9d8e33c07e4aeb43ff41a8660241b1686e2cc330ad/);
  assert.match(compose, /command: \["pull", "qwen3:1\.7b"\]/);
  assert.match(compose, /HERMES_CHAT_COMPLETIONS_URL: http:\/\/hermes-agent:8642\/v1\/chat\/completions/);
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
  assert.match(wrangler, /"MS_REALTY_ORIGIN_URL": "https:\/\/ms-realty-review\.157-230-109-185\.sslip\.io"/);
  assert.equal(wrangler.split("__MS_REALTY_BUILD_MARKER__").length - 1, 2);
});

test("origin deployment is immutable, backup-first, and rolls back the active release", () => {
  assert.match(deployScript, /^set -euo pipefail$/m);
  assert.doesNotMatch(deployScript, /^set -E/m);
  assert.match(deployScript, /\^\[0-9a-f\]\{40\}\$/);
  assert.match(deployScript, /tar -tzf "\$archive" \| awk/);
  assert.doesNotMatch(deployScript, /tar -tzf "\$archive" \| grep -q/);
  assert.match(deployScript, /run_stack "\$previous" docker:backup/);
  assert.match(deployScript, /run_stack "\$release" docker:status "\$release_id"/);
  assert.match(deployScript, /run_stack "\$release" docker:hermes:up "\$release_id"/);
  assert.match(deployScript, /d\.build_marker !== process\.argv\[2\]/);
  assert.match(deployScript, /deployment failed; restoring \$previous/);
  assert.match(deployScript, /local status="\$\{1:-1\}"/);
  assert.match(deployScript, /trap 'rollback "\$\?"' ERR/);
  assert.match(deployScript, /mv -Tf "\$base\/\.current-\$release_id" "\$current"/);
  assert.doesNotMatch(deployScript, /docker:reset|docker compose down --volumes/);
  assert.match(ciWorkflow, /scp .*production\/scripts\/deploy-production-review\.sh .*\$\{GITHUB_SHA\}\.deploy\.sh/);
  assert.match(ciWorkflow, /bash '\/opt\/ms-realty\/incoming\/\$\{GITHUB_SHA\}\.deploy\.sh' '\$GITHUB_SHA' <\/dev\/null/);
  assert.match(ciWorkflow, /readlink -f \/opt\/ms-realty\/current/);
  assert.doesNotMatch(ciWorkflow, /bash -s --/);
});

test("every public CMS media asset is mirrorable under one of the two final hosts", () => {
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
