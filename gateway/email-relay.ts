/** Private Cloudflare binding relay. Accepted is never reported as delivered. */
export interface RelayStore {
  get<T>(key: string): Promise<T | undefined>;
  put(key: string, value: unknown): Promise<void>;
}
export interface RelayEmail {
  from: string;
  to: string[];
  subject: string;
  text: string;
  reply_to?: string;
}
export interface RelayEnv {
  EMAIL_FROM: string;
  EMAIL_ALLOWED_RECIPIENTS: string;
  EMAIL_REPLY_DOMAIN?: string;
  EMAIL: {
    send(
      message: Omit<RelayEmail, "reply_to"> & { replyTo?: string },
    ): Promise<{ messageId: string }>;
  };
}
type Receipt = { hash: string; status: "pending" | "unknown" | "accepted"; messageId?: string };
const reply = (status: number, body: unknown) =>
  Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" },
  });
export async function relayEmail(
  request: Request,
  env: RelayEnv,
  store: RelayStore,
): Promise<Response> {
  const key = request.headers.get("idempotency-key");
  if (!key || key.length > 256 || /[\r\n]/.test(key)) return reply(400, { code: "invalid_key" });
  const stored = await store.get<Receipt>("receipt");
  if (request.method === "GET")
    return stored?.status === "accepted"
      ? reply(200, { status: "accepted", messageId: stored.messageId })
      : reply(stored ? 409 : 404, { status: stored?.status ?? "absent" });
  if (request.method !== "POST") return reply(405, { code: "method_not_allowed" });
  const reader = request.body?.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  if (reader)
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > 65536) {
        await reader.cancel();
        return reply(413, { code: "message_too_large" });
      }
      chunks.push(value);
    }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  let body: string;
  try {
    body = new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes);
  } catch {
    return reply(422, { code: "message_not_allowed" });
  }
  let message: RelayEmail, allowed: unknown;
  try {
    message = JSON.parse(body);
    allowed = JSON.parse(env.EMAIL_ALLOWED_RECIPIENTS);
    if (
      !message ||
      Object.keys(message).some(
        (k) => !["from", "to", "subject", "text", "reply_to"].includes(k),
      ) ||
      message.from !== env.EMAIL_FROM ||
      !Array.isArray(message.to) ||
      message.to.length !== 1 ||
      !Array.isArray(allowed) ||
      !allowed.includes(message.to[0]) ||
      !/^[^\s@\r\n]+@[^\s@\r\n]+$/.test(message.to[0] ?? "") ||
      typeof message.subject !== "string" ||
      !message.subject ||
      message.subject.length > 500 ||
      /[\r\n]/.test(message.subject) ||
      typeof message.text !== "string" ||
      !message.text ||
      (message.reply_to !== undefined &&
        (typeof message.reply_to !== "string" ||
          !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}$/.test(
            env.EMAIL_REPLY_DOMAIN ?? "",
          ) ||
          !new RegExp(`^m-[a-f0-9]{40}@${env.EMAIL_REPLY_DOMAIN?.replaceAll(".", "\\.")}$`).test(
            message.reply_to,
          )))
    )
      return reply(422, { code: "message_not_allowed" });
  } catch {
    return reply(422, { code: "message_not_allowed" });
  }
  const hash = [
    ...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(body))),
  ]
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
  if (stored) {
    if (stored.hash !== hash) return reply(409, { code: "idempotency_conflict" });
    return stored.status === "accepted"
      ? reply(200, { status: "accepted", messageId: stored.messageId })
      : reply(409, { status: stored.status });
  }
  // Persist uncertainty before the provider call. A crash/timeout cannot cause a blind retry.
  await store.put("receipt", { hash, status: "pending" });
  try {
    const { reply_to, ...mail } = message;
    const result = await env.EMAIL.send({ ...mail, ...(reply_to ? { replyTo: reply_to } : {}) });
    if (!result || typeof result.messageId !== "string" || !result.messageId)
      throw new Error("Uncertain acceptance");
    await store.put("receipt", { hash, status: "accepted", messageId: result.messageId });
    return reply(200, { status: "accepted", messageId: result.messageId });
  } catch {
    await store.put("receipt", { hash, status: "unknown" });
    return reply(409, { status: "unknown" });
  }
}
