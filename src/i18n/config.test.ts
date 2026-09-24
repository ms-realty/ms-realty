import { describe, expect, it } from "vitest";
import { pageFirstSegments } from "../../next.config";
import {
  type CatalogReview,
  catalogReviews,
  defaultLocale,
  indexableLocales,
  isPublicLocale,
  isRoutableLocale,
  isStaffLocale,
  type LocaleIndexabilityApproval,
  localeDirection,
  localePolicy,
  publicLocales,
  routableLocales,
} from "./config";

function approval(
  locale: LocaleIndexabilityApproval["subject"]["id"],
  overrides: Partial<LocaleIndexabilityApproval> = {},
): LocaleIndexabilityApproval {
  return {
    kind: "locale_indexability",
    subject: { type: "locale", id: locale, version: 1, hash: "h" },
    state: "approved",
    decidedBy: "staff-1",
    ...overrides,
  };
}

const reviewed: CatalogReview = {
  status: "approved",
  reviewer: "staff-2",
  reviewedAt: "2026-09-24T10:00:00Z",
};

describe("locale registry (AD9, §18.2)", () => {
  it("keeps Bulgarian as the default source locale", () => {
    expect(defaultLocale).toBe("bg");
  });

  it("recognises only configured public and staff locales", () => {
    expect(isPublicLocale("he")).toBe(true);
    expect(isPublicLocale("fr")).toBe(false);
    expect(isStaffLocale("ru")).toBe(true);
    expect(isStaffLocale("de")).toBe(false);
  });

  it("renders Hebrew right-to-left and everything else left-to-right", () => {
    expect(publicLocales.filter((locale) => localeDirection(locale) === "rtl")).toEqual(["he"]);
  });

  it("routes every public locale on preview", () => {
    expect(routableLocales()).toEqual([...publicLocales]);
    expect(isRoutableLocale("de")).toBe(true);
    expect(isRoutableLocale("fr")).toBe(false);
  });
});

describe("indexability (§20.4, A55)", () => {
  it("indexes only the source locale by default", () => {
    expect(indexableLocales()).toEqual(["bg"]);
  });

  it("no catalog is approved yet and every catalog has a review record", () => {
    expect(Object.keys(catalogReviews).sort()).toEqual([...publicLocales].sort());
    for (const review of Object.values(catalogReviews)) {
      expect(review).toEqual({ status: "draft_unreviewed", reviewer: null, reviewedAt: null });
    }
  });

  it("a draft catalog never makes a locale indexable, even with an approval", () => {
    expect(localePolicy("en", [approval("en")]).indexable).toBe(false);
  });

  it("an approved catalog alone does not make a locale indexable", () => {
    expect(localePolicy("en", [], { en: reviewed }).indexable).toBe(false);
  });

  it("an approved catalog without a named reviewer and date does not count", () => {
    const unsigned = { ...reviewed, reviewer: null };
    expect(localePolicy("en", [approval("en")], { en: unsigned }).indexable).toBe(false);
  });

  it("a recorded human approval plus a reviewed catalog makes the locale indexable", () => {
    expect(localePolicy("en", [approval("en")], { en: reviewed })).toEqual({
      routable: true,
      indexable: true,
    });
    expect(indexableLocales([approval("en")], { en: reviewed })).toEqual(["bg", "en"]);
  });

  it("ignores pending, rejected, unsigned or other-locale approvals", () => {
    const reviews = { en: reviewed };
    for (const candidate of [
      approval("en", { state: "pending" }),
      approval("en", { state: "rejected" }),
      approval("en", { state: "invalidated" }),
      approval("en", { decidedBy: undefined }),
      approval("de"),
    ]) {
      expect(localePolicy("en", [candidate], reviews).indexable).toBe(false);
    }
  });
});

describe("next.config page segments", () => {
  it("lists every public locale and the workspace, so no page URL is sent to the 404", () => {
    expect(pageFirstSegments).toEqual([...publicLocales, "workspace"]);
  });
});
