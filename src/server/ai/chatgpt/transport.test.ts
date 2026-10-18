import { describe, expect, it, vi } from "vitest";
import { type ChatGptRequest, chatGptGeneration } from "./transport";

const request: ChatGptRequest = {
  model: "account-visible-model",
  bearer: "synthetic",
  instructions: "Use only supplied sources. Draft only.",
  input: { source: "Synthetic approved source" },
  schema: { type: "object" },
  name: "draft",
  maxOutputTokens: 128,
  timeoutMs: 1000,
};
const frame = (event: unknown) => `data: ${JSON.stringify(event)}\n\n`;
const complete = (text = '{"draft":"שלום"}', output = 12) => ({
  type: "response.completed",
  response: {
    status: "completed",
    usage: { input_tokens: 30, output_tokens: output },
    output: [{ type: "message", content: [{ type: "output_text", text }] }],
  },
});
function stream(text: string, chunk = 7): Response {
  const bytes = new TextEncoder().encode(text);
  let offset = 0;
  return new Response(
    new ReadableStream<Uint8Array>({
      pull(controller) {
        if (offset === bytes.length) {
          controller.close();
          return;
        }
        controller.enqueue(bytes.slice(offset, offset + chunk));
        offset = Math.min(offset + chunk, bytes.length);
      },
    }),
    { headers: { "Content-Type": "text/event-stream; charset=utf-8" } },
  );
}
describe("subscription Responses SSE transport", () => {
  it("uses the public route and supported body fields, accepts only terminal structured output", async () => {
    const transport = vi.fn<typeof fetch>(async (url, init) => {
      expect(url).toBe("https://api.openai.com/v1/responses");
      expect(init?.redirect).toBe("error");
      const body = JSON.parse(String(init?.body));
      expect(body).toMatchObject({ store: false, stream: true, model: request.model });
      expect(body.input).toEqual([
        { role: "user", content: [{ type: "input_text", text: JSON.stringify(request.input) }] },
      ]);
      expect(Object.keys(body).sort()).toEqual([
        "input",
        "instructions",
        "model",
        "store",
        "stream",
        "text",
      ]);
      return stream(
        frame({ type: "response.output_text.delta", delta: "untrusted partial" }) +
          frame(complete()),
        1,
      );
    });
    expect(await chatGptGeneration(request, transport)).toEqual({
      output: { draft: "שלום" },
      inputTokens: 30,
      outputTokens: 12,
      billingMode: "chatgpt_subscription",
    });
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it("handles multiline SSE data and CRLF boundaries", async () => {
    const data = `${JSON.stringify(complete(), null, 2)
      .split("\n")
      .map((line) => `data: ${line}`)
      .join("\r\n")}\r\n\r\n`;
    await expect(chatGptGeneration(request, async () => stream(data, 1))).resolves.toMatchObject({
      output: { draft: "שלום" },
    });
  });
  it.each(["subscription_sharing_usage_limit_exceeded", "subscription_sharing_usage_unavailable"])(
    "keeps terminal %s distinct after streamed text",
    async (code) => {
      const transport = vi.fn<typeof fetch>(async () =>
        stream(
          frame({ type: "response.output_text.delta", delta: "unfinished" }) +
            frame({ type: "response.failed", response: { error: { code } } }),
        ),
      );
      await expect(chatGptGeneration(request, transport)).rejects.toMatchObject({
        code: `provider_${code}`,
      });
      expect(transport).toHaveBeenCalledTimes(1);
    },
  );
  it("handles an SSE error event's direct code and a structured HTTP limit error", async () => {
    const code = "subscription_sharing_usage_limit_exceeded";
    await expect(
      chatGptGeneration(request, async () => stream(frame({ type: "error", code }))),
    ).rejects.toMatchObject({ recovery: "usage" });
    await expect(
      chatGptGeneration(request, async () => Response.json({ error: { code } }, { status: 429 })),
    ).rejects.toMatchObject({ recovery: "usage" });
  });
  it("reads a header-absent direct-route stream and its nested plan-limit error", async () => {
    const data = frame({
      type: "error",
      error: { type: "invalid_request_error", code: "subscription_sharing_usage_limit_exceeded" },
      sequence_number: 3,
    });
    const transport = vi.fn<typeof fetch>(async () => new Response(new TextEncoder().encode(data)));
    await expect(chatGptGeneration(request, transport)).rejects.toMatchObject({
      code: "provider_subscription_sharing_usage_limit_exceeded",
      recovery: "usage",
      inferenceOutcome: "settled",
    });
    expect(transport).toHaveBeenCalledOnce();
    await expect(
      chatGptGeneration(
        request,
        async () => new Response(new TextEncoder().encode(frame(complete()))),
      ),
    ).resolves.toMatchObject({ output: { draft: "שלום" }, billingMode: "chatgpt_subscription" });
  });
  it("does not treat a declared different media type or header-absent JSON as a stream", async () => {
    await expect(
      chatGptGeneration(request, async () => new Response(frame(complete()))),
    ).rejects.toMatchObject({ code: "provider_chatgpt_stream_type" });
    await expect(
      chatGptGeneration(
        request,
        async () => new Response(new TextEncoder().encode('{"status":"completed"}')),
      ),
    ).rejects.toMatchObject({ code: "provider_chatgpt_interrupted" });
  });
  it("compares the media type exactly while permitting standard parameters", async () => {
    await expect(
      chatGptGeneration(
        request,
        async () =>
          new Response(frame(complete()), {
            headers: { "Content-Type": "text/event-stream-other" },
          }),
      ),
    ).rejects.toMatchObject({ code: "provider_chatgpt_stream_type" });
    await expect(
      chatGptGeneration(
        request,
        async () =>
          new Response(frame(complete()), {
            headers: { "Content-Type": "Text/Event-Stream; charset=utf-8" },
          }),
      ),
    ).resolves.toMatchObject({ output: { draft: "שלום" } });
  });
  it("bounds terminal-only output independently of the reported token count", async () => {
    const text = JSON.stringify({ draft: "x".repeat(2000) });
    await expect(
      chatGptGeneration({ ...request, maxOutputTokens: 1 }, async () =>
        stream(frame(complete(text, 1))),
      ),
    ).rejects.toMatchObject({
      code: "provider_chatgpt_output_oversize",
      inferenceOutcome: "settled",
      usage: { inputTokens: 30, outputTokens: 1 },
    });
  });
  it("keeps an unrecognized provider failure unknown without an inference retry", async () => {
    const transport = vi.fn<typeof fetch>(async () =>
      Response.json({ error: { code: "unclassified_failure" } }, { status: 503 }),
    );
    await expect(chatGptGeneration(request, transport)).rejects.toMatchObject({
      inferenceOutcome: "unknown",
      recovery: "unknown",
    });
    expect(transport).toHaveBeenCalledOnce();
  });
  it.each([
    [
      "interrupted deltas",
      frame({ type: "response.output_text.delta", delta: "unfinished" }),
      "provider_chatgpt_interrupted",
    ],
    ["incomplete terminal", frame({ type: "response.incomplete" }), "provider_chatgpt_incomplete"],
    ["missing terminal", "data: [DONE]\n\n", "provider_chatgpt_interrupted"],
    ["invalid JSON output", frame(complete("unfinished")), "provider_chatgpt_output_invalid"],
    [
      "over-token terminal",
      frame(complete('{"draft":"text"}', 129)),
      "provider_chatgpt_usage_limit",
    ],
  ])("rejects %s", async (_name, data, code) => {
    await expect(chatGptGeneration(request, async () => stream(data))).rejects.toMatchObject({
      code,
    });
  });
  it("rejects a failure after a completed event instead of exposing a draft", async () => {
    const data =
      frame(complete()) +
      frame({
        type: "response.failed",
        response: { error: { code: "subscription_sharing_usage_unavailable" } },
      });
    await expect(chatGptGeneration(request, async () => stream(data))).rejects.toMatchObject({
      recovery: "later",
    });
  });
  it("bounds input and stream bytes and stops a stalled stream at its deadline", async () => {
    const transport = vi.fn<typeof fetch>();
    await expect(
      chatGptGeneration({ ...request, maxInputBytes: 8 }, transport),
    ).rejects.toMatchObject({ code: "provider_chatgpt_input_oversize" });
    expect(transport).not.toHaveBeenCalled();
    await expect(
      chatGptGeneration({ ...request, maxResponseBytes: 8 }, async () => stream(frame(complete()))),
    ).rejects.toMatchObject({ code: "provider_chatgpt_response_oversize" });
    await expect(
      chatGptGeneration(
        { ...request, timeoutMs: 10 },
        async () =>
          new Response(new ReadableStream(), { headers: { "Content-Type": "text/event-stream" } }),
      ),
    ).rejects.toMatchObject({ code: "provider_chatgpt_interrupted" });
  });
});
