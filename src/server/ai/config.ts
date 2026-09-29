import "server-only";
import { readJevPolicy } from "./jev";
import type { JevPolicy } from "./jev-contract";
import { type RoutingPolicy, readRoutingPolicy } from "./routing";

export interface AssistanceConfig {
  readonly provider?: "openai" | "openrouter";
  readonly routing?: RoutingPolicy;
  readonly jev?: JevPolicy;
  readonly enabled: boolean;
  readonly model: string | null;
  readonly apiKey: string | null;
  /** USD micro-units per token, configured from the operator's approved rate card. */
  readonly inputCostMicros: number;
  readonly outputCostMicros: number;
  readonly dailyLimitMicros: number;
  readonly maxOutputTokens: number;
  readonly timeoutMs: number;
}
const positive = (raw: string | undefined, maximum: number) => {
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 && value <= maximum ? value : 0;
};

/** No credentials are discovered, provisioned or used without explicit operator activation. */
export function assistanceConfig(
  env: Record<string, string | undefined> = process.env,
): AssistanceConfig {
  const provider = env.HERMES_PROVIDER ?? "openrouter";
  const routing = readRoutingPolicy(env);
  const jev = readJevPolicy(env);
  const jevReady =
    env.HERMES_JEV_ENABLED !== "1" ||
    (provider === "openrouter" && jev && env.HERMES_JEV_QUALIFIED === "1");
  const model =
    provider === "openrouter" ? (routing?.router ?? null) : env.HERMES_MODEL?.trim() || null;
  const apiKey = env.OPENAI_API_KEY?.trim() || null;
  const inputCostMicros = positive(env.HERMES_INPUT_USD_MICROS_PER_TOKEN, 100_000);
  const outputCostMicros = positive(env.HERMES_OUTPUT_USD_MICROS_PER_TOKEN, 100_000);
  const dailyLimitMicros = Math.floor(positive(env.HERMES_DAILY_LIMIT_USD_MICROS, 1_000_000_000));
  const credential = provider === "openrouter" ? env.OPENROUTER_API_KEY?.trim() : apiKey;
  const transportReady =
    provider === "openai" ||
    (provider === "openrouter" && routing && env.HERMES_ROUTING_QUALIFIED === "1");
  return {
    provider: provider === "openai" ? "openai" : "openrouter",
    routing: provider === "openrouter" ? (routing ?? undefined) : undefined,
    jev,
    enabled: Boolean(
      env.HERMES_ENABLED === "1" &&
        env.HERMES_PROCESSING_APPROVED === "1" &&
        model &&
        credential &&
        transportReady &&
        jevReady &&
        inputCostMicros &&
        outputCostMicros &&
        dailyLimitMicros,
    ),
    model,
    apiKey: credential || null,
    inputCostMicros,
    outputCostMicros,
    dailyLimitMicros,
    maxOutputTokens: 1024,
    timeoutMs: 10_000,
  };
}

/** Operations projections must not serialize a provider credential. */
export function assistanceAvailability(config = assistanceConfig()) {
  return {
    enabled: config.enabled,
    model: config.model,
    dailyLimitMicros: config.dailyLimitMicros,
    timeoutMs: config.timeoutMs,
    maxOutputTokens: config.maxOutputTokens,
  };
}
