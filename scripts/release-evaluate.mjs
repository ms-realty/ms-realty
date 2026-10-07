// Local operator evaluation only; this command never deploys, publishes, or contacts providers.
// Exit 0 = all gates pass, 2 = evaluated and blocked, 1 = invalid/unreadable inputs.
import { randomUUID } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import { parseArgs } from "node:util";
import { evaluateRelease, renderReadinessMarkdown } from "../src/release/evaluate.ts";

function evidenceFiles(dir) {
  const files = [];
  const walk = (current) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      if (entry.isSymbolicLink()) throw new Error("Evidence entries may not be symbolic links");
      if (entry.isDirectory()) walk(path);
      else if (entry.isFile() && path.endsWith(".json")) {
        files.push({ file: relative(dir, path), content: readFileSync(path, "utf8") });
      }
    }
  };
  walk(dir);
  return files;
}

// Replace complete files only. JSON is the authority; both views carry the same snapshot id.
function writeViews(dir, json, markdown) {
  mkdirSync(dir, { recursive: true });
  const temporary = join(dir, `.readiness-${randomUUID()}`);
  try {
    writeFileSync(`${temporary}.json`, `${JSON.stringify(json, null, 2)}\n`, { mode: 0o600 });
    writeFileSync(`${temporary}.md`, markdown, { mode: 0o600 });
    renameSync(`${temporary}.md`, join(dir, "readiness.md"));
    renameSync(`${temporary}.json`, join(dir, "readiness.json"));
  } finally {
    rmSync(`${temporary}.json`, { force: true });
    rmSync(`${temporary}.md`, { force: true });
  }
}

let outputDirectory;
try {
  const { values } = parseArgs({
    options: {
      manifest: { type: "string" },
      evidence: { type: "string" },
      policy: { type: "string", default: "release/policy.json" },
      out: { type: "string", default: "release" },
      now: { type: "string" },
    },
  });
  if (!values.manifest || !values.evidence) {
    throw new Error("--manifest <file> and --evidence <dir> are required");
  }
  const insideEvidence = relative(resolve(values.evidence), resolve(values.out));
  if (!insideEvidence || (!insideEvidence.startsWith("..") && !isAbsolute(insideEvidence))) {
    throw new Error("--out must be outside the evidence directory");
  }
  outputDirectory = values.out;
  const now = values.now ? new Date(values.now) : new Date();
  if (Number.isNaN(now.getTime())) throw new Error("--now is not a valid instant");
  const report = evaluateRelease({
    manifest: JSON.parse(readFileSync(values.manifest, "utf8")),
    policy: JSON.parse(readFileSync(values.policy, "utf8")),
    evidence: evidenceFiles(values.evidence),
    now,
  });
  writeViews(outputDirectory, report, renderReadinessMarkdown(report));
  const blocked = report.gates.filter((gate) => gate.status === "blocked").map((gate) => gate.id);
  console.log(
    `Release ${report.release.releaseSha}: ${report.verdict}` +
      (blocked.length ? ` (blocked: ${blocked.join(", ")})` : "") +
      `\nSnapshot ${report.snapshotId} → ${join(values.out, "readiness.{json,md}")}`,
  );
  process.exitCode = report.verdict === "pass" ? 0 : 2;
} catch (error) {
  // A failed refresh must not leave an older passing output in place. This marker deliberately
  // fails readinessReportSchema; the endpoint therefore blocks it even if runtime pins are old.
  if (outputDirectory) {
    try {
      writeViews(
        outputDirectory,
        { schemaVersion: 0, verdict: "blocked", error: "evaluation_failed" },
        "# Release readiness\n\n**Blocked:** evaluation failed. Correct the inputs and regenerate both views.\n",
      );
    } catch {
      console.error("release:evaluate: could not invalidate the previous output; do not use it");
    }
  }
  console.error(`release:evaluate: ${error instanceof Error ? error.message : error}`);
  process.exitCode = 1;
}
