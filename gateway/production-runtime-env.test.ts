import { generateKeyPairSync, randomUUID, sign } from "node:crypto";
import { describe, expect, it } from "vitest";
import { productionGrant, productionRuntimeEnvironment } from "./production-runtime-env";

// Ephemeral signing keys and credentials are unit fixtures, not actual approval/custody.
export function productionEnvFixture(): Record<string, string> {
  return {
    STAGING: "false",
    RELEASE_ENVIRONMENT: "production",
    BUILD_SHA: "a".repeat(40),
    IMAGE_DIGEST: `sha256:${"b".repeat(64)}`,
    PRODUCTION_WORKER_NAME: `ms-realty-production-${"a".repeat(12)}`,
    PRODUCTION_INPUTS_SHA256: "c".repeat(64),
    PRODUCTION_SCHEMA_SHA256: "d".repeat(64),
    PRODUCTION_ACCEPTED_REPORT_SHA256: "e".repeat(64),
    PRODUCTION_OWNERSHIP_SHA256: "f".repeat(64),
    PUBLIC_ORIGIN: "https://makler-realty.com",
    CLIENT_ORIGIN: "https://my.makler-realty.com",
    STAFF_ORIGIN: "https://app.makler-realty.com",
    PRODUCTION_DATABASE_HOST: "db.production.msr.invalid",
    PRODUCTION_DATABASE_NAME: "ms_realty_payload",
    PRODUCTION_WEB_DATABASE_ROLE: "msr_web",
    PRODUCTION_WORKER_DATABASE_ROLE: "msr_worker",
    PRODUCTION_MIGRATOR_DATABASE_ROLE: "msr_migrator",
    DATABASE_TRANSPORT: "direct",
    WEB_DATABASE_URL:
      "postgres://msr_web:unit@db.production.msr.invalid/ms_realty_payload?sslmode=verify-full",
    WORKER_DATABASE_URL:
      "postgres://msr_worker:unit@db.production.msr.invalid/ms_realty_payload?sslmode=verify-full",
    MIGRATOR_DATABASE_URL:
      "postgres://msr_migrator:unit@db.production.msr.invalid/ms_realty_payload?sslmode=verify-full",
    AUTH_SECRET: randomUUID(),
    ORIGIN_VERIFY_SECRET: randomUUID(),
    EMAIL_RELAY_SECRET: randomUUID(),
    ACCESS_SERVICE_CLIENT_SECRET: randomUUID(),
    ACCESS_SERVICE_CLIENT_ID: "unit.access",
    EMAIL_FROM: "unit@notifications.makler-realty.com",
    FILE_STORAGE: "r2",
    FILE_SCAN_MODE: "clamav",
    CLAMAV_HOST: "scan.production.msr.invalid",
    R2_BUCKET: "ms-realty-media",
    R2_ACCOUNT_ID: "921d0224dcd595c87b7928d2b3c479d1",
  };
}
describe("production runtime role boundary", () => {
  it("supplies exactly one reviewed TLS database role and no operator/relay secrets to other roles", () => {
    const env: Record<string, string> = {
      ...productionEnvFixture(),
      BUTLER_CHATGPT_OPERATOR_DATABASE_URL: "private-operator-fixture",
      BUTLER_CHATGPT_OPERATOR_DATABASE_ROLE: "operator",
    };
    const web = productionRuntimeEnvironment(env, "web"),
      worker = productionRuntimeEnvironment(env, "worker"),
      migrator = productionRuntimeEnvironment(env, "migrator");
    expect(web.DATABASE_URL).toBe(env.WEB_DATABASE_URL);
    expect(worker.DATABASE_URL).toBe(env.WORKER_DATABASE_URL);
    expect(migrator.DATABASE_URL).toBe(env.MIGRATOR_DATABASE_URL);
    expect(worker.EMAIL_RELAY_URL).toBe("https://app.makler-realty.com/__release/email");
    expect(web.JOB_QUEUE_SCHEMA_PRECREATED).toBe("true");
    expect(worker.JOB_QUEUE_SCHEMA_PRECREATED).toBe("true");
    expect(migrator).not.toHaveProperty("JOB_QUEUE_SCHEMA_PRECREATED");
    for (const role of [web, worker, migrator]) {
      for (const name of [
        "BUILD_SHA",
        "WEB_DATABASE_URL",
        "WORKER_DATABASE_URL",
        "MIGRATOR_DATABASE_URL",
        "BUTLER_CHATGPT_OPERATOR_DATABASE_URL",
        "BUTLER_CHATGPT_OPERATOR_DATABASE_ROLE",
      ])
        expect(role).not.toHaveProperty(name);
      expect(role.EXPECTED_SOURCE_COMMIT).toBe(env.BUILD_SHA);
    }
    for (const role of [web, migrator]) expect(role).not.toHaveProperty("EMAIL_RELAY_SECRET");
    expect(migrator).not.toHaveProperty("AUTH_SECRET");
    expect(worker).not.toHaveProperty("ORIGIN_VERIFY_SECRET");
    expect(web.BUTLER_ENABLED).toBe("0");
    expect(worker.CASE_EMAIL_ENABLED).toBe("0");
  });
  it.each([
    { STAGING: "true" },
    { STAGING: "FALSE" },
    { RELEASE_ENVIRONMENT: "staging" },
    { PRODUCTION_INPUTS_SHA256: "" },
    { PUBLIC_ORIGIN: "https://makler-realty.ru" },
    { PRODUCTION_DATABASE_HOST: "db.staging.invalid" },
    { PRODUCTION_WORKER_DATABASE_ROLE: "msr_web" },
    {
      WEB_DATABASE_URL:
        "postgres://msr_web:unit@db.production.msr.invalid/ms_realty_payload?sslmode=require",
    },
    { DATABASE_TRANSPORT: "" },
    { FILE_SCAN_MODE: "staging-unverified" },
    { BUTLER_ENABLED: "1" },
  ])("rejects ambiguous/staging/unreviewed runtime context %#", (change) =>
    expect(() =>
      productionRuntimeEnvironment({ ...productionEnvFixture(), ...change }, "web"),
    ).toThrow(),
  );
  it("requires a separately configured private production Access companion", () => {
    const env: Record<string, string> = {
      ...productionEnvFixture(),
      DATABASE_TRANSPORT: "cloudflared-access-tcp",
      DATABASE_TLS_CA_PEM: "unit-ca-validated-by-node-transport",
      TUNNEL_SERVICE_HOSTNAME: "db.production.msr.invalid",
      TUNNEL_SERVICE_URL: "127.0.0.1:15432",
      TUNNEL_SERVICE_TOKEN_ID: "unit.access",
      TUNNEL_SERVICE_TOKEN_SECRET: randomUUID(),
    };
    expect(productionRuntimeEnvironment(env, "migrator").TUNNEL_SERVICE_HOSTNAME).toBe(
      env.PRODUCTION_DATABASE_HOST,
    );
    expect(() =>
      productionRuntimeEnvironment({ ...env, TUNNEL_SERVICE_URL: "0.0.0.0:15432" }, "web"),
    ).toThrow();
  });
});
describe("genuine operation-grant verification (ephemeral unit keys only)", () => {
  function fixture() {
    const key = generateKeyPairSync("ed25519"),
      env = productionEnvFixture(),
      now = Date.now();
    env.PRODUCTION_CONTROLLER_PUBLIC_KEY = key.publicKey
      .export({ type: "spki", format: "pem" })
      .toString();
    const grant = {
      schemaVersion: 1,
      purpose: "production-runtime",
      operation: "activate",
      operationId: randomUUID(),
      sourceCommit: env.BUILD_SHA,
      digest: env.IMAGE_DIGEST,
      inputsSha256: env.PRODUCTION_INPUTS_SHA256,
      schemaSha256: env.PRODUCTION_SCHEMA_SHA256,
      acceptedReportSha256: env.PRODUCTION_ACCEPTED_REPORT_SHA256,
      ownershipSha256: env.PRODUCTION_OWNERSHIP_SHA256,
      issuedAt: new Date(now - 1).toISOString(),
      expiresAt: new Date(now + 1000).toISOString(),
    };
    const envelope = (value = grant) => {
      const payload = JSON.stringify(value);
      return {
        payload,
        signature: sign(null, Buffer.from(payload), key.privateKey).toString("base64"),
      };
    };
    return { env, grant, envelope, now };
  }
  it("accepts a fresh exact external signature and rejects unsigned flags, tampering and cross-operation replay", async () => {
    const f = fixture();
    expect((await productionGrant(f.envelope(), "activate", f.env, f.now)).operationId).toBe(
      f.grant.operationId,
    );
    await expect(
      productionGrant({ ...f.envelope(), payload: "{}" }, "activate", f.env, f.now),
    ).rejects.toThrow(/controller-signed/);
    await expect(
      productionGrant({ status: "PASS", armed: true }, "activate", f.env, f.now),
    ).rejects.toThrow();
    await expect(productionGrant(f.envelope(), "migrate", f.env, f.now)).rejects.toThrow();
  });
  it.each([
    "sourceCommit",
    "digest",
    "inputsSha256",
    "schemaSha256",
    "acceptedReportSha256",
    "ownershipSha256",
  ])("rejects a correctly signed grant for another %s", async (field) => {
    const f = fixture();
    await expect(
      productionGrant(
        f.envelope({ ...f.grant, [field]: "different-unit-binding" }),
        "activate",
        f.env,
        f.now,
      ),
    ).rejects.toThrow();
  });
  it("rejects expired/future/overlong grants and unbound feature activation", async () => {
    const f = fixture();
    for (const change of [
      { expiresAt: new Date(f.now).toISOString() },
      { issuedAt: new Date(f.now + 1).toISOString() },
      { expiresAt: new Date(f.now + 600_001).toISOString() },
    ])
      await expect(
        productionGrant(f.envelope({ ...f.grant, ...change }), "activate", f.env, f.now),
      ).rejects.toThrow();
    await expect(
      productionGrant(
        f.envelope(),
        "activate",
        { ...f.env, BUTLER_ENABLED: "1", PRODUCTION_FEATURE_POLICY_SHA256: "a".repeat(64) },
        f.now,
      ),
    ).rejects.toThrow();
  });
  it("permits a specifically signed deactivation through the bounded rollback window", async () => {
    const f = fixture();
    const payload = {
      ...f.grant,
      operation: "deactivate",
      expiresAt: new Date(f.now + 720_000).toISOString(),
    };
    expect((await productionGrant(f.envelope(payload), "deactivate", f.env, f.now)).operation).toBe(
      "deactivate",
    );
    await expect(
      productionGrant(
        f.envelope({ ...payload, expiresAt: new Date(f.now + 900_000).toISOString() }),
        "deactivate",
        f.env,
        f.now,
      ),
    ).rejects.toThrow();
  });
});
