import "server-only";
import { z } from "zod";
import type { AssistanceConfig } from "./config";
import type { Generation } from "./provider";
import { providerJson } from "./response";
import { routingDigest, routingRequest } from "./routing";

// Keep bounded routing facts; omit prompts, reasoning and free-form metadata.
const attempt = z.object({
  provider: z.string().max(160),
  model: z.string().max(200),
  status: z.number().int(),
});
const metadata = z.object({
  requested: z.string().max(200),
  strategy: z.string().max(80),
  attempt: z.number().int().nonnegative().max(100),
  attempts: z.array(attempt).max(100).optional(),
});
const envelope = z.object({
  id: z.string().min(1).max(200),
  model: z.string().min(1).max(200),
  provider: z.string().max(160).optional(),
  choices: z
    .array(
      z.object({
        finish_reason: z.string(),
        message: z.object({
          content: z.string().nullable(),
          refusal: z.unknown().optional(),
          tool_calls: z.array(z.unknown()).optional(),
        }),
      }),
    )
    .length(1),
  usage: z.object({
    prompt_tokens: z.number().int().nonnegative().max(1_000_000),
    completion_tokens: z.number().int().nonnegative().max(1_000_000),
    cost: z.number().finite().nonnegative().max(2000),
  }),
  // Cache hits intentionally omit metadata. Do not invent it.
  openrouter_metadata: metadata.optional(),
});

export async function routedGeneration(
  config: AssistanceConfig,
  instructions: string,
  input: unknown,
  schema: unknown,
  name: string,
): Promise<Generation> {
  const policy = config.routing;
  if (!config.enabled || !config.apiKey || !policy || config.model !== policy.router)
    throw new Error("provider_disabled");
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
      "X-OpenRouter-Metadata": "enabled",
      "X-OpenRouter-Title": "MS Realty Butler",
    },
    body: JSON.stringify({
      ...routingRequest(policy, config.inputCostMicros, config.outputCostMicros),
      messages: [
        { role: "system", content: instructions },
        { role: "user", content: JSON.stringify(input) },
      ],
      stream: false,
      store: false,
      max_tokens: config.maxOutputTokens,
      response_format: { type: "json_schema", json_schema: { name, strict: true, schema } },
      // Jev Router owns reasoning effort; the application does not force it.
    }),
    signal: AbortSignal.timeout(config.timeoutMs),
    redirect: "error",
    cache: "no-store",
  });
  const result = envelope.parse(await providerJson(response));
  if (!policy.models.includes(result.model)) throw new Error("unqualified_routed_model");
  if (result.openrouter_metadata && result.openrouter_metadata.requested !== policy.router)
    throw new Error("routing_metadata_mismatch");
  const choice = result.choices[0];
  if (!choice) throw new Error("provider_empty");
  if (choice.message.refusal) throw new Error("provider_refused");
  if (choice.finish_reason !== "stop" || choice.message.tool_calls?.length)
    throw new Error("provider_incomplete");
  if (!choice.message.content) throw new Error("provider_empty");
  return {
    output: JSON.parse(choice.message.content),
    inputTokens: result.usage.prompt_tokens,
    outputTokens: result.usage.completion_tokens,
    actualCostMicros: Math.ceil(result.usage.cost * 1_000_000),
    routing: {
      requested: policy.router,
      model: result.model,
      provider: result.provider ?? null,
      generationId: result.id,
      policyDigest: routingDigest(policy),
      metadata: result.openrouter_metadata ?? null,
    },
  };
}
