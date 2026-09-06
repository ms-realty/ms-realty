import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

function runCli(t, rejected = false) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "msr-source-review-cli-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const reportPath = path.join(directory, "report.json");
  const cleanupPath = path.join(directory, "cleanup.json");
  // Run the actual CLI with isolated source/provider boundaries. A referenced
  // transport handle deliberately survives Payload cleanup, as on the live host.
  const source = fs.readFileSync(new URL("../scripts/run-hermes-source-review.mjs", import.meta.url), "utf8");
  fs.writeFileSync(path.join(directory, "cli.mjs"), source.replace(/from "\.\.\/lib\/[^"\n]+"/g, 'from "./boundary.mjs"'));
  fs.writeFileSync(path.join(directory, "boundary.mjs"), `
    import fs from "node:fs";
    export const loadCmsSeed = () => ({});
    export const loadLocaleRegistry = () => ({});
    export const projectListingDraftSeed = async () => ({});
    export const readSourceReviewTask = () => ({});
    export async function loadPayloadCmsImportRuntime() {
      setInterval(() => {}, 60_000);
      return { async destroy() {
        await new Promise(resolve => setTimeout(resolve, 25));
        fs.writeFileSync(${JSON.stringify(cleanupPath)}, JSON.stringify({ closed: true }));
      } };
    }
    export async function runHermesSourceReview({ loadSeed }) {
      await loadSeed();
      return { capability: "source_review", translation_status: "not_validated",
        summary: { attempted: 1, persisted: ${rejected ? 0 : 1}, rejected: ${rejected ? 1 : 0} },
        rejected: ${rejected ? '["invalid selection"]' : '[]'} };
    }
    export function assertHermesDraftWorkerReport(report) {
      if (!report.summary.persisted) throw new Error("No draft persisted");
    }
  `);
  const result = spawnSync(process.execPath, [path.join(directory, "cli.mjs"), "--report", reportPath], {
    env: { ...process.env, DATABASE_URL: "postgres://fixture:fixture@localhost/fixture", MS_REALTY_TASK_LEDGER_PATH: path.join(directory, "tasks.jsonl") },
    encoding: "utf8", timeout: 5000,
  });
  assert.equal(result.error, undefined, result.error?.message);
  assert.deepEqual(JSON.parse(fs.readFileSync(cleanupPath, "utf8")), { closed: true });
  assert.equal(JSON.parse(fs.readFileSync(reportPath, "utf8")).summary.rejected, rejected ? 1 : 0);
  return result;
}

test("source-review CLI exits after durable evidence and asynchronous cleanup despite a retained transport", (t) => {
  const result = runCli(t);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).summary.persisted, 1);
});

test("source-review CLI retains rejected evidence and exits unsuccessfully after cleanup", (t) => {
  const result = runCli(t, true);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /No draft persisted/);
  assert.equal(JSON.parse(result.stdout).summary.rejected, 1);
});
