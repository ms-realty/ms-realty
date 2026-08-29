import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { appAdminConfigFromEnv, renderAppAdminResponse } from "../lib/app-admin-adapter.mjs";
import { requiredAdminCapability } from "../lib/admin-auth.mjs";
import { readAuditLog } from "../lib/audit-log.mjs";
import { SocialMarketingPublishError } from "../lib/social-marketing-publishing.mjs";
import * as socialMarketingRoute from "../../app/api/admin/social-marketing/publish/route.js";

const BEARER = "next-social-token-0123456789";

test("the Next social publish route keeps the admin capability contract and returns typed provider failures", async () => {
  assert.equal(typeof socialMarketingRoute.POST, "function");
  assert.equal(requiredAdminCapability("POST", "/api/admin/social-marketing/publish"), "content:write");

  const response = await renderAppAdminResponse(
    new Request("https://example.test/api/admin/social-marketing/publish", {
      method: "POST",
      headers: {
        authorization: `Bearer ${BEARER}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        provider: "instagram",
        workspaceId: "ws-sandanski",
        idempotencyKey: "social-next-instagram-1",
        imageUrl: "https://cdn.ms-realty.example/post.jpg",
        caption: "Approved caption.",
        approved: true,
      }),
    }),
    {
      config: {
        ...appAdminConfigFromEnv({ NODE_ENV: "test" }),
        authEnv: {
          NODE_ENV: "production",
          MS_REALTY_ADMIN_CREDENTIALS_JSON: JSON.stringify([
            { id: "next_social_editor", token: BEARER, roles: ["editor"], workspace_ids: ["ws-sandanski"] },
          ]),
        },
        publishApprovedSocialDraft: async () => {
          throw new SocialMarketingPublishError("Instagram rejected the publish request", {
            code: "social_marketing_provider_rejected",
            receipt: {
              idempotency_key: "social-next-instagram-1",
              workspace_id: "ws-sandanski",
              provider: "instagram",
              status: "failed",
              external_post_id: null,
              external_account_id: "178414000001",
              started_at: "2026-08-29T15:00:00.000Z",
              completed_at: "2026-08-29T15:00:05.000Z",
              idempotent: false,
            },
          });
        },
      },
    },
  );

  assert.equal(response.status, 502);
  const body = await response.json();
  assert.equal(body.kind, "social_marketing_provider_rejected");
  assert.equal(body.receipt.provider, "instagram");
  assert.equal(body.receipt.external_account_id, "178414000001");
});

test("the Next social publish route records one audit event across an idempotent replay", async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ms-realty-app-social-marketing-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const auditLogPath = path.join(directory, "audit.jsonl");
  fs.writeFileSync(auditLogPath, "");
  let calls = 0;
  const config = {
    ...appAdminConfigFromEnv({ NODE_ENV: "test" }),
    auditLogPath,
    reviewedAt: "2026-08-29T15:00:00.000Z",
    authEnv: {
      NODE_ENV: "production",
      MS_REALTY_ADMIN_CREDENTIALS_JSON: JSON.stringify([
        { id: "next_social_editor", token: BEARER, roles: ["editor"], workspace_ids: ["ws-sandanski"] },
      ]),
    },
    publishApprovedSocialDraft: async (input) => ({
      idempotency_key: input.idempotencyKey,
      workspace_id: input.workspaceId,
      provider: input.provider,
      status: "published",
      external_post_id: "100000000001_200000000001",
      external_account_id: "100000000001",
      started_at: "2026-08-29T15:00:00.000Z",
      completed_at: "2026-08-29T15:00:01.000Z",
      idempotent: calls++ > 0,
    }),
  };
  const request = () =>
    new Request("https://example.test/api/admin/social-marketing/publish", {
      method: "POST",
      headers: { authorization: `Bearer ${BEARER}`, "content-type": "application/json" },
      body: JSON.stringify({
        provider: "facebook",
        workspaceId: "ws-sandanski",
        idempotencyKey: "social-next-facebook-1",
        message: "Approved owner copy.",
        approved: true,
      }),
    });

  assert.equal((await renderAppAdminResponse(request(), { config })).status, 201);
  assert.equal((await renderAppAdminResponse(request(), { config })).status, 200);
  const rows = readAuditLog(auditLogPath);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].action, "social_marketing_published");
  assert.equal(rows[0].object_id, "social-next-facebook-1");
});
