import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { readAuditLog } from "../lib/audit-log.mjs";
import { createHttpApp, dispatchHttp } from "../lib/http.mjs";

const SESSION_TOKEN = "payload.social.session";
const APPROVED_AT = "2026-08-29T14:00:00.000Z";

function auditFile(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ms-realty-http-social-marketing-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const filePath = path.join(directory, "audit.jsonl");
  fs.writeFileSync(filePath, "");
  return filePath;
}

function payloadAdminAuth(principal = {
  id: "payload-social-admin",
  source: "payload_session",
  can_mutate: true,
  roles: ["admin"],
  workspace_ids: ["ws-sandanski"],
}) {
  return {
    async resolve(token) {
      return token === SESSION_TOKEN ? { principal, user: { id: 1 } } : null;
    },
  };
}

function sessionHeaders() {
  return {
    cookie: `ms_admin=${SESSION_TOKEN}`,
    host: "ms-realty.example",
    origin: "https://ms-realty.example",
    "sec-fetch-site": "same-origin",
    "content-type": "application/json",
  };
}

test("standalone social publish binds approval to the authenticated operator and records a safe audit row", async (t) => {
  const auditLogPath = auditFile(t);
  const calls = [];
  const app = createHttpApp({
    auditLogPath,
    reviewedAt: APPROVED_AT,
    payloadAdminAuth: payloadAdminAuth(),
    publishApprovedSocialDraft: async (input, options) => {
      calls.push({ input, options });
      return {
        idempotency_key: input.idempotencyKey,
        workspace_id: input.workspaceId,
        provider: input.provider,
        status: "published",
        external_post_id: "100000000001_200000000001",
        external_account_id: "100000000001",
        started_at: APPROVED_AT,
        completed_at: APPROVED_AT,
        idempotent: false,
      };
    },
  });

  const response = await dispatchHttp(app, {
    method: "POST",
    url: "/api/admin/social-marketing/publish",
    headers: sessionHeaders(),
    body: {
      provider: "facebook",
      workspaceId: "ws-sandanski",
      idempotencyKey: "social-http-facebook-1",
      message: "Approved owner copy.",
      link: "https://ms-realty.example/post",
      approved: true,
      approvedBy: "spoofed-reviewer",
      approvedAt: "2000-01-01T00:00:00.000Z",
    },
  });

  assert.equal(response.status, 400);
  assert.match(response.body.message, /approvedBy must match the authenticated operator/);
  assert.equal(calls.length, 0);

  const accepted = await dispatchHttp(app, {
    method: "POST",
    url: "/api/admin/social-marketing/publish",
    headers: sessionHeaders(),
    body: {
      provider: "facebook",
      workspaceId: "ws-sandanski",
      idempotencyKey: "social-http-facebook-1",
      message: "Approved owner copy.",
      link: "https://ms-realty.example/post",
      approved: true,
    },
  });

  assert.equal(accepted.status, 201);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].input.approvedBy, "payload-social-admin");
  assert.equal(calls[0].input.approvedAt, APPROVED_AT);
  assert.equal(calls[0].input.workspaceId, "ws-sandanski");
  assert.equal(calls[0].options.fetchImpl, globalThis.fetch);
  assert.equal(accepted.body.publication.external_post_id, "100000000001_200000000001");

  const auditRows = readAuditLog(auditLogPath);
  assert.equal(auditRows.length, 1);
  assert.equal(auditRows[0].action, "social_marketing_published");
  assert.equal(auditRows[0].actor, "payload-social-admin");
  const serialized = JSON.stringify(auditRows);
  assert.doesNotMatch(serialized, /Approved owner copy\./);
  assert.doesNotMatch(serialized, /https:\/\/ms-realty\.example\/post/);
});

test("standalone social publish rejects a workspace outside the operator scope", async () => {
  let called = false;
  const app = createHttpApp({
    reviewedAt: APPROVED_AT,
    payloadAdminAuth: payloadAdminAuth({
      id: "payload-social-editor",
      source: "payload_session",
      can_mutate: true,
      roles: ["editor"],
      workspace_ids: ["ws-owned"],
    }),
    publishApprovedSocialDraft: async () => {
      called = true;
      throw new Error("must not be called");
    },
  });

  const response = await dispatchHttp(app, {
    method: "POST",
    url: "/api/admin/social-marketing/publish",
    headers: sessionHeaders(),
    body: {
      provider: "instagram",
      workspaceId: "ws-other",
      idempotencyKey: "social-http-instagram-1",
      imageUrl: "https://cdn.ms-realty.example/post.jpg",
      caption: "Approved caption.",
      approved: true,
    },
  });

  assert.equal(response.status, 403);
  assert.equal(response.body.kind, "forbidden");
  assert.equal(response.body.required_capability, "content:write");
  assert.equal(called, false);
});
