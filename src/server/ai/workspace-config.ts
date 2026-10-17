import "server-only";
import { type WorkspaceBudget, workspaceProtocol } from "@/domain/generative";
import { hashRequest } from "../crypto";
import { type AssistanceConfig, assistanceConfig } from "./config";

export interface WorkspaceConfig {
  readonly enabled: boolean;
  readonly generation: AssistanceConfig;
  readonly budget: WorkspaceBudget;
  readonly policyDigest: string;
}

/** Increment when the planner instructions or application tool semantics change. */
export const workspacePolicyRevision = "bounded-read-and-prepare-v1";

const integer = (raw: string | undefined, fallback: number, minimum: number, maximum: number) => {
  if (raw === undefined) return fallback;
  const value = raw.trim() ? Number(raw) : Number.NaN;
  return Number.isSafeInteger(value) && value >= minimum && value <= maximum ? value : null;
};

/** Separate qualification and limits never change the five existing assistance drafts. */
export function workspaceConfig(
  env: Record<string, string | undefined> = process.env,
  baseConfig: AssistanceConfig = assistanceConfig(env),
): WorkspaceConfig {
  const base = baseConfig;
  const setting = (key: string) => env[`BUTLER_WORKSPACE_${key}`] ?? env[`HERMES_WORKSPACE_${key}`];
  const values = {
    maxSteps: integer(setting("MAX_STEPS"), 8, 1, 24),
    maxTotalTokens: integer(setting("MAX_TOTAL_TOKENS"), 100_000, 1024, 2_000_000),
    maxOutputTokens: integer(setting("MAX_OUTPUT_TOKENS"), 4096, 256, 8192),
    maxInputBytes: integer(setting("MAX_INPUT_BYTES"), 49_152, 1024, 131_072),
    timeoutMs: integer(setting("TIMEOUT_MS"), 30_000, 1000, 120_000),
    maxElapsedMs: integer(setting("MAX_ELAPSED_MS"), 180_000, 1000, 900_000),
    maxCostMicros: integer(setting("MAX_COST_USD_MICROS"), 0, 1, base.dailyLimitMicros),
    readRetries: integer(setting("READ_RETRIES"), 2, 0, 2),
  };
  const valid =
    Object.values(values).every((value) => value !== null) &&
    (values.maxCostMicros ?? 0) > 0 &&
    (values.maxElapsedMs ?? 0) >= (values.timeoutMs ?? Number.POSITIVE_INFINITY);
  // Invalid operator settings remain safely bounded in disabled status projections.
  const budget: WorkspaceBudget = {
    maxSteps: values.maxSteps ?? 8,
    maxTotalTokens: values.maxTotalTokens ?? 100_000,
    maxOutputTokens: values.maxOutputTokens ?? 4096,
    maxInputBytes: values.maxInputBytes ?? 49_152,
    timeoutMs: values.timeoutMs ?? 30_000,
    maxElapsedMs: values.maxElapsedMs ?? 180_000,
    maxCostMicros: values.maxCostMicros ?? 0,
    readRetries: values.readRetries ?? 2,
  };
  const enabled = base.enabled && setting("QUALIFIED") === "1" && valid;
  const generation: AssistanceConfig = {
    ...base,
    enabled,
    maxOutputTokens: budget.maxOutputTokens,
    timeoutMs: budget.timeoutMs,
  };
  const policyDigest = hashRequest({
    protocol: workspaceProtocol,
    revision: workspacePolicyRevision,
    provider: generation.provider,
    model: generation.model,
    routing: generation.routing ?? null,
    jev: generation.jev ?? null,
    rates: {
      inputCostMicros: generation.inputCostMicros,
      outputCostMicros: generation.outputCostMicros,
      dailyLimitMicros: generation.dailyLimitMicros,
    },
    budget,
  });
  return { enabled, generation, budget, policyDigest };
}
