import { describe, expect, it } from "vitest";
import { assistanceConfig } from "./config";
import { syntheticJevPolicy } from "./jev-testing";

const current = {
  BUTLER_ENABLED: "1",
  BUTLER_PROVIDER: "openrouter",
  BUTLER_PROCESSING_APPROVED: "1",
  BUTLER_ROUTING_QUALIFIED: "1",
  BUTLER_ROUTING_POLICY: JSON.stringify({
    router: "typesafe/jev-router",
    models: ["test/fast", "test/deep"],
    providers: ["test"],
    guardrailRevision: "synthetic-qualification",
    sort: "price",
  }),
  BUTLER_INPUT_USD_MICROS_PER_TOKEN: "1",
  BUTLER_OUTPUT_USD_MICROS_PER_TOKEN: "2",
  BUTLER_DAILY_LIMIT_USD_MICROS: "100000",
  BUTLER_JEV_ENABLED: "1",
  BUTLER_JEV_QUALIFIED: "1",
  BUTLER_JEV_POLICY: JSON.stringify(syntheticJevPolicy),
  OPENROUTER_API_KEY: "test-only",
};
const legacy = Object.fromEntries(
  Object.entries(current).map(([key, value]) => [key.replace(/^BUTLER_/, "HERMES_"), value]),
);

describe("Butler deployment setting migration", () => {
  it("preserves qualified routing, semantic assessment and budgets for old deployments", () => {
    const config = assistanceConfig(current);
    expect(config).toMatchObject({
      enabled: true,
      provider: "openrouter",
      model: "typesafe/jev-router",
      jev: syntheticJevPolicy,
      inputCostMicros: 1,
      outputCostMicros: 2,
      dailyLimitMicros: 100000,
    });
    expect(assistanceConfig(legacy)).toEqual(config);
    expect(assistanceConfig({ ...legacy, BUTLER_DAILY_LIMIT_USD_MICROS: "50000" })).toMatchObject({
      enabled: true,
      dailyLimitMicros: 50000,
    });
  });

  it.each([
    ["BUTLER_ENABLED", "0"],
    ["BUTLER_PROCESSING_APPROVED", "0"],
    ["BUTLER_ROUTING_QUALIFIED", "0"],
    ["BUTLER_JEV_QUALIFIED", "0"],
    ["BUTLER_PROVIDER", "unknown"],
    ["BUTLER_PROVIDER", ""],
    ["BUTLER_ROUTING_POLICY", "{"],
    ["BUTLER_ROUTING_POLICY", ""],
    ["BUTLER_JEV_POLICY", "{"],
    ["BUTLER_JEV_POLICY", ""],
    ["BUTLER_INPUT_USD_MICROS_PER_TOKEN", "0"],
    ["BUTLER_OUTPUT_USD_MICROS_PER_TOKEN", "invalid"],
    ["BUTLER_DAILY_LIMIT_USD_MICROS", ""],
  ])("fails closed for explicit %s=%s despite qualified legacy settings", (key, value) => {
    expect(assistanceConfig({ ...legacy, [key]: value }).enabled).toBe(false);
  });

  it("honours an explicit semantic-assessment disable instead of the old enable", () => {
    expect(assistanceConfig({ ...legacy, BUTLER_JEV_ENABLED: "0" })).toMatchObject({
      enabled: true,
      jev: undefined,
    });
  });

  it("preserves the explicitly selected legacy OpenAI adapter without a model fallback", () => {
    const env = {
      ...legacy,
      HERMES_PROVIDER: "openai",
      HERMES_JEV_ENABLED: "0",
      HERMES_MODEL: "operator-test-model",
      OPENAI_API_KEY: "test-only",
    };
    expect(assistanceConfig(env)).toMatchObject({ enabled: true, model: "operator-test-model" });
    expect(assistanceConfig({ ...env, BUTLER_MODEL: "" }).enabled).toBe(false);
    expect(assistanceConfig({ ...env, BUTLER_MODEL: "replacement-model" })).toMatchObject({
      enabled: true,
      model: "replacement-model",
    });
  });
});
