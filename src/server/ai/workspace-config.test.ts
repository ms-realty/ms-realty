import { describe, expect, it } from "vitest";
import { type AssistanceConfig, assistanceConfig } from "./config";
import { workspaceConfig } from "./workspace-config";

const env = {
  BUTLER_WORKSPACE_QUALIFIED: "1",
  BUTLER_WORKSPACE_MAX_COST_USD_MICROS: "60000",
};
// No transport is called. Production activation still comes from assistanceConfig(env).
const base: AssistanceConfig = {
  enabled: true,
  provider: "openai",
  model: "operator-selected-model",
  apiKey: null,
  inputCostMicros: 1,
  outputCostMicros: 2,
  dailyLimitMicros: 100000,
  maxOutputTokens: 1024,
  timeoutMs: 10000,
};

describe("F29 separately qualified workspace limits", () => {
  it("keeps existing draft defaults and enlarges only workspace generation", () => {
    const config = workspaceConfig(env, base);
    expect(config.enabled).toBe(true);
    expect(config.budget).toEqual({
      maxSteps: 8,
      maxTotalTokens: 100000,
      maxOutputTokens: 4096,
      maxInputBytes: 49152,
      timeoutMs: 30000,
      maxElapsedMs: 180000,
      maxCostMicros: 60000,
      readRetries: 2,
    });
    expect(config.generation).toMatchObject({
      enabled: true,
      provider: "openai",
      model: base.model,
      maxOutputTokens: 4096,
      timeoutMs: 30000,
    });
    expect(base).toMatchObject({ maxOutputTokens: 1024, timeoutMs: 10000 });
    expect(assistanceConfig({})).toMatchObject({ maxOutputTokens: 1024, timeoutMs: 10000 });
    expect(workspaceConfig(env).enabled).toBe(false);
    expect(workspaceConfig(env, { ...base, enabled: false }).enabled).toBe(false);
  });

  it.each([
    ["BUTLER_WORKSPACE_QUALIFIED", undefined],
    ["BUTLER_WORKSPACE_QUALIFIED", "0"],
    ["BUTLER_WORKSPACE_MAX_COST_USD_MICROS", undefined],
    ["BUTLER_WORKSPACE_MAX_COST_USD_MICROS", "0"],
    ["BUTLER_WORKSPACE_MAX_COST_USD_MICROS", "100001"],
    ["BUTLER_WORKSPACE_MAX_COST_USD_MICROS", "1.2"],
    ["BUTLER_WORKSPACE_MAX_STEPS", "25"],
    ["BUTLER_WORKSPACE_MAX_STEPS", ""],
    ["BUTLER_WORKSPACE_MAX_TOTAL_TOKENS", "1023"],
    ["BUTLER_WORKSPACE_MAX_TOTAL_TOKENS", "2000001"],
    ["BUTLER_WORKSPACE_MAX_TOTAL_TOKENS", "100000.5"],
    ["BUTLER_WORKSPACE_MAX_TOTAL_TOKENS", ""],
    ["BUTLER_WORKSPACE_MAX_OUTPUT_TOKENS", "8193"],
    ["BUTLER_WORKSPACE_MAX_INPUT_BYTES", "131073"],
    ["BUTLER_WORKSPACE_TIMEOUT_MS", "120001"],
    ["BUTLER_WORKSPACE_MAX_ELAPSED_MS", "900001"],
    ["BUTLER_WORKSPACE_MAX_ELAPSED_MS", "1000"],
    ["BUTLER_WORKSPACE_READ_RETRIES", "3"],
    ["BUTLER_WORKSPACE_READ_RETRIES", "-1"],
  ])("disables activation on invalid %s", (key, value) => {
    const config = workspaceConfig({ ...env, [key]: value }, base);
    expect(config.enabled).toBe(false);
    expect(config.generation.enabled).toBe(false);
  });

  it("supports bounded choices without changing provider or effort", () => {
    const config = workspaceConfig(
      {
        ...env,
        BUTLER_WORKSPACE_MAX_STEPS: "24",
        BUTLER_WORKSPACE_MAX_TOTAL_TOKENS: "2000000",
        BUTLER_WORKSPACE_MAX_OUTPUT_TOKENS: "8192",
        BUTLER_WORKSPACE_TIMEOUT_MS: "120000",
        BUTLER_WORKSPACE_MAX_ELAPSED_MS: "900000",
        BUTLER_WORKSPACE_READ_RETRIES: "0",
      },
      base,
    );
    expect(config.enabled).toBe(true);
    expect(config.budget).toMatchObject({
      maxSteps: 24,
      maxTotalTokens: 2000000,
      maxOutputTokens: 8192,
      timeoutMs: 120000,
      maxElapsedMs: 900000,
      readRetries: 0,
    });
    expect(config.generation.model).toBe(base.model);
    expect(config.generation).not.toHaveProperty("reasoning");
  });

  it("pins rates, model and budgets without credential fields", () => {
    const first = workspaceConfig(env, base);
    expect(first.policyDigest).toMatch(/^[a-f0-9]{64}$/);
    for (const change of [
      { model: "another-approved-model" },
      { inputCostMicros: 2 },
      { outputCostMicros: 3 },
      { dailyLimitMicros: 110000 },
    ])
      expect(workspaceConfig(env, { ...base, ...change }).policyDigest).not.toBe(
        first.policyDigest,
      );
    for (const change of [
      { BUTLER_WORKSPACE_MAX_STEPS: "9" },
      { BUTLER_WORKSPACE_MAX_TOTAL_TOKENS: "200000" },
      { BUTLER_WORKSPACE_MAX_OUTPUT_TOKENS: "5000" },
      { BUTLER_WORKSPACE_MAX_INPUT_BYTES: "50000" },
      { BUTLER_WORKSPACE_TIMEOUT_MS: "40000" },
      { BUTLER_WORKSPACE_MAX_ELAPSED_MS: "200000" },
      { BUTLER_WORKSPACE_MAX_COST_USD_MICROS: "50000" },
      { BUTLER_WORKSPACE_READ_RETRIES: "1" },
    ])
      expect(workspaceConfig({ ...env, ...change }, base).policyDigest).not.toBe(
        first.policyDigest,
      );
    const { apiKey: _credential, ...safeGeneration } = first.generation;
    expect(JSON.stringify({ ...first, generation: safeGeneration })).not.toContain("apiKey");
    expect(workspaceConfig({ ...env, UNRELATED_SETTING: "ignored" }, base).policyDigest).toBe(
      first.policyDigest,
    );
  });

  it("preserves routing restrictions and pins changes to the qualified pool", () => {
    const routed: AssistanceConfig = {
      ...base,
      provider: "openrouter",
      model: "typesafe/jev-router",
      routing: {
        router: "typesafe/jev-router",
        models: ["test/fast", "test/deep"],
        providers: ["test"],
        guardrailRevision: "synthetic-qualification",
        sort: "price",
      },
    };
    const first = workspaceConfig(env, routed);
    expect(first.enabled).toBe(true);
    expect(first.generation.routing).toEqual(routed.routing);
    if (!routed.routing) throw new Error("Missing synthetic routing policy");
    expect(
      workspaceConfig(env, {
        ...routed,
        routing: { ...routed.routing, models: ["test/fast", "test/other"] },
      }).policyDigest,
    ).not.toBe(first.policyDigest);
  });

  it("accepts the minimum total-token ceiling while keeping the job budget pinned", () => {
    const minimum = workspaceConfig({ ...env, BUTLER_WORKSPACE_MAX_TOTAL_TOKENS: "1024" }, base);
    expect(minimum.enabled).toBe(true);
    expect(minimum.budget.maxTotalTokens).toBe(1024);
    expect(minimum.policyDigest).not.toBe(workspaceConfig(env, base).policyDigest);
    const invalid = workspaceConfig({ ...env, BUTLER_WORKSPACE_MAX_TOTAL_TOKENS: "0" }, base);
    expect(invalid.enabled).toBe(false);
    expect(invalid.budget.maxTotalTokens).toBe(100000);
  });

  it("honours explicit Butler disables over legacy qualification", () => {
    const legacy = Object.fromEntries(
      Object.entries(env).map(([key, value]) => [key.replace(/^BUTLER_/, "HERMES_"), value]),
    );
    expect(workspaceConfig(legacy, base)).toEqual(workspaceConfig(env, base));
    expect(workspaceConfig({ ...legacy, BUTLER_WORKSPACE_QUALIFIED: "0" }, base).enabled).toBe(
      false,
    );
  });
});
