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
describe("R09/AT27 public crawl and indexability policy", () => {
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
  it("keeps unapproved locales crawlable but noindex regardless of hostname", () => {
    vi.stubEnv("STAGING", "false");
    for (const host of [origin.host, "makler-realty.ru", "preview.workers.dev", null]) {
      for (const locale of publicLocales)
        expect(localizedMetadata({ locale, path: "/", host, origin }).robots).toEqual({
          index: locale === "bg",
          follow: true,
        });
    }
    vi.stubEnv("STAGING", "true");
    expect(
      localizedMetadata({ locale: "bg", path: "/", host: origin.host, origin }).robots,
    ).toEqual({ index: false, follow: false });
  });
  it("keeps every routable canonical while advertising only approved static locale siblings", () => {
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
      languages: {},
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
  it.each([{ availableIn: [] }, { availableIn: ["en"] }] as const)(
    "an absent BG edition is noindex even when its locale is approved: $availableIn",
    ({ availableIn }) => {
      const metadata = localizedMetadata({
        locale: "bg",
        path: "/help/missing",
        host: origin.host,
        origin,
        availableIn,
        staging: false,
      });
      expect(metadata.robots).toEqual({ index: false, follow: true });
      expect(metadata.alternates).toEqual({
        canonical: `${origin.origin}/bg/help/missing`,
        languages: {},
      });
    },
  );
  it("normalizes localized paths without indexing tracking strings or fragments", () => {
    expect(localizedPath("bg", "/")).toBe("/bg");
    expect(localizedPath("en", "/areas?utm_source=x#top")).toBe("/en/areas");
  });
});
