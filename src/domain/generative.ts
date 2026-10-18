// F29: a durable, editable research process. Model output never grants business authority.
import { z } from "zod";

export const workspaceProtocol = "generative-workspace-v1";
export const contextSelectionSchema = z
  .object({
    caseId: z.uuid().nullable(),
    inquiryId: z.uuid().nullable(),
    listingIds: z.array(z.uuid()).max(12),
  })
  .strict();
export type ContextSelection = z.infer<typeof contextSelectionSchema>;

export interface WorkspaceSource {
  key: string;
  type:
    | "inquiry"
    | "case"
    | "task"
    | "message"
    | "listing"
    | "content"
    | "external"
    | "calculation";
  id: string;
  revision: string;
  digest: string;
  title: string;
  audience: "internal" | "approved_public" | "external_unverified";
  text: string;
  facts: Record<string, string>;
}
export type SourcePin = Pick<WorkspaceSource, "key" | "type" | "id" | "revision" | "digest">;
export interface WorkspaceContext {
  sources: WorkspaceSource[];
  digest: string;
  pins: SourcePin[];
  truncated: boolean;
}

const plain = (max: number) => z.string().trim().min(1).max(max);
export const sourceCitationSchema = z
  .object({
    source: plain(200),
    quote: plain(1200),
  })
  .strict();
const artifactBase = {
  title: plain(180),
  body: plain(6000),
  citations: z.array(sourceCitationSchema).max(24),
};
export const artifactProposalSchema = z.discriminatedUnion("kind", [
  z.object({ ...artifactBase, kind: z.literal("task") }).strict(),
  z
    .object({
      ...artifactBase,
      kind: z.literal("buyer_handoff"),
      requirements: plain(4000),
      preferences: z.string().max(4000),
      listingIds: z.array(z.uuid()).max(6),
    })
    .strict(),
  z
    .object({
      ...artifactBase,
      kind: z.enum(["research", "options", "reply", "seller_copy", "owner_analysis"]),
    })
    .strict(),
]);
export type ArtifactProposal = z.infer<typeof artifactProposalSchema>;
export const planStepSchema = z
  .object({
    id: plain(80),
    title: plain(240),
    state: z.enum(["pending", "working", "prepared"]),
  })
  .strict();
export type WorkspacePlanStep = z.infer<typeof planStepSchema>;
export const workspaceToolSchema = z.discriminatedUnion("name", [
  z.object({ name: z.literal("context.search"), query: plain(300) }).strict(),
  z.object({ name: z.literal("context.read"), source: plain(200) }).strict(),
  z.object({ name: z.literal("listings.search"), query: z.string().max(300) }).strict(),
  z.object({ name: z.literal("listings.compare"), ids: z.array(z.uuid()).min(1).max(6) }).strict(),
  z
    .object({
      name: z.literal("calculate"),
      operation: z.enum(["add", "subtract", "multiply", "divide"]),
      values: z.array(z.number().finite()).min(2).max(12),
    })
    .strict(),
  z.object({ name: z.literal("draft.prepare"), proposal: artifactProposalSchema }).strict(),
]);
export type WorkspaceTool = z.infer<typeof workspaceToolSchema>;
export const plannerTurnSchema = z
  .object({
    message: plain(4000),
    questions: z.array(plain(500)).max(8),
    decisions: z.array(plain(500)).max(12),
    plan: z.array(planStepSchema).max(16),
    next: z.enum(["tool", "clarify", "review", "complete"]),
    tool: workspaceToolSchema.nullable(),
  })
  .strict()
  .refine((x) => (x.next === "tool") === (x.tool !== null), "Tool transition mismatch");
export type PlannerTurn = z.infer<typeof plannerTurnSchema>;
export interface WorkspaceConversationTurn {
  role: "user" | "assistant";
  text: string;
}
export interface WorkspaceCheckpoint {
  step: number;
  turn: PlannerTurn;
  toolResult: unknown;
}
export interface PlannerInput {
  protocol: typeof workspaceProtocol;
  goal: string;
  constraints: string[];
  locale: "bg" | "en" | "ru";
  conversation: WorkspaceConversationTurn[];
  decisions: string[];
  plan: WorkspacePlanStep[];
  context: WorkspaceContext;
  checkpoints: WorkspaceCheckpoint[];
  remainingSteps: number;
}
export type AiBillingMode = "metered_usd" | "chatgpt_subscription";
export type InferenceOutcome = "not_started" | "pending" | "settled" | "unknown";
export interface WorkspaceBudget {
  /** Absent on historical budgets, which remain metered in USD. */
  billingMode?: AiBillingMode;
  maxSteps: number;
  maxTotalTokens: number;
  maxOutputTokens: number;
  maxInputBytes: number;
  timeoutMs: number;
  maxElapsedMs: number;
  maxCostMicros: number | null;
  readRetries: number;
}
export const workspaceStates = [
  "idle",
  "queued",
  "running",
  "waiting_input",
  "review",
  "completed",
  "cancelled",
  "failed",
  "stale",
  "budget_exhausted",
  "unknown_provider",
] as const;
export type WorkspaceState = (typeof workspaceStates)[number];

