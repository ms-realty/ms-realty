import { describe, expect, it } from "vitest";
import { runtimeEnvironment } from "./runtime-env";

describe("Staging image role isolation", () => {
  it("never supplies another database role or relay credentials to web/migration", () => {
    const ephemeral = () => crypto.randomUUID();
    const env = {
      STAGING: "true",
      BUILD_SHA: "a".repeat(40),
      PUBLIC_ORIGIN: "https://staging.makler-realty.com",
      AUTH_SECRET: ephemeral(),
      WEB_DATABASE_URL: "postgres://web:fixture@db.invalid/msr_stage?sslmode=verify-full",
      WORKER_DATABASE_URL: "postgres://worker:fixture@db.invalid/msr_stage?sslmode=verify-full",
      MIGRATOR_DATABASE_URL:
        "postgres://migration:fixture@db.invalid/msr_stage?sslmode=verify-full",
      STAGING_DATABASE_NAME: "msr_stage",
      STAGING_DATABASE_HOST: "db.invalid",
      STAGING_WEB_DATABASE_ROLE: "web",
      STAGING_WORKER_DATABASE_ROLE: "worker",
      STAGING_MIGRATOR_DATABASE_ROLE: "migration",
      EMAIL_RELAY_SECRET: ephemeral(),
      ORIGIN_VERIFY_SECRET: ephemeral(),
      ACCESS_SERVICE_CLIENT_SECRET: ephemeral(),
      FILE_SCAN_MODE: "staging-unverified",
      R2_JURISDICTION: "default",
    };
    const web = runtimeEnvironment(env, "web"),
      worker = runtimeEnvironment(env, "worker"),
      migrator = runtimeEnvironment(env, "migrator");
    expect(web.DATABASE_URL).toBe(env.WEB_DATABASE_URL);
    expect(worker.DATABASE_URL).toBe(env.WORKER_DATABASE_URL);
    expect(migrator.DATABASE_URL).toBe(env.MIGRATOR_DATABASE_URL);
    for (const role of [web, worker]) {
      expect(role.FILE_SCAN_MODE).toBe("staging-unverified");
      expect(role.R2_JURISDICTION).toBe("default");
    }
    for (const role of [web, worker, migrator])
      for (const name of ["WEB_DATABASE_URL", "WORKER_DATABASE_URL", "MIGRATOR_DATABASE_URL"])
        expect(role).not.toHaveProperty(name);
    for (const role of [web, migrator])
      for (const name of ["EMAIL_RELAY_SECRET", "EMAIL_ACCESS_CLIENT_SECRET"])
        expect(role).not.toHaveProperty(name);
    expect(migrator).not.toHaveProperty("AUTH_SECRET");
    for (const role of [web, worker, migrator]) {
      expect(role).not.toHaveProperty("BUILD_SHA");
      expect(role.EXPECTED_SOURCE_COMMIT).toBe(env.BUILD_SHA);
    }
    expect(worker.EMAIL_RELAY_URL).toBe("https://staging.makler-realty.com/__staging/email");
    expect(() => runtimeEnvironment({ ...env, STAGING: "1" }, "web")).toThrow();
    expect(() =>
      runtimeEnvironment(
        {
          ...env,
          WEB_DATABASE_URL: env.WEB_DATABASE_URL.replace("msr_stage", "ms_realty_payload"),
        },
        "web",
      ),
    ).toThrow();
    expect(() =>
      runtimeEnvironment(
        { ...env, WEB_DATABASE_URL: env.WEB_DATABASE_URL.replace("verify-full", "require") },
        "web",
      ),
    ).toThrow();
  });
  it("supplies a reviewed notice inbox only to worker and only as the sole allowlisted recipient", () => {
    const env = {
      STAGING: "true",
      BUILD_SHA: "a".repeat(40),
      STAGING_DATABASE_NAME: "msr_stage",
      STAGING_DATABASE_HOST: "db.invalid",
      STAGING_WEB_DATABASE_ROLE: "web",
      STAGING_WORKER_DATABASE_ROLE: "worker",
      STAGING_MIGRATOR_DATABASE_ROLE: "migration",
      WEB_DATABASE_URL: "postgres://web:fixture@db.invalid/msr_stage?sslmode=verify-full",
      WORKER_DATABASE_URL: "postgres://worker:fixture@db.invalid/msr_stage?sslmode=verify-full",
      MIGRATOR_DATABASE_URL:
        "postgres://migration:fixture@db.invalid/msr_stage?sslmode=verify-full",
      INQUIRY_COVERAGE_NOTICE_ENABLED: "1",
      INQUIRY_COVERAGE_TEST_INBOX_REVIEWED: "true",
      INQUIRY_COVERAGE_TEST_INBOX: "reviewed@example.invalid",
      EMAIL_ALLOWED_RECIPIENTS: '["reviewed@example.invalid"]',
    };
    expect(runtimeEnvironment(env, "worker")).toMatchObject({
      INQUIRY_COVERAGE_NOTICE_ENABLED: "1",
      INQUIRY_COVERAGE_TEST_INBOX_REVIEWED: "true",
      INQUIRY_COVERAGE_TEST_INBOX: "reviewed@example.invalid",
    });
    for (const role of ["web", "migrator"] as const)
      for (const key of Object.keys(env).filter((key) => key.startsWith("INQUIRY_COVERAGE_")))
        expect(runtimeEnvironment(env, role)).not.toHaveProperty(key);
    for (const invalid of [
      { INQUIRY_COVERAGE_TEST_INBOX_REVIEWED: "false" },
      { EMAIL_ALLOWED_RECIPIENTS: '["another@example.invalid"]' },
      { EMAIL_ALLOWED_RECIPIENTS: '["reviewed@example.invalid","extra@example.invalid"]' },
      { EMAIL_ALLOWED_RECIPIENTS: "invalid" },
    ])
      expect(() => runtimeEnvironment({ ...env, ...invalid }, "worker")).toThrow(/inbox/);
    expect(
      runtimeEnvironment({ ...env, INQUIRY_COVERAGE_NOTICE_ENABLED: "0" }, "worker"),
    ).not.toHaveProperty("INQUIRY_COVERAGE_TEST_INBOX");
    expect(() => runtimeEnvironment({ ...env, BUILD_SHA: "branch-name" }, "worker")).toThrow();
  });
  it("maps each private transport role and never supplies a companion in direct mode", () => {
    const ephemeral = () => crypto.randomUUID();
    const env = {
      STAGING: "true",
      BUILD_SHA: "a".repeat(40),
      STAGING_DATABASE_HOST: "staging-db.example.invalid",
      STAGING_DATABASE_NAME: "msr_stage",
      STAGING_WEB_DATABASE_ROLE: "web",
      STAGING_WORKER_DATABASE_ROLE: "worker",
      STAGING_MIGRATOR_DATABASE_ROLE: "migration",
      WEB_DATABASE_URL:
        "postgres://web:fixture@staging-db.example.invalid/msr_stage?sslmode=verify-full",
      WORKER_DATABASE_URL:
        "postgres://worker:fixture@staging-db.example.invalid/msr_stage?sslmode=verify-full",
      MIGRATOR_DATABASE_URL:
        "postgres://migration:fixture@staging-db.example.invalid/msr_stage?sslmode=verify-full",
      DATABASE_TRANSPORT: "cloudflared-access-tcp",
      DATABASE_TLS_CA_PEM: "reviewed public CA",
      TUNNEL_SERVICE_HOSTNAME: "staging-db.example.invalid",
      TUNNEL_SERVICE_URL: "127.0.0.1:15432",
      TUNNEL_SERVICE_TOKEN_ID: ephemeral(),
      TUNNEL_SERVICE_TOKEN_SECRET: ephemeral(),
    };
    for (const [role, databaseRole] of [
      ["web", "web"],
      ["worker", "worker"],
      ["migrator", "migration"],
    ] as const) {
      expect(runtimeEnvironment(env, role)).toMatchObject({
        DATABASE_TRANSPORT: "cloudflared-access-tcp",
        STAGING_DATABASE_ROLE: databaseRole,
        STAGING_DATABASE_HOST: env.STAGING_DATABASE_HOST,
        STAGING_DATABASE_NAME: env.STAGING_DATABASE_NAME,
        DATABASE_TLS_CA_PEM: env.DATABASE_TLS_CA_PEM,
        TUNNEL_SERVICE_URL: "127.0.0.1:15432",
      });
      const direct = runtimeEnvironment({ ...env, DATABASE_TRANSPORT: "direct" }, role);
      expect(direct).not.toHaveProperty("TUNNEL_SERVICE_TOKEN_SECRET");
      expect(direct).not.toHaveProperty("DATABASE_TRANSPORT");
    }
    for (const invalid of [
      { DATABASE_TRANSPORT: "unknown" },
      { TUNNEL_SERVICE_HOSTNAME: "another.invalid" },
      { TUNNEL_SERVICE_URL: "0.0.0.0:15432" },
      { DATABASE_TLS_CA_PEM: "" },
      { TUNNEL_SERVICE_TOKEN_ID: "" },
      { TUNNEL_SERVICE_TOKEN_SECRET: "" },
    ])
      expect(() => runtimeEnvironment({ ...env, ...invalid }, "migrator")).toThrow(/companion/);
  });
});
