import "server-only";
import { z } from "zod";
import type { AssistanceConfig } from "./config";
import {
  type AssistanceSource,
  type AssistanceTask,
  draftInstructions,
  draftJsonSchema,
} from "./draft";
import { type IntakeSource, intakeDraftInstructions, intakeDraftJsonSchema } from "./intake-draft";
import { type LocaleSource, localeDraftInstructions, localeDraftJsonSchema } from "./locale-draft";
import { routedGeneration } from "./openrouter";
import { providerJson } from "./response";

export interface Generation {
  readonly output: unknown;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly actualCostMicros?: number;
  readonly routing?: {
    requested: string;
    model: string;
    provider: string | null;
    generationId: string;
    policyDigest: string | null;
    metadata: {
      requested: string;
      strategy: string;
      attempt: number;
      attempts?: { provider: string; model: string; status: number }[];
    } | null;
  };
}
export type DraftGenerator = (
  task: AssistanceTask,
  source: AssistanceSource,
  config: AssistanceConfig,
) => Promise<Generation>;
export type LocaleDraftGenerator = (
  source: LocaleSource,
  config: AssistanceConfig,
) => Promise<Generation>;

export type IntakeDraftGenerator = (
  source: IntakeSource,
  config: AssistanceConfig,
) => Promise<Generation>;
const usageSchema = z.object({
  input_tokens: z.number().int().nonnegative().max(1_000_000),
  output_tokens: z.number().int().nonnegative().max(1_000_000),
});
/** Qualified transport, no tools/retries/storage; activation is independently enforced. */
export const generateDraft: DraftGenerator = async (task, source, config) => {
  return requestGeneration(
    config,
    draftInstructions,
    { task: "case.assist", variant: task, source },
    draftJsonSchema,
    "broker_draft",
  );
};
export const generateLocaleDraft: LocaleDraftGenerator = async (source, config) =>
  requestGeneration(
    config,
    localeDraftInstructions,
    { task: "locale.draft", source },
    localeDraftJsonSchema,
    "locale_draft",
  );

export const generateIntakeDraft: IntakeDraftGenerator = async (source, config) =>
  requestGeneration(
    config,
    intakeDraftInstructions,
    { task: "intake.extract", source },
    intakeDraftJsonSchema,
    "intake_candidates",
  );

async function requestGeneration(
  config: AssistanceConfig,
  instructions: string,
  input: unknown,
  schema: unknown,
  name: string,
): Promise<Generation> {
  if (!config.enabled || !config.model || !config.apiKey) throw new Error("provider_disabled");
  if (config.provider === "openrouter")
    return routedGeneration(config, instructions, input, schema, name);
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: config.model,
      instructions,
      input: JSON.stringify(input),
      store: false,
      max_output_tokens: config.maxOutputTokens,
      text: {
        format: {
          type: "json_schema",
          name,
          strict: true,
          schema,
        },
      },
    }),
    signal: AbortSignal.timeout(config.timeoutMs),
    redirect: "error",
    cache: "no-store",
  });
  const result = (await providerJson(response)) as {
    status?: string;
    model?: string;
    usage?: unknown;
    output?: Array<{ type?: string; content?: Array<{ type?: string; text?: string }> }>;
  };
  if (result.status !== "completed") throw new Error("provider_incomplete");
  const parts =
    result.output?.flatMap((item) => (item.type === "message" ? (item.content ?? []) : [])) ?? [];
  if (parts.some((part) => part.type === "refusal")) throw new Error("provider_refused");
  const text = parts
    .filter((part) => part.type === "output_text")
    .map((part) => part.text ?? "")
    .join("");
  const usage = usageSchema.parse(result.usage);
  return {
    output: JSON.parse(text),
    inputTokens: usage.input_tokens,
    outputTokens: usage.output_tokens,
  };
}
