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
  expectedOrigin,
  hostContextOf,
  identify,
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
      error: { code: "RATE_LIMITED", correlationId: "corr-abcdefgh" },
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

describe("host contexts (§8.1, §11.1)", () => {
  const env = parseEnv({ NODE_ENV: "test", PORT: "3161" });

  it("binds same-origin checks to the addressed host", () => {
    expect(hostContextOf(headers({ host: "app.localhost:3161" }), env)).toBe("staff");
    expect(expectedOrigin(headers({ host: "my.localhost:3161" }), env)).toBe(
      "http://my.localhost:3161",
    );
    // A mutation posted from the client host to the staff host is cross-origin.
    expect(() =>
      assertSameOrigin(
        headers({ host: "app.localhost:3161", origin: "http://my.localhost:3161" }),
        expectedOrigin(headers({ host: "app.localhost:3161" }), env),
      ),
    ).toThrow(expect.objectContaining({ code: "cross_origin_request" }));
    expect(() => expectedOrigin(headers({ host: "evil.example" }), env)).toThrow(
      expect.objectContaining({ code: "cross_origin_request" }),
    );
  });

  it("never reads a private session cookie on the public host", async () => {
    const db = new Proxy({}, { get: () => expect.unreachable("no database read") });
    const identity = await identify(
      db as never,
      headers({
        host: "localhost:3161",
        cookie: "msr_staff_session=tok; msr_client_session=tok",
      }),
      env,
    );
    expect(identity).toEqual({ session: null, actor: null, sessionToken: undefined });
  });
});

describe("session cookie", () => {
  it("uses the __Host- prefix with Secure, HttpOnly, SameSite=Lax and Path=/ in production", () => {
    const env = parseEnv({
      NODE_ENV: "production",
      DATABASE_URL: "postgres://x",
      APP_ORIGIN: origin,
      CANONICAL_ORIGIN: origin,
      PUBLIC_ORIGIN: origin,
      CLIENT_ORIGIN: "https://my.makler-realty.com",
      STAFF_ORIGIN: "https://app.makler-realty.com",
      AUTH_SECRET: "s".repeat(32),
      MEDIA_PUBLIC_BASE_URL: `${origin}/media`,
    });
    const cookie = sessionSetCookie(env, "staff", "tok", new Date("2026-10-01T00:00:00Z"));
    expect(cookie).toBe(
      "__Host-msr_staff_session=tok; Path=/; Expires=Thu, 01 Oct 2026 00:00:00 GMT; HttpOnly; Secure; SameSite=Lax",
    );
    expect(cookie).not.toMatch(/Domain=/);
    expect(sessionClearCookie(env, "client")).toMatch(
      /^__Host-msr_client_session=; Path=\/; Expires=Thu, 01 Jan 1970/,
    );
  });

  it("names the staff and client cookies apart, so neither host reads the other's (§8.1)", () => {
    const env = parseEnv({ NODE_ENV: "development" });
    expect(sessionCookieName(env, "staff")).toBe("msr_staff_session");
    expect(sessionCookieName(env, "client")).toBe("msr_client_session");
    expect(sessionSetCookie(env, "client", "tok", new Date(0))).not.toContain("Secure");
    expect(sessionSetCookie(env, "staff", "tok", new Date(0))).not.toMatch(/Domain=/);
  });

  it("reads one cookie out of a header", () => {
    expect(readCookie("a=1; msr_session=abc=; b=2", "msr_session")).toBe("abc=");
    expect(readCookie("xmsr_session=nope", "msr_session")).toBeUndefined();
    expect(readCookie(null, "msr_session")).toBeUndefined();
  });
});
