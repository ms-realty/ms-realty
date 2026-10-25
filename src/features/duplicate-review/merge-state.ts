export interface DuplicateMergeState {
  operationId: string;
  reason: string;
  error?: "failure" | "conflict" | "unknown";
}
