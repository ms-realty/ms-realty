import { describe, expect, it } from "vitest";
import {
  canonicalOrigin,
  isCanonicalHost,
  localizedMetadata,
  localizedPath,
  requestHost,
} from "./seo";

const origin = new URL("https://makler-realty.com");
const canonicalHost = "makler-realty.com";

describe("crawl and index metadata (§20.4)", () => {
  it("reads the canonical origin from the environment and treats unset as none", () => {
    expect(canonicalOrigin({ CANONICAL_ORIGIN: "https://makler-realty.com" })?.host).toBe(
      canonicalHost,
    );
    expect(canonicalOrigin({})).toBeNull();
    expect(canonicalOrigin({ CANONICAL_ORIGIN: "not a url" })).toBeNull();
  });

  it("uses the forwarded host when a proxy sits in front", () => {
    const headers = new Headers({
      host: "origin.internal:3000",
      "x-forwarded-host": canonicalHost,
    });
    expect(requestHost(headers)).toBe(canonicalHost);
    expect(requestHost(new Headers({ host: "preview.workers.dev" }))).toBe("preview.workers.dev");
  });

  it("matches hosts exactly", () => {
    expect(isCanonicalHost(canonicalHost, origin)).toBe(true);
    expect(isCanonicalHost("makler-realty.ru", origin)).toBe(false);
    expect(isCanonicalHost(canonicalHost, null)).toBe(false);
  });

  it("builds locale paths without query strings", () => {
    expect(localizedPath("bg", "/")).toBe("/bg");
    expect(localizedPath("en", "/areas?utm_source=x#top")).toBe("/en/areas");
  });

  it("noindexes every non-canonical host, even for the source locale", () => {
    for (const host of ["preview.workers.dev", "127.0.0.1:3102", null]) {
      expect(localizedMetadata({ locale: "bg", path: "/", host, origin })).toEqual({
        robots: { index: false, follow: false },
      });
    }
    expect(
      localizedMetadata({ locale: "bg", path: "/", host: canonicalHost, origin: null }),
    ).toEqual({
      robots: { index: false, follow: false },
    });
  });

  it("noindexes non-indexable locales on the canonical host without canonical tags", () => {
    expect(localizedMetadata({ locale: "en", path: "/", host: canonicalHost, origin })).toEqual({
      robots: { index: false, follow: true },
    });
  });

  it("gives indexable pages a canonical and hreflang among indexable locales plus x-default", () => {
    expect(localizedMetadata({ locale: "bg", path: "/", host: canonicalHost, origin })).toEqual({
      alternates: {
        canonical: "https://makler-realty.com/bg",
        languages: {
          bg: "https://makler-realty.com/bg",
          "x-default": "https://makler-realty.com/bg",
        },
      },
      robots: { index: true, follow: true },
    });

    const withEnglish = localizedMetadata({
      locale: "en",
      path: "/areas",
      host: canonicalHost,
      origin,
      indexable: ["bg", "en"],
    });
    expect(withEnglish.alternates).toEqual({
      canonical: "https://makler-realty.com/en/areas",
      languages: {
        bg: "https://makler-realty.com/bg/areas",
        en: "https://makler-realty.com/en/areas",
        "x-default": "https://makler-realty.com/bg/areas",
      },
    });
  });

  it("lists only locales that hold an approved version of the page", () => {
    const metadata = localizedMetadata({
      locale: "bg",
      path: "/areas/x",
      host: canonicalHost,
      origin,
      indexable: ["bg", "en"],
      availableIn: ["bg"],
    });
    expect(Object.keys(metadata.alternates?.languages ?? {})).toEqual(["bg", "x-default"]);
  });

  it("a locale without an approved version of the page is neither indexed nor canonical", () => {
    expect(
      localizedMetadata({
        locale: "en",
        path: "/areas/x",
        host: canonicalHost,
        origin,
        indexable: ["bg", "en"],
        availableIn: ["bg"],
      }),
    ).toEqual({ robots: { index: false, follow: true } });
  });
});
