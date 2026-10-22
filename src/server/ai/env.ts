import "server-only";

type ButlerSetting =
  | "ENABLED"
  | "PROVIDER"
  | "MODEL"
  | "PROCESSING_APPROVED"
  | "ROUTING_QUALIFIED"
  | "ROUTING_POLICY"
  | "INPUT_USD_MICROS_PER_TOKEN"
  | "OUTPUT_USD_MICROS_PER_TOKEN"
  | "DAILY_LIMIT_USD_MICROS"
  | "JEV_ENABLED"
  | "JEV_QUALIFIED"
  | "JEV_POLICY";

/** Old deployments remain readable; an explicit Butler value always takes precedence. */
export function butlerSetting(
  env: Record<string, string | undefined>,
  setting: ButlerSetting,
): string | undefined {
  return env[`BUTLER_${setting}`] ?? env[`HERMES_${setting}`];
}
