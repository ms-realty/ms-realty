import net from "node:net";
import tls from "node:tls";

// Outbound message delivery.
//
// Until now every customer-facing message was copy-pasted by a broker and the
// result logged by hand, so "instant confirmation", saved-search alerts, and
// SLA escalations existed only as reports. This is the seam that closes that
// gap without adding a dependency: a minimal SMTP submission client plus a
// null transport for local/test runs.
//
// ponytail: SMTP over an explicit TLS/STARTTLS socket, AUTH LOGIN/PLAIN only,
// one message per connection. Swap in a provider SDK if bounce handling,
// templating, or throughput ever justify it.
//
// Deliberately NOT auto-sending anything a human must approve: this module is
// called only after a broker/editor has approved the content.

const DEFAULT_TIMEOUT_MS = 15_000;

export function messageDeliveryConfigFromEnv(env = process.env) {
  const host = String(env.MS_REALTY_SMTP_HOST || "").trim();
  if (!host) return { transport: "none", reason: "MS_REALTY_SMTP_HOST is not configured" };
  const port = Number(env.MS_REALTY_SMTP_PORT || 587);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("MS_REALTY_SMTP_PORT must be a valid port");
  const from = String(env.MS_REALTY_SMTP_FROM || "").trim();
  if (!from) throw new Error("MS_REALTY_SMTP_FROM is required when SMTP is configured");
  return {
    transport: "smtp",
    host,
    port,
    // Port 465 is implicit TLS; 587/25 negotiate STARTTLS. Plaintext is only
    // for an explicitly opted-in loopback relay (e.g. a local postfix).
    implicitTls: env.MS_REALTY_SMTP_IMPLICIT_TLS === "1" || port === 465,
    allowPlaintext: env.MS_REALTY_SMTP_ALLOW_PLAINTEXT === "1",
    user: String(env.MS_REALTY_SMTP_USER || "").trim() || null,
    password: env.MS_REALTY_SMTP_PASSWORD || null,
    from,
    timeoutMs: Number(env.MS_REALTY_SMTP_TIMEOUT_MS || DEFAULT_TIMEOUT_MS),
  };
}

function encodeHeaderValue(value) {
  const text = String(value || "").replace(/[\r\n]+/g, " ").trim();
  // RFC 2047 for anything outside ASCII (Cyrillic/Greek/Hebrew subjects).
  return /^[\x20-\x7E]*$/.test(text) ? text : `=?UTF-8?B?${Buffer.from(text, "utf8").toString("base64")}?=`;
}

function assertAddress(value, label) {
  const address = String(value || "").trim();
  // Reject CR/LF outright: header injection is the one thing that must not slip
  // through when the address comes from a contact vault.
  if (!address || /[\r\n]/.test(address) || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(address)) {
    throw new Error(`${label} must be a valid email address`);
  }
  return address;
}

export function buildMimeMessage({ from, to, subject, text, replyTo = null, date = new Date() }) {
  const body = String(text || "").replace(/\r?\n/g, "\r\n").replace(/^\./gm, "..");
  const headers = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${encodeHeaderValue(subject)}`,
    `Date: ${date.toUTCString()}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="utf-8"',
    "Content-Transfer-Encoding: 8bit",
  ];
  if (replyTo) headers.push(`Reply-To: ${replyTo}`);
  return `${headers.join("\r\n")}\r\n\r\n${body}\r\n`;
}

function smtpConversation(socket, commands, timeoutMs) {
  return new Promise((resolve, reject) => {
    let buffer = "";
    let index = -1;
    const transcript = [];
    const timer = setTimeout(() => reject(new Error("SMTP timeout")), timeoutMs);
    const finish = (error, value) => {
      clearTimeout(timer);
      socket.removeAllListeners("data");
      socket.removeAllListeners("error");
      error ? reject(error) : resolve(value);
    };

    const next = () => {
      index += 1;
      if (index >= commands.length) return finish(null, transcript);
      socket.write(`${commands[index]}\r\n`);
    };

    socket.on("error", (error) => finish(error));
    socket.on("data", (chunk) => {
      buffer += chunk.toString("utf8");
      // A reply ends on a line whose 4th character is a space, not a hyphen.
      const match = buffer.match(/^(\d{3})[ ][^\r\n]*\r\n$/m);
      if (!match) return;
      const code = Number(match[1]);
      transcript.push({ command: index >= 0 ? commands[index].split(" ")[0] : "GREETING", code });
      buffer = "";
      if (code >= 400) return finish(new Error(`SMTP rejected ${transcript.at(-1).command} with ${code}`));
      next();
    });
  });
}

function awaitOnce(emitter, event, timeoutMs, label) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`SMTP ${label} timed out`)), timeoutMs);
    emitter.once(event, () => {
      clearTimeout(timer);
      resolve();
    });
    emitter.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

async function connect(config) {
  const options = { host: config.host, port: config.port };
  const socket = config.implicitTls ? tls.connect({ ...options, servername: config.host }) : net.connect(options);
  socket.setTimeout(config.timeoutMs);
  await awaitOnce(socket, config.implicitTls ? "secureConnect" : "connect", config.timeoutMs, "connect");
  return socket;
}

export async function sendEmail({ to, subject, text, replyTo = null }, { config = messageDeliveryConfigFromEnv(), now = () => new Date() } = {}) {
  const recipient = assertAddress(to, "Recipient");
  if (config.transport !== "smtp") {
    return { delivered: false, transport: config.transport, reason: config.reason || "delivery transport is not configured" };
  }
  const sender = assertAddress(config.from, "MS_REALTY_SMTP_FROM");
  const message = buildMimeMessage({ from: sender, to: recipient, subject, text, replyTo, date: now() });

  const socket = await connect(config);
  try {
    const auth = config.user
      ? ["AUTH LOGIN", Buffer.from(config.user).toString("base64"), Buffer.from(String(config.password || "")).toString("base64")]
      : [];
    if (!config.implicitTls && !config.allowPlaintext) {
      await smtpConversation(socket, [`EHLO ${config.host}`, "STARTTLS"], config.timeoutMs);
      const secure = tls.connect({ socket, servername: config.host });
      await awaitOnce(secure, "secureConnect", config.timeoutMs, "STARTTLS");
      await smtpConversation(
        secure,
        [`EHLO ${config.host}`, ...auth, `MAIL FROM:<${sender}>`, `RCPT TO:<${recipient}>`, "DATA", `${message}.`, "QUIT"],
        config.timeoutMs,
      );
      secure.end();
      return { delivered: true, transport: "smtp", recipient };
    }
    await smtpConversation(
      socket,
      [`EHLO ${config.host}`, ...auth, `MAIL FROM:<${sender}>`, `RCPT TO:<${recipient}>`, "DATA", `${message}.`, "QUIT"],
      config.timeoutMs,
    );
    return { delivered: true, transport: "smtp", recipient };
  } finally {
    socket.end();
  }
}
