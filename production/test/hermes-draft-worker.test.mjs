import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import { spawn, spawnSync } from "node:child_process";
import {
  assertHermesDraftWorkerReport,
  openAiCompatibleHermesProvider,
  runHermesDraftWorker,
  taskFromHermesDraft,
} from "../lib/hermes-draft-worker.mjs";
import { assertAuditLog, readAuditLog } from "../lib/audit-log.mjs";
import { fromRoot } from "../lib/paths.mjs";
import { readHermesAuditLedger, readTranslationLedger } from "../lib/translation-ledger.mjs";

function dispatchRow() {
  return {
    id: "translation-listing-MS-TEST-1-he",
    status: "ready_for_hermes",
    object_type: "listing",
    object_id: "MS-TEST-1",
    source_locale: "bg",
    target_locale: "he",
    target_direction: "rtl",
    reviewer_role: "translator_he",
    provider_mode: "hermes_draft",
    public_indexable: false,
    requires_human_approval: true,
    can_publish: false,
    can_mark_indexable: false,
    source_hash: "source-hash",
    draft_hash: "draft-hash",
    admin_path: "/admin/translations?objectType=listing&objectId=MS-TEST-1&locale=he",
    prompt: {
      role: "translation_draft",
      sourceLocale: "bg",
      targetLocale: "he",
      sourceText: "Sandanski apartment",
      propertyFacts: { id: "MS-TEST-1", location: "Sandanski", price_eur: 50000 },
      rules: ["Draft only; never publish."],
    },
    source_snapshot: {
      object_type: "listing",
      object_id: "MS-TEST-1",
      source_locale: "bg",
      source_hash: "source-hash",
      approved_legal_content: false,
    },
    citations: [{ source: "cms_seed", object_id: "MS-TEST-1" }],
  };
}

function validDraft() {
  return {
    title: "MS-TEST-1 Sandanski 50000",
    body: "MS-TEST-1 Sandanski 50000 draft",
    seo_title: "MS-TEST-1 Sandanski 50000",
    meta_description: "MS-TEST-1 Sandanski 50000 draft",
    citations: [{ source: "cms_seed", object_id: "MS-TEST-1" }],
  };
}

function runScript(script, env) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [fromRoot("production", "scripts", script)], {
      cwd: fromRoot(),
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("close", (status) => resolve({ status, stdout, stderr }));
  });
}

async function withHermesServer(fn) {
  const draft = {
    title: "MS-CRAWL-0001 Sandanski commercial rent",
    body: "MS-CRAWL-0001 Sandanski commercial rent draft",
    seo_title: "MS-CRAWL-0001 Sandanski commercial rent",
    meta_description: "MS-CRAWL-0001 Sandanski commercial rent draft",
    citations: [{ source: "cms_seed", object_id: "MS-CRAWL-0001" }],
  };
  const server = http.createServer((request, response) => {
    request.resume();
    request.on("end", () => {
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(draft) } }] }));
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  try {
    await fn(`http://${address.address}:${address.port}/v1/chat/completions`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test("Hermes draft worker persists validated drafts to the requested ledger", async () => {
  const dir = fs.mkdtempSync(`${os.tmpdir()}/ms-realty-hermes-worker-`);
  const file = `${dir}/translations.jsonl`;
  const audit = `${dir}/audit.jsonl`;
  const auditLog = `${dir}/audit-log.jsonl`;
  const report = await runHermesDraftWorker({
    dispatch: { rows: [dispatchRow()] },
    provider: async () => validDraft(),
    filePath: file,
    auditPath: audit,
    auditLogPath: auditLog,
    providerMetadata: {
      mode: "self_hosted",
      model: "NousResearch/Hermes-4-14B",
      toolCallParser: "hermes",
      sensitiveDataAllowed: true,
    },
  });

  assert.equal(assertHermesDraftWorkerReport(report), true);
  assert.equal(report.summary.persisted, 1);
  assert.equal(report.summary.rejected, 0);
  assert.equal(report.audit_log_rows, 1);
  const rows = readTranslationLedger(file);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].status, "hermes_drafted");
  assert.equal(rows[0].public_indexable, false);
  assert.equal(rows[0].hermes.can_publish, false);
  assert.equal(rows[0].hermes.output.human_approved, false);
  assert.equal(readHermesAuditLedger(audit)[0].has_output, true);
  const auditRows = readAuditLog(auditLog);
  assert.equal(assertAuditLog(auditRows), true);
  assert.equal(auditRows[0].action, "hermes_model_call");
  assert.equal(auditRows[0].metadata.model, "NousResearch/Hermes-4-14B");
  assert.equal(auditRows[0].metadata.prompt_version, "translation_draft");
  assert.equal(auditRows[0].metadata.tool_call_parser, "hermes");
  assert.equal(auditRows[0].metadata.sensitive_data, true);
  assert.equal(JSON.stringify(auditRows).includes("Sandanski apartment"), false);
});

