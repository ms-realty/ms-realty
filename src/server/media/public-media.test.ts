import { describe, expect, it } from "vitest";

import { isPubliclyServable, type MediaEligibility, publicMediaUrl } from "./public-media";

// A54: only cleared, reviewed, disclosed media in the public area ever gets a URL (F23, AD12).
const servable: MediaEligibility & { r2Key: string } = {
  r2Key: "public/MS-00242/photo 1.webp",
  storageArea: "public",
  rights: "cleared",
  review: "approved",
  modification: "none",
  modificationDisclosure: null,
};
const base = "https://makler-realty.com/media";

describe("publicMediaUrl", () => {
  it("builds an encoded URL under the public base for servable media", () => {
    expect(publicMediaUrl(servable, base)).toBe(
      "https://makler-realty.com/media/public/MS-00242/photo%201.webp",
    );
  });

  it.each([
    ["staging area", { storageArea: "staging" }],
    ["rights not cleared", { rights: "unknown" }],
    ["rights restricted", { rights: "restricted" }],
    ["review pending", { review: "pending" }],
    ["modification undisclosed", { modification: "virtually_staged" }],
  ] as const)("returns null when %s", (_label, change) => {
    const asset = { ...servable, ...change };
    expect(isPubliclyServable(asset)).toBe(false);
    expect(publicMediaUrl(asset, base)).toBeNull();
  });

  it("serves disclosed modified media and nothing without a configured base", () => {
    const staged = {
      ...servable,
      modification: "virtually_staged" as const,
      modificationDisclosure: "Virtually staged furniture",
    };
    expect(publicMediaUrl(staged, base)).toMatch(/^https:/);
    expect(publicMediaUrl(servable, undefined)).toBeNull();
  });
});
