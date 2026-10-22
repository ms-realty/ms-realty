import "server-only";
import { butlerSetting } from "./env";
import { readJevPolicy } from "./jev";
import type { JevPolicy } from "./jev-contract";
import { type RoutingPolicy, readRoutingPolicy } from "./routing";

export interface AssistanceConfig {
  readonly provider?: "openai" | "openrouter" | "chatgpt_oauth";
  readonly chatGptRegistrationId?: string;
  readonly routing?: RoutingPolicy;
  readonly jev?: JevPolicy;
  readonly enabled: boolean;
  readonly model: string | null;
  readonly apiKey: string | null;
  /** USD micro-units per token, configured from the operator's approved rate card. */
  readonly inputCostMicros: number | null;
  readonly outputCostMicros: number | null;
  readonly dailyLimitMicros: number | null;
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
  const provider = butlerSetting(env, "PROVIDER") ?? "openrouter";
  const subscription = provider === "chatgpt_oauth";
  const chatGptRegistrationId = env.BUTLER_CHATGPT_CREDENTIAL_ID?.trim();
  const chatGptReady = Boolean(
    subscription &&
      chatGptRegistrationId &&
      /^[a-f0-9]{64}$/.test(chatGptRegistrationId) &&
      env.BUTLER_CHATGPT_HOST_KEY &&
      /^[A-Za-z0-9_-]{1,80}$/.test(env.BUTLER_CHATGPT_HOST_KEY) &&
      env.BUTLER_CHATGPT_DATABASE_URL &&
      env.BUTLER_CHATGPT_ENCRYPTION_KEY &&
      /^[A-Za-z0-9+/]{43}=$/.test(env.BUTLER_CHATGPT_ENCRYPTION_KEY) &&
      env.BUTLER_CHATGPT_QUALIFIED === "1",
  );
  const routing = readRoutingPolicy(env);
  const jev = readJevPolicy(env);
  const jevReady =
    butlerSetting(env, "JEV_ENABLED") !== "1" ||
    (provider === "openrouter" && jev && butlerSetting(env, "JEV_QUALIFIED") === "1");
  const model =
    provider === "openrouter"
      ? (routing?.router ?? null)
      : butlerSetting(env, "MODEL")?.trim() || null;
  const apiKey = env.OPENAI_API_KEY?.trim() || null;
  const inputCostMicros = positive(butlerSetting(env, "INPUT_USD_MICROS_PER_TOKEN"), 100_000);
  const outputCostMicros = positive(butlerSetting(env, "OUTPUT_USD_MICROS_PER_TOKEN"), 100_000);
  const dailyLimitMicros = Math.floor(
    positive(butlerSetting(env, "DAILY_LIMIT_USD_MICROS"), 1_000_000_000),
  );
  const credential = subscription
    ? null
    : provider === "openrouter"
      ? env.OPENROUTER_API_KEY?.trim()
      : apiKey;
  const transportReady =
    provider === "openai" ||
    chatGptReady ||
    (provider === "openrouter" && routing && butlerSetting(env, "ROUTING_QUALIFIED") === "1");
  return {
    provider: subscription ? "chatgpt_oauth" : provider === "openai" ? "openai" : "openrouter",
    ...(subscription ? { chatGptRegistrationId } : {}),
    routing: provider === "openrouter" ? (routing ?? undefined) : undefined,
    jev,
    enabled: Boolean(
      butlerSetting(env, "ENABLED") === "1" &&
        butlerSetting(env, "PROCESSING_APPROVED") === "1" &&
        model &&
        (subscription ? chatGptReady : credential) &&
        transportReady &&
        jevReady &&
        (subscription || (inputCostMicros && outputCostMicros && dailyLimitMicros)),
    ),
    model,
    apiKey: credential || null,
    inputCostMicros: subscription ? null : inputCostMicros,
    outputCostMicros: subscription ? null : outputCostMicros,
    dailyLimitMicros: subscription ? null : dailyLimitMicros,
    maxOutputTokens: 1024,
    timeoutMs: 10_000,
  };
}

/** Operations projections must not serialize a provider credential. */
export function assistanceAvailability(config = assistanceConfig()) {
  return {
    enabled: config.enabled,
    billingMode: config.provider === "chatgpt_oauth" ? "chatgpt_subscription" : "metered_usd",
    model: config.model,
    dailyLimitMicros: config.dailyLimitMicros,
    timeoutMs: config.timeoutMs,
    maxOutputTokens: config.maxOutputTokens,
  };
}
