import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { appendRealtyCaseConditionAction, openRealtyCaseCondition, resetRealtyCaseConditionLedger } from "../lib/realty-case-conditions.mjs";
import { openRealtyCase, resetRealtyCaseLedger } from "../lib/realty-cases.mjs";

const enabled = process.env.MS_REALTY_RUN_PAYLOAD_INTEGRATION === "1";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const composeFile = path.join(root, "production", "docker-compose.payload.yml");
const payloadCli = path.join(root, "node_modules", "payload", "bin.js");
const caseProjector = path.join(root, "production", "scripts", "run-realty-case-payload-projector.mjs");
const conditionProjector = path.join(root, "production", "scripts", "run-realty-case-condition-payload-projector.mjs");
const caseReadback = path.join(root, "production", "scripts", "run-realty-case-payload-readback.mjs");
const payloadConfig = path.join(root, "payload.config.js");
const payloadRuntime = path.join(root, "node_modules", "payload", "dist", "index.js");
const payloadAuthority = path.join(root, "production", "lib", "realty-case-payload-authority.mjs");
const leadDurableStore = path.join(root, "production", "lib", "lead-durable-store.mjs");
const COMMAND_TIMEOUT_MS = 120_000;

function redact(value, env) {
  let text = String(value || "");
  for (const secret of [env?.DATABASE_URL, env?.PAYLOAD_SECRET, env?.PAYLOAD_POSTGRES_PASSWORD]) {
    if (secret) text = text.replaceAll(secret, "[redacted]");
  }
  return text.replace(/postgres(?:ql)?:\/\/[^\s@]+@/gi, "postgres://[redacted]@");
}

function command(commandName, args, { env, label }) {
  const result = spawnSync(commandName, args, {
    cwd: root,
    encoding: "utf8",
    env,
    maxBuffer: 10 * 1024 * 1024,
    timeout: COMMAND_TIMEOUT_MS,
  });
  if (result.error) throw new Error(`${label} could not start: ${result.error.message}`);
  assert.equal(result.status, 0, `${label} failed\n${redact(`${result.stdout || ""}${result.stderr || ""}`, env)}`);
  return result;
}

function commandAsync(commandName, args, { env, label }) {
  return new Promise((resolve, reject) => {
    const child = spawn(commandName, args, { cwd: root, env });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, COMMAND_TIMEOUT_MS);
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.once("error", (error) => {
      clearTimeout(timeout);
      reject(new Error(`${label} could not start: ${error.message}`));
    });
    child.once("close", (status, signal) => {
      clearTimeout(timeout);
      if (status === 0) {
        resolve({ stdout, stderr });
        return;
      }
      const reason = timedOut ? `timed out after ${COMMAND_TIMEOUT_MS}ms` : `failed with ${signal || `status ${status}`}`;
      reject(new Error(`${label} ${reason}\n${redact(`${stdout}${stderr}`, env)}`));
    });
  });
}

function composeArgs(project, args) {
  return ["compose", "--project-name", project, "-f", composeFile, ...args];
}

function runCompose(project, args, env, label) {
  return command("docker", composeArgs(project, args), { env, label });
}

function downCompose(project, env) {
  return command("docker", composeArgs(project, ["down", "--volumes", "--remove-orphans"]), {
    env,
    label: "cleaning up isolated Payload Postgres",
  });
}

async function freeLoopbackPort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen({ host: "127.0.0.1", port: 0 }, resolve);
  });
  const address = server.address();
  await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  assert.ok(address && typeof address === "object", "could not reserve a loopback port for the Payload integration database");
  return address.port;
}

