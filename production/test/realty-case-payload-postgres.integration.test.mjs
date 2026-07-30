import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import {
  appendRealtyCaseConditionAction,
  openRealtyCaseCondition,
  resetRealtyCaseConditionLedger,
} from "../lib/realty-case-conditions.mjs";
import { openRealtyCase, resetRealtyCaseLedger } from "../lib/realty-cases.mjs";
import { fromRoot } from "../lib/paths.mjs";

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close((error) => (error ? reject(error) : resolve(port)));
    });
  });
}

function redact(value, secrets) {
  let text = String(value || "");
  for (const secret of secrets) if (secret) text = text.replaceAll(secret, "[redacted]");
  return text.replace(/postgres(?:ql)?:\/\/[^\s@]+@/gi, "postgres://[redacted]@");
}

function run(command, args, { env, label, secrets }) {
  const result = spawnSync(command, args, {
    cwd: fromRoot(),
    encoding: "utf8",
    env,
    timeout: 120_000,
  });
  if (result.error) throw new Error(`${label} could not start: ${result.error.message}`);
  if (result.status !== 0) {
    const output = redact(`${result.stdout || ""}\n${result.stderr || ""}`, secrets).trim().slice(-6000);
    throw new Error(`${label} failed${output ? `: ${output}` : ""}`);
  }
  return result;
}

function fixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ms-realty-payload-postgres-it-"));
  const caseLedgerPath = path.join(directory, "cases.jsonl");
  const conditionLedgerPath = path.join(directory, "conditions.jsonl");
  resetRealtyCaseLedger(caseLedgerPath);
  resetRealtyCaseConditionLedger(conditionLedgerPath);
  openRealtyCase(
    {
      id: "case-payload-postgres-it-1",
      jurisdiction: "BG",
      caseType: "buyer_purchase",
      assetKind: "residential",
      clientRef: "client-payload-postgres-it-1",
      propertyRef: "property-payload-postgres-it-1",
      executionMode: "manual",
      mandate: {
        ref: "mandate-payload-postgres-it-1",
        grantedByRef: "client-payload-postgres-it-1",
        signedAt: "2026-07-30T08:00:00.000Z",
        signedEvidenceRef: "evidence://mandate/payload-postgres-it-1",
        capabilities: ["case:*"],
      },
      actor: "broker-sandanski-1",
      executorKind: "human",
    },
    { filePath: caseLedgerPath, recordedAt: "2026-07-30T08:05:00.000Z" },
  );
  openRealtyCaseCondition(
    {
      caseId: "case-payload-postgres-it-1",
      conditionId: "title-clearance",
      type: "title_clearance",
      dueAt: "2026-07-31T09:00:00.000Z",
      requiredEvidenceProducerRefs: ["lawyer://title-review", "registry://property-register"],
      actor: "broker-sandanski-1",
      executorKind: "human",
    },
    { filePath: conditionLedgerPath, caseLedgerPath, recordedAt: "2026-07-30T09:00:00.000Z" },
  );
  appendRealtyCaseConditionAction(
    {
      eventId: "condition-payload-postgres-title-satisfied",
      caseId: "case-payload-postgres-it-1",
      conditionId: "title-clearance",
      action: "condition_satisfied",
      evidenceRefs: [
        { ref: "evidence://lawyer/title", producerRef: "lawyer://title-review" },
        { ref: "evidence://registry/title", producerRef: "registry://property-register" },
      ],
      actor: "broker-sandanski-1",
      executorKind: "human",
    },
    { filePath: conditionLedgerPath, caseLedgerPath, recordedAt: "2026-07-30T10:00:00.000Z" },
  );
  return { caseLedgerPath, conditionLedgerPath, directory };
}

