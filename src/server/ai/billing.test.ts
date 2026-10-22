import { describe, expect, it } from "vitest";
import { addKnownCosts, billingMode, generationCost, reserveGenerationCost } from "./billing";
import { assistanceConfig } from "./config";

const subscription = assistanceConfig({
  BUTLER_ENABLED: "1",
  BUTLER_PROCESSING_APPROVED: "1",
  BUTLER_PROVIDER: "chatgpt_oauth",
  BUTLER_MODEL: "account-visible-model",
  BUTLER_CHATGPT_CREDENTIAL_ID: "a".repeat(64),
  BUTLER_CHATGPT_HOST_KEY: "synthetic",
  BUTLER_CHATGPT_DATABASE_URL: "postgres://synthetic",
  BUTLER_CHATGPT_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString("base64"),
  BUTLER_CHATGPT_QUALIFIED: "1",
});
describe("explicit subscription versus monetary billing", () => {
  it("requires its own qualification and durable storage, without a fake USD rate", () => {
    expect(subscription).toMatchObject({
      enabled: true,
      provider: "chatgpt_oauth",
      apiKey: null,
      inputCostMicros: null,
      outputCostMicros: null,
      dailyLimitMicros: null,
    });
    expect(billingMode(subscription)).toBe("chatgpt_subscription");
    expect(reserveGenerationCost(subscription, 1000, 1024)).toBeNull();
    expect(
      generationCost(subscription, {
        output: {},
        inputTokens: 20,
        outputTokens: 10,
        billingMode: "chatgpt_subscription",
      }),
    ).toBeNull();
    expect(() =>
      generationCost(subscription, {
        output: {},
        inputTokens: 20,
        outputTokens: 10,
        actualCostMicros: 0,
        billingMode: "chatgpt_subscription",
      }),
    ).toThrow("provider_billing_mismatch");
    expect(addKnownCosts("chatgpt_subscription", null, null)).toBeNull();
    expect(() => addKnownCosts("chatgpt_subscription", 0, null)).toThrow();
  });
  it("keeps absent or unqualified app credentials disabled despite an unrelated API key", () => {
    expect(
      assistanceConfig({
        BUTLER_PROVIDER: "chatgpt_oauth",
        BUTLER_ENABLED: "1",
        BUTLER_PROCESSING_APPROVED: "1",
        BUTLER_MODEL: "model",
        OPENAI_API_KEY: "synthetic",
      }).enabled,
    ).toBe(false);
  });
});
