import { describe, expect, it } from "vitest";
import { hostContextFor, isPublicWwwHost, parseHostOrigins, servesApi } from "./hosts";

const production = {
  PUBLIC_ORIGIN: "https://makler-realty.com",
  CLIENT_ORIGIN: "https://my.makler-realty.com/",
  STAFF_ORIGIN: "https://app.makler-realty.com",
};

describe("host origins (§11.1)", () => {
  it("defaults to the three *.localhost hosts on the running port", () => {
    expect(parseHostOrigins({ PORT: "3161" })).toEqual({
      public: "http://localhost:3161",
      client: "http://my.localhost:3161",
      staff: "http://app.localhost:3161",
    });
    expect(parseHostOrigins({}).public).toBe("http://localhost:3000");
  });

  it("normalizes configured origins", () => {
    expect(parseHostOrigins(production)).toEqual({
      public: "https://makler-realty.com",
      client: "https://my.makler-realty.com",
      staff: "https://app.makler-realty.com",
    });
  });

  it("rejects anything but a bare http(s) origin, naming only the variable", () => {
    for (const value of [
      "makler-realty.com",
      "ftp://makler-realty.com",
      "https://app.makler-realty.com/bg",
      "https://app.makler-realty.com?x=1",
      "https://user:secret@app.makler-realty.com",
    ]) {
      const run = () => parseHostOrigins({ ...production, STAFF_ORIGIN: value });
      expect(run).toThrow(/STAFF_ORIGIN/);
      try {
        run();
      } catch (error) {
        expect(String(error)).not.toContain("secret");
      }
    }
  });

  it("refuses two contexts on one host", () => {
    expect(() =>
      parseHostOrigins({ ...production, CLIENT_ORIGIN: "https://makler-realty.com" }),
    ).toThrow(/must differ/);
  });
});

describe("host resolution", () => {
  const origins = parseHostOrigins(production);

  it("maps each Host header to exactly one context", () => {
    expect(hostContextFor("makler-realty.com", origins)).toBe("public");
    expect(hostContextFor("MY.makler-realty.com", origins)).toBe("client");
    expect(hostContextFor("app.makler-realty.com", origins)).toBe("staff");
  });

  it("serves nothing on any other host", () => {
    for (const host of [
      null,
      "",
      "makler-realty.ru",
      "evil.example",
      "app.makler-realty.com.evil.example",
      "makler-realty.com:8443",
      "www.makler-realty.com",
    ]) {
      expect(hostContextFor(host, origins), String(host)).toBeNull();
    }
  });

  it("compares the port on local hosts", () => {
    const local = parseHostOrigins({ PORT: "3161" });
    expect(hostContextFor("app.localhost:3161", local)).toBe("staff");
    expect(hostContextFor("app.localhost:3000", local)).toBeNull();
    expect(hostContextFor("127.0.0.1:3161", local)).toBeNull();
  });

  it("recognizes www only in front of the public host", () => {
    expect(isPublicWwwHost("www.makler-realty.com", origins)).toBe(true);
    expect(isPublicWwwHost("www.my.makler-realty.com", origins)).toBe(false);
    expect(isPublicWwwHost("makler-realty.com", origins)).toBe(false);
  });

  it("serves each API family on its own host only", () => {
    expect(servesApi("public", "/api/inquiries")).toBe(true);
    expect(servesApi("public", "/api/inquiries/abc")).toBe(true);
    expect(servesApi("client", "/api/inquiries")).toBe(false);
    expect(servesApi("staff", "/api/inquiries/abc")).toBe(false);
    expect(servesApi("public", "/api/unknown")).toBe(false);
    expect(servesApi("public", "/api/constructor")).toBe(false);
  });
});