test(
  "real Payload migrations project cases and dependent conditions idempotently",
  { skip: process.env.MS_REALTY_RUN_PAYLOAD_INTEGRATION !== "1", timeout: 180_000 },
  async () => {
    const suffix = `${process.pid}-${crypto.randomBytes(4).toString("hex")}`;
    const project = `ms-realty-payload-it-${suffix}`;
    const port = await freePort();
    const password = crypto.randomBytes(24).toString("hex");
    const payloadSecret = crypto.randomBytes(32).toString("hex");
    const source = fixture();
    const databaseUrl = `postgres://payload_it:${password}@127.0.0.1:${port}/payload_it`;
    const env = {
      ...process.env,
      DATABASE_URL: databaseUrl,
      MS_REALTY_CASE_CONDITION_LEDGER_PATH: source.conditionLedgerPath,
      MS_REALTY_CASE_LEDGER_PATH: source.caseLedgerPath,
      MS_REALTY_CASE_PROJECTOR_APPLY: "1",
      MS_REALTY_WORKSPACE_ID: "workspace-payload-postgres-it",
      NODE_ENV: "production",
      PAYLOAD_CONFIG_PATH: fromRoot("payload.config.js"),
      PAYLOAD_POSTGRES_DB: "payload_it",
      PAYLOAD_POSTGRES_HOST: "127.0.0.1",
      PAYLOAD_POSTGRES_PASSWORD: password,
      PAYLOAD_POSTGRES_PORT: String(port),
      PAYLOAD_POSTGRES_USER: "payload_it",
      PAYLOAD_SECRET: payloadSecret,
    };
    const secrets = [password, payloadSecret, databaseUrl];
    const compose = (...args) => ["compose", "--project-name", project, "-f", fromRoot("production", "docker-compose.payload.yml"), ...args];
    let client;
    try {
      run("docker", compose("up", "--detach", "--wait", "payload-postgres"), { env, label: "Disposable Payload Postgres startup", secrets });
      run(fromRoot("node_modules", ".bin", "payload"), ["migrate"], { env, label: "Payload migration", secrets });
      run("npm", ["run", "case:project"], { env, label: "Case projection", secrets });
      run("npm", ["run", "case:conditions:project"], { env, label: "Condition projection", secrets });
      run("npm", ["run", "case:project"], { env, label: "Case projection replay", secrets });
      run("npm", ["run", "case:conditions:project"], { env, label: "Condition projection replay", secrets });
      const readback = run(process.execPath, [fromRoot("production", "scripts", "run-realty-case-payload-readback.mjs")], {
        env: {
          ...env,
          MS_REALTY_CASE_PROJECTOR_APPLY: "",
          MS_REALTY_CASE_READBACK_DATABASE_URL: databaseUrl,
        },
        label: "Payload read-back",
        secrets,
      });
      const readbackOutput = readback.stdout.trim();
      assert.equal(readbackOutput.startsWith("{"), true, readbackOutput);
      assert.deepEqual(JSON.parse(readbackOutput), {
        kind: "realty_case_payload_readback",
        workspace_id: "workspace-payload-postgres-it",
        clean: true,
        case: { missing: 0, changed: 0, unexpected: 0, source_gaps: 0 },
        conditions: { missing: 0, changed: 0, unexpected: 0, source_gaps: 0 },
        scanned: {
          realty_cases: 1,
          realty_case_events: 1,
          realty_case_mandate_versions: 1,
          realty_case_conditions: 1,
          realty_case_condition_events: 2,
        },
      });

      const { Client } = await import("pg");
      client = new Client({ connectionString: databaseUrl });
      await client.connect();
      const { rows: counts } = await client.query(`
        SELECT
          (SELECT count(*)::int FROM realty_cases) AS cases,
          (SELECT count(*)::int FROM realty_case_events) AS case_events,
          (SELECT count(*)::int FROM realty_case_mandate_versions) AS mandates,
          (SELECT count(*)::int FROM realty_case_conditions) AS conditions,
          (SELECT count(*)::int FROM realty_case_condition_events) AS condition_events
      `);
      assert.deepEqual(counts[0], { cases: 1, case_events: 1, mandates: 1, conditions: 1, condition_events: 2 });
      const { rows: cases } = await client.query("SELECT id FROM realty_cases");
      const { rows: conditions } = await client.query(
        "SELECT id, case_id, last_event_sequence, status FROM realty_case_conditions",
      );
      const { rows: conditionEvents } = await client.query(
        "SELECT case_id, condition_id, idempotency_key FROM realty_case_condition_events ORDER BY sequence",
      );
      assert.equal(conditions[0].case_id, cases[0].id);
      assert.equal(Number(conditions[0].last_event_sequence), 2);
      assert.equal(conditions[0].status, "satisfied");
      for (const event of conditionEvents) {
        assert.equal(event.case_id, cases[0].id);
        assert.equal(event.condition_id, conditions[0].id);
      }
      assert.equal(new Set(conditionEvents.map((event) => event.idempotency_key)).size, 2);
    } finally {
      if (client) await client.end();
      spawnSync("docker", compose("down", "--volumes", "--remove-orphans"), { cwd: fromRoot(), encoding: "utf8", env, timeout: 120_000 });
      fs.rmSync(source.directory, { force: true, recursive: true });
    }
  },
);
