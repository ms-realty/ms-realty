export interface ContactReviewState {
  operationId: string;
  nextStep: string;
  error?: "failure" | "unknown";
}
