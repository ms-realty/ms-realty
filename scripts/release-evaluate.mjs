// Evaluates release gates R00–R12 for one manifest (architecture §20.3, §21.3; D14; AT67).
// Usage: npm run release:evaluate -- --manifest <file> --evidence <dir>
//          [--policy release/policy.json] [--out release] [--now <ISO instant>]
// Writes <out>/readiness.json and <out>/readiness.md from one snapshot. Exit code: 0 when every
// gate passes, 2 when any gate is blocked, 1 when the inputs cannot be evaluated.
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { parseArgs } from "node:util";
import { evaluateRelease, renderReadinessMarkdown } from "../src/release/evaluate.ts";

function evidenceFiles(dir) {
  return readdirSync(dir, { recursive: true })
    .map((entry) => join(dir, String(entry)))
    .filter((path) => path.endsWith(".json") && statSync(path).isFile())
    .map((path) => ({ file: relative(dir, path), content: readFileSync(path, "utf8") }));
}

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
  const now = values.now ? new Date(values.now) : new Date();
  if (Number.isNaN(now.getTime())) throw new Error("--now is not a valid instant");
  const report = evaluateRelease({
    manifest: JSON.parse(readFileSync(values.manifest, "utf8")),
    policy: JSON.parse(readFileSync(values.policy, "utf8")),
    evidence: evidenceFiles(values.evidence),
    now,
  });
  mkdirSync(values.out, { recursive: true });
  writeFileSync(join(values.out, "readiness.json"), `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(join(values.out, "readiness.md"), renderReadinessMarkdown(report));
  const blocked = report.gates.filter((gate) => gate.status === "blocked").map((gate) => gate.id);
  console.log(
    `Release ${report.release.releaseSha}: ${report.verdict}` +
      (blocked.length ? ` (blocked: ${blocked.join(", ")})` : "") +
      `\nSnapshot ${report.snapshotId} → ${join(values.out, "readiness.{json,md}")}`,
  );
  process.exitCode = report.verdict === "pass" ? 0 : 2;
} catch (error) {
  console.error(`release:evaluate: ${error instanceof Error ? error.message : error}`);
  process.exitCode = 1;
}
