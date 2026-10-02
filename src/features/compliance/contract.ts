export const processFields = {
  policy: [
    "title",
    "documentVersionId",
    "country",
    "transaction",
    "participantCategory",
    "transactionItems",
    "partyItems",
    "withdrawalDays",
    "expressStartRequired",
    "retentionDays",
    "professionalName",
    "validUntil",
  ],
  start: ["proposalRevisionId", "policyId", "participantCategory", "dueAt"],
  item: ["result", "reason", "evidenceVersionId", "professionalName", "validUntil"],
  agreement: [
    "partyId",
    "policyId",
    "documentVersionId",
    "channel",
    "signedAt",
    "withdrawalInformedAt",
    "expressStartRequestedAt",
    "expressStartEvidenceVersionId",
    "commissionBasis",
    "commissionPayerPartyId",
    "validUntil",
  ],
  approve: [],
  revoke: ["reason"],
  commission: ["agreementId", "amountMinor", "invoiceReference"],
  suspicion: ["partyId", "policyId", "note", "externalReference", "reportedAt"],
} as const;
export type ProcessCommand = keyof typeof processFields;
export interface ProcessBinding {
  caseId: string;
  command: ProcessCommand;
  reviewId?: string;
  code?: string;
  partyScope?: string;
  targetId?: string;
  kind?: "agreement" | "policy" | "review";
}
export const processScope = (binding: ProcessBinding) => `case-process:${JSON.stringify(binding)}`;
export const processPath = (locale: string, id: string) => `/${locale}/cases/${id}/process`;
