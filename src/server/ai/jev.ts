import "server-only";
import { z } from "zod";
import { hashRequest } from "../crypto";
import type { AssistanceConfig } from "./config";
import { butlerSetting } from "./env";
import {
  type JevAssessment,
  type JevPolicy,
  jevAnswersSchema,
  jevInputTokenBound,
  jevOutputTokenBound,
  jevPolicySchema,
  jevQuestions,
  jevQuestionVersion,
} from "./jev-contract";
import { providerJson } from "./response";

export function readJevPolicy(env: Record<string, string | undefined>): JevPolicy | undefined {
  if (butlerSetting(env, "JEV_ENABLED") !== "1") return undefined;
  try {
    return jevPolicySchema.parse(JSON.parse(butlerSetting(env, "JEV_POLICY") ?? "null"));
  } catch {
    return undefined;
  }
}
export function jevDigest(policy: JevPolicy | undefined) {
  return policy
    ? hashRequest({ policy, questions: jevQuestions, version: jevQuestionVersion })
    : null;
}
export type JevState = { task: string; source: unknown; draft: unknown };
export function prepareJevState(state: JevState): JevState {
  // Shared state plus all three questions fits the smallest qualified context, including framing.
  if (Buffer.byteLength(JSON.stringify({ state, questions: jevQuestions }), "utf8") > 24_000)
    throw new Error("jev_input_limit");
  return state;
}
const envelope = z.object({
  id: z.string().max(200).optional(),
  model: z.string().max(200),
  provider: z.string().optional(),
  answers: jevAnswersSchema,
  usage: z.object({
    input_tokens: z.number().int().nonnegative().max(jevInputTokenBound),
    output_tokens: z.number().int().nonnegative().max(jevOutputTokenBound),
    cost: z.number().finite().nonnegative().max(2000),
  }),
});
export type DraftAssessor = (state: JevState, config: AssistanceConfig) => Promise<JevAssessment>;
export const assessDraft: DraftAssessor = async (input, config) => {
  const policy = config.jev;
  if (!config.enabled || config.provider !== "openrouter" || !config.apiKey || !policy)
    throw new Error("jev_disabled");
  const state = prepareJevState(input);
  const response = await fetch("https://openrouter.ai/api/alpha/decisions", {
    method: "POST",
    headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: policy.model,
      state,
      questions: jevQuestions,
      provider: {
        only: ["typesafe"],
        allow_fallbacks: false,
        require_parameters: true,
        data_collection: "deny",
        zdr: true,
        max_price: {
          prompt: policy.inputCostMicros,
          completion: policy.outputCostMicros,
          request: 0,
        },
      },
    }),
    signal: AbortSignal.timeout(config.timeoutMs),
    redirect: "error",
    cache: "no-store",
  });
  const result = envelope.parse(await providerJson(response));
  if (
    !policy.snapshots.includes(result.model) ||
    (result.provider && result.provider.toLowerCase() !== "typesafe")
  )
    throw new Error("unqualified_jev_model");
  return {
    questionVersion: jevQuestionVersion,
    policyDigest: jevDigest(policy) as string,
    model: result.model,
    generationId: result.id ?? null,
    answers: result.answers,
    inputTokens: result.usage.input_tokens,
    outputTokens: result.usage.output_tokens,
    costMicros: Math.ceil(result.usage.cost * 1_000_000),
  };
};
