import test from "node:test";
import assert from "node:assert/strict";
import {
  adminCapabilities,
  adminCredentials,
  adminHomePath,
  bindAuthenticatedOperator,
  canAdminAccess,
  canAdminMutate,
  isAdminAuthorized,
  resolveAdminPrincipal,
  withAuthenticatedAuditActor,
} from "../lib/admin-auth.mjs";

const credentialRegistry = JSON.stringify([
  { id: "broker_bg", token: "broker-bg-token-0123456789abcdef", roles: ["broker"] },
  { id: "broker_bg", token: "broker-bg-rotated-token-0123456789", roles: ["broker"] },
  { id: "broker_en", token: "broker-en-token-0123456789abcdef", roles: ["broker"] },
]);

test("individual admin credentials are authoritative and bind a stable operator", () => {
  const env = {
    NODE_ENV: "production",
    MS_REALTY_ADMIN_TOKEN: "legacy-shared-token",
    MS_REALTY_ADMIN_CREDENTIALS_JSON: credentialRegistry,
  };
  const principal = resolveAdminPrincipal("Bearer broker-bg-token-0123456789abcdef", env);

  assert.deepEqual(adminCredentials(env).map((credential) => credential.id), ["broker_bg", "broker_bg", "broker_en"]);
  assert.deepEqual(principal, { id: "broker_bg", source: "credential_registry", can_mutate: true, roles: ["broker"] });
  assert.equal(canAdminMutate(principal), true);
  assert.equal(canAdminAccess(principal, "operations:write"), true);
  assert.equal(canAdminAccess(principal, "translations:write"), false);
  assert.deepEqual(adminCapabilities(principal), ["activity:read", "content:read", "operations:read", "operations:write", "workspace:read"]);
  assert.equal(adminHomePath(principal), "/admin/today");
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

  assert.deepEqual(principal, { id: null, source: "shared_token", can_mutate: false, roles: ["admin"] });
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
    roles: ["admin"],
  });

  const invalidEnv = { ...namedEnv, MS_REALTY_ADMIN_CREDENTIALS_JSON: "not-json" };
  assert.throws(() => adminCredentials(invalidEnv), /must be valid JSON/);
  assert.equal(resolveAdminPrincipal("Bearer single-admin-token", invalidEnv), null);
  assert.equal(isAdminAuthorized("Bearer single-admin-token", invalidEnv), false);

  assert.throws(
    () =>
      adminCredentials({
        MS_REALTY_ADMIN_CREDENTIALS_JSON: JSON.stringify([
          { id: "missing_roles", token: "missing-role-token-0123456789abcdef" },
        ]),
      }),
    /roles must contain one or more/,
  );
  assert.throws(
    () =>
      adminCredentials({
        MS_REALTY_ADMIN_CREDENTIALS_JSON: JSON.stringify([
          { id: "rotating_operator", token: "rotation-one-token-0123456789abcdef", roles: ["broker"] },
          { id: "rotating_operator", token: "rotation-two-token-0123456789abcdef", roles: ["admin"] },
        ]),
      }),
    /must use the same roles/,
  );
});