function writeFixture(directory) {
  const caseId = "case-payload-postgres-it";
  const caseLedgerPath = path.join(directory, "cases.jsonl");
  const conditionLedgerPath = path.join(directory, "conditions.jsonl");
  resetRealtyCaseLedger(caseLedgerPath);
  resetRealtyCaseConditionLedger(conditionLedgerPath);

  openRealtyCase(
    {
      id: caseId,
      jurisdiction: "BG",
      caseType: "buyer_purchase",
      assetKind: "residential",
      clientRef: "client-payload-postgres-it",
      propertyRef: "property-payload-postgres-it",
      executionMode: "manual",
      mandate: {
        ref: "mandate-payload-postgres-it",
        grantedByRef: "client-payload-postgres-it",
        signedAt: "2026-07-30T08:00:00.000Z",
        signedEvidenceRef: "evidence://mandate/payload-postgres-it",
        capabilities: ["case:*"],
      },
      actor: "broker-payload-postgres-it",
      executorKind: "human",
    },
    { filePath: caseLedgerPath, recordedAt: "2026-07-30T08:05:00.000Z" },
  );
  openRealtyCaseCondition(
    {
      caseId,
      conditionId: "title-clearance",
      type: "title_clearance",
      dueAt: "2026-07-31T09:00:00.000Z",
      requiredEvidenceProducerRefs: ["lawyer://title-review", "registry://property-register"],
      actor: "broker-payload-postgres-it",
      executorKind: "human",
    },
    { filePath: conditionLedgerPath, caseLedgerPath, recordedAt: "2026-07-30T09:00:00.000Z" },
  );
  appendRealtyCaseConditionAction(
    {
      eventId: "condition-payload-postgres-it-satisfied",
      caseId,
      conditionId: "title-clearance",
      action: "condition_satisfied",
      evidenceRefs: [
        { ref: "evidence://lawyer/title", producerRef: "lawyer://title-review" },
        { ref: "evidence://registry/title", producerRef: "registry://property-register" },
      ],
      actor: "broker-payload-postgres-it",
      executorKind: "human",
    },
    { filePath: conditionLedgerPath, caseLedgerPath, recordedAt: "2026-07-30T10:00:00.000Z" },
  );
  return { caseId, caseLedgerPath, conditionLedgerPath };
}

function markInternalOutboxDelivered(env, workspaceId) {
  const script = `
    import assert from "node:assert/strict";
    import { Client } from "pg";

    const workspaceId = ${JSON.stringify(workspaceId)};
    let client;
    let exitCode = 0;

    try {
      client = new Client({ connectionString: process.env.DATABASE_URL });
      await client.connect();
      const selected = await client.query(
        "SELECT id, status, attempt_count FROM realty_case_outbox WHERE workspace_id = $1 AND kind = 'reconciliation' AND destination_ref = 'internal:realty_case_payload_readback'",
        [workspaceId],
      );
      assert.equal(selected.rows.length, 1, "expected one internal reconciliation outbox row");
      const current = selected.rows[0];
      if (current.status !== "delivered") {
        const updated = await client.query(
          "UPDATE realty_case_outbox SET status = 'delivered', attempt_count = 1 WHERE id = $1 AND status = $2 RETURNING id",
          [current.id, current.status],
        );
        assert.equal(updated.rowCount, 1, "internal reconciliation outbox delivery update was not applied");
      }
      const delivered = await client.query("SELECT status, attempt_count FROM realty_case_outbox WHERE id = $1", [current.id]);
      assert.equal(delivered.rows.length, 1);
      assert.equal(delivered.rows[0].status, "delivered");
      assert.equal(Number(delivered.rows[0].attempt_count), 1);
    } catch (error) {
      console.error(error.stack || error);
      exitCode = 1;
    } finally {
      if (client) {
        try {
          await client.end();
        } catch (error) {
          console.error(error.stack || error);
          exitCode = 1;
        }
      }
    }
    process.exit(exitCode);
  `;
  command(process.execPath, ["--input-type=module", "--eval", script], { env, label: "marking internal reconciliation outbox delivered" });
}

