import { describe, expect, it } from "vitest";

import { parseEnv } from "./env";

const production = {
  NODE_ENV: "production",
  DATABASE_URL: "postgres://app@db/app",
  APP_ORIGIN: "https://makler-realty.com/",
  CANONICAL_ORIGIN: "https://makler-realty.com",
  PUBLIC_ORIGIN: "https://makler-realty.com",
  CLIENT_ORIGIN: "https://my.makler-realty.com",
  STAFF_ORIGIN: "https://app.makler-realty.com",
  AUTH_SECRET: "x".repeat(32),
  MEDIA_PUBLIC_BASE_URL: "https://makler-realty.com/media/",
};

describe("parseEnv", () => {
  it("gives development and tests safe local defaults", () => {
    const env = parseEnv({ NODE_ENV: "test" });
    expect(env).toMatchObject({
      production: false,
      appOrigin: "http://localhost:3000",
      canonicalOrigin: "http://localhost:3000",
      webauthn: { rpId: "localhost", rpName: "MS Realty" },
      hosts: {
        public: "http://localhost:3000",
        client: "http://my.localhost:3000",
        staff: "http://app.localhost:3000",
      },
      r2: undefined,
    });
    expect(env.authSecret.length).toBeGreaterThanOrEqual(32);
  });

  it("accepts a complete production environment and normalizes origins", () => {
    expect(parseEnv(production)).toMatchObject({
      production: true,
      appOrigin: "https://makler-realty.com",
      hosts: {
        public: "https://makler-realty.com",
        client: "https://my.makler-realty.com",
        staff: "https://app.makler-realty.com",
      },
      webauthn: { rpId: "makler-realty.com" },
      mediaPublicBaseUrl: "https://makler-realty.com/media",
    });
  });

  it("fails fast in production, naming variables but never values", () => {
    const run = () => parseEnv({ ...production, DATABASE_URL: "", AUTH_SECRET: undefined });
    expect(run).toThrow(/DATABASE_URL is required.*AUTH_SECRET is required/);
    expect(() => parseEnv({ ...production, MEDIA_PUBLIC_BASE_URL: "" })).toThrow(
      /MEDIA_PUBLIC_BASE_URL is required/,
    );
    expect(() => parseEnv({ ...production, APP_ORIGIN: "http://makler-realty.com" })).toThrow(
      /APP_ORIGIN must be https/,
    );
    expect(() => parseEnv({ ...production, STAFF_ORIGIN: "" })).toThrow(/STAFF_ORIGIN is required/);
    expect(() => parseEnv({ ...production, CLIENT_ORIGIN: "http://my.makler-realty.com" })).toThrow(
      /CLIENT_ORIGIN must be https/,
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

  it("requires R2 settings all together", () => {
    expect(() => parseEnv({ NODE_ENV: "test", R2_BUCKET: "ms-realty-media" })).toThrow(
      /all-or-none/,
    );
  });
});
