import test from "node:test";
import assert from "node:assert/strict";
import {
  adminCredentials,
  bindAuthenticatedOperator,
  canAdminMutate,
  isAdminAuthorized,
  resolveAdminPrincipal,
  withAuthenticatedAuditActor,
} from "../lib/admin-auth.mjs";

const credentialRegistry = JSON.stringify([
  { id: "broker_bg", token: "broker-bg-token-0123456789abcdef" },
  { id: "broker_bg", token: "broker-bg-rotated-token-0123456789" },
  { id: "broker_en", token: "broker-en-token-0123456789abcdef" },
]);

test("individual admin credentials are authoritative and bind a stable operator", () => {
  const env = {
    NODE_ENV: "production",
    MS_REALTY_ADMIN_TOKEN: "legacy-shared-token",
    MS_REALTY_ADMIN_CREDENTIALS_JSON: credentialRegistry,
  };
  const principal = resolveAdminPrincipal("Bearer broker-bg-token-0123456789abcdef", env);

  assert.deepEqual(adminCredentials(env).map((credential) => credential.id), ["broker_bg", "broker_bg", "broker_en"]);
  assert.deepEqual(principal, { id: "broker_bg", source: "credential_registry", can_mutate: true });
  assert.equal(canAdminMutate(principal), true);
  assert.equal(isAdminAuthorized("Bearer legacy-shared-token", env), false);
  assert.equal(resolveAdminPrincipal("Bearer broker-bg-token-0123456789abcdef-extra", env), null);
  assert.deepEqual(bindAuthenticatedOperator({ actor: "broker_bg", action: "complete" }, principal), {
    actor: "broker_bg",
    action: "complete",
  });
  assert.throws(
    () => bindAuthenticatedOperator({ actor: "broker_en", action: "complete" }, principal),
    /must match the authenticated operator/,
  );
  assert.equal(withAuthenticatedAuditActor({ actor: "browser_claim", action: "example" }, principal).actor, "broker_bg");
});

test("a production shared bearer can read but cannot create an attributed mutation", () => {
  const env = { NODE_ENV: "production", MS_REALTY_ADMIN_TOKEN: "legacy-shared-token" };
  const principal = resolveAdminPrincipal("Bearer legacy-shared-token", env);

  assert.deepEqual(principal, { id: null, source: "shared_token", can_mutate: false });
  assert.equal(isAdminAuthorized("Bearer legacy-shared-token", env), true);
  assert.equal(canAdminMutate(principal), false);
});

test("a named single admin token is a migration path, while invalid registry config fails closed", () => {
  const namedEnv = {
    NODE_ENV: "production",
    MS_REALTY_ADMIN_TOKEN: "single-admin-token",
    MS_REALTY_ADMIN_ACTOR: "operations_lead",
  };
  assert.deepEqual(resolveAdminPrincipal("Bearer single-admin-token", namedEnv), {
    id: "operations_lead",
    source: "named_legacy_token",
    can_mutate: true,
  });

  const invalidEnv = { ...namedEnv, MS_REALTY_ADMIN_CREDENTIALS_JSON: "not-json" };
  assert.throws(() => adminCredentials(invalidEnv), /must be valid JSON/);
  assert.equal(resolveAdminPrincipal("Bearer single-admin-token", invalidEnv), null);
  assert.equal(isAdminAuthorized("Bearer single-admin-token", invalidEnv), false);
});
