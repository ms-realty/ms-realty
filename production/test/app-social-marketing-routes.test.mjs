import test from "node:test";
import assert from "node:assert/strict";
import { appAdminConfigFromEnv, renderAppAdminResponse } from "../lib/app-admin-adapter.mjs";
import { requiredAdminCapability } from "../lib/admin-auth.mjs";
import { SocialMarketingPublishError } from "../lib/social-marketing-publishing.mjs";

const BEARER = "next-social-token-0123456789";

test("the Next social publish route keeps the admin capability contract and returns typed provider failures", async () => {
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
