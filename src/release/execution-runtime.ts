// Import-free legacy guard: new-mode requests require the separately installed runtime adapter.
export class ExecutionUnavailableError extends Error {
  constructor() {
    super("Single-operator execution unavailable: installed trust and remote admission required");
  }
}

export function rejectExecutionActivation(value: unknown): void {
  if (
    value &&
    typeof value === "object" &&
    (Object.hasOwn(value, "execution") ||
      Object.hasOwn(value, "executionPacket") ||
      Object.hasOwn(value, "protocolVersion") ||
      ("purpose" in value && value.purpose !== "complete_parity") ||
      Object.hasOwn(value, "approvalModel"))
  ) {
    throw new ExecutionUnavailableError();
  }
  if (value && typeof value === "object") {
    if ("approvals" in value && value.approvals && typeof value.approvals === "object")
      for (const approval of Object.values(value.approvals)) rejectExecutionActivation(approval);
    if ("payload" in value && typeof value.payload === "string")
      rejectExecutionActivation(JSON.parse(value.payload));
    if ("plan" in value) {
      const bytes = value.plan;
      // CLI specifications contain a path; loaded bundles contain the actual JSON bytes.
      if (typeof bytes === "string" && bytes.trimStart().startsWith("{"))
        rejectExecutionActivation(JSON.parse(bytes));
      else if (bytes instanceof Uint8Array)
        rejectExecutionActivation(JSON.parse(new TextDecoder().decode(bytes)));
    }
  }
}
