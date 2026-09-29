import "server-only";
import { z } from "zod";
import { hashRequest } from "../crypto";

const modelId = z.string().regex(/^[a-z0-9-]+\/[a-zA-Z0-9._-]+$/);
const policyFields = z
  .object({
    // Jev Router's pool must also be enforced by the qualified key's account guardrail.
    // Auto Router plugin settings are not documented as applying to Jev Router.
    models: z
      .array(modelId)
      .min(2)
      .max(32)
      .refine((models) => new Set(models).size === models.length),
    providers: z
      .array(z.string().regex(/^[a-z0-9/-]+$/))
      .min(1)
      .max(16),
    guardrailRevision: z.string().min(1).max(160),
    sort: z.enum(["price", "latency", "throughput"]),
  })
  .strict();
export const routingPolicy = z.discriminatedUnion("router", [
  policyFields.extend({ router: z.literal("typesafe/jev-router") }),
  policyFields.extend({
    router: z.literal("openrouter/auto"),
    costTier: z.enum(["low", "medium", "high", "xhigh", "max"]),
  }),
]);
export type RoutingPolicy = z.infer<typeof routingPolicy>;
export function readRoutingPolicy(env: Record<string, string | undefined>): RoutingPolicy | null {
  try {
    const parsed = routingPolicy.safeParse(JSON.parse(env.HERMES_ROUTING_POLICY ?? "null"));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
export function routingRequest(policy: RoutingPolicy, inputRate: number, outputRate: number) {
  return {
    model: policy.router,
    provider: {
      only: policy.providers,
      allow_fallbacks: true,
      require_parameters: true,
      data_collection: "deny",
      zdr: true,
      sort: policy.sort,
      max_price: { prompt: inputRate, completion: outputRate, request: 0 },
    },
    ...(policy.router === "openrouter/auto"
      ? {
          plugins: [
            { id: "auto-router", allowed_models: policy.models, cost_tier: policy.costTier },
          ],
        }
      : {}),
  };
}
export function routingDigest(policy: RoutingPolicy | undefined) {
  return policy ? hashRequest(policy) : null;
}
