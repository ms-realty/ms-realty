import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fromRoot } from "../lib/paths.mjs";

test("local Docker compose persists preview CRM and CMS state in a named local-only volume", () => {
  const compose = fs.readFileSync(fromRoot("production", "docker-compose.local-production.yml"), "utf8");
  const requiredPaths = [
    "MS_REALTY_LEAD_LEDGER_PATH: /runtime-data/lead-ledger.jsonl",
    "MS_REALTY_LISTING_EDIT_LEDGER_PATH: /runtime-data/listing-edits.jsonl",
    "MS_REALTY_TRANSLATION_LEDGER_PATH: /runtime-data/translation-tasks.jsonl",
    "MS_REALTY_REPLY_OUTBOX_PATH: /runtime-data/reply-outbox.jsonl",
    "MS_REALTY_EVENT_LEDGER_PATH: /runtime-data/events.jsonl",
    "MS_REALTY_CONSENT_LEDGER_PATH: /runtime-data/consent-ledger.jsonl",
    "MS_REALTY_LOCALE_REGISTRY_PATH: /runtime-data/locales.json",
    "MS_REALTY_LAUNCH_READINESS_OUTPUT_PATH: /runtime-evidence/local-launch-readiness.json",
  ];
  for (const line of requiredPaths) assert.ok(compose.includes(line), `missing ${line}`);
  assert.match(compose, /- local-dev-app-data:\/runtime-data/);
  assert.match(compose, /if \[ ! -f \/runtime-data\/locales\.json \]; then cp \/app\/locales\/registry\.json \/runtime-data\/locales\.json; fi/);
  assert.match(compose, /runtime-init:\n[\s\S]*local-dev-app-data:\n/);
  assert.match(compose, /# Local preview only: JSONL CRM\/CMS state survives app recreate, not production deployment\./);
});