/**
 * Only exact supplied quotes count as source evidence. Instructions in sources remain data.
 * humanRequirements is a server-owned exception for a person's saved needs, never model output
 * or permission to change approved property claims in the title and narrative.
 */
export function validateArtifactSources(
  proposal: ArtifactProposal,
  context: WorkspaceContext,
  options: { humanRequirements?: boolean } = {},
): void {
  if (!proposal.citations.length && context.sources.length)
    throw new Error("workspace_missing_citation");
  for (const citation of proposal.citations) {
    const source = context.sources.find((s) => s.key === citation.source);
    if (!source?.text.includes(citation.quote)) throw new Error("workspace_invalid_citation");
  }
  const supporting = context.sources.filter(
    (s) => proposal.citations.some((c) => c.source === s.key) || s.key.startsWith("intent:"),
  );
  const supplied = supporting.map((s) => `${s.text}\n${JSON.stringify(s.facts)}`).join("\n");
  const authored = [
    proposal.title,
    proposal.body,
    ...(proposal.kind === "buyer_handoff" && !options.humanRequirements
      ? [proposal.requirements, proposal.preferences]
      : []),
  ].join("\n");
  const numberKey = (s: string) =>
    s.replace(/(?<=\d)[, .](?=\d{3}(?:\D|$))/g, "").replace(",", ".");
  const numbers = new Set((supplied.match(/\d+(?:[.,]\d+)*/g) ?? []).map(numberKey));
  const factualText = authored.replace(/^\s*\d+[.)]\s+/gm, "");
  if ((factualText.match(/\d+(?:[.,]\d+)*/g) ?? []).some((n) => !numbers.has(numberKey(n))))
    throw new Error("workspace_unsupported_number");
  for (const token of authored.match(/https?:\/\/[^\s<>]+|[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi) ?? []) {
    if (!supplied.includes(token.replace(/[.,;)]$/, "")))
      throw new Error("workspace_unsupported_contact");
  }
  for (const currency of authored.match(/\b(?:EUR|BGN|USD|GBP|CHF|ILS)\b/g) ?? []) {
    if (!supplied.includes(currency)) throw new Error("workspace_unsupported_currency");
  }
  // Listing facts are rendered from the approved typed record, never reconstructed from a
  // bag of digits in generated prose. A calculation is separate derived evidence, not price
  // authority. Preserve a complete explicit calculation/quotation, rather than laundering its
  // result into an unsupported property statement. Buyer requirements remain editable inputs.
  if (context.sources.some((s) => s.type === "listing" && s.audience === "approved_public")) {
    let narrative = `${proposal.title}\n${proposal.body}`;
    for (const source of supporting) {
      if (source.type === "calculation")
        narrative = narrative.replaceAll(source.text, "[calculation]");
      if (
        source.type === "listing" &&
        proposal.citations.some((c) => c.source === source.key && c.quote === source.text)
      )
        narrative = narrative.replaceAll(source.text, "[approved quotation]");
      if (source.key.startsWith("intent:")) {
        for (const line of source.text.split("\n").filter(Boolean))
          for (const label of ["User requirement: ", "Изискване: ", "Требование: "])
            narrative = narrative.replaceAll(label + line, "[user requirement]");
      }
    }
    narrative = narrative.replace(/^\s*\d+[.)]\s+/gm, "");
    if (/\d/.test(narrative)) throw new Error("workspace_property_facts_require_structured_view");
  }
  if (proposal.kind === "buyer_handoff") {
    for (const id of proposal.listingIds) {
      if (
        !context.sources.some(
          (s) => s.type === "listing" && s.id === id && s.audience === "approved_public",
        )
      )
        throw new Error("workspace_unverified_listing");
    }
  }
}
