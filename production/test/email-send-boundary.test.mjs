import assert from "node:assert/strict";
import test from "node:test";

import { buildMimeMessage, sendEmail } from "../../workers/email-send-boundary.mjs";

const SECRET = "email-send-test-secret";

class FakeEmailMessage {
  constructor(from, to, raw) {
    this.from = from;
    this.to = to;
    this.raw = raw;
  }
}

function harness({ reject = false } = {}) {
  const sent = [];
  return {
    sent,
    env: {
      MS_REALTY_EMAIL_SEND_SECRET: SECRET,
      MS_REALTY_EMAIL_FROM: "noreply@makler-realty.com",
      MS_REALTY_EMAIL_FROM_NAME: "MS Realty",
      EMAIL: {
        async send(message) {
          if (reject) throw new Error("destination address not verified");
          sent.push(message);
        },
      },
    },
  };
}

function request(body, { authorized = true, method = "POST" } = {}) {
  const headers = new Headers({ "content-type": "application/json" });
  if (authorized) headers.set("authorization", `Bearer ${SECRET}`);
  return new Request("https://edge.test/__email/send", { method, headers, body: body === undefined ? null : JSON.stringify(body) });
}

const message = { to: "ms.realty.bg@gmail.com", subject: "Нова заявка · MS-CRAWL-0002", text: "Здравейте,\nнова заявка.", html: "<p>Здравейте,<br>нова заявка.</p>" };

test("the email boundary is invisible without its credential and sender, and refuses bad callers", async () => {
  const { env } = harness();
  assert.equal((await sendEmail(request(message), { ...env, MS_REALTY_EMAIL_SEND_SECRET: "" }, { EmailMessage: FakeEmailMessage })).status, 404);
  assert.equal((await sendEmail(request(message), { ...env, MS_REALTY_EMAIL_FROM: "not-an-address" }, { EmailMessage: FakeEmailMessage })).status, 404);
  assert.equal((await sendEmail(request(message), env, {})).status, 404);
  assert.equal((await sendEmail(request(message, { authorized: false }), env, { EmailMessage: FakeEmailMessage })).status, 401);
  assert.equal((await sendEmail(request(undefined, { method: "GET" }), env, { EmailMessage: FakeEmailMessage })).status, 405);
  assert.equal((await sendEmail(request({ ...message, to: "nobody" }), env, { EmailMessage: FakeEmailMessage })).status, 400);
  assert.equal((await sendEmail(request({ ...message, subject: "Split\r\nBcc: x@y.z" }), env, { EmailMessage: FakeEmailMessage })).status, 400);
  assert.equal((await sendEmail(request({ ...message, text: "", html: "" }), env, { EmailMessage: FakeEmailMessage })).status, 400);
});

test("an accepted message is one RFC 5322 envelope per recipient with UTF-8 encoded parts", async () => {
  const { env, sent } = harness();
  const response = await sendEmail(request({ ...message, to: [message.to, { address: "second@example.test" }] }), env, { EmailMessage: FakeEmailMessage });
  assert.equal(response.status, 202);
  const body = await response.json();
  assert.equal(body.kind, "email_accepted");
  assert.equal(body.recipients, 2);
  assert.equal(sent.length, 2);
  assert.equal(sent[0].from, "noreply@makler-realty.com");
  assert.equal(sent[0].to, "ms.realty.bg@gmail.com");
  assert.equal(sent[1].to, "second@example.test");
  const raw = sent[0].raw;
  assert.match(raw, /^From: MS Realty <noreply@makler-realty\.com>\r\n/);
  assert.match(raw, /\r\nTo: ms\.realty\.bg@gmail\.com, second@example\.test\r\n/);
  assert.match(raw, /\r\nSubject: =\?UTF-8\?B\?[A-Za-z0-9+/=]+\?=\r\n/);
  assert.match(raw, /\r\nMessage-ID: <[0-9a-f-]+@makler-realty\.com>\r\n/);
  assert.match(raw, /Content-Type: multipart\/alternative; boundary="msr-[a-z0-9]+"/);
  assert.match(raw, /Content-Type: text\/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64/);
  assert.match(raw, /Content-Type: text\/html; charset=UTF-8/);
  const plain = raw.split("Content-Transfer-Encoding: base64\r\n\r\n")[1].split("\r\n--")[0].replace(/\r\n/g, "");
  assert.equal(Buffer.from(plain, "base64").toString("utf8"), message.text);
});

test("a plain-text message has no multipart wrapper and a refused envelope surfaces as 502", async () => {
  const raw = buildMimeMessage({ from: "noreply@makler-realty.com", fromName: "", to: ["ms.realty.bg@gmail.com"], subject: "Plain", text: "hello", html: "", messageId: "abc-123" });
  assert.doesNotMatch(raw, /multipart/);
  assert.match(raw, /^From: noreply@makler-realty\.com\r\n/);
  const { env } = harness({ reject: true });
  const response = await sendEmail(request(message), env, { EmailMessage: FakeEmailMessage });
  assert.equal(response.status, 502);
  assert.equal((await response.json()).kind, "email_rejected");
});


test("HTML-only Payload mail and large UTF-8 bodies work; unbounded bodies are rejected", async () => {
  const { env, sent } = harness();
  assert.equal((await sendEmail(request({ ...message, text: "", html: "<p>Reset link</p>" }), env, { EmailMessage: FakeEmailMessage })).status, 202);
  const text = "я".repeat(80000);
  assert.equal((await sendEmail(request({ ...message, text, html: "" }), env, { EmailMessage: FakeEmailMessage })).status, 202);
  const encoded = sent[1].raw.split("Content-Transfer-Encoding: base64\r\n\r\n")[1].replace(/\r\n/g, "");
  assert.equal(Buffer.from(encoded, "base64").toString("utf8"), text);
  assert.equal((await sendEmail(request({ ...message, text: "я".repeat(140000) }), env, { EmailMessage: FakeEmailMessage })).status, 413);
  assert.equal(sent.length, 2);
});
