export const requestFields = {
  create: [
    "recipientParticipantId",
    "policyId",
    "title",
    "purpose",
    "instructions",
    "alternatives",
    "classification",
    "allowedContentTypes",
    "maxBytes",
    "expiresAt",
  ],
  review: ["reviewType", "note", "clientOutcome", "confirmed"],
  cancel: ["clientOutcome"],
} as const;
export type RequestBinding = {
  command: keyof typeof requestFields;
  caseId: string;
  requestId?: string;
  versionId?: string;
  fileRevision?: number;
};
export const requestScope = (b: RequestBinding) =>
  `document-request:${b.command}:${b.caseId}:${b.requestId ?? "new"}:${b.versionId ?? ""}`;
