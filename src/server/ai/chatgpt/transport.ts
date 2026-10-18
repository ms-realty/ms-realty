import "server-only";
import { z } from "zod";
import { boundedJson } from "./oauth";
import { ChatGptError, subscriptionError } from "./types";

const usageSchema = z.object({
  input_tokens: z.number().int().nonnegative().max(1_000_000),
  output_tokens: z.number().int().nonnegative().max(1_000_000),
});
const responseSchema = z.object({
  status: z.literal("completed"),
  usage: usageSchema,
  output: z.array(
    z.object({
      type: z.string(),
      content: z.array(z.object({ type: z.string(), text: z.string().optional() })).optional(),
    }),
  ),
});
export interface ChatGptGeneration {
  readonly output: unknown;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly billingMode: "chatgpt_subscription";
}
export interface ChatGptRequest {
  readonly model: string;
  readonly bearer: string;
  readonly instructions: string;
  readonly input: unknown;
  readonly schema: unknown;
  readonly name: string;
  readonly maxOutputTokens: number;
  readonly timeoutMs: number;
  readonly maxInputBytes?: number;
  readonly maxResponseBytes?: number;
}
function errorCode(value: unknown): string {
  const body = z.object({ error: z.object({ code: z.string() }) }).safeParse(value);
  const event = z.object({ code: z.string() }).safeParse(value);
  return body.success ? body.data.error.code : event.success ? event.data.code : "unknown";
}
/** Direct plan-use transport. No hidden provider retry, conversation storage or hosted tools. */
export async function chatGptGeneration(
  request: ChatGptRequest,
  doFetch: typeof fetch = fetch,
): Promise<ChatGptGeneration> {
  if (
    !request.model ||
    !request.bearer ||
    !Number.isSafeInteger(request.maxOutputTokens) ||
    request.maxOutputTokens < 1
  )
    throw new ChatGptError("provider_chatgpt_configuration", "configuration");
  const body = JSON.stringify({
    model: request.model,
    instructions: request.instructions,
    input: [
      { role: "user", content: [{ type: "input_text", text: JSON.stringify(request.input) }] },
    ],
    store: false,
    stream: true,
    text: {
      format: { type: "json_schema", name: request.name, strict: true, schema: request.schema },
    },
  });
  if (Buffer.byteLength(body) > (request.maxInputBytes ?? 131_072))
    throw new ChatGptError("provider_chatgpt_input_oversize", "configuration");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), request.timeoutMs);
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
    const response = await doFetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${request.bearer}`,
        "Content-Type": "application/json",
        Accept: "text/event-stream",
      },
      body,
      signal: controller.signal,
      redirect: "error",
      cache: "no-store",
    });
    if (!response.ok) throw subscriptionError(errorCode(await boundedJson(response)));
    // Some direct-route responses omit the media type. They still have to pass the
    // bounded SSE parser and terminal response validation; a declared other type is rejected.
    const contentType = response.headers.get("content-type");
    if (contentType && contentType.split(";", 1)[0]?.trim().toLowerCase() !== "text/event-stream")
      throw new ChatGptError("provider_chatgpt_stream_type");
    reader = response.body?.getReader();
    if (!reader) throw new ChatGptError("provider_chatgpt_empty");
    controller.signal.addEventListener(
      "abort",
      () => {
        void reader?.cancel().catch(() => {});
      },
      { once: true },
    );
    if (controller.signal.aborted) await reader.cancel();
    const decoder = new TextDecoder("utf-8", { fatal: true });
    let buffer = "",
      bytes = 0,
      outputBytes = 0;
    let completed: z.infer<typeof responseSchema> | undefined;
    const onFrame = (frame: string) => {
      const data = frame
        .split(/\r\n|\r|\n/)
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).replace(/^ /, ""))
        .join("\n");
      if (!data || data === "[DONE]") return;
      let event: Record<string, unknown>;
      try {
        event = JSON.parse(data);
      } catch {
        throw new ChatGptError("provider_chatgpt_stream_invalid");
      }
      if (event.type === "response.output_text.delta") {
        if (completed || typeof event.delta !== "string")
          throw new ChatGptError("provider_chatgpt_stream_invalid");
        outputBytes += Buffer.byteLength(event.delta);
        // A byte cap is enforced while streaming; exact provider tokens are checked at terminal usage.
        if (outputBytes > Math.min(131_072, request.maxOutputTokens * 32))
          throw new ChatGptError("provider_chatgpt_output_oversize");
      } else if (event.type === "response.failed" || event.type === "error") {
        throw subscriptionError(
          errorCode(event.type === "response.failed" ? event.response : event),
        );
      } else if (event.type === "response.incomplete") {
        throw new ChatGptError("provider_chatgpt_incomplete", "unknown", "settled");
      } else if (event.type === "response.completed") {
        if (completed) throw new ChatGptError("provider_chatgpt_stream_invalid");
        completed = responseSchema.parse(event.response);
      }
    };
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      bytes += next.value.byteLength;
      if (bytes > (request.maxResponseBytes ?? 524_288))
        throw new ChatGptError("provider_chatgpt_response_oversize");
      buffer += decoder.decode(next.value, { stream: true });
      for (;;) {
        const separator = /\r\n\r\n|\n\n|\r\r/.exec(buffer);
        if (!separator || separator.index === undefined) break;
        const frame = buffer.slice(0, separator.index);
        buffer = buffer.slice(separator.index + separator[0].length);
        onFrame(frame);
      }
      if (buffer.length > 262_144) throw new ChatGptError("provider_chatgpt_event_oversize");
    }
    buffer += decoder.decode();
    if (buffer.trim()) onFrame(buffer);
    if (!completed) throw new ChatGptError("provider_chatgpt_interrupted");
    const usage = {
      inputTokens: completed.usage.input_tokens,
      outputTokens: completed.usage.output_tokens,
    };
    if (usage.outputTokens > request.maxOutputTokens)
      throw new ChatGptError("provider_chatgpt_usage_limit", "configuration", "settled", usage);
    const parts = completed.output.flatMap((item) =>
      item.type === "message" ? (item.content ?? []) : [],
    );
    if (parts.some((part) => part.type === "refusal"))
      throw new ChatGptError("provider_refused", "configuration", "settled", usage);
    const outputText = parts
      .filter((part) => part.type === "output_text")
      .map((part) => part.text ?? "")
      .join("");
    // Terminal-only streams must obey the same output bound as delta streams.
    if (Buffer.byteLength(outputText) > Math.min(131_072, request.maxOutputTokens * 32))
      throw new ChatGptError("provider_chatgpt_output_oversize", "configuration", "settled", usage);
    let output: unknown;
    try {
      output = JSON.parse(outputText);
    } catch {
      throw new ChatGptError("provider_chatgpt_output_invalid", "configuration", "settled", usage);
    }
    return { output, ...usage, billingMode: "chatgpt_subscription" };
  } catch (error) {
    const interrupted = controller.signal.aborted;
    controller.abort();
    if (error instanceof ChatGptError) throw error;
    throw new ChatGptError(
      interrupted ? "provider_chatgpt_interrupted" : "provider_chatgpt_failed",
    );
  } finally {
    clearTimeout(timeout);
    if (reader) {
      await reader.cancel().catch(() => {});
      reader.releaseLock();
    }
  }
}
