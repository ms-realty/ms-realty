import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import config from "../../payload.config.js";
import {
  REALTY_CASE_COLLECTIONS,
  REALTY_CASE_PAYLOAD_COLLECTION_SLUGS,
  validateReferenceOnlyJSON,
} from "../lib/realty-case-collections.mjs";
import { REQUIRED_PAYLOAD_COLLECTIONS } from "../lib/payload-runtime.mjs";

const migrationPath = "migrations/20260730_142043_realty_case_persistence.ts";
const mandateMigrationPath = "migrations/20260730_160000_realign_realty_case_mandate_projection.ts";
const conditionMigrationPath = "migrations/20260730_170000_add_realty_case_conditions.ts";

function collection(slug) {
  const result = REALTY_CASE_COLLECTIONS.find((item) => item.slug === slug);
  assert.ok(result, `expected ${slug} collection`);
  return result;
}

function field(slug, name) {
  const result = collection(slug).fields.find((item) => item.name === name);
  assert.ok(result, `expected ${slug}.${name} field`);
  return result;
}

test("RealtyCase Payload collections are registered as workspace-scoped durable projections", async () => {
  const resolved = await config;
  const slugs = resolved.collections.map((item) => item.slug);

  assert.deepEqual(REALTY_CASE_PAYLOAD_COLLECTION_SLUGS, [
    "realty_cases",
    "realty_case_conditions",
    "realty_case_condition_events",
    "realty_case_events",
    "realty_case_mandate_versions",
    "realty_case_evidence",
    "realty_case_outbox",
  ]);
  for (const slug of REALTY_CASE_PAYLOAD_COLLECTION_SLUGS) assert.ok(slugs.includes(slug));
  assert.equal(REQUIRED_PAYLOAD_COLLECTIONS.length, 13);
  for (const slug of REQUIRED_PAYLOAD_COLLECTIONS) assert.ok(slugs.includes(slug));

  for (const slug of REALTY_CASE_PAYLOAD_COLLECTION_SLUGS) {
    const workspace = field(slug, "workspace_id");
    assert.equal(workspace.type, "text");
    assert.equal(workspace.required, true);
    assert.equal(workspace.index, true);
  }
});

test("RealtyCase snapshots, conditions, events, mandates, evidence, and outbox retain references instead of document content", () => {
  const snapshot = field("realty_cases", "workflow_snapshot");
  assert.equal(snapshot.type, "json");
  assert.equal(snapshot.required, true);
  assert.equal(snapshot.access.update(), false);
  assert.equal(field("realty_cases", "workflow_snapshot_digest").access.update(), false);

  const event = collection("realty_case_events");
  assert.equal(event.access.update(), false);
  assert.equal(event.access.delete(), false);
  assert.equal(field("realty_case_events", "reference_payload").required, true);
  assert.equal(field("realty_case_events", "idempotency_key").required, true);
  assert.equal(field("realty_case_events", "sequence").type, "number");

  assert.equal(field("realty_case_mandate_versions", "capabilities").type, "json");
  assert.equal(field("realty_case_mandate_versions", "signed_evidence_ref").required, true);
  assert.equal(field("realty_case_mandate_versions", "idempotency_key").required, true);
  assert.equal(field("realty_case_evidence", "storage_ref").type, "text");
  assert.equal(field("realty_case_evidence", "metadata_refs").type, "json");
  assert.equal(field("realty_case_outbox", "payload_refs").type, "json");

  const condition = collection("realty_case_conditions");
  assert.equal(field("realty_case_conditions", "required_evidence_producer_refs").type, "json");
  assert.equal(field("realty_case_conditions", "evidence_refs").type, "json");
  assert.equal(field("realty_case_conditions", "last_event_sequence").type, "number");
  assert.equal(field("realty_case_conditions", "last_event_at").type, "date");

  const conditionEvent = collection("realty_case_condition_events");
  assert.equal(conditionEvent.access.update(), false);
  assert.equal(conditionEvent.access.delete(), false);
  assert.equal(field("realty_case_condition_events", "condition").relationTo, "realty_case_conditions");
  assert.equal(field("realty_case_condition_events", "sequence").type, "number");
  assert.equal(field("realty_case_condition_events", "reference_payload").type, "json");
  assert.equal(field("realty_case_condition_events", "payload_digest").required, true);
  assert.equal(field("realty_case_condition_events", "idempotency_key").required, true);

  for (const item of REALTY_CASE_COLLECTIONS) {
    const names = item.fields.map((candidate) => candidate.name);
    assert.equal(names.includes("body"), false);
    assert.equal(names.includes("content"), false);
    assert.equal(names.includes("document_content"), false);
  }
  assert.equal(validateReferenceOnlyJSON({ evidence_refs: ["evidence://registry/1"] }), true);
  assert.match(validateReferenceOnlyJSON({ content: "raw document" }), /must not contain document content/);
  assert.match(validateReferenceOnlyJSON({ nested: { file_data: "base64" } }), /must not contain document content/);
});