function assertCleanReadback(result, workspaceId) {
  const output = result.stdout.trim();
  assert.ok(output.startsWith("{"), `Payload read-back did not emit a report: ${output}`);
  assert.deepEqual(JSON.parse(output), {
    kind: "realty_case_payload_readback",
    workspace_id: workspaceId,
    clean: true,
    case: { missing: 0, changed: 0, unexpected: 0, source_gaps: 0 },
    conditions: { missing: 0, changed: 0, unexpected: 0, source_gaps: 0 },
    outbox: { missing: 0, changed: 0, unexpected: 0, source_gaps: 0 },
    scanned: {
      realty_cases: 1,
      realty_case_events: 1,
      realty_case_mandate_versions: 1,
      realty_case_conditions: 1,
      realty_case_condition_events: 2,
      realty_case_outbox: 1,
    },
  });
}

async function exercisePayloadAuthority(env, workspaceId) {
  const caseId = "case-payload-postgres-authority-it";
  const openedEventId = `realty-case-${caseId}-opened`;
  const blockedEventIds = [
    "case-payload-postgres-authority-it-lead-blocked",
    "case-payload-postgres-authority-it-requirements-blocked",
  ];
  const frozenEventId = "case-payload-postgres-authority-it-frozen";
  const openScript = `
    import assert from "node:assert/strict";
    import { getPayload } from ${JSON.stringify(pathToFileURL(payloadRuntime).href)};
    import {
      openRealtyCaseInPayload,
    } from ${JSON.stringify(pathToFileURL(payloadAuthority).href)};

    const workspaceId = ${JSON.stringify(workspaceId)};
    const caseId = ${JSON.stringify(caseId)};
    const openedEventId = ${JSON.stringify(openedEventId)};
    const frozenEventId = ${JSON.stringify(frozenEventId)};
    let payload;
    let exitCode = 0;

    async function rows(collection) {
      const result = await payload.find({
        collection,
        depth: 0,
        limit: 10,
        overrideAccess: true,
        pagination: false,
        where: { workspace_id: { equals: workspaceId } },
      });
      return result.docs;
    }

    try {
      const configModule = await import(${JSON.stringify(pathToFileURL(payloadConfig).href)});
      payload = await getPayload({ config: configModule.default });
      const options = { payload, workspaceId };
      const opened = await openRealtyCaseInPayload(
        {
          id: caseId,
          jurisdiction: "BG",
          caseType: "buyer_purchase",
          assetKind: "residential",
          clientRef: "client-payload-postgres-authority-it",
          propertyRef: "property-payload-postgres-authority-it",
          executionMode: "autonomous",
          assuranceRef: "assurance://trusted-agent/payload-postgres-it",
          mandate: {
            ref: "mandate-payload-postgres-authority-it",
            grantedByRef: "client-payload-postgres-authority-it",
            signedAt: "2026-07-30T08:00:00.000Z",
            signedEvidenceRef: "evidence://mandate/payload-postgres-authority-it",
            capabilities: ["case:*"],
          },
          actor: "trusted-agent-payload-postgres-it",
          executorKind: "agent",
        },
        { ...options, recordedAt: "2026-07-30T08:05:00.000Z" },
      );
      assert.equal(opened.idempotent, false);
      assert.equal(opened.event.id, openedEventId);
    } catch (error) {
      console.error(error.stack || error);
      exitCode = 1;
    } finally {
      if (payload) {
        try {
          await payload.destroy();
        } catch (error) {
          console.error(error.stack || error);
          exitCode = 1;
        }
      }
    }
    process.exit(exitCode);
  `;
  command(process.execPath, ["--input-type=module", "--eval", openScript], {
    env,
    label: "opening Payload RealtyCase authority fixture",
  });

  const concurrentInputs = [
    {
      id: blockedEventIds[0],
      caseId,
      action: "step_blocked",
      stepKey: "lead_intake",
      reasonCode: "integration_concurrent_lead_block",
      actor: "trusted-agent-payload-postgres-it",
      executorKind: "agent",
    },
    {
      id: blockedEventIds[1],
      caseId,
      action: "step_blocked",
      stepKey: "requirements_brief",
      reasonCode: "integration_concurrent_requirements_block",
      actor: "trusted-agent-payload-postgres-it",
      executorKind: "agent",
    },
  ];
  const writerScript = (input) => `
    import assert from "node:assert/strict";
    import { getPayload } from ${JSON.stringify(pathToFileURL(payloadRuntime).href)};
    import { appendRealtyCaseActionInPayload } from ${JSON.stringify(pathToFileURL(payloadAuthority).href)};

    const input = ${JSON.stringify(input)};
    const workspaceId = ${JSON.stringify(workspaceId)};
    let payload;
    let exitCode = 0;

    try {
      const configModule = await import(${JSON.stringify(pathToFileURL(payloadConfig).href)});
      payload = await getPayload({ config: configModule.default });
      const result = await appendRealtyCaseActionInPayload(input, {
        payload,
        workspaceId,
        recordedAt: "2026-07-30T08:10:00.000Z",
      });
      assert.equal(result.idempotent, false);
      assert.equal(result.event.id, input.id);
    } catch (error) {
      console.error(error.cause?.stack || error.stack || error);
      exitCode = 1;
    } finally {
      if (payload) {
        try {
          await payload.destroy();
        } catch (error) {
          console.error(error.stack || error);
          exitCode = 1;
        }
      }
    }
    process.exit(exitCode);
  `;
  await Promise.all(
    concurrentInputs.map((input) =>
      commandAsync(process.execPath, ["--input-type=module", "--eval", writerScript(input)], {
        env,
        label: `concurrent Payload RealtyCase authority writer ${input.id}`,
      }),
    ),
  );

  const verifyScript = `
    import assert from "node:assert/strict";
    import { getPayload } from ${JSON.stringify(pathToFileURL(payloadRuntime).href)};
    import {
      appendRealtyCaseActionInPayload,
      readRealtyCasePayloadAuthorityHistory,
    } from ${JSON.stringify(pathToFileURL(payloadAuthority).href)};

    const workspaceId = ${JSON.stringify(workspaceId)};
    const caseId = ${JSON.stringify(caseId)};
    const openedEventId = ${JSON.stringify(openedEventId)};
    const blockedEventIds = ${JSON.stringify(blockedEventIds)};
    const frozenEventId = ${JSON.stringify(frozenEventId)};
    const concurrentInputs = ${JSON.stringify(concurrentInputs)};
    let payload;
    let exitCode = 0;

    async function rows(collection) {
      const result = await payload.find({
        collection,
        depth: 0,
        limit: 10,
        overrideAccess: true,
        pagination: false,
        where: { workspace_id: { equals: workspaceId } },
      });
      return result.docs;
    }

    try {
      const configModule = await import(${JSON.stringify(pathToFileURL(payloadConfig).href)});
      payload = await getPayload({ config: configModule.default });
      const options = { payload, workspaceId };
      const beforeFreeze = await readRealtyCasePayloadAuthorityHistory(options);
      const expectedBeforeFreeze = [openedEventId, ...blockedEventIds].sort();
      assert.deepEqual(beforeFreeze.caseEvents.map((event) => event.id).sort(), expectedBeforeFreeze);
      assert.deepEqual(beforeFreeze.conditionEvents, []);
      assert.equal(beforeFreeze.caseEvents.length, expectedBeforeFreeze.length);
      const [eventsBeforeFreeze, outboxBeforeFreeze] = await Promise.all([rows("realty_case_events"), rows("realty_case_outbox")]);
      const orderedEvents = [...eventsBeforeFreeze].sort((left, right) => Number(left.sequence) - Number(right.sequence));
      assert.deepEqual(orderedEvents.map((event) => Number(event.sequence)), [1, 2, 3]);
      assert.deepEqual(beforeFreeze.caseEvents.map((event) => event.id), orderedEvents.map((event) => event.event_id));
      assert.equal(new Set(eventsBeforeFreeze.map((event) => event.event_id)).size, 3);
      assert.equal(new Set(eventsBeforeFreeze.map((event) => event.idempotency_key)).size, 3);
      assert.equal(outboxBeforeFreeze.length, 3);
      assert.equal(new Set(outboxBeforeFreeze.map((row) => row.idempotency_key)).size, 3);
      assert.deepEqual(
        outboxBeforeFreeze.map((row) => String(row.source_event?.id ?? row.source_event)).sort(),
        orderedEvents.map((event) => String(event.id)).sort(),
      );
      assert.deepEqual(
        outboxBeforeFreeze.map((row) => row.payload_refs.last_event_id).sort(),
        expectedBeforeFreeze,
      );

      const retries = await Promise.all(
        concurrentInputs.map((input) =>
          appendRealtyCaseActionInPayload(input, { ...options, recordedAt: "2026-07-30T08:10:00.000Z" }),
        ),
      );
      assert.deepEqual(retries.map((result) => result.idempotent), [true, true]);

      const freezeInput = {
        id: frozenEventId,
        caseId,
        action: "case_frozen",
        authorityRef: "authority://broker/payload-postgres-it",
        reasonCode: "integration_authority_retry",
        actor: "trusted-agent-payload-postgres-it",
        executorKind: "agent",
      };
      const frozen = await appendRealtyCaseActionInPayload(
        freezeInput,
        { ...options, recordedAt: "2026-07-30T08:15:00.000Z" },
      );
      assert.equal(frozen.idempotent, false);
      assert.equal(frozen.case.status, "frozen");

      const retried = await appendRealtyCaseActionInPayload(
        freezeInput,
        { ...options, recordedAt: "2026-07-30T08:15:00.000Z" },
      );
      assert.equal(retried.idempotent, true);

      const history = await readRealtyCasePayloadAuthorityHistory(options);
      const expected = [openedEventId, ...blockedEventIds, frozenEventId].sort();
      assert.deepEqual(history.caseEvents.map((event) => event.id).sort(), expected);
      assert.equal(history.caseEvents.at(-1).authority_ref, freezeInput.authorityRef);
      const [events, outbox] = await Promise.all([rows("realty_case_events"), rows("realty_case_outbox")]);
      assert.equal(events.length, 4);
      assert.equal(new Set(events.map((event) => event.event_id)).size, 4);
      assert.equal(new Set(events.map((event) => event.idempotency_key)).size, 4);
      assert.equal(outbox.length, 4);
      assert.equal(new Set(outbox.map((row) => row.idempotency_key)).size, 4);
      assert.deepEqual(
        outbox.map((row) => row.payload_refs.last_event_id).sort(),
        expected,
      );
    } catch (error) {
      console.error(error.stack || error);
      exitCode = 1;
    } finally {
      if (payload) {
        try {
          await payload.destroy();
        } catch (error) {
          console.error(error.stack || error);
          exitCode = 1;
        }
      }
    }
    process.exit(exitCode);
  `;
  command(process.execPath, ["--input-type=module", "--eval", verifyScript], {
    env,
    label: "verifying concurrent Payload RealtyCase authority writers",
  });
}

