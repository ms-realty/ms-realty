// Proposal changes → deal notices. The notice names the proposal by reference only; its terms
// stay in the client area.
import "server-only";
import type { proposalRevisions, proposals } from "@/db/schema";
import type { Actor } from "@/domain/capabilities";
import type { Executor } from "../db";
import { partySnapshotsSchema } from "../proposals/terms";
import { notifyDealUpdate } from "./notify";

export type ProposalChange =
  | "ready"
  | "withdrawn"
  | "expired"
  | "accepted"
  | "declined"
  | "countered";

const events = {
  ready: "proposal.ready",
  withdrawn: "proposal.withdrawn",
  expired: "proposal.expired",
  accepted: "client.proposal_accepted",
  declined: "client.proposal_declined",
  countered: "client.proposal_countered",
} as const;

export async function notifyProposalChange(
  db: Executor,
  change: ProposalChange,
  proposal: typeof proposals.$inferSelect,
  revision: typeof proposalRevisions.$inferSelect,
  actor: Actor,
  /** For client answers: the response record, so each answer notifies once. */
  responseId?: string,
) {
  const parties = partySnapshotsSchema.safeParse(revision.parties);
  return notifyDealUpdate(db, {
    caseId: proposal.caseId,
    event: events[change],
    eventKey: `proposal-revision:${revision.id}:${change}${responseId ? `:${responseId}` : ""}`,
    subject: { type: "proposal", id: proposal.id, reference: proposal.reference },
    actor,
    ...(parties.success ? { partyIds: parties.data.map((party) => party.partyId) } : {}),
  });
}