test("RealtyCase migration enforces workspace-local idempotency, immutable snapshots, and append-only boundaries", () => {
  const migration = fs.readFileSync(migrationPath, "utf8");
  const down = migration.slice(migration.indexOf("export async function down"));

  assert.match(migration, /CREATE TABLE "realty_cases"/);
  assert.match(migration, /CREATE TABLE "realty_case_events"/);
  assert.match(migration, /CREATE TABLE "realty_case_mandate_versions"/);
  assert.match(migration, /CREATE TABLE "realty_case_evidence"/);
  assert.match(migration, /CREATE TABLE "realty_case_outbox"/);
  assert.match(migration, /UNIQUE \("workspace_id", "case_id"\)/);
  assert.match(migration, /UNIQUE \("workspace_id", "event_id"\)/);
  assert.match(migration, /UNIQUE \("workspace_id", "idempotency_key"\)/);
  assert.match(migration, /FOREIGN KEY \("case_id", "workspace_id"\) REFERENCES "public"\."realty_cases"\("id", "workspace_id"\)/);
  assert.match(migration, /FOREIGN KEY \("source_event_id", "workspace_id"\) REFERENCES "public"\."realty_case_events"\("id", "workspace_id"\)/);
  for (const name of [
    "realty_case_events_case_id_realty_cases_id_fk",
    "realty_case_mandate_versions_case_id_realty_cases_id_fk",
    "realty_case_evidence_case_id_realty_cases_id_fk",
    "realty_case_outbox_case_id_realty_cases_id_fk",
  ]) {
    assert.match(
      migration,
      new RegExp(`ADD CONSTRAINT "${name}" FOREIGN KEY \\("case_id"\\) REFERENCES "public"\\."realty_cases"\\("id"\\) ON DELETE restrict`),
      `${name} must preserve its required parent instead of nulling a NOT NULL field`,
    );
  }
  assert.match(migration, /CREATE FUNCTION "public"\."realty_case_prevent_workflow_snapshot_mutation"/);
  assert.match(migration, /CREATE TRIGGER "realty_cases_workflow_snapshot_immutable" BEFORE UPDATE ON "realty_cases"/);
  for (const trigger of [
    "realty_case_events_append_only",
    "realty_case_mandates_append_only",
    "realty_case_evidence_append_only",
  ]) {
    assert.match(migration, new RegExp(`CREATE TRIGGER "${trigger}" BEFORE UPDATE OR DELETE`));
    assert.ok(
      down.indexOf(`DROP TRIGGER "${trigger}"`) < down.indexOf('DROP TABLE "realty_case_outbox"'),
      `${trigger} is removed before its table during rollback`,
    );
  }
  assert.ok(
    down.indexOf('DROP TRIGGER "realty_cases_workflow_snapshot_immutable"') < down.indexOf('DROP TABLE "realty_cases"'),
    "rollback removes the immutable-workflow trigger before dropping cases",
  );
  assert.ok(
    down.indexOf('DROP CONSTRAINT "payload_locked_documents_rels_realty_cases_fk"') < down.indexOf('DROP TABLE "realty_case_outbox"'),
    "rollback removes Payload lock-table references before dropping their target collections",
  );
});

test("RealtyCase mandate migration preserves append-only idempotency across case reuse", () => {
  const migration = fs.readFileSync(mandateMigrationPath, "utf8");

  assert.match(migration, /ADD COLUMN "idempotency_key" varchar/);
  assert.match(migration, /realty_case_mandates_workspace_case_version_unique/);
  assert.match(migration, /UNIQUE \("workspace_id", "case_id", "version_number"\)/);
  assert.match(migration, /realty_case_mandates_workspace_idempotency_unique/);
  assert.match(migration, /UNIQUE \("workspace_id", "idempotency_key"\)/);
  assert.match(migration, /Cannot restore the legacy mandate uniqueness constraint/);
});

test("RealtyCase condition migration keeps projections mutable and condition events workspace-scoped, idempotent, and append-only", () => {
  const migration = fs.readFileSync(conditionMigrationPath, "utf8");
  const down = migration.slice(migration.indexOf("export async function down"));
  const migrationIndex = fs.readFileSync("migrations/index.ts", "utf8");

  assert.match(migrationIndex, /20260730_170000_add_realty_case_conditions/);
  assert.match(migration, /CREATE TABLE "realty_case_conditions"/);
  assert.match(migration, /CREATE TABLE "realty_case_condition_events"/);
  assert.match(migration, /UNIQUE \("workspace_id", "case_id", "condition_id"\)/);
  assert.match(migration, /UNIQUE \("workspace_id", "event_id"\)/);
  assert.match(migration, /UNIQUE \("workspace_id", "idempotency_key"\)/);
  assert.match(migration, /UNIQUE \("condition_id", "sequence"\)/);
  assert.match(migration, /FOREIGN KEY \("case_id", "workspace_id"\) REFERENCES "public"\."realty_cases"\("id", "workspace_id"\)/);
  assert.match(
    migration,
    /FOREIGN KEY \("condition_id", "workspace_id", "case_id"\) REFERENCES "public"\."realty_case_conditions"\("id", "workspace_id", "case_id"\)/,
  );
  assert.match(migration, /CREATE TRIGGER "realty_case_condition_events_append_only" BEFORE UPDATE OR DELETE/);
  assert.ok(
    down.indexOf('DROP TRIGGER "realty_case_condition_events_append_only"') < down.indexOf('DROP TABLE "realty_case_condition_events"'),
    "rollback removes the immutable condition-event trigger before dropping its table",
  );
  assert.ok(
    down.indexOf('DROP CONSTRAINT "payload_locked_rels_realty_case_condition_events_fk"') < down.indexOf('DROP TABLE "realty_case_condition_events"'),
    "rollback removes Payload lock-table references before dropping condition events",
  );
});