function exerciseDurableLeadStore(env) {
  const script = `
    import assert from "node:assert/strict";
    import { getPayload } from ${JSON.stringify(pathToFileURL(payloadRuntime).href)};
    import { persistLeadIntakeDurably } from ${JSON.stringify(pathToFileURL(leadDurableStore).href)};

    const leadId = "lead-draft-33333333-3333-4333-8333-333333333333";
    const idempotencyKey = "payload-postgres-durable-lead-it";
    const receivedAt = "2026-08-10T09:00:00.000Z";
    const plaintextName = "Durable Lead Integration";
    const plaintextPhone = "+359000000000";
    const lead = {
      id: "crm-inbox-payload-postgres-durable-lead-it",
      lead: {
        id: leadId,
        idempotency_key: idempotencyKey,
        source: "website_contact_callback",
        intent: "callback",
        leadType: "general",
        contact: { name: plaintextName, phone: plaintextPhone },
        intake: { complete: true, missing_fields: [], captured_fields: ["contact"] },
      },
      original_language: "en",
      admin_locale: "en",
      contact_preference: "phone",
      hermes_reply_draft: { broker_approval_required: true },
      confirmation: { status: "ready", message_key: "lead_received" },
      broker_assignment: { broker_id: "broker-payload-postgres-it", method: "integration_fixture" },
    };
    let payload;
    let exitCode = 0;

    async function rows(collection, where) {
      const result = await payload.find({
        collection,
        depth: 0,
        limit: 10,
        overrideAccess: true,
        pagination: false,
        where,
      });
      return result.docs;
    }

    try {
      const configModule = await import(${JSON.stringify(pathToFileURL(payloadConfig).href)});
      payload = await getPayload({ config: configModule.default });
      const options = { lead, contactSecret: process.env.MS_REALTY_LEAD_CONTACT_KEY, receivedAt, payload };
      const first = await persistLeadIntakeDurably(options);
      const retry = await persistLeadIntakeDurably(options);
      assert.equal(first.created, true);
      assert.equal(first.idempotent, false);
      assert.equal(retry.created, false);
      assert.equal(retry.idempotent, true);

      const [leads, contacts] = await Promise.all([
        rows("public_leads", { lead_id: { equals: leadId } }),
        rows("lead_contacts", { subject_id: { equals: leadId } }),
      ]);
      assert.equal(leads.length, 1, "expected exactly one durable public lead");
      assert.equal(contacts.length, 1, "expected exactly one encrypted lead contact");
      assert.equal(leads[0].idempotency_key, idempotencyKey);
      assert.equal(contacts[0].algorithm, "aes-256-gcm");
      for (const field of ["iv", "auth_tag", "ciphertext"]) assert.ok(contacts[0][field], "missing encrypted envelope field " + field);
      for (const field of ["contact", "name", "phone", "email", "message"]) assert.equal(field in contacts[0], false);

      const serialized = JSON.stringify({ lead: leads[0], contact: contacts[0] });
      assert.equal(serialized.includes(plaintextName), false, "plaintext name reached Postgres");
      assert.equal(serialized.includes(plaintextPhone), false, "plaintext phone reached Postgres");
    } catch (error) {
      console.error(error.stack || error);
      exitCode = 1;
    } finally {
      if (payload) {
        try {
          await payload.destroy();
        } catch (error) {
          console.error(error.stack || error);
          exitCode = 1;
        }
      }
    }
    process.exit(exitCode);
  `;
  command(process.execPath, ["--input-type=module", "--eval", script], { env, label: "exercising durable lead storage" });
}