test("Hermes draft worker rejects outputs that omit protected facts", () => {
  assert.throws(
    () =>
      taskFromHermesDraft(dispatchRow(), {
        title: "Sandanski",
        body: "Missing protected id and price",
        citations: [{ source: "cms_seed" }],
      }),
    /property fact/,
  );
});

test("OpenAI-compatible Hermes provider posts JSON draft requests", async () => {
  let request;
  const provider = openAiCompatibleHermesProvider({
    endpoint: "https://hermes.local/v1/chat/completions",
    apiKey: "test-key",
    model: "NousResearch/Hermes-4-14B",
    fetchImpl: async (url, options) => {
      request = { url, options, body: JSON.parse(options.body) };
      return {
        ok: true,
        async json() {
          return { choices: [{ message: { content: `\`\`\`\n${JSON.stringify(validDraft())}\n\`\`\`` } }] };
        },
      };
    },
  });

  const output = await provider(dispatchRow());
  assert.equal(request.url, "https://hermes.local/v1/chat/completions");
  assert.equal(request.options.headers.authorization, "Bearer test-key");
  assert.equal(request.body.model, "NousResearch/Hermes-4-14B");
  assert.equal(request.body.response_format.type, "json_object");
  assert.equal(output.title, "MS-TEST-1 Sandanski 50000");
});

test("live Hermes draft worker CLI fails closed when provider env is missing", () => {
  const result = spawnSync(process.execPath, [fromRoot("production", "scripts", "run-hermes-draft-worker.mjs")], {
    cwd: fromRoot(),
    encoding: "utf8",
    env: { ...process.env, HERMES_CHAT_COMPLETIONS_URL: "", HERMES_API_KEY: "" },
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /HERMES DRAFT WORKER FAILED: HERMES_CHAT_COMPLETIONS_URL is required/);
});

test("live Hermes draft worker CLI writes report and ledger to configured paths", async () => {
  await withHermesServer(async (endpoint) => {
    const dir = fs.mkdtempSync(`${os.tmpdir()}/ms-realty-hermes-cli-`);
    const reportPath = `${dir}/hermes-draft-worker-report.json`;
    const ledgerPath = `${dir}/translation-tasks.jsonl`;
    const auditPath = `${dir}/hermes-audit.jsonl`;
    const auditLogPath = `${dir}/audit-log.jsonl`;
    const result = await runScript("run-hermes-draft-worker.mjs", {
      ...process.env,
      HERMES_CHAT_COMPLETIONS_URL: endpoint,
      HERMES_API_KEY: "test-key",
      HERMES_DRAFT_LIMIT: "1",
      MS_REALTY_HERMES_WORKER_REPORT_PATH: reportPath,
      MS_REALTY_TRANSLATION_LEDGER_PATH: ledgerPath,
      MS_REALTY_HERMES_AUDIT_PATH: auditPath,
      MS_REALTY_AUDIT_LOG_PATH: auditLogPath,
    });

    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
    assert.equal(assertHermesDraftWorkerReport(report), true);
    assert.equal(report.summary.persisted, 1);
    assert.equal(report.audit_path, auditPath);
    assert.equal(report.audit_log_path, auditLogPath);
    assert.equal(report.audit_log_rows, 1);
    assert.equal(readTranslationLedger(ledgerPath).length, 1);
    assert.equal(readHermesAuditLedger(auditPath).length, 1);
    assert.equal(readAuditLog(auditLogPath)[0].action, "hermes_model_call");
  });
});
