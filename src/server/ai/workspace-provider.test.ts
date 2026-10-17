import { afterEach, describe, expect, it, vi } from "vitest";
import { type PlannerInput, workspaceProtocol } from "@/domain/generative";
import { requestGeneration } from "./provider";
import { workspaceConfig } from "./workspace-config";
import { generateWorkspaceTurn, workspaceTurnJsonSchema } from "./workspace-provider";

vi.mock("./provider", () => ({ requestGeneration: vi.fn() }));
const config = workspaceConfig(
  { BUTLER_WORKSPACE_QUALIFIED: "1", BUTLER_WORKSPACE_MAX_COST_USD_MICROS: "60000" },
  {
    enabled: true,
    provider: "openai",
    model: "operator-selected-model",
    apiKey: null,
    inputCostMicros: 1,
    outputCostMicros: 2,
    dailyLimitMicros: 100000,
    maxOutputTokens: 1024,
    timeoutMs: 10000,
  },
);
const input: PlannerInput = {
  protocol: workspaceProtocol,
  goal: "Compare suitable approved listings",
  constraints: [],
  locale: "bg",
  conversation: [],
  decisions: [],
  plan: [],
  context: { sources: [], pins: [], digest: "empty", truncated: false },
  checkpoints: [],
  remainingSteps: 8,
};
const turn = {
  message: "Inspect the approved source context.",
  questions: [],
  decisions: [],
  plan: [{ id: "search", title: "Find approved listings", state: "working" }],
  next: "tool",
  tool: { name: "listings.search", query: "" },
};
afterEach(() => vi.clearAllMocks());

describe("F29 one-inference structured planner seam", () => {
  it("delegates one inference using the unchanged qualified transport", async () => {
    const generation = { output: turn, inputTokens: 120, outputTokens: 80, actualCostMicros: 123 };
    vi.mocked(requestGeneration).mockResolvedValueOnce(generation);
    expect(await generateWorkspaceTurn(input, config)).toBe(generation);
    expect(requestGeneration).toHaveBeenCalledTimes(1);
    const call = vi.mocked(requestGeneration).mock.calls[0];
    if (!call) throw new Error("Missing request");
    expect(call[0]).toEqual(config.generation);
    expect(call[0]).toMatchObject({
      model: "operator-selected-model",
      maxOutputTokens: 4096,
      timeoutMs: 30000,
    });
    expect(call[0]).not.toHaveProperty("reasoning");
    expect(call[1]).toContain("untrusted data");
    expect(call[1]).toContain("Human review is mandatory");
    expect(call[1]).toContain("deterministic fact cards");
    expect(call[1]).toContain("copy its complete Calculation expression");
    expect(call[1]).toContain("User requirement:");
    expect(call[2]).toEqual(input);
    expect(call[3]).toEqual(workspaceTurnJsonSchema);
    expect(call[4]).toBe("workspace_planner_turn");
  });

  it("uses strict structured schema for every typed tool and no business completion state", () => {
    const serialized = JSON.stringify(workspaceTurnJsonSchema);
    for (const name of [
      "context.search",
      "context.read",
      "listings.search",
      "listings.compare",
      "calculate",
      "draft.prepare",
    ])
      expect(serialized).toContain(name);
    expect(serialized).not.toContain("customer.send");
    expect(serialized).not.toContain('"completed"');
    expect(workspaceTurnJsonSchema).toMatchObject({
      additionalProperties: false,
      required: ["message", "questions", "decisions", "plan", "next", "tool"],
    });
  });

  it("rejects disabled, incompatible and exhausted requests before inference", async () => {
    await expect(generateWorkspaceTurn(input, { ...config, enabled: false })).rejects.toThrow(
      "workspace_disabled",
    );
    await expect(
      generateWorkspaceTurn({ ...input, protocol: "unknown" } as unknown as PlannerInput, config),
    ).rejects.toThrow("workspace_protocol_mismatch");
    for (const remainingSteps of [0, -1, 9, 1.5, Number.NaN])
      await expect(generateWorkspaceTurn({ ...input, remainingSteps }, config)).rejects.toThrow(
        "workspace_step_budget",
      );
    expect(requestGeneration).not.toHaveBeenCalled();
  });

  it("bounds serialized input by UTF-8 bytes, including non-ASCII text", async () => {
    const small = { ...config, budget: { ...config.budget, maxInputBytes: 1024 } };
    const large = { ...input, goal: "ж".repeat(400) };
    expect(JSON.stringify(large).length).toBeLessThan(1024);
    expect(new TextEncoder().encode(JSON.stringify(large)).byteLength).toBeGreaterThan(1024);
    await expect(generateWorkspaceTurn(large, small)).rejects.toThrow("workspace_input_oversize");
    expect(requestGeneration).not.toHaveBeenCalled();
  });

  it("preserves usage for durable accounting when a model turn is invalid", async () => {
    vi.mocked(requestGeneration).mockResolvedValueOnce({
      output: { ...turn, tool: { name: "publish" } },
      inputTokens: 120,
      outputTokens: 80,
      actualCostMicros: 123,
    });
    expect(await generateWorkspaceTurn(input, config)).toMatchObject({
      output: { tool: { name: "publish" } },
      inputTokens: 120,
      outputTokens: 80,
      actualCostMicros: 123,
    });
  });

  it("propagates provider errors without replaying an inference", async () => {
    vi.mocked(requestGeneration).mockRejectedValueOnce(new Error("provider_incomplete"));
    await expect(generateWorkspaceTurn(input, config)).rejects.toThrow("provider_incomplete");
    expect(requestGeneration).toHaveBeenCalledTimes(1);
  });
});
