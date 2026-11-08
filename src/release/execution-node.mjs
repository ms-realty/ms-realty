// Operator adapter: installation is selected only by the real process environment.
import { fileURLToPath } from "node:url";
import { loadExecutionAdmission } from "./execution-admission.ts";
import { ExecutionUnavailableError } from "./execution-runtime.ts";

export const installedExecution = () => loadExecutionAdmission(process.env, "operator");
let module;
async function bridge() {
  module ??= import("tsx/esm/api").then(({ tsImport }) =>
    tsImport("./execution-bridge.ts", {
      parentURL: import.meta.url,
      tsconfig: fileURLToPath(new URL("../../tsconfig.json", import.meta.url)),
    }),
  );
  return module;
}
export function executionBundle(packet, keys) {
  const copy = structuredClone(packet);
  return {
    ...copy.production,
    approvals: { owner: copy.grant, controller: copy.verification },
    trustedKeys: structuredClone(keys),
    executionPacket: copy,
  };
}
export async function verifyInstalledExecution(packet, state, now = Date.now(), forward = false) {
  // Snapshot before an await; neither later caller mutation nor packet-owned trust is authority.
  const copy = structuredClone(packet);
  const installed = installedExecution();
  if (!installed) throw new ExecutionUnavailableError();
  const lease = structuredClone({
    scope: state.scope,
    reservedAt: state.reservedAt,
    expiresAt: state.expiresAt,
    status: state.status,
    receipt: state.receipt,
  });
  return (await bridge()).verifyRuntimeExecution(copy, installed, lease, new Date(now), forward);
}
