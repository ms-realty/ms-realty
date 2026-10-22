import { beforeEach, expect, it, vi } from "vitest";
import { evaluateRelease } from "@/release/evaluate";
import { gatePolicySchema } from "@/release/schemas";
import { readinessSnapshotDigest } from "@/release/signature";
import manifestTemplate from "../../../release/manifest.template.json";
import policy from "../../../release/policy.json";
import type { Executor } from "../db";
import { AppError } from "../errors";
import { summarizeReadiness } from "./readiness";
import { readReleaseOverview } from "./readiness-view";

const mocks = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock("./readiness", async (original) => ({
  ...(await original<typeof import("./readiness")>()),
  readReadiness: mocks.read,
}));
const sha = "c".repeat(40);
const db = {} as Executor;
const actor = { kind: "staff" as const, id: "synthetic-reviewer" };
function input() {
  const now = new Date();
  const snapshot = evaluateRelease({
    manifest: { ...manifestTemplate, releaseSha: sha },
    policy: gatePolicySchema.parse(policy),
    evidence: [],
    now,
  });
  return {
    buildSha: sha,
    snapshot,
    environment: snapshot.release.environment,
    policyDigest: snapshot.policy.policyDigest,
    manifestDigest: snapshot.release.manifestDigest,
    snapshotDigest: snapshot.snapshotId,
    now,
  };
}
function addEvidence(
  current: ReturnType<typeof input>,
  gate: string,
  type: string,
  counted: boolean,
) {
  current.snapshot.evidence.push({
    file: "/private/operator/path/never-expose.json",
    id: "synthetic-evidence",
    type,
    gate,
    digest: `sha256:${"d".repeat(64)}`,
    artifactDigest: counted ? `sha256:${"e".repeat(64)}` : null,
    counted,
    reasons: counted ? [] : ["synthetic-reason"],
  });
  current.snapshot.snapshotId = readinessSnapshotDigest(current.snapshot);
  current.snapshotDigest = current.snapshot.snapshotId;
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.read.mockImplementation(async (_db, _actor, value) =>
    summarizeReadiness(value.snapshot, value.buildSha, value),
  );
});

it("preserves missing and rejected proof separately and never exposes operator paths", async () => {
  const current = input();
  addEvidence(current, "R01", "first_party_runtime_report", false);
  const view = await readReleaseOverview(db, actor, current);
  expect(mocks.read).toHaveBeenCalledWith(db, actor, current);
  const runtime = view.gates.find((gate) => gate.id === "R01");
  expect(
    runtime?.requirements.find((item) => item.type === "first_party_runtime_report")?.result,
  ).toBe("rejected");
  expect(runtime?.requirements.find((item) => item.type === "deployed_check")?.result).toBe(
    "not_confirmed",
  );
  expect(JSON.stringify(view)).not.toContain("/private/");
  expect(runtime?.affects).toContain("R10");
  expect(runtime?.affects).toContain("R12");
});

it("does not let another gate's report confirm the selected requirement", async () => {
  const current = input();
  addEvidence(current, "R08", "first_party_runtime_report", true);
  const view = await readReleaseOverview(db, actor, current);
  expect(
    view.gates
      .find((gate) => gate.id === "R01")
      ?.requirements.find((item) => item.type === "first_party_runtime_report")?.result,
  ).toBe("not_confirmed");
  expect(
    view.gates
      .find((gate) => gate.id === "R08")
      ?.requirements.find((item) => item.type === "first_party_runtime_report")?.result,
  ).toBe("confirmed");
});

it("does not revive counted proof from another running release or an installed-policy mismatch", async () => {
  const current = input();
  addEvidence(current, "R01", "first_party_runtime_report", true);
  const stale = await readReleaseOverview(db, actor, { ...current, buildSha: "e".repeat(40) });
  expect(stale.summary.snapshotState).toBe("other_release");
  expect(
    stale.gates
      .flatMap((gate) => gate.requirements)
      .every((item) => item.result === "not_confirmed"),
  ).toBe(true);
  current.snapshot.policy.policyDigest = `sha256:${"e".repeat(64)}`;
  current.policyDigest = current.snapshot.policy.policyDigest;
  current.snapshot.snapshotId = readinessSnapshotDigest(current.snapshot);
  current.snapshotDigest = current.snapshot.snapshotId;
  const mismatched = await readReleaseOverview(db, actor, current);
  expect(mismatched.policyMatches).toBe(false);
  expect(
    mismatched.gates.every((gate) => gate.requirements.length === 0 && gate.affects.length === 0),
  ).toBe(true);
});

it("propagates access refusal rather than displaying an empty readiness report", async () => {
  mocks.read.mockRejectedValueOnce(new AppError("forbidden"));
  await expect(readReleaseOverview(db, actor, input())).rejects.toMatchObject({
    code: "forbidden",
  });
});
