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
    "MS_REALTY_LOCALE_REGISTRY_PATH: /runtime-data/locales.json",
    "MS_REALTY_LAUNCH_READINESS_OUTPUT_PATH: /runtime-evidence/local-launch-readiness.json",
    "MS_REALTY_LISTING_QUALITY_REVIEW_PATH: /runtime-evidence/listing-quality-review.csv",
    "MS_REALTY_SEO_EVIDENCE_OUTPUT_PATH: /runtime-evidence/seo-evidence-report.json",
  ];
  for (const line of requiredPaths) assert.ok(compose.includes(line), `missing ${line}`);
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
  assert.match(script, /Caddy resolves the app service address when it starts/);
  assert.match(script, /\["up", "--detach", "--wait", "--no-deps", "--force-recreate", "edge"\]/);
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
  assert.match(script, /materializeLocalReadinessInApp\(\)/);
});