function verifyProjection(env, workspaceId, caseId, { label, outboxStatus, outboxAttempts }) {
  const script = `
    import assert from "node:assert/strict";
    import { getPayload } from ${JSON.stringify(pathToFileURL(payloadRuntime).href)};

    const workspaceId = ${JSON.stringify(workspaceId)};
    const caseId = ${JSON.stringify(caseId)};
    const outboxStatus = ${JSON.stringify(outboxStatus)};
    const outboxAttempts = ${JSON.stringify(outboxAttempts)};
    let payload;
    let exitCode = 0;

    async function rows(collection) {
      const result = await payload.find({
        collection,
        depth: 0,
        limit: 10,
        overrideAccess: true,
        pagination: false,
        where: { workspace_id: { equals: workspaceId } },
      });
      return result.docs;
    }

    try {
      const configModule = await import(\`${pathToFileURL(payloadConfig).href}?payload-postgres-it=\${Date.now()}\`);
      payload = await getPayload({ config: configModule.default });
      const migrations = await payload.find({ collection: "payload-migrations", limit: 0, overrideAccess: true, pagination: false });
      const migrationNames = new Set(migrations.docs.map((migration) => migration.name));
      for (const name of [
        "20260710_132716_initial_schema",
        "20260730_142043_realty_case_persistence",
        "20260730_160000_realign_realty_case_mandate_projection",
        "20260730_170000_add_realty_case_conditions",
        "20260810_000558_durable_lead_store",
        "20260810_143000_repair_durable_lead_relations",
      ]) {
        assert.ok(migrationNames.has(name), \`missing applied Payload migration \${name}\`);
      }

      const [cases, caseEvents, mandates, conditions, conditionEvents, outbox] = await Promise.all([
        rows("realty_cases"),
        rows("realty_case_events"),
        rows("realty_case_mandate_versions"),
        rows("realty_case_conditions"),
        rows("realty_case_condition_events"),
        rows("realty_case_outbox"),
      ]);
      assert.equal(cases.length, 1);
      assert.equal(caseEvents.length, 1);
      assert.equal(mandates.length, 1);
      assert.equal(conditions.length, 1);
      assert.equal(conditionEvents.length, 2);
      assert.equal(outbox.length, 1);
      assert.equal(cases[0].case_id, caseId);
      assert.equal(caseEvents[0].case, cases[0].id);
      assert.equal(mandates[0].case, cases[0].id);
      assert.equal(conditions[0].case, cases[0].id);
      assert.equal(Number(conditions[0].last_event_sequence), 2);
      assert.equal(conditions[0].status, "satisfied");
      for (const event of conditionEvents) {
        assert.equal(event.case, cases[0].id);
        assert.equal(event.condition, conditions[0].id);
      }
      assert.equal(new Set(conditionEvents.map((event) => event.idempotency_key)).size, 2);
      assert.equal(outbox[0].case, cases[0].id);
      assert.equal(outbox[0].source_event, caseEvents[0].id);
      assert.equal(outbox[0].kind, "reconciliation");
      assert.equal(outbox[0].destination_ref, "internal:realty_case_payload_readback");
      assert.equal(outbox[0].status, outboxStatus);
      assert.equal(Number(outbox[0].attempt_count), outboxAttempts);
      assert.deepEqual(Object.keys(outbox[0].payload_refs).sort(), [
        "case_id",
        "case_projection_digest",
        "last_event_id",
        "last_event_sequence",
        "manifest_kind",
        "manifest_version",
      ]);
      assert.equal(outbox[0].payload_refs.case_id, caseId);
      assert.equal(outbox[0].payload_refs.last_event_id, caseEvents[0].event_id);
      assert.equal(Number(outbox[0].payload_refs.last_event_sequence), Number(caseEvents[0].sequence));
      assert.match(outbox[0].payload_digest, /^[a-f0-9]{64}$/);
      assert.equal(JSON.stringify(outbox[0].payload_refs).includes("client-payload-postgres-it"), false);
    } catch (error) {
      console.error(error.stack || error);
      exitCode = 1;
    } finally {
      if (payload) {
        try {
          await payload.destroy();
        } catch (error) {
          console.error(error.stack || error);
          exitCode = 1;
        }
      }
    }
    process.exit(exitCode);
  `;
  command(process.execPath, ["--input-type=module", "--eval", script], { env, label });
}

