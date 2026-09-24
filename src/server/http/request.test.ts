import { describe, expect, it, vi } from "vitest";

import {
  readCookie,
  sessionClearCookie,
  sessionCookieName,
  sessionSetCookie,
} from "../auth/cookies";
import { parseEnv } from "../config/env";
import { AppError } from "../errors";
import {
  assertSameOrigin,
  clientIpFrom,
  correlationIdFrom,
  errorResponse,
  isUnsafeMethod,
} from "./request";

const origin = "https://makler-realty.com";
const headers = (values: Record<string, string>) => new Headers(values);

describe("assertSameOrigin", () => {
  it("accepts same-origin requests", () => {
    expect(() =>
      assertSameOrigin(headers({ origin, "sec-fetch-site": "same-origin" }), origin),
    ).not.toThrow();
    expect(() => assertSameOrigin(headers({ origin }), origin)).not.toThrow();
  });

  it.each([
    { "sec-fetch-site": "cross-site", origin: "https://evil.example" },
    { "sec-fetch-site": "same-site", origin: "https://preview.makler-realty.com" },
    { origin: "https://evil.example" },
    { origin: "null" },
    {},
  ] as Record<string, string>[])("rejects %o", (values) => {
    expect(() => assertSameOrigin(headers(values), origin)).toThrow(
      expect.objectContaining({ code: "cross_origin_request" }),
    );
  });

  it("only treats unsafe methods as mutations", () => {
    expect(["GET", "HEAD", "OPTIONS"].some(isUnsafeMethod)).toBe(false);
    expect(["POST", "PUT", "PATCH", "DELETE"].every(isUnsafeMethod)).toBe(true);
  });
});

describe("correlation and client identity", () => {
  it("keeps a well-formed edge request id and replaces anything else", () => {
    expect(correlationIdFrom(headers({ "x-request-id": "edge-req-123456" }))).toBe(
      "edge-req-123456",
    );
    const injected = correlationIdFrom(headers({ "x-request-id": "<script>alert(1)</script>" }));
    expect(injected).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("prefers the edge's connecting IP", () => {
    expect(
      clientIpFrom(headers({ "cf-connecting-ip": "203.0.113.5", "x-forwarded-for": "1.1.1.1" })),
    ).toBe("203.0.113.5");
    expect(clientIpFrom(headers({ "x-forwarded-for": "198.51.100.2, 10.0.0.1" }))).toBe(
      "198.51.100.2",
    );
  });
});

describe("errorResponse", () => {
  it("maps errors to status, safe JSON, Retry-After and the correlation header", async () => {
    const response = errorResponse(
      new AppError("rate_limited", { retryAfterSeconds: 12 }),
      "corr-abcdefgh",
    );
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("12");
    expect(response.headers.get("x-correlation-id")).toBe("corr-abcdefgh");
    expect(await response.json()).toMatchObject({
      error: { code: "rate_limited", correlationId: "corr-abcdefgh" },
    });
  });

  it("never leaks an unexpected error", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = errorResponse(new Error("select * from secrets"), "corr-abcdefgh");
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("secrets");
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });
});

describe("session cookie", () => {
  it("uses the __Host- prefix with Secure, HttpOnly, SameSite=Lax and Path=/ in production", () => {
    const env = parseEnv({
      NODE_ENV: "production",
      DATABASE_URL: "postgres://x",
      APP_ORIGIN: origin,
      CANONICAL_ORIGIN: origin,
      AUTH_SECRET: "s".repeat(32),
    });
    const cookie = sessionSetCookie(env, "tok", new Date("2026-10-01T00:00:00Z"));
    expect(cookie).toBe(
      "__Host-msr_session=tok; Path=/; Expires=Thu, 01 Oct 2026 00:00:00 GMT; HttpOnly; Secure; SameSite=Lax",
    );
    expect(cookie).not.toMatch(/Domain=/);
    expect(sessionClearCookie(env)).toMatch(
      /^__Host-msr_session=; Path=\/; Expires=Thu, 01 Jan 1970/,
    );
  });

  it("drops the prefix and Secure only for plain-http local development", () => {
    const env = parseEnv({ NODE_ENV: "development" });
    expect(sessionCookieName(env)).toBe("msr_session");
    expect(sessionSetCookie(env, "tok", new Date(0))).not.toContain("Secure");
  });

  it("reads one cookie out of a header", () => {
    expect(readCookie("a=1; msr_session=abc=; b=2", "msr_session")).toBe("abc=");
    expect(readCookie("xmsr_session=nope", "msr_session")).toBeUndefined();
    expect(readCookie(null, "msr_session")).toBeUndefined();
  });
});
