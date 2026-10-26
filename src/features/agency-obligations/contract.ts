export const agencyCommands = {
  partnerSave: "agency.partner.save",
  partnerDecision: "agency.partner.decide",
  reviewSave: "agency.review.save",
  reviewDocumentConsent: "agency.review.consent.document",
  reviewVerify: "agency.review.verify",
  clientConsent: "agency.review.consent.client",
  photography: "appointment.photography.request",
} as const;
export type AgencyCommand = keyof typeof agencyCommands;
export const agencyFields: Record<AgencyCommand, readonly string[]> = {
  partnerSave: [
    "caseId",
    "counterpartyPartyId",
    "relationship",
    "purpose",
    "sourceReference",
    "sourceVersion",
    "termsText",
    "documentVersionId",
    "acceptedReference",
    "acceptedAt",
    "validUntil",
    "unknowns",
    "reviewed",
  ],
  partnerDecision: ["action", "expectedHash", "professionalName", "note", "reviewed"],
  reviewSave: ["caseId", "authorPartyId", "contentPageVersionId", "displayChoice", "reviewed"],
  reviewDocumentConsent: [
    "expectedHash",
    "decision",
    "policyVersionId",
    "documentVersionId",
    "sourceReference",
    "reviewed",
  ],
  reviewVerify: ["expectedHash", "note", "reviewed"],
  clientConsent: ["expectedHash", "decision", "policyVersionId", "reviewed"],
  photography: ["preferredWindow", "photographyScope", "reviewed"],
};
export const agencyScope = (command: AgencyCommand, id: string) => `agency:${command}:${id}`;
export const agencyReceiptPath = (
  locale: string,
  command: AgencyCommand,
  id: string,
  key: string,
) =>
  `/${locale}/${command === "clientConsent" ? "reviews" : "operations/agency"}/receipt?command=${command}&id=${id}&key=${encodeURIComponent(key)}`;
