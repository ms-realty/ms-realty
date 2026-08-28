import test from "node:test";
import assert from "node:assert/strict";
import {
  hermesOwnerCommandAvailability,
  hermesReplyAvailability,
} from "../lib/hermes-availability.mjs";
import { openAiCompatibleHermesProvider } from "../lib/hermes-draft-worker.mjs";

const OPENROUTER_ENV = {
  HERMES_PROVIDER_MODE: "openrouter",
  HERMES_API_KEY: "openrouter-test-key",
  HERMES_MODEL: "openrouter/test-model",
};

test("OpenRouter is available for non-sensitive Hermes execution but not customer replies", () => {
  const command = hermesOwnerCommandAvailability({ env: OPENROUTER_ENV, fetchImpl: () => {} });
  const reply = hermesReplyAvailability({ env: OPENROUTER_ENV, fetchImpl: () => {} });

  assert.equal(command.available, true);
  assert.equal(command.provider_mode, "openrouter");
  assert.equal(reply.available, false);
  assert.equal(reply.reason_key, "provider_mode_unsupported");
});

test("an injected reply provider does not make owner-command availability true", () => {
  const replyProvider = async () => ({ title: "draft" });
  const reply = hermesReplyAvailability({ env: {}, provider: replyProvider });
  const command = hermesOwnerCommandAvailability({ env: {}, provider: null, fetchImpl: () => {} });

  assert.equal(reply.available, true);
  assert.equal(reply.provider_mode, "injected_provider");
  assert.equal(command.available, false);
  assert.equal(command.reason_key, "not_configured");
});

test("OpenRouter Hermes draft provider uses its provisioned default endpoint", async () => {
  const calls = [];
  const provider = openAiCompatibleHermesProvider({
    env: OPENROUTER_ENV,
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      return {
        ok: true,
        async json() {
          return {
            choices: [{ message: { content: JSON.stringify({ title: "Draft", body: "Body", seo_title: "SEO", meta_description: "Description", citations: [] }) } }],
          };
        },
      };
    },
  });

  const result = await provider({
    id: "listing-1",
    prompt: { role: "translation_draft", sourceText: "Approved source" },
  });

  assert.equal(result.title, "Draft");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://openrouter.ai/api/v1/chat/completions");
  assert.match(calls[0].init.headers.authorization, /^Bearer openrouter-test-key$/);
  assert.match(calls[0].init.body, /openrouter\/test-model/);
});
