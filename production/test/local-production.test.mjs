import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fromRoot } from "../lib/paths.mjs";

test("local Docker compose persists preview CRM and CMS state in a named local-only volume", () => {
  const compose = fs.readFileSync(fromRoot("production", "docker-compose.local-production.yml"), "utf8");
  const requiredPaths = [
    "MS_REALTY_LEAD_LEDGER_PATH: /runtime-data/lead-ledger.jsonl",
    "MS_REALTY_ACCOUNT_LEDGER_PATH: /runtime-data/accounts.jsonl",
    "MS_REALTY_DOCUMENT_CHECKLIST_LEDGER_PATH: /runtime-data/document-checklist-outcomes.jsonl",
    "MS_REALTY_LEAD_ASSIGNMENT_LEDGER_PATH: /runtime-data/lead-assignments.jsonl",
    "MS_REALTY_LISTING_EDIT_LEDGER_PATH: /runtime-data/listing-edits.jsonl",
    "MS_REALTY_MEDIA_REVIEW_LEDGER_PATH: /runtime-data/media-reviews.jsonl",
    "MS_REALTY_LISTING_PUBLICATION_SCHEDULE_PATH: /runtime-data/listing-publication-schedules.jsonl",
    "MS_REALTY_TRANSLATION_LEDGER_PATH: /runtime-data/translation-tasks.jsonl",
    "MS_REALTY_REPLY_OUTBOX_PATH: /runtime-data/reply-outbox.jsonl",
    "MS_REALTY_REPLY_DELIVERY_OUTCOME_LEDGER_PATH: /runtime-data/reply-delivery-outcomes.jsonl",
    "MS_REALTY_PUBLIC_REQUEST_OUTCOME_LEDGER_PATH: /runtime-data/public-request-outcomes.jsonl",
    "MS_REALTY_SELLER_PIPELINE_OUTCOME_LEDGER_PATH: /runtime-data/seller-pipeline-outcomes.jsonl",
    "MS_REALTY_VIEWING_FOLLOW_UP_LEDGER_PATH: /runtime-data/viewing-follow-ups.jsonl",
    "MS_REALTY_EVENT_LEDGER_PATH: /runtime-data/events.jsonl",
    "MS_REALTY_CONSENT_LEDGER_PATH: /runtime-data/consent-ledger.jsonl",
    "MS_REALTY_CASE_LEDGER_PATH: /runtime-data/realty-case-events.jsonl",
    "MS_REALTY_CASE_CONDITION_LEDGER_PATH: /runtime-data/realty-case-condition-events.jsonl",
    "MS_REALTY_LOCALE_REGISTRY_PATH: /runtime-data/locales.json",
    "MS_REALTY_LAUNCH_READINESS_OUTPUT_PATH: /runtime-evidence/local-launch-readiness.json",
    "MS_REALTY_LISTING_QUALITY_REVIEW_PATH: /runtime-evidence/listing-quality-review.csv",
    "MS_REALTY_SEO_EVIDENCE_OUTPUT_PATH: /runtime-evidence/seo-evidence-report.json",
  ];
  for (const line of requiredPaths) assert.ok(compose.includes(line), `missing ${line}`);
  assert.match(compose, /MS_REALTY_SEARCH_ENGINE: postgres/);
  assert.match(compose, /image: ms-realty-local-app:\$\{MS_REALTY_BUILD_MARKER:-latest\}/);
  assert.doesNotMatch(compose.split("services:")[0], /TYPESENSE_URL|TYPESENSE_API_KEY|MEILI_URL|MEILI_API_KEY/);
  assert.match(compose, /- local-dev-app-data:\/runtime-data/);
  assert.match(compose, /seed_runtime_file\(\)/);
  const committedBaselines = [
    ["/app/locales/registry.json", "/runtime-data/locales.json"],
    ["/app/production/data/listing-edits.jsonl", "/runtime-data/listing-edits.jsonl"],
    ["/app/production/data/broker-contacts.jsonl", "/runtime-data/broker-contacts.jsonl"],
    ["/app/production/data/translation-tasks.jsonl", "/runtime-data/translation-tasks.jsonl"],
    ["/app/production/data/tour-approvals.jsonl", "/runtime-data/tour-approvals.jsonl"],
    ["/app/production/data/slug-history.jsonl", "/runtime-data/slug-history.jsonl"],
    ["/app/production/data/redirect-approvals.jsonl", "/runtime-data/redirect-approvals.jsonl"],
    ["/app/production/data/deployable-redirects.json", "/runtime-data/deployable-redirects.json"],
  ];
  for (const [source, target] of committedBaselines) {
    assert.ok(compose.includes(`seed_runtime_file ${source} ${target}`), `missing runtime baseline ${target}`);
  }
  assert.match(compose, /if \[ ! -e "\$\$target_file" \] && \[ -f "\$\$source_file" \]/);
  assert.doesNotMatch(compose, /seed_runtime_file \/app\/production\/data\/lead-ledger\.jsonl/);
  assert.doesNotMatch(compose, /seed_runtime_file \/app\/production\/data\/events\.jsonl/);
  assert.match(compose, /runtime-init:\n[\s\S]*local-dev-app-data:\n/);
  assert.match(compose, /# Local preview only: JSONL CRM\/CMS state survives app recreate, not production deployment\./);
});

test("local Docker startup recreates the edge after an app update", () => {
  const script = fs.readFileSync(fromRoot("production", "scripts", "local-production.mjs"), "utf8");
  const importer = fs.readFileSync(fromRoot("production", "scripts", "run-payload-cms-import.mjs"), "utf8");
  const start = script.slice(script.indexOf("async function start("), script.indexOf("\ntry {", script.indexOf("async function start(")));
  const importAt = start.indexOf('"payload:cms:import", "--", "--skip-if-initialized"');
  const searchAt = start.indexOf('"search-seed"');
  const hermesRuntimeAt = start.indexOf('"hermes:runtime"');
  const liveProvisioningAt = start.indexOf('"live:provisioning"');
  const liveProvisioningPreflightAt = start.indexOf('"live:provisioning:preflight"');
  const liveCaptureAt = start.indexOf('"live:capture"');
  const livePreflightAt = start.indexOf('"live:preflight"');
  const readinessAt = start.indexOf("materializeLocalReadinessInApp(envOverrides)");
  assert.match(script, /Caddy resolves the app service address when it starts/);
  assert.match(script, /\["up", "--detach", "--wait", "--no-deps", "--force-recreate", "edge"\]/);
  assert.ok(importAt >= 0 && searchAt > importAt);
  assert.match(start, /"exec", "-T", "--env", "HERMES_DRAFT_LIMIT=1", "app", "npm", "run", "live:capture"/);
  assert.ok(
    searchAt < hermesRuntimeAt &&
      hermesRuntimeAt < liveProvisioningAt &&
      liveProvisioningAt < liveProvisioningPreflightAt &&
      liveProvisioningPreflightAt < liveCaptureAt &&
      liveCaptureAt < livePreflightAt &&
      livePreflightAt < readinessAt,
  );
  assert.match(importer, /--skip-if-initialized/);
  assert.match(importer, /collection: "listings", depth: 0, draft: true, limit: 1, overrideAccess: true/);
});

test("the up flow projects the seed's recorded publication state after the import and before search re-seeding", () => {
  const script = fs.readFileSync(fromRoot("production", "scripts", "local-production.mjs"), "utf8");
  const packageJson = JSON.parse(fs.readFileSync(fromRoot("package.json"), "utf8"));
  const start = script.slice(script.indexOf("async function start("), script.indexOf("\ntry {", script.indexOf("async function start(")));

  const importAt = start.indexOf('"payload:cms:import", "--", "--skip-if-initialized"');
  const publicationAt = start.indexOf('"payload:publication:sync"');
  const searchAt = start.indexOf('"search-seed"');

  assert.ok(publicationAt >= 0, "the up flow must run the publication projector");
  assert.ok(importAt >= 0 && publicationAt > importAt, "the projector must run after the CMS import");
  assert.ok(searchAt > publicationAt, "search must be re-seeded after publication state reaches Postgres");

  // The committed seed's recorded approvals are the authority, so the step is
  // not hidden behind an environment flag; the projector's own fail-closed
  // rules are the guard.
  assert.doesNotMatch(
    start.slice(publicationAt - 200, publicationAt + 120),
    /MS_REALTY_[A-Z_]*PUBLICATION[A-Z_]*\s*===|process\.env\.[A-Za-z_]+\s*===/,
  );

  assert.equal(
    packageJson.scripts["payload:publication:sync"],
    "node production/scripts/run-payload-publication-sync.mjs",
  );
});

test("production review reuses the tested stack with durable volumes and an authenticated noindex edge", () => {
  const compose = fs.readFileSync(fromRoot("production", "docker-compose.production-review.yml"), "utf8");
  const caddy = fs.readFileSync(fromRoot("production", "Caddyfile.production-review"), "utf8");
  const script = fs.readFileSync(fromRoot("production", "scripts", "local-production.mjs"), "utf8");

  assert.match(compose, /name: ms-realty-production-review/);
  assert.match(compose, /MS_REALTY_ADMIN_ACTOR: \$\{MS_REALTY_ADMIN_ACTOR:-agency_admin\}/);
  assert.match(compose, /name: ms-realty-production-review-runtime-data/);
  assert.match(compose, /name: ms-realty-production-review-postgres/);
  assert.match(compose, /- "443:443"/);
  assert.match(caddy, /basic_auth \{/);
  assert.match(caddy, /X-Robots-Tag "noindex, nofollow, noarchive"/);
  assert.match(caddy, /\{\$MS_REALTY_REVIEW_HOST\}[\s\S]*import app_proxy/);
  assert.doesNotMatch(caddy, /redir @review_root/);
  assert.match(caddy, /header_up Authorization "Bearer \{\$MS_REALTY_ADMIN_TOKEN\}"/);
  assert.match(script, /MS_REALTY_COMPOSE_OVERRIDE/);
  assert.match(script, /MS_REALTY_ENV_FILE/);
});

test("local recovery is explicit, checksummed, and takes a rollback snapshot", () => {
  const script = fs.readFileSync(fromRoot("production", "scripts", "local-production.mjs"), "utf8");
  const packageJson = JSON.parse(fs.readFileSync(fromRoot("package.json"), "utf8"));
  const gitignore = fs.readFileSync(fromRoot(".gitignore"), "utf8");

  assert.equal(packageJson.scripts["docker:backup"], "node production/scripts/local-production.mjs backup");
  assert.equal(packageJson.scripts["docker:restore"], "node production/scripts/local-production.mjs restore");
  assert.match(gitignore, /^\.local-backups\/$/m);
  assert.match(script, /--confirm-replace-local-data/);
  assert.match(script, /prefix: "pre-restore"/);
  assert.match(script, /keepQuiesced: true/);
  assert.match(script, /validateArchiveInApp/);
  assert.match(script, /chown -R 1001:1001 \$\{targetDirectory\}/);
  assert.match(script, /releaseBuildMarkerPath = path\.join\(root, "\.ms-realty-release-sha"\)/);
  assert.match(script, /MS_REALTY_BUILD_MARKER: releaseBuildMarker/);
  assert.match(script, /materializeLocalReadinessInApp\(\)/);
});
