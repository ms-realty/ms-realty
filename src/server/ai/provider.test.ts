import { afterEach, describe, expect, it, vi } from "vitest";
import { accessToken } from "./chatgpt/oauth";
import { chatGptGeneration } from "./chatgpt/transport";
import { ChatGptError } from "./chatgpt/types";
import type { AssistanceConfig } from "./config";
import { routedGeneration } from "./openrouter";
import { requestGeneration } from "./provider";

vi.mock("./chatgpt/oauth", () => ({ accessToken: vi.fn() }));
vi.mock("./chatgpt/runtime", () => ({ runtimeChatGptStore: vi.fn(() => ({})) }));
vi.mock("./chatgpt/transport", () => ({ chatGptGeneration: vi.fn() }));
vi.mock("./openrouter", () => ({ routedGeneration: vi.fn() }));
afterEach(() => {
  vi.resetAllMocks();
  vi.unstubAllGlobals();
});
const config: AssistanceConfig = {
  enabled: true,
  provider: "chatgpt_oauth",
  chatGptRegistrationId: "a".repeat(64),
  model: "account-visible-model",
  apiKey: null,
  inputCostMicros: null,
  outputCostMicros: null,
  dailyLimitMicros: null,
  maxOutputTokens: 1024,
  timeoutMs: 1000,
};
describe("explicit Butler provider selection", () => {
  it("uses app-owned OAuth credentials without requiring an API key or inventing a rate", async () => {
    vi.mocked(accessToken).mockResolvedValueOnce("synthetic");
    const generation = {
      output: { draft: true },
      inputTokens: 8,
      outputTokens: 4,
      billingMode: "chatgpt_subscription" as const,
    };
    vi.mocked(chatGptGeneration).mockResolvedValueOnce(generation);
    expect(
      await requestGeneration(config, "Draft only", { source: true }, { type: "object" }, "draft"),
    ).toBe(generation);
    expect(chatGptGeneration).toHaveBeenCalledWith(
      expect.objectContaining({ model: config.model, bearer: "synthetic", maxOutputTokens: 1024 }),
    );
    expect(routedGeneration).not.toHaveBeenCalled();
  });
  it("does not fall back on plan limits or missing authorization", async () => {
    vi.mocked(accessToken).mockResolvedValueOnce("synthetic");
    vi.mocked(chatGptGeneration).mockRejectedValueOnce(
      new ChatGptError("provider_subscription_sharing_usage_limit_exceeded", "usage", "settled"),
    );
    await expect(requestGeneration(config, "Draft only", {}, {}, "draft")).rejects.toMatchObject({
      recovery: "usage",
    });
    vi.mocked(accessToken).mockRejectedValueOnce(new Error("missing"));
    await expect(requestGeneration(config, "Draft only", {}, {}, "draft")).rejects.toMatchObject({
      inferenceOutcome: "not_started",
    });
    expect(routedGeneration).not.toHaveBeenCalled();
  });
  it("includes refresh wait in the caller's deadline and never sends inference after it expires", async () => {
    vi.mocked(accessToken).mockImplementationOnce(
      () => new Promise((resolve) => setTimeout(() => resolve("synthetic"), 25)),
    );
    await expect(
      requestGeneration({ ...config, timeoutMs: 5 }, "Draft only", {}, {}, "draft"),
    ).rejects.toMatchObject({ inferenceOutcome: "not_started" });
    expect(chatGptGeneration).not.toHaveBeenCalled();
  });
  it("keeps the explicitly selected API-key request contract unchanged", async () => {
    const transport = vi.fn<typeof fetch>(async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      expect(body).toMatchObject({
        input: '{"source":true}',
        store: false,
        max_output_tokens: 1024,
      });
      expect(body).not.toHaveProperty("stream");
      expect(init?.headers).toMatchObject({ Authorization: "Bearer synthetic" });
      return Response.json({
        status: "completed",
        usage: { input_tokens: 8, output_tokens: 4 },
        output: [{ type: "message", content: [{ type: "output_text", text: '{"draft":true}' }] }],
      });
    });
    vi.stubGlobal("fetch", transport);
    await expect(
      requestGeneration(
        {
          ...config,
          provider: "openai",
          apiKey: "synthetic",
          inputCostMicros: 1,
          outputCostMicros: 2,
          dailyLimitMicros: 1000,
        },
        "Draft only",
        { source: true },
        {},
        "draft",
      ),
    ).resolves.toMatchObject({ output: { draft: true } });
    expect(accessToken).not.toHaveBeenCalled();
  });
});
