import { describe, expect, it } from "vitest";
import { runtimeEnvironment } from "./runtime-env";

describe("Staging image role isolation", () => {
  it("never supplies another database role or relay credentials to web/migration", () => {
    const ephemeral = () => crypto.randomUUID();
    const env = {
      STAGING: "true",
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
    };
    const web = runtimeEnvironment(env, "web"),
      worker = runtimeEnvironment(env, "worker"),
      migrator = runtimeEnvironment(env, "migrator");
    expect(web.DATABASE_URL).toBe(env.WEB_DATABASE_URL);
    expect(worker.DATABASE_URL).toBe(env.WORKER_DATABASE_URL);
    expect(migrator.DATABASE_URL).toBe(env.MIGRATOR_DATABASE_URL);
    for (const role of [web, worker, migrator])
      for (const name of ["WEB_DATABASE_URL", "WORKER_DATABASE_URL", "MIGRATOR_DATABASE_URL"])
        expect(role).not.toHaveProperty(name);
    for (const role of [web, migrator])
      for (const name of ["EMAIL_RELAY_SECRET", "EMAIL_ACCESS_CLIENT_SECRET"])
        expect(role).not.toHaveProperty(name);
    expect(migrator).not.toHaveProperty("AUTH_SECRET");
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
});