test(
  "Payload/Postgres authority writer and RealtyCase projectors work against an isolated database",
  { skip: enabled ? false : "set MS_REALTY_RUN_PAYLOAD_INTEGRATION=1 to run the disposable Docker integration test", timeout: 180_000 },
  async () => {
    const project = `ms-realty-payload-it-${process.pid}-${randomUUID().slice(0, 8)}`;
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ms-realty-payload-postgres-it-"));
    const port = await freeLoopbackPort();
    const workspaceId = `workspace-payload-postgres-it-${process.pid}`;
    const authorityWorkspaceId = `workspace-payload-postgres-authority-it-${process.pid}`;
    const databaseUser = "payload_it";
    const databaseName = "payload_it";
    const databasePassword = randomBytes(32).toString("hex");
    const payloadSecret = randomBytes(32).toString("hex");
    const leadContactKey = randomBytes(32).toString("hex");
    const databaseUrl = `postgres://${databaseUser}:${databasePassword}@127.0.0.1:${port}/${databaseName}`;
    const env = {
      ...process.env,
      DATABASE_URL: databaseUrl,
      NODE_ENV: "production",
      PAYLOAD_CONFIG_PATH: payloadConfig,
      PAYLOAD_POSTGRES_DB: databaseName,
      PAYLOAD_POSTGRES_HOST: "127.0.0.1",
      PAYLOAD_POSTGRES_PASSWORD: databasePassword,
      PAYLOAD_POSTGRES_PORT: String(port),
      PAYLOAD_POSTGRES_USER: databaseUser,
      PAYLOAD_SECRET: payloadSecret,
      MS_REALTY_LEAD_CONTACT_KEY: leadContactKey,
    };
    try {
      runCompose(project, ["up", "--detach", "--wait", "payload-postgres"], env, "starting isolated Payload Postgres");
      command(process.execPath, [payloadCli, "migrate"], { env, label: "running Payload migrations" });
      command(process.execPath, [payloadCli, "migrate:status"], { env, label: "checking Payload migration status" });
      exerciseDurableLeadStore(env);
      await exercisePayloadAuthority(env, authorityWorkspaceId);

      const fixture = writeFixture(directory);
      const projectorEnv = {
        ...env,
        MS_REALTY_CASE_CONDITION_LEDGER_PATH: fixture.conditionLedgerPath,
        MS_REALTY_CASE_LEDGER_PATH: fixture.caseLedgerPath,
        MS_REALTY_CASE_PROJECTOR_APPLY: "1",
        MS_REALTY_WORKSPACE_ID: workspaceId,
      };
      command(process.execPath, [caseProjector], { env: projectorEnv, label: "applying RealtyCase Payload projector" });
      command(process.execPath, [conditionProjector], { env: projectorEnv, label: "applying RealtyCase condition Payload projector" });
      command(process.execPath, [caseProjector], { env: projectorEnv, label: "retrying RealtyCase Payload projector" });
      command(process.execPath, [conditionProjector], { env: projectorEnv, label: "retrying RealtyCase condition Payload projector" });
      verifyProjection(projectorEnv, workspaceId, fixture.caseId, {
        label: "verifying idempotent RealtyCase projection",
        outboxStatus: "pending",
        outboxAttempts: 0,
      });

      markInternalOutboxDelivered(projectorEnv, workspaceId);
      command(process.execPath, [caseProjector], { env: projectorEnv, label: "reconciling delivered RealtyCase outbox" });
      const readback = command(process.execPath, [caseReadback], {
        env: {
          ...projectorEnv,
          MS_REALTY_CASE_PROJECTOR_APPLY: "",
          MS_REALTY_CASE_READBACK_DATABASE_URL: databaseUrl,
        },
        label: "running scoped RealtyCase Payload read-back",
      });
      assertCleanReadback(readback, workspaceId);
      verifyProjection(projectorEnv, workspaceId, fixture.caseId, {
        label: "verifying delivered RealtyCase reconciliation outbox",
        outboxStatus: "delivered",
        outboxAttempts: 1,
      });
    } finally {
      try {
        downCompose(project, env);
      } finally {
        fs.rmSync(directory, { force: true, recursive: true });
      }
    }
  },
);
