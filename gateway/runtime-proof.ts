import type { RuntimeRole } from "./runtime-env";

export type RuntimeProof = {
  schemaVersion: 1;
  role: RuntimeRole;
  sourceCommit: string;
  buildNonce: string;
  state: "prepared" | "running" | "completed" | "failed";
  operationId?: string;
  completedAt?: string;
};
export type MigrationReceipt = {
  status: "running" | "completed" | "failed" | "unknown";
  operationId: string;
  configuredDigest: string;
  // Source/process completion is separate from external provider digest/rollout observation.
  digestVerification: "unqualified";
  sourceCommit?: string;
  buildNonce?: string;
  completedAt?: string;
};
const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
export function runtimeProof(
  value: unknown,
  role: RuntimeRole,
  expectedSource: string,
): RuntimeProof {
  const proof = value as Partial<RuntimeProof> | null;
  if (
    proof?.schemaVersion !== 1 ||
    proof.role !== role ||
    !/^[a-f0-9]{40}$/.test(expectedSource) ||
    proof.sourceCommit !== expectedSource ||
    typeof proof.buildNonce !== "string" ||
    !uuid.test(proof.buildNonce) ||
    !["prepared", "running", "completed", "failed"].includes(proof.state ?? "")
  )
    throw new Error("Immutable running-image source identity is unavailable or mismatched");
  return proof as RuntimeProof;
}
export function migrationCompletion(
  receipt: MigrationReceipt,
  proof: RuntimeProof,
): MigrationReceipt {
  if (receipt.status !== "running") return receipt;
  if (
    proof.role !== "migrator" ||
    proof.sourceCommit !== receipt.sourceCommit ||
    proof.operationId !== receipt.operationId ||
    !uuid.test(receipt.operationId) ||
    !uuid.test(receipt.buildNonce ?? "") ||
    receipt.buildNonce !== proof.buildNonce
  )
    return { ...receipt, status: "unknown" };
  if (proof.state === "failed") return { ...receipt, status: "failed" };
  if (proof.state !== "completed") return receipt;
  if (!proof.completedAt || !Number.isFinite(Date.parse(proof.completedAt)))
    return { ...receipt, status: "unknown" };
  return {
    ...receipt,
    status: "completed",
    sourceCommit: proof.sourceCommit,
    buildNonce: proof.buildNonce,
    completedAt: proof.completedAt,
  };
}
export function migrationStopped(
  receipt: MigrationReceipt,
  stop: { exitCode: number; reason: string },
): MigrationReceipt {
  if (receipt.status !== "running") return receipt;
  // The Container SDK can synthesize exit/0 after a restart. An exit is not completion proof.
  return {
    ...receipt,
    status: stop.reason === "exit" && stop.exitCode !== 0 ? "failed" : "unknown",
  };
}
