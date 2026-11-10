export const proposalTypes = {
  create: "proposal.create",
  revise: "proposal.revise",
  review: "proposal.transition",
  submit: "proposal.transition",
  withdraw: "proposal.transition",
  expire: "proposal.transition",
  decide: "proposal.decide",
  agree: "proposal.record_agreement",
} as const;
export type ProposalCommand = keyof typeof proposalTypes;
/** Advisory navigation hint. Commands still verify the session, scope and expected revision. */
export const proposalEnhancementField = "_proposalEnhanced";
const terms = [
  "clientPartyId",
  "additionalPartyIds",
  "amount",
  "currency",
  "period",
  "paymentBasis",
  "conditions",
  "inclusions",
  "deadline",
];
export const proposalFields: Record<ProposalCommand, readonly string[]> = {
  create: ["interestId", "sellerPartyId", "sellerName", ...terms],
  revise: ["revisionId", ...terms, "reason"],
  review: ["revisionId", "reviewed", "reason"],
  submit: ["revisionId", "reviewed", "reason"],
  withdraw: ["revisionId", "reason"],
  expire: ["revisionId"],
  decide: ["revisionId", "state", "reason"],
  // ADR 0015: "Record that both sides agreed". One side's fields cover every party on that side
  // who has not accepted in the client area.
  agree: [
    "revisionId",
    "buyerChannel",
    "buyerOn",
    "sellerChannel",
    "sellerOn",
    "note",
    "evidenceVersionId",
  ],
};
export const proposalScope = (command: ProposalCommand, id: string) => `proposal.${command}.${id}`;
export const proposalStatus = (locale: string, command: ProposalCommand, id: string, key: string) =>
  `/${locale}/proposals/operations?command=${command}&id=${encodeURIComponent(id)}&key=${encodeURIComponent(key)}`;
