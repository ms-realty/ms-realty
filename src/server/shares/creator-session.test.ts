import { describe, expect, it } from "vitest";
import { GET } from "../../../app/api/public-shares/creator-session/route";
import { getEnv } from "../config/env";

const env = getEnv();
const request = (origin: string, locale: string, cookie?: string) =>
  new Request(`${origin}/api/public-shares/creator-session?locale=${locale}`, {
    headers: { host: new URL(origin).host, ...(cookie ? { cookie } : {}) },
  });

describe("anonymous public-share creator entry", () => {
  it("issues the creator cookie before returning to P08 and reuses it on revisit", () => {
    const first = GET(request(env.hosts.public, "bg"));
    expect(first.status).toBe(303);
    expect(first.headers.get("location")).toBe(`${env.hosts.public}/bg/saved`);
    expect(first.headers.get("cache-control")).toBe("private, no-store");
    expect(first.headers.get("referrer-policy")).toBe("no-referrer");
    const setCookie = first.headers.get("set-cookie");
    expect(setCookie).toMatch(/msr_share_creator=[A-Za-z0-9_-]{43}/);
    expect(first.headers.get("x-robots-tag")).toBe("noindex, nofollow");

    const second = GET(request(env.hosts.public, "bg", setCookie?.split(";")[0]));
    expect(second.status).toBe(303);
    expect(second.headers.get("set-cookie")).toBeNull();
  });

  it("does not issue a cookie on a private host or invalid locale", () => {
    expect(GET(request(env.hosts.client, "bg")).status).toBe(404);
    const invalid = GET(request(env.hosts.public, "xx"));
    expect(invalid.status).toBe(400);
    expect(invalid.headers.get("set-cookie")).toBeNull();
  });
});
