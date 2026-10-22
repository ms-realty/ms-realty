import "server-only";
import type { AiBillingMode } from "@/domain/generative";
import type { AssistanceConfig } from "./config";
import type { Generation } from "./provider";

export function billingMode(config: AssistanceConfig): AiBillingMode {
  return config.provider === "chatgpt_oauth" ? "chatgpt_subscription" : "metered_usd";
}
export function meteredRates(config: AssistanceConfig) {
  if (
    config.inputCostMicros === null ||
    config.outputCostMicros === null ||
    config.dailyLimitMicros === null
  )
    throw new Error("provider_metered_rates_missing");
  return {
    input: config.inputCostMicros,
    output: config.outputCostMicros,
    daily: config.dailyLimitMicros,
  };
}
export function reserveGenerationCost(
  config: AssistanceConfig,
  inputTokens: number,
  outputTokens: number,
): number | null {
  if (billingMode(config) === "chatgpt_subscription") return null;
  const rates = meteredRates(config);
  return Math.ceil(inputTokens * rates.input + outputTokens * rates.output);
}
export function generationCost(config: AssistanceConfig, generation: Generation): number | null {
  if (billingMode(config) === "chatgpt_subscription") {
    if (
      generation.billingMode !== "chatgpt_subscription" ||
      generation.actualCostMicros !== undefined
    )
      throw new Error("provider_billing_mismatch");
    return null;
  }
  if (generation.billingMode !== undefined && generation.billingMode !== "metered_usd")
    throw new Error("provider_billing_mismatch");
  const amount =
    config.provider === "openrouter"
      ? generation.actualCostMicros
      : reserveGenerationCost(config, generation.inputTokens, generation.outputTokens);
  if (
    typeof amount !== "number" ||
    !Number.isSafeInteger(amount) ||
    amount < 0 ||
    amount > 2_000_000_000
  )
    throw new Error("provider_cost_unknown");
  return amount;
}
export function addKnownCosts(
  mode: AiBillingMode,
  previous: number | null,
  amount: number | null,
): number | null {
  if (mode === "chatgpt_subscription") {
    if (previous !== null || amount !== null) throw new Error("subscription_money_not_applicable");
    return null;
  }
  if (previous === null || amount === null) throw new Error("provider_cost_unknown");
  const total = previous + amount;
  if (!Number.isSafeInteger(total) || total < 0 || total > 2_000_000_000)
    throw new Error("provider_cost_unknown");
  return total;
}
