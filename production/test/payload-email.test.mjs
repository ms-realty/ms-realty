import assert from "node:assert/strict";
import test from "node:test";

import { cloudflareEmailAdapter, cloudflareEmailConfigFromEnv } from "../lib/payload-email.mjs";

test("the Payload email adapter is off until every edge credential is present, and insists on https", () => {
  assert.equal(cloudflareEmailConfigFromEnv({}), null);
  assert.equal(cloudflareEmailConfigFromEnv({ MS_REALTY_EMAIL_SEND_URL: "https://edge.test/__email/send", MS_REALTY_EMAIL_SEND_SECRET: "s" }), null);
  assert.throws(() => cloudflareEmailConfigFromEnv({ MS_REALTY_EMAIL_SEND_URL: "http://edge.test/__email/send", MS_REALTY_EMAIL_SEND_SECRET: "s", MS_REALTY_EMAIL_FROM: "noreply@makler-realty.com" }), /https/);
  assert.deepEqual(
    cloudflareEmailConfigFromEnv({ MS_REALTY_EMAIL_SEND_URL: "https://edge.test/__email/send", MS_REALTY_EMAIL_SEND_SECRET: "s", MS_REALTY_EMAIL_FROM: "noreply@makler-realty.com" }),
    { url: "https://edge.test/__email/send", secret: "s", from: "noreply@makler-realty.com", fromName: "MS Realty" },
  );
});

test("the adapter posts each Payload message to the edge with the bearer secret and fails loudly on refusal", async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return calls.length === 1
      ? new Response(JSON.stringify({ kind: "email_accepted", message_id: "m1", recipients: 1 }), { status: 202 })
      : new Response(JSON.stringify({ kind: "email_rejected" }), { status: 502 });
  };
  const adapter = cloudflareEmailAdapter({ url: "https://edge.test/__email/send", secret: "s", from: "noreply@makler-realty.com", fromName: "MS Realty" }, { fetchImpl })();
  assert.equal(adapter.name, "cloudflare-email-worker");
  assert.equal(adapter.defaultFromAddress, "noreply@makler-realty.com");
  const result = await adapter.sendEmail({ to: { address: "ms.realty.bg@gmail.com", name: "MS Realty" }, subject: "Reset", text: "link", html: "<a>link</a>" });
  assert.equal(result.message_id, "m1");
  assert.equal(calls[0].init.headers.authorization, "Bearer s");
  assert.deepEqual(JSON.parse(calls[0].init.body), { to: ["ms.realty.bg@gmail.com"], subject: "Reset", text: "link", html: "<a>link</a>" });
  await assert.rejects(adapter.sendEmail({ to: "ms.realty.bg@gmail.com", subject: "Again", text: "x" }), /refused \(502\): email_rejected/);
  await assert.rejects(adapter.sendEmail({ to: [], subject: "None", text: "x" }), /recipient/);
});
