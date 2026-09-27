export const proposalTypes = {
  create: "proposal.create",
  revise: "proposal.revise",
  review: "proposal.transition",
  submit: "proposal.transition",
  withdraw: "proposal.transition",
  expire: "proposal.transition",
  decide: "proposal.decide",
} as const;
export type ProposalCommand = keyof typeof proposalTypes;
const terms = [
  "clientPartyId",
  "amount",
  "currency",
  "period",
  "paymentBasis",
  "conditions",
  "inclusions",
  "deadline",
];
export const proposalFields: Record<ProposalCommand, readonly string[]> = {
  create: ["interestId", ...terms],
  revise: ["revisionId", ...terms, "reason"],
  review: ["revisionId", "reviewed", "reason"],
  submit: ["revisionId", "reviewed", "reason"],
  withdraw: ["revisionId", "reason"],
  expire: ["revisionId"],
  decide: ["revisionId", "state", "reason"],
};
export const proposalScope = (command: ProposalCommand, id: string) => `proposal.${command}.${id}`;
export const proposalStatus = (locale: string, command: ProposalCommand, id: string, key: string) =>
  `/${locale}/proposals/operations?command=${command}&id=${encodeURIComponent(id)}&key=${encodeURIComponent(key)}`;
