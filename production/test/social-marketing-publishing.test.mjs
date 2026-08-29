import test from "node:test";
import assert from "node:assert/strict";
import { SocialMarketingPublishError, publishApprovedSocialDraft } from "../lib/social-marketing-publishing.mjs";

const SECRET = "social-marketing-provider-secret-that-is-longer-than-thirty-two-characters";
const CONFIG = {
  credentialSecret: SECRET,
  metaGraphVersion: "v22.0",
  metaFacebookPublishReady: true,
  metaInstagramPublishReady: true,
};

function payloadRuntime() {
  const docs = [];
  return {
    docs,
    async find({ where }) {
      const key = where?.idempotency_key?.equals;
      return { docs: key ? docs.filter((doc) => doc.idempotency_key === key) : [...docs] };
    },
    async create({ data }) {
      if (docs.some((doc) => doc.idempotency_key === data.idempotency_key)) {
        const error = new Error("duplicate idempotency key");
        error.code = "23505";
        throw error;
      }
      const doc = { id: docs.length + 1, ...data };
      docs.push(doc);
      return doc;
    },
    async update({ id, data }) {
      const index = docs.findIndex((doc) => doc.id === id);
      docs[index] = { ...docs[index], ...data };
      return docs[index];
    },
  };
}

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() {
      return JSON.stringify(body);
    },
  };
}

test("Facebook publishing stores one encrypted receipt and replays idempotently without re-posting", async () => {
  const payload = payloadRuntime();
  const calls = [];
  const receipt = await publishApprovedSocialDraft(
    {
      provider: "facebook",
      workspaceId: "ws-sandanski",
      idempotencyKey: "social-facebook-1",
      message: "Approved launch update.",
      link: "https://ms-realty.example/launch",
      approved: true,
      approvedBy: "owner_social",
      approvedAt: "2026-08-29T12:00:00.000Z",
    },
    {
      config: CONFIG,
      payload,
      readCredentials: async () => ({ page_access_token: "meta-page-token", page_id: "100000000001" }),
      fetchImpl: async (url, init = {}) => {
        calls.push({ url: String(url), headers: init.headers, body: String(init.body) });
        return jsonResponse({ id: "100000000001_200000000001" });
      },
      now: () => "2026-08-29T12:05:00.000Z",
    },
  );

  assert.equal(receipt.status, "published");
  assert.equal(receipt.idempotent, false);
  assert.equal(receipt.external_post_id, "100000000001_200000000001");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://graph.facebook.com/v22.0/100000000001/feed");
  assert.match(calls[0].headers.authorization, /^Bearer meta-page-token$/);
  assert.match(calls[0].body, /message=Approved\+launch\+update\./);
  assert.equal(JSON.stringify(payload.docs[0]).includes("Approved launch update."), false);
  assert.equal(JSON.stringify(payload.docs[0]).includes("meta-page-token"), false);

  const replay = await publishApprovedSocialDraft(
    {
      provider: "facebook",
      workspaceId: "ws-sandanski",
      idempotencyKey: "social-facebook-1",
      message: "Approved launch update.",
      link: "https://ms-realty.example/launch",
      approved: true,
      approvedBy: "owner_social",
      approvedAt: "2026-08-29T12:00:00.000Z",
    },
    {
      config: CONFIG,
      payload,
      readCredentials: async () => ({ page_access_token: "meta-page-token", page_id: "100000000001" }),
      fetchImpl: async () => {
        throw new Error("replay must not post again");
      },
      now: () => "2026-08-29T12:06:00.000Z",
    },
  );

  assert.equal(replay.idempotent, true);
  assert.equal(replay.external_post_id, "100000000001_200000000001");
});

test("Instagram uncertain publish is recorded once and refused on retry without echoing provider secrets", async () => {
  const payload = payloadRuntime();
  const calls = [];
  const input = {
    provider: "instagram",
    workspaceId: "ws-sandanski",
    idempotencyKey: "social-instagram-1",
    imageUrl: "https://cdn.ms-realty.example/post.jpg",
    caption: "Approved market snapshot.",
    approved: true,
    approvedBy: "owner_social",
    approvedAt: "2026-08-29T13:00:00.000Z",
  };
  const failure = await publishApprovedSocialDraft(input, {
    config: CONFIG,
    payload,
    readCredentials: async () => ({
      page_access_token: "meta-instagram-page-token",
      instagram_account_id: "178414000001",
    }),
    fetchImpl: async (url) => {
      const requestUrl = String(url);
      calls.push(requestUrl);
      if (requestUrl.endsWith("/media")) return jsonResponse({ id: "creation-1" });
      return {
        ok: false,
        status: 500,
        async text() {
          return JSON.stringify({ error: { message: "meta-instagram-page-token" } });
        },
      };
    },
    now: () => "2026-08-29T13:05:00.000Z",
  }).catch((error) => error);

  assert.ok(failure instanceof SocialMarketingPublishError);
  assert.equal(failure.code, "social_marketing_uncertain");
  assert.equal(failure.receipt.status, "uncertain");
  assert.equal(JSON.stringify(failure).includes("meta-instagram-page-token"), false);
  assert.equal(JSON.stringify(payload.docs[0]).includes("meta-instagram-page-token"), false);
  assert.equal(calls.length, 2);

  const retry = await publishApprovedSocialDraft(input, {
    config: CONFIG,
    payload,
    readCredentials: async () => ({
      page_access_token: "meta-instagram-page-token",
      instagram_account_id: "178414000001",
    }),
    fetchImpl: async () => {
      throw new Error("uncertain retry must not publish again");
    },
    now: () => "2026-08-29T13:06:00.000Z",
  }).catch((error) => error);

  assert.ok(retry instanceof SocialMarketingPublishError);
  assert.equal(retry.code, "social_marketing_uncertain");
  assert.equal(retry.receipt.idempotent, true);
});
