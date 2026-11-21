// Switches for Butler answers on listing pages (ADR 0017). The brand sets the level in
// src/config/tenant.ts; a deployment can switch the whole block off with BUTLER_PUBLIC_ANSWERS=0
// (the legacy HERMES_PUBLIC_ANSWERS name is read only when the Butler name is absent). The text
// tier additionally needs the existing Butler configuration to be enabled.
import { butlerLevels } from "@/config/tenant";
import type { AssistanceConfig } from "./config";
import { butlerSetting } from "./env";

export function publicAnswersEnabled(
  env: Record<string, string | undefined> = process.env,
  level: "act" | "off" = butlerLevels.publicAnswers,
): boolean {
  return level === "act" && butlerSetting(env, "PUBLIC_ANSWERS") !== "0";
}

/** The model tier runs only under the same enablement, qualification and rates as every task. */
export function publicTextTierAvailable(config: AssistanceConfig): boolean {
  return (
    config.enabled &&
    Boolean(config.model) &&
    (config.provider === "chatgpt_oauth" ||
      (config.inputCostMicros !== null &&
        config.outputCostMicros !== null &&
        config.dailyLimitMicros !== null))
  );
}
