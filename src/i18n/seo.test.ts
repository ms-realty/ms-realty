import { afterEach, describe, expect, it, vi } from "vitest";
import { publicLocales } from "./config";
import {
  canonicalOrigin,
  isCanonicalHost,
  localizedMetadata,
  localizedPath,
  requestHost,
  stagingEnabled,
} from "./seo";

const origin = new URL("https://makler-realty.com");
afterEach(() => vi.unstubAllEnvs());
describe("zero-loss public crawl policy", () => {
  it("requires a bare trusted HTTPS origin, with HTTP reserved for local development", () => {
    expect(canonicalOrigin({ CANONICAL_ORIGIN: origin.origin })?.origin).toBe(origin.origin);
    expect(canonicalOrigin({ CANONICAL_ORIGIN: "http://localhost:3100" })?.host).toBe(
      "localhost:3100",
    );
    for (const value of [
      undefined,
      "not a url",
      "http://makler-realty.com",
      "https://user:pass@makler-realty.com",
      "https://makler-realty.com/sub",
      "https://makler-realty.com?host=x",
      "https://makler-realty.com#x",
    ]) {
      expect(canonicalOrigin({ CANONICAL_ORIGIN: value })).toBeNull();
    }
  });
  it("never adopts forwarded headers as canonical identity", () => {
    expect(
      requestHost(
        new Headers({ host: "origin.internal:3000", "x-forwarded-host": "makler-realty.com" }),
      ),
    ).toBe("origin.internal:3000");
    expect(isCanonicalHost("MAKLER-REALTY.COM", origin)).toBe(true);
    expect(isCanonicalHost("makler-realty.com.attacker.test", origin)).toBe(false);
    expect(isCanonicalHost(null, origin)).toBe(false);
  });
  it("rejects ambiguous staging flags rather than accidentally indexing staging", () => {
    expect(stagingEnabled({})).toBe(false);
    expect(stagingEnabled({ STAGING: "false" })).toBe(false);
    expect(stagingEnabled({ STAGING: "true" })).toBe(true);
    for (const flag of ["1", "0", "TRUE", "", " true "])
      expect(() => stagingEnabled({ STAGING: flag })).toThrow("STAGING");
  });
  it("only the explicit staging flag adds public noindex, independently of hostname and locale", () => {
    vi.stubEnv("STAGING", "false");
    for (const host of [origin.host, "makler-realty.ru", "preview.workers.dev", null]) {
      for (const locale of publicLocales)
        expect(localizedMetadata({ locale, path: "/", host, origin }).robots).toEqual({
          index: true,
          follow: true,
        });
    }
    vi.stubEnv("STAGING", "true");
    expect(
      localizedMetadata({ locale: "bg", path: "/", host: origin.host, origin }).robots,
    ).toEqual({ index: false, follow: false });
  });
  it("gives each locale its own canonical and all real static locale siblings", () => {
    const metadata = localizedMetadata({
      locale: "he",
      path: "/properties",
      host: origin.host,
      origin,
      staging: false,
    });
    expect(metadata.alternates?.canonical).toBe(`${origin.origin}/he/properties`);
    expect(metadata.alternates?.languages).toEqual({
      bg: `${origin.origin}/bg/properties`,
      en: `${origin.origin}/en/properties`,
      ru: `${origin.origin}/ru/properties`,
      de: `${origin.origin}/de/properties`,
      nl: `${origin.origin}/nl/properties`,
      el: `${origin.origin}/el/properties`,
      he: `${origin.origin}/he/properties`,
      "x-default": `${origin.origin}/bg/properties`,
    });
  });
  it("never advertises missing or unapproved listing/content translations", () => {
    const metadata = localizedMetadata({
      locale: "ru",
      path: "/legacy/source",
      host: origin.host,
      origin,
      availableIn: ["ru"],
      staging: true,
    });
    expect(metadata.alternates).toEqual({
      canonical: `${origin.origin}/ru/legacy/source`,
      languages: { ru: `${origin.origin}/ru/legacy/source` },
    });
    expect(
      localizedMetadata({
        locale: "bg",
        path: "/areas/x",
        host: origin.host,
        origin,
        availableIn: ["bg"],
        staging: false,
      }).alternates?.languages,
    ).toEqual({ bg: `${origin.origin}/bg/areas/x`, "x-default": `${origin.origin}/bg/areas/x` });
  });
  it("normalizes localized paths without indexing tracking strings or fragments", () => {
    expect(localizedPath("bg", "/")).toBe("/bg");
    expect(localizedPath("en", "/areas?utm_source=x#top")).toBe("/en/areas");
  });
});
