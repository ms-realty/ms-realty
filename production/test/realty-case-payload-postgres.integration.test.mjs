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
const hermesOwnerCommand = path.join(root, "production", "lib", "hermes-owner-command.mjs");
const privateContactVault = path.join(root, "production", "lib", "private-contact-vault.mjs");
const operationsStore = path.join(root, "production", "lib", "operations-durable-store.mjs");
const leadDurableStore = path.join(root, "production", "lib", "lead-durable-store.mjs");
const httpRuntime = path.join(root, "production", "lib", "http.mjs");
const durableLeadMigration = path.join(root, "migrations", "20260813_120000_durable_lead_side_effects.ts");
const COMMAND_TIMEOUT_MS = 120_000;

function redact(value, env) {
  let text = String(value || "");
  for (const secret of [env?.DATABASE_URL, env?.PAYLOAD_SECRET, env?.PAYLOAD_POSTGRES_PASSWORD, env?.MS_REALTY_PROVIDER_TOKEN_KEY]) {
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
    import { persistLeadIntakeDurably, readLeadIntakesDurably } from ${JSON.stringify(pathToFileURL(leadDurableStore).href)};
    import { createHttpApp, dispatchHttp } from ${JSON.stringify(pathToFileURL(httpRuntime).href)};

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
        source: "website_seller_valuation",
        intent: "valuation",
        leadType: "seller",
        contact: { name: plaintextName, phone: plaintextPhone },
        property: { location: "Sandanski", type: "apartment" },
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
      const options = {
        lead,
        contactSecret: process.env.MS_REALTY_LEAD_CONTACT_KEY,
        marketingOptIn: true,
        receivedAt,
        sellerPipelineCreatedAt: receivedAt,
        workspaceId: process.env.MS_REALTY_WORKSPACE_ID,
        payload,
      };
      const first = await persistLeadIntakeDurably(options);
      const retry = await persistLeadIntakeDurably(options);
      assert.equal(first.created, true);
      assert.equal(first.idempotent, false);
      assert.equal(retry.created, false);
      assert.equal(retry.idempotent, true);

      const [leads, contacts, consents, sellerEvents] = await Promise.all([
        rows("public_leads", { lead_id: { equals: leadId } }),
        rows("lead_contacts", { subject_id: { equals: leadId } }),
        rows("consent_events", { lead_id: { equals: leadId } }),
        rows("seller_pipeline_events", { lead_id: { equals: leadId } }),
      ]);
      assert.equal(leads.length, 1, "expected exactly one durable public lead");
      assert.equal(contacts.length, 1, "expected exactly one encrypted lead contact");
      assert.equal(consents.length, 1, "expected exactly one consent event");
      assert.equal(sellerEvents.length, 1, "expected exactly one seller pipeline event");
      assert.equal(leads[0].idempotency_key, idempotencyKey);
      assert.equal(leads[0].workspace_id, process.env.MS_REALTY_WORKSPACE_ID);
      assert.equal(contacts[0].workspace_id, process.env.MS_REALTY_WORKSPACE_ID);
      assert.equal(contacts[0].algorithm, "aes-256-gcm");
      for (const field of ["iv", "auth_tag", "ciphertext"]) assert.ok(contacts[0][field], "missing encrypted envelope field " + field);
      for (const field of ["contact", "name", "phone", "email", "message"]) assert.equal(field in contacts[0], false);

      assert.equal(consents[0].workspace_id, process.env.MS_REALTY_WORKSPACE_ID);
      assert.equal(consents[0].payload.marketing_opt_in, true);
      assert.equal(sellerEvents[0].payload.stage, "valuation_requested");
      assert.equal("contact_name" in sellerEvents[0].payload, false);

      const serialized = JSON.stringify({ lead: leads[0], contact: contacts[0], consent: consents[0], seller: sellerEvents[0] });
      assert.equal(serialized.includes(plaintextName), false, "plaintext name reached Postgres");
      assert.equal(serialized.includes(plaintextPhone), false, "plaintext phone reached Postgres");

      const opened = await readLeadIntakesDurably({
        contactSecret: process.env.MS_REALTY_LEAD_CONTACT_KEY,
        payload,
        user: {
          collection: "admins",
          id: "payload-postgres-broker-it",
          role: "broker",
          workspace_ids: [process.env.MS_REALTY_WORKSPACE_ID],
        },
        workspaceId: process.env.MS_REALTY_WORKSPACE_ID,
      });
      assert.equal(opened.length, 1);
      assert.equal(opened[0].workspace_id, process.env.MS_REALTY_WORKSPACE_ID);
      assert.equal(opened[0].contact.name, plaintextName);
      assert.equal(opened[0].contact.phone, plaintextPhone);

      const concurrentIdempotencyKey = "payload-postgres-concurrent-http-lead-it";
      const concurrentInput = {
        source: "website_seller_valuation",
        intent: "valuation",
        leadType: "seller",
        language: "bg",
        idempotencyKey: concurrentIdempotencyKey,
        contact: { name: "Concurrent Durable Seller", phone: "+359000000099" },
        contact_preference: "phone",
        property: { location: "Sandanski", type: "apartment" },
        message: "One request submitted concurrently twice.",
        marketingOptIn: true,
      };
      const app = createHttpApp({
        leadDurableStore: {
          leadDurableStoreEnabled: true,
          payloadSecret: process.env.PAYLOAD_SECRET,
          databaseUrl: process.env.DATABASE_URL,
          contactSecret: process.env.MS_REALTY_LEAD_CONTACT_KEY,
          workspaceId: process.env.MS_REALTY_WORKSPACE_ID,
        },
        persistLeadIntake: (input) => persistLeadIntakeDurably({ ...input, payload }),
        receivedAt: "2026-08-10T09:05:00.000Z",
        sellerPipelineCreatedAt: "2026-08-10T09:05:01.000Z",
      });
      const submit = () =>
        dispatchHttp(app, {
          method: "POST",
          url: "/api/leads",
          headers: { host: "localhost", origin: "http://localhost" },
          body: concurrentInput,
        });
      const concurrentResponses = await Promise.all([submit(), submit()]);
      assert.deepEqual(concurrentResponses.map(({ status }) => status).sort(), [200, 201]);
      const concurrentLeadIds = concurrentResponses.map(({ body }) => body.ledger.lead_id);
      assert.equal(new Set(concurrentLeadIds).size, 1, "both requests must resolve to the committed original lead");
      const concurrentLeadId = concurrentLeadIds[0];
      const [concurrentLeads, concurrentContacts, concurrentConsents, concurrentSellerEvents] = await Promise.all([
        rows("public_leads", {
          and: [
            { workspace_id: { equals: process.env.MS_REALTY_WORKSPACE_ID } },
            { idempotency_key: { equals: concurrentIdempotencyKey } },
          ],
        }),
        rows("lead_contacts", { subject_id: { equals: concurrentLeadId } }),
        rows("consent_events", { lead_id: { equals: concurrentLeadId } }),
        rows("seller_pipeline_events", { lead_id: { equals: concurrentLeadId } }),
      ]);
      assert.deepEqual(
        [concurrentLeads.length, concurrentContacts.length, concurrentConsents.length, concurrentSellerEvents.length],
        [1, 1, 1, 1],
        "the concurrent retry must leave exactly one atomic lead intake",
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
  command(process.execPath, ["--input-type=module", "--eval", script], { env, label: "exercising durable lead storage" });
}

function exerciseDurableLeadMigrationRoundTrip(env) {
  const script = `
    import assert from "node:assert/strict";
    import { Pool } from "pg";
    import { drizzle } from "drizzle-orm/node-postgres";
    import * as migration from ${JSON.stringify(pathToFileURL(durableLeadMigration).href)};

    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    const db = drizzle(pool);
    const exists = async (relation) => {
      const result = await pool.query("SELECT to_regclass($1) AS relation", ["public." + relation]);
      return result.rows[0].relation !== null;
    };
    const columnExists = async (table, column) => {
      const result = await pool.query(
        "SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2",
        [table, column],
      );
      return result.rowCount === 1;
    };
    try {
      await migration.down({ db });
      assert.equal(await exists("consent_events"), false);
      assert.equal(await exists("seller_pipeline_events"), false);
      assert.equal(await columnExists("public_leads", "workspace_id"), false);
      assert.equal(await columnExists("lead_contacts", "workspace_id"), false);
      assert.equal(await exists("public_leads_idempotency_key_idx"), true);

      await migration.up({ db });
      assert.equal(await exists("consent_events"), true);
      assert.equal(await exists("seller_pipeline_events"), true);
      assert.equal(await columnExists("public_leads", "workspace_id"), true);
      assert.equal(await columnExists("lead_contacts", "workspace_id"), true);
      assert.equal(await exists("public_leads_workspace_id_idempotency_key_idx"), true);
    } finally {
      await pool.end();
    }
  `;
  command(process.execPath, ["--import", "tsx", "--input-type=module", "--eval", script], {
    env,
    label: "round-tripping the durable lead migration",
  });
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
        "20260813_120000_durable_lead_side_effects",
        "20260828_120000_hermes_owner_receipts",
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

function exerciseHermesOwnerCommand(env) {
  const script = `
    import assert from "node:assert/strict";
    import { getPayload } from ${JSON.stringify(pathToFileURL(payloadRuntime).href)};
    import payloadConfig from ${JSON.stringify(pathToFileURL(payloadConfig).href)};
    import { runHermesOwnerCommand } from ${JSON.stringify(pathToFileURL(hermesOwnerCommand).href)};
    import { openPrivateContactEnvelope } from ${JSON.stringify(pathToFileURL(privateContactVault).href)};

    let payload;
    let exitCode = 0;
    try {
      payload = await getPayload({ config: await payloadConfig });
      let providerCalls = 0;
      const input = {
        idempotencyKey: "hermes-owner-payload-postgres-it",
        command: "Prepare a guarded review plan for today's enquiries.",
        locale: "en",
      };
      const options = {
        operator: { id: "payload-owner-it", roles: ["admin"], workspace_ids: [] },
        payload,
        secret: process.env.MS_REALTY_PROVIDER_TOKEN_KEY,
        provider: async () => {
          providerCalls += 1;
          return {
            summary: "Review today's source-backed enquiry queue.",
            steps: [{
              title: "Open the work queue",
              why: "The authenticated queue is the source of truth.",
              destination: "work",
              mode: "review",
              evidence: ["authenticated_owner_scope"],
            }],
            questions: [],
          };
        },
        now: (() => {
          const values = ["2026-08-28T12:00:00.000Z", "2026-08-28T12:00:01.000Z"];
          return () => values.shift() || "2026-08-28T12:00:01.000Z";
        })(),
      };

      const receipt = await runHermesOwnerCommand(input, options);
      assert.equal(receipt.status, "planned");
      assert.equal(receipt.plan.steps[0].can_execute, false);
      assert.equal(receipt.plan.steps[0].requires_human_approval, true);
      const repeated = await runHermesOwnerCommand(input, options);
      assert.equal(repeated.idempotent, true);
      assert.equal(providerCalls, 1);

      const stored = await payload.find({
        collection: "hermes_owner_receipts",
        depth: 0,
        limit: 1,
        overrideAccess: true,
        pagination: false,
        where: { idempotency_key: { equals: input.idempotencyKey } },
      });
      assert.equal(stored.docs.length, 1);
      assert.equal(stored.docs[0].operator_id, "payload-owner-it");
      assert.equal(JSON.stringify(stored.docs[0]).includes(input.command), false);
      const opened = openPrivateContactEnvelope(stored.docs[0].receipt_envelope, {
        secret: process.env.MS_REALTY_PROVIDER_TOKEN_KEY,
        secretName: "MS_REALTY_PROVIDER_TOKEN_KEY",
      });
      assert.equal(opened.payload.command, input.command);
      assert.equal(opened.payload.plan.steps[0].can_execute, false);
    } catch (error) {
      console.error(error.stack || error);
      exitCode = 1;
    } finally {
      if (payload) await payload.destroy().catch((error) => {
        console.error(error.stack || error);
        exitCode = 1;
      });
    }
    process.exit(exitCode);
  `;
  command(process.execPath, ["--input-type=module", "--eval", script], {
    env,
    label: "exercising Hermes owner command against Payload/Postgres",
  });
}

function exerciseOperationsStore(env, hermesAuditPath, workspaceId) {
  const script = `
    import assert from "node:assert/strict";
    import fs from "node:fs";
    import { getPayload } from ${JSON.stringify(pathToFileURL(payloadRuntime).href)};
    import payloadConfig from ${JSON.stringify(pathToFileURL(payloadConfig).href)};
    import {
      automationConfirmation,
      createAutomationRule,
      createTask,
      readAutomationRun,
      readHermesRunHistory,
      readTask,
      runAutomationRule,
      updateAutomationRule,
    } from ${JSON.stringify(pathToFileURL(operationsStore).href)};

    const workspaceId = ${JSON.stringify(workspaceId)};
    const hermesAuditPath = ${JSON.stringify(hermesAuditPath)};
    const principal = { id: "operations-owner-it", roles: ["admin"], workspace_ids: [] };
    let payload;
    let exitCode = 0;
    try {
      payload = await getPayload({ config: await payloadConfig });
      const taskInput = {
        task_id: "operations-task-payload-it",
        idempotency_key: "operations-task-payload-it-key",
        title: "Review the source-backed listing",
        source_type: "listing",
        source_id: "MS-CRAWL-0001",
        assignee_id: "operations-owner-it",
        due_at: "2026-09-01T10:00:00.000Z",
        priority: "high",
      };
      const created = await createTask({ payload, workspaceId, actor: principal.id, input: taskInput });
      assert.equal(created.idempotent, false);
      assert.equal(created.task.task_id, taskInput.task_id);
      await payload.destroy();
      // Payload caches the default instance globally even after destroy(). A
      // distinct key gives this assertion a genuinely fresh connection while
      // keeping the create/reload check inside one isolated child process.
      payload = await getPayload({ config: await payloadConfig, key: "operations-reload" });
      const reloaded = await readTask({ payload, workspaceId, taskId: taskInput.task_id });
      assert.equal(reloaded.title, taskInput.title);
      await assert.rejects(
        createTask({
          payload,
          workspaceId,
          actor: principal.id,
          input: { ...taskInput, task_id: "operations-task-payload-conflict", title: "Different source work" },
        }),
        (error) => error.code === "conflict" && error.status === 409,
      );

      const rule = await createAutomationRule({
        payload,
        workspaceId,
        actor: principal.id,
        principal,
        input: {
          rule_id: "operations-rule-payload-it",
          idempotency_key: "operations-rule-payload-it-key",
          name: "Approved listing schedule",
          rule_type: "listing_publication_schedules",
          schedule: "daily",
        },
      });
      assert.equal(rule.rule.enabled, false);
      await updateAutomationRule({
        payload,
        workspaceId,
        actor: principal.id,
        principal,
        ruleId: rule.rule.rule_id,
        input: { enabled: true, confirmation: automationConfirmation("enable", rule.rule.rule_id) },
      });
      const run = await runAutomationRule({
        payload,
        workspaceId,
        actor: principal.id,
        principal,
        ruleId: rule.rule.rule_id,
        input: { run_id: "operations-run-payload-it", confirmation: automationConfirmation("run", rule.rule.rule_id) },
        runner: async () => ({ queued: 1, url: "https://must-not-persist.example" }),
      });
      assert.equal(run.run.status, "succeeded");
      assert.equal(run.run.result_summary.queued, 1);
      assert.equal(run.run.result_summary.url, undefined);
      const runReadback = await readAutomationRun({ payload, workspaceId, runId: run.run.run_id });
      assert.equal(runReadback.run.status, "succeeded");
      assert.deepEqual(runReadback.failures, []);

      fs.writeFileSync(hermesAuditPath, JSON.stringify({
        recorded_at: "2026-09-01T11:00:00.000Z",
        task_id: "operations-hermes-payload-it",
        object_type: "listing",
        object_id: "MS-CRAWL-0001",
        source_locale: "bg",
        target_locale: "en",
        status: "hermes_drafted",
        provider_mode: "self_hosted",
        source_hash: "a".repeat(64),
        draft_hash: "b".repeat(64),
        has_output: true,
        public_indexable: false,
        human_approved: false,
        can_publish: false,
        can_mark_indexable: false,
        prompt: "never return this",
      }) + "\\n");
      const history = await readHermesRunHistory({ auditPath: hermesAuditPath });
      assert.equal(history[0].run_id, "operations-hermes-payload-it");
      assert.equal(history[0].can_publish, false);
      assert.equal(Object.hasOwn(history[0], "prompt"), false);
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
  command(process.execPath, ["--input-type=module", "--eval", script], {
    env,
    label: "exercising durable operations against Payload/Postgres",
  });
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
      PAYLOAD_POSTGRES_DATA_DIR: "/var/lib/postgresql",
      PAYLOAD_POSTGRES_HOST: "127.0.0.1",
      PAYLOAD_POSTGRES_IMAGE: "postgres:18-alpine",
      PAYLOAD_POSTGRES_PASSWORD: databasePassword,
      PAYLOAD_POSTGRES_PORT: String(port),
      PAYLOAD_POSTGRES_USER: databaseUser,
      PAYLOAD_SECRET: payloadSecret,
      MS_REALTY_LEAD_CONTACT_KEY: leadContactKey,
      MS_REALTY_PROVIDER_TOKEN_KEY: randomBytes(32).toString("hex"),
      MS_REALTY_WORKSPACE_ID: workspaceId,
    };
    try {
      runCompose(project, ["up", "--detach", "--wait", "payload-postgres"], env, "starting isolated Payload Postgres");
      command(process.execPath, [payloadCli, "migrate"], { env, label: "running Payload migrations" });
      command(process.execPath, [payloadCli, "migrate:status"], { env, label: "checking Payload migration status" });
      exerciseHermesOwnerCommand(env);
      exerciseOperationsStore(env, path.join(directory, "hermes-operations-audit.jsonl"), workspaceId);
      exerciseDurableLeadMigrationRoundTrip(env);
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
