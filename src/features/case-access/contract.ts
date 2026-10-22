export const accessFields = {
  invite: ["targetEmail", "targetName", "requestedRole", "reason"],
  remove: ["targetParticipantId", "reason"],
  decide: ["decision", "clientOutcome", "accessExpiresAt"],
  withdraw: ["clientOutcome"],
  revoke: ["reason"],
} as const;
export type AccessBinding = {
  command: keyof typeof accessFields;
  caseId: string;
  targetId?: string;
  host: "staff" | "client";
};
export const accessScope = (b: AccessBinding) =>
  `case-access:${b.host}:${b.command}:${b.caseId}:${b.targetId ?? "new"}`;
export const accessOperationType = (command: AccessBinding["command"]) =>
  command === "revoke"
    ? "case.participant.revoke"
    : command === "invite" || command === "remove"
      ? "case.access.request"
      : "case.access.decide";
export const accessPath = (locale: string, host: AccessBinding["host"], caseId: string) =>
  `/${locale}/${host === "staff" ? "cases" : "overview"}/${caseId}/participants`;
