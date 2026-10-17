import { describe, expect, it } from "vitest";
import { originHeaders } from "./origin";

const origins = {
  public: "https://makler-realty.com",
  client: "https://my.makler-realty.com",
  staff: "https://app.makler-realty.com",
};
const secret = "test-only-origin-secret-0123456789abcdef";
const env = { NODE_ENV: "production", ORIGIN_VERIFY_SECRET: secret };
describe("Origin transport boundary", () => {
  it("retains canonical path context only after gateway authentication", () => {
    const headers = new Headers({
      host: "provider.example",
      "x-msr-public-host": "makler-realty.com",
      "x-msr-origin-token": secret,
      "x-msr-rendered-path": "/original?x=%2F",
    });
    expect(originHeaders(headers, origins, env)?.get("x-msr-rendered-path")).toBe(
      "/original?x=%2F",
    );
    headers.set("host", "makler-realty.com");
    expect(
      originHeaders(headers, origins, { NODE_ENV: "development" })?.has("x-msr-rendered-path"),
    ).toBe(false);
    const loopback = {
      public: "http://localhost:3100",
      client: "http://my.localhost:3100",
      staff: "http://app.localhost:3100",
    };
    headers.set("host", "localhost:3100");
    expect(
      originHeaders(headers, loopback, { NODE_ENV: "production" })?.has("x-msr-rendered-path"),
    ).toBe(false);
    headers.delete("x-msr-origin-token");
    expect(originHeaders(headers, origins, env)).toBeNull();
  });
  it("rejects direct origin, forged host/internal headers and unavailable secrets", () => {
    const attempts: Array<Record<string, string>> = [
      { host: "app.makler-realty.com" },
      { host: "provider.example", "x-forwarded-host": "app.makler-realty.com" },
      {
        host: "provider.example",
        "x-msr-public-host": "app.makler-realty.com",
        "x-msr-origin-token": "x".repeat(secret.length),
      },
      {
        host: "provider.example",
        "x-msr-public-host": "evil.example",
        "x-msr-origin-token": secret,
      },
      {
        host: "provider.example",
        "x-msr-public-host": "app.makler-realty.com",
        "x-msr-origin-token": "é".repeat(secret.length),
      },
    ];
    for (const headers of attempts) {
      expect(originHeaders(new Headers(headers), origins, env)).toBeNull();
    }
    expect(
      originHeaders(
        new Headers({
          host: "provider.example",
          "x-msr-public-host": "app.makler-realty.com",
          "x-msr-origin-token": secret,
        }),
        origins,
        { NODE_ENV: "production" },
      ),
    ).toBeNull();
  });
  it("accepts only gateway host/IP context, strips internal control headers and supports rotation", () => {
    const headers = new Headers({
      host: "provider.example",
      "x-msr-public-host": "app.makler-realty.com",
      "x-msr-origin-token": secret,
      "x-msr-client-ip": "192.0.2.10",
      "x-forwarded-for": "198.51.100.9",
      "x-middleware-subrequest": "proxy",
      "x-app-surface": "public",
      "x-nonce": "forged",
    });
    const result = originHeaders(headers, origins, env);
    expect(result?.get("host")).toBe("app.makler-realty.com");
    expect(result?.get("x-forwarded-for")).toBe("192.0.2.10");
    expect(result?.has("x-middleware-subrequest")).toBe(false);
    expect(result?.has("x-app-surface")).toBe(false);
    expect(
      originHeaders(headers, origins, {
        ...env,
        ORIGIN_VERIFY_SECRET: "new-key-".repeat(8),
        ORIGIN_VERIFY_PREVIOUS_SECRET: secret,
      }),
    ).not.toBeNull();
  });
  it("keeps explicit loopback production browser qualification directly reachable", () => {
    expect(
      originHeaders(
        new Headers({ host: "app.localhost:3100" }),
        {
          public: "http://localhost:3100",
          client: "http://my.localhost:3100",
          staff: "http://app.localhost:3100",
        },
        { NODE_ENV: "production" },
      )?.get("host"),
    ).toBe("app.localhost:3100");
  });
});
