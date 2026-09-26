import { describe, expect, it } from "vitest";

import { parseEnv } from "./env";

const production = {
  NODE_ENV: "production",
  DATABASE_URL: "postgres://app@db/app",
  APP_ORIGIN: "https://makler-realty.com/",
  CANONICAL_ORIGIN: "https://makler-realty.com",
  AUTH_SECRET: "x".repeat(32),
};

describe("parseEnv", () => {
  it("gives development and tests safe local defaults", () => {
    const env = parseEnv({ NODE_ENV: "test" });
    expect(env).toMatchObject({
      production: false,
      appOrigin: "http://localhost:3000",
      canonicalOrigin: "http://localhost:3000",
      webauthn: { rpId: "localhost", rpName: "MS Realty" },
      r2: undefined,
    });
    expect(env.authSecret.length).toBeGreaterThanOrEqual(32);
  });

  it("accepts a complete production environment and normalizes origins", () => {
    expect(parseEnv(production)).toMatchObject({
      production: true,
      appOrigin: "https://makler-realty.com",
      webauthn: { rpId: "makler-realty.com" },
    });
  });

  it("fails fast in production, naming variables but never values", () => {
    const run = () => parseEnv({ ...production, DATABASE_URL: "", AUTH_SECRET: undefined });
    expect(run).toThrow(/DATABASE_URL is required.*AUTH_SECRET is required/);
    expect(() => parseEnv({ ...production, APP_ORIGIN: "http://makler-realty.com" })).toThrow(
      /APP_ORIGIN must be https/,
    );
    try {
      parseEnv({ ...production, AUTH_SECRET: "short-secret-value" });
    } catch (error) {
      expect(String(error)).not.toContain("short-secret-value");
    }
  });

  it("treats blank variables copied from .env.example as unset", () => {
    expect(parseEnv({ NODE_ENV: "", APP_ORIGIN: "", CANONICAL_ORIGIN: " " })).toMatchObject({
      nodeEnv: "development",
      appOrigin: "http://localhost:3000",
    });
    expect(() => parseEnv({ NODE_ENV: "test", APP_ORIGIN: "ftp://files.example" })).toThrow();
  });

  it("enables search assistance only with a provider and a key", () => {
    expect(parseEnv({ NODE_ENV: "test" }).assist).toBeUndefined();
    expect(parseEnv({ NODE_ENV: "test", ANTHROPIC_API_KEY: "test-key" }).assist).toBeUndefined();
    expect(parseEnv({ NODE_ENV: "test", ASSIST_PROVIDER: "anthropic" }).assist).toBeUndefined();
    expect(
      parseEnv({ NODE_ENV: "test", ASSIST_PROVIDER: "off", ANTHROPIC_API_KEY: "test-key" }).assist,
    ).toBeUndefined();
    expect(
      parseEnv({ NODE_ENV: "test", ASSIST_PROVIDER: "anthropic", ANTHROPIC_API_KEY: "test-key" })
        .assist,
    ).toEqual({ provider: "anthropic", apiKey: "test-key", model: "claude-sonnet-5" });
    expect(
      parseEnv({
        NODE_ENV: "test",
        ASSIST_PROVIDER: "anthropic",
        ANTHROPIC_API_KEY: "test-key",
        ASSIST_MODEL: "claude-haiku-4-5",
      }).assist?.model,
    ).toBe("claude-haiku-4-5");
    expect(() => parseEnv({ NODE_ENV: "test", ASSIST_PROVIDER: "other" })).toThrow(
      /ASSIST_PROVIDER/,
    );
  });

  it("requires R2 settings all together", () => {
    expect(() => parseEnv({ NODE_ENV: "test", R2_BUCKET: "ms-realty-media" })).toThrow(
      /all-or-none/,
    );
  });
});
