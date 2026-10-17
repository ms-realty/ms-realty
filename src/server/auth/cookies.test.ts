import { describe, expect, it } from "vitest";
import { getEnv } from "../config/env";
import { sessionCookieName, sessionCookieOptions, sessionSetCookie } from "./cookies";

const expires = new Date("2026-10-01T00:00:00Z");
describe("host-only authentication cookies", () => {
  it("supports production builds on HTTP loopback without unusable Secure or __Host cookies", () => {
    const env = { ...getEnv(), production: true };
    expect(sessionCookieName(env, "client")).toBe("msr_client_session");
    expect(sessionCookieOptions(env, "client", expires).secure).toBe(false);
    expect(sessionSetCookie(env, "client", "opaque", expires)).not.toContain("Secure");
    expect(sessionSetCookie(env, "client", "opaque", expires)).not.toContain("Domain=");
  });
  it("enforces Secure, HttpOnly and the host prefix for real HTTPS origins", () => {
    const env = {
      ...getEnv(),
      production: true,
      hosts: {
        public: "https://example.test",
        staff: "https://app.example.test",
        client: "https://my.example.test",
      },
    };
    expect(sessionCookieName(env, "staff")).toBe("__Host-msr_staff_session");
    const cookie = sessionSetCookie(env, "staff", "opaque", expires);
    expect(cookie).toContain("HttpOnly; Secure; SameSite=Lax");
    expect(cookie).not.toContain("Domain=");
  });
});
