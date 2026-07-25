import assert from "node:assert/strict";
import net from "node:net";
import test from "node:test";
import { buildMimeMessage, messageDeliveryConfigFromEnv, sendEmail } from "../lib/message-delivery.mjs";

test("delivery is inert until SMTP is configured", async () => {
  const config = messageDeliveryConfigFromEnv({});
  assert.equal(config.transport, "none");
  const result = await sendEmail({ to: "buyer@example.com", subject: "Hi", text: "Body" }, { config });
  assert.equal(result.delivered, false);
  assert.match(result.reason, /not configured/);
});

test("SMTP config validates port and requires a sender", () => {
  assert.throws(() => messageDeliveryConfigFromEnv({ MS_REALTY_SMTP_HOST: "mail.example.com" }), /MS_REALTY_SMTP_FROM/);
  assert.throws(
    () => messageDeliveryConfigFromEnv({ MS_REALTY_SMTP_HOST: "mail.example.com", MS_REALTY_SMTP_FROM: "a@b.c", MS_REALTY_SMTP_PORT: "0" }),
    /valid port/,
  );
  const config = messageDeliveryConfigFromEnv({
    MS_REALTY_SMTP_HOST: "mail.example.com",
    MS_REALTY_SMTP_FROM: "office@makler-realty.com",
    MS_REALTY_SMTP_PORT: "465",
  });
  assert.equal(config.implicitTls, true, "port 465 is implicit TLS");
});

test("header injection through a vaulted address is rejected", async () => {
  const config = { transport: "smtp", host: "localhost", port: 25, allowPlaintext: true, from: "office@makler-realty.com", timeoutMs: 100 };
  await assert.rejects(
    () => sendEmail({ to: "buyer@example.com\r\nBcc: attacker@evil.example", subject: "x", text: "y" }, { config }),
    /valid email address/,
  );
});

test("non-ASCII subjects are RFC 2047 encoded and the body is dot-stuffed", () => {
  const message = buildMimeMessage({
    from: "office@makler-realty.com",
    to: "buyer@example.com",
    subject: "Оглед на имот",
    text: "Line one\n.hidden\nLine three",
    date: new Date("2026-07-25T10:00:00Z"),
  });
  assert.match(message, /Subject: =\?UTF-8\?B\?/);
  assert.match(message, /\r\n\.\.hidden\r\n/, "a leading dot must be escaped so it cannot end the DATA block");
  assert.match(message, /Content-Type: text\/plain; charset="utf-8"/);
});

test("a reviewed reply reaches a real SMTP conversation", async () => {
  const received = [];
  const server = net.createServer((socket) => {
    socket.write("220 test ESMTP\r\n");
    socket.on("data", (chunk) => {
      const text = chunk.toString("utf8");
      received.push(text);
      for (const line of text.split("\r\n").filter(Boolean)) {
        if (line.startsWith("EHLO")) socket.write("250 ok\r\n");
        else if (line.startsWith("MAIL FROM") || line.startsWith("RCPT TO")) socket.write("250 ok\r\n");
        else if (line === "DATA") socket.write("354 send it\r\n");
        else if (line === ".") socket.write("250 queued\r\n");
        else if (line === "QUIT") socket.write("221 bye\r\n");
      }
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();

  const result = await sendEmail(
    { to: "buyer@example.com", subject: "Reply", text: "Reviewed reply approved by broker." },
    {
      config: {
        transport: "smtp",
        host: "127.0.0.1",
        port,
        implicitTls: false,
        allowPlaintext: true,
        user: null,
        from: "office@makler-realty.com",
        timeoutMs: 4000,
      },
    },
  );

  assert.equal(result.delivered, true);
  assert.equal(result.recipient, "buyer@example.com");
  const transcript = received.join("");
  assert.match(transcript, /MAIL FROM:<office@makler-realty\.com>/);
  assert.match(transcript, /RCPT TO:<buyer@example\.com>/);
  assert.match(transcript, /Reviewed reply approved by broker\./);
  await new Promise((resolve) => server.close(resolve));
});
