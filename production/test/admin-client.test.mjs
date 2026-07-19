import test from "node:test";
import assert from "node:assert/strict";
import { ADMIN_APP_JS } from "../lib/ui/client.mjs";

test("admin reply client submits broker-only drafts and reviewed replies as JSON", () => {
  assert.match(ADMIN_APP_JS, /function initReplyForms\(\)/);
  assert.match(ADMIN_APP_JS, /data-hermes-draft-request/);
  assert.match(ADMIN_APP_JS, /data-reply-approval-required/);
  assert.match(ADMIN_APP_JS, /function submitReplyJson\(form, payload\)/);
  assert.match(ADMIN_APP_JS, /"content-type": "application\/json"/);
  assert.match(ADMIN_APP_JS, /result\.broker_approval_required !== true/);
  assert.match(ADMIN_APP_JS, /result\.can_send_without_approval === true/);
  assert.match(ADMIN_APP_JS, /result\.status !== "queued_for_manual_send"/);
  assert.match(ADMIN_APP_JS, /leadRow\.setAttribute\("data-lead-replied", "false"\)/);
  assert.match(ADMIN_APP_JS, /leadRow\.setAttribute\("data-reply-queue-status", "queued"\)/);
  assert.match(ADMIN_APP_JS, /function initReplyDeliveryForms\(\)/);
  assert.match(ADMIN_APP_JS, /data-reply-delivery-form/);
  assert.match(ADMIN_APP_JS, /result\.delivery\.status/);
  assert.match(ADMIN_APP_JS, /function initLeadPipelineFilters\(\)/);
  assert.match(ADMIN_APP_JS, /data-pipeline-card/);
  assert.match(ADMIN_APP_JS, /function initAdminMutationForms\(\)/);
  assert.match(ADMIN_APP_JS, /data-admin-mutation-form/);
});
