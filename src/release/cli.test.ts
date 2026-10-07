// Exercise the operator entry point with isolated filesystem inputs; these are never release evidence.
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readinessReportSchema } from "./schemas";

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "msr-release-cli-"));
  directories.push(directory);
  const manifest = join(directory, "manifest.json");
  const evidence = join(directory, "evidence");
  const output = join(directory, "output");
  mkdirSync(evidence);
  writeFileSync(manifest, readFileSync("release/manifest.template.json", "utf8"));
  const run = (out = output) =>
    spawnSync(
      process.execPath,
      [
        "--import",
        "tsx",
        "scripts/release-evaluate.mjs",
        "--manifest",
        manifest,
        "--evidence",
        evidence,
        "--out",
        out,
        "--now",
        "2026-09-27T12:00:00.000Z",
      ],
      { encoding: "utf8" },
    );
  return { manifest, evidence, output, run };
}

describe("release evaluator CLI", () => {
  it("writes both views of the same blocked snapshot and exits 2 for the local template", () => {
    const input = fixture();
    const process = input.run();
    expect(process.status, process.stderr).toBe(2);
    const report = readinessReportSchema.parse(
      JSON.parse(readFileSync(join(input.output, "readiness.json"), "utf8")),
    );
    expect(report.verdict).toBe("blocked");
    expect(report.gates.every((gate) => gate.status === "blocked")).toBe(true);
    expect(report.gates.find((gate) => gate.id === "R00")?.blockers).toEqual(
      expect.arrayContaining([
        "missing_evidence:authority_decision_record",
        "legacy_mapping_unapproved:live_services",
        "legacy_mapping_unapproved:payload_runtime",
      ]),
    );
    expect(report.gates.find((gate) => gate.id === "R10")?.blockers).toEqual(
      expect.arrayContaining(["dependency_blocked:R00", "missing_evidence:release_attestation"]),
    );
    const markdown = readFileSync(join(input.output, "readiness.md"), "utf8");
    expect(markdown).toContain(report.snapshotId);
    expect(markdown).toContain("- Verdict: **blocked**");
  });

  it("invalidates older output and exits 1 when a refresh cannot be evaluated", () => {
    const input = fixture();
    mkdirSync(input.output);
    writeFileSync(join(input.output, "readiness.json"), JSON.stringify({ verdict: "pass" }));
    writeFileSync(input.manifest, "{");
    const process = input.run();
    expect(process.status).toBe(1);
    const marker = JSON.parse(readFileSync(join(input.output, "readiness.json"), "utf8"));
    expect(marker).toEqual({ schemaVersion: 0, verdict: "blocked", error: "evaluation_failed" });
    expect(readinessReportSchema.safeParse(marker).success).toBe(false);
  });

  it("refuses symlinked evidence and keeps generated outputs outside the input directory", () => {
    const input = fixture();
    symlinkSync(input.manifest, join(input.evidence, "linked.json"));
    const symlink = input.run();
    expect(symlink.status).toBe(1);
    expect(symlink.stderr).toContain("may not be symbolic links");
    const overlap = input.run(input.evidence);
    expect(overlap.status).toBe(1);
    expect(overlap.stderr).toContain("outside the evidence directory");
    expect(readFileSync(input.manifest, "utf8")).toBe(
      readFileSync("release/manifest.template.json", "utf8"),
    );
  });
});
