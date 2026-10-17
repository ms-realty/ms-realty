import "server-only";
import { butlerEligibility } from "@/domain/butler";
import type { ArtifactProposal, ContextSelection, WorkspaceContext } from "@/domain/generative";

/** Explain the real current guard; generated text can never supply or widen this authority. */
export function workspaceProposalPolicy(
  proposal: ArtifactProposal,
  selection: ContextSelection,
  context: WorkspaceContext,
) {
  const action =
    proposal.kind === "task"
      ? "task.create"
      : proposal.kind === "buyer_handoff"
        ? "brief.revise"
        : proposal.kind === "reply"
          ? "contact.first"
          : proposal.kind === "seller_copy"
            ? "publication.publish"
            : "research.prepare";
  const caseId = selection.caseId ?? "unselected";
  const source = context.sources.find((x) => x.type === "case" && x.id === selection.caseId);
  const evidence = source
    ? {
        caseId,
        caseActive: source.facts.state === "active",
        protectedEffects: [],
        task: { internalCreationOnly: true, ownerAvailable: false, makesClientPromise: false },
      }
    : undefined;
  return {
    policy: "owner_draft_only" as const,
    action,
    autonomous: butlerEligibility(action, caseId, evidence),
    humanReviewRequired: true as const,
    humanCommandAvailable: proposal.kind === "task" || proposal.kind === "buyer_handoff",
    effects:
      proposal.kind === "task"
        ? ["internal_task"]
        : proposal.kind === "buyer_handoff"
          ? ["buyer_brief", "reviewed_suggestions_or_manual_handoff"]
          : ["draft_only"],
    forbiddenEffects: [
      "customer_send",
      "booking",
      "publication",
      "access_grant",
      "price_or_contract_change",
      "legal_or_tax_approval",
    ],
  };
}
