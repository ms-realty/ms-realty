import { secretMatches } from "./durable-case-authority.mjs";

// Outbound mail leaves through the edge, never through the origin container:
// Cloudflare Email Workers deliver from a verified sender on the zone, and the
// container only holds a credential for this one endpoint. The boundary
// builds the RFC 5322 message itself so the Worker bundle carries no mail
// library.
export const EMAIL_SEND_PATH = "/__email/send";
const MAX_BODY_BYTES = 256 * 1024;
const MAX_RECIPIENTS = 5;
const ADDRESS = /^[^\s@<>,;"']+@[^\s@<>,;"']+\.[^\s@<>,;"']+$/;
// eslint-disable-next-line no-control-regex -- header injection is the whole point
const HEADER_UNSAFE = /[\u0000-\u001f\u007f]/;

function json(status, body) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
}

function addressList(value) {
  const rows = (Array.isArray(value) ? value : [value]).map((row) => (row && typeof row === "object" ? row.address : row));
  const list = rows.map((row) => String(row || "").trim()).filter(Boolean);
  if (!list.length || list.length > MAX_RECIPIENTS || !list.every((row) => ADDRESS.test(row))) return null;
  return list;
}

function encodeHeaderText(value) {
  const text = String(value || "").trim();
  if (!text || HEADER_UNSAFE.test(text)) return null;
  // eslint-disable-next-line no-control-regex -- ASCII check for the encoded-word decision
  return /^[ -~]*$/.test(text) ? text : `=?UTF-8?B?${btoa(Array.from(new TextEncoder().encode(text), (byte) => String.fromCharCode(byte)).join(""))}?=`;
}

function base64Lines(text) {
  const encoded = btoa(Array.from(new TextEncoder().encode(text), (byte) => String.fromCharCode(byte)).join(""));
  return encoded.replace(/(.{76})/g, "$1\r\n");
}

export function buildMimeMessage({ from, fromName, to, subject, text, html, messageId, date = new Date() }) {
  const encodedSubject = encodeHeaderText(subject);
  const encodedFromName = fromName ? encodeHeaderText(fromName) : "";
  if (!encodedSubject || (fromName && !encodedFromName)) throw new Error("subject and sender name must be single-line text");
  const boundary = `msr-${messageId.replace(/[^a-z0-9]/gi, "").slice(0, 24)}`;
  const headers = [
    `From: ${encodedFromName ? `${encodedFromName} <${from}>` : from}`,
    `To: ${to.join(", ")}`,
    `Subject: ${encodedSubject}`,
    `Date: ${date.toUTCString()}`,
    `Message-ID: <${messageId}@${from.split("@")[1]}>`,
    "MIME-Version: 1.0",
  ];
  const part = (type, body) => `Content-Type: ${type}; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${base64Lines(body)}`;
  if (!html) return `${headers.join("\r\n")}\r\n${part("text/plain", text)}\r\n`;
  return [
    ...headers,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    part("text/plain", text),
    `--${boundary}`,
    part("text/html", html),
    `--${boundary}--`,
    "",
  ].join("\r\n");
}

export async function sendEmail(request, env, { EmailMessage } = {}) {
  const expected = env.MS_REALTY_EMAIL_SEND_SECRET || "";
  const from = String(env.MS_REALTY_EMAIL_FROM || "").trim();
  if (!expected || !ADDRESS.test(from) || !env.EMAIL || !EmailMessage) return new Response("Not found", { status: 404 });
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405, headers: { allow: "POST" } });
  const presented = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!presented || !(await secretMatches(presented, expected))) return new Response("Unauthorized", { status: 401 });
  if (Number(request.headers.get("content-length") || 0) > MAX_BODY_BYTES) return json(413, { kind: "email_too_large" });

  let body;
  try {
    const reader = request.body?.getReader();
    if (!reader) return json(400, { kind: "email_invalid" });
    const chunks = [];
    let size = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) {
        await reader.cancel();
        return json(413, { kind: "email_too_large" });
      }
      chunks.push(value);
    }
    body = JSON.parse(await new Blob(chunks).text());
  } catch {
    return json(400, { kind: "email_invalid" });
  }
  const to = addressList(body?.to);
  const text = String(body?.text || "").trim();
  const html = body?.html ? String(body.html) : "";
  if (!to || (!text && !html.trim()) || text.length > MAX_BODY_BYTES || html.length > MAX_BODY_BYTES) return json(400, { kind: "email_invalid" });

  const messageId = crypto.randomUUID();
  let raw;
  try {
    raw = buildMimeMessage({ from, fromName: env.MS_REALTY_EMAIL_FROM_NAME || "", to, subject: body.subject, text, html, messageId });
  } catch {
    return json(400, { kind: "email_invalid" });
  }
  // One message per recipient: Email Workers address a single envelope recipient.
  for (const recipient of to) {
    try {
      await env.EMAIL.send(new EmailMessage(from, recipient, raw));
    } catch (error) {
      return json(502, { kind: "email_rejected", recipient, message: String(error?.message || error) });
    }
  }
  return json(202, { kind: "email_accepted", message_id: messageId, recipients: to.length });
}
