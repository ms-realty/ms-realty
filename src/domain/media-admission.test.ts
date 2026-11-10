// ADR 0016: which check admits stored media, and whether it still counts under a brand's policy.
import { describe, expect, it } from "vitest";
import { mediaPolicy, scanFirstMediaPolicy } from "../config/tenant";
import {
  admissionAccepted,
  isLegacyPhotoAwaitingCarryOver,
  isLegacyPhotoLeftOut,
  isMediaPublishable,
  type MediaEligibilityInput,
} from "./media";

const eligible: MediaEligibilityInput = {
  audience: "public_candidate",
  sealedSha256: "a".repeat(64),
  scan: "clean",
  processing: "ready",
  rights: "cleared",
  review: "approved",
  modification: "none",
  admission: "reencode",
  contentType: "image/jpeg",
};

describe("media admission (ADR 0016)", () => {
  it("accepts a scanner result under any policy", () => {
    for (const policy of [mediaPolicy, scanFirstMediaPolicy])
      for (const contentType of ["image/jpeg", "application/pdf", "video/mp4"])
        expect(admissionAccepted({ admission: "virus_scan", contentType }, policy)).toBe(true);
  });

  it("accepts a re-encode only for raster images while the policy re-encodes", () => {
    for (const contentType of ["image/jpeg", "image/png", "image/webp"]) {
      expect(admissionAccepted({ admission: "reencode", contentType }, mediaPolicy)).toBe(true);
      expect(admissionAccepted({ admission: "reencode", contentType }, scanFirstMediaPolicy)).toBe(
        false,
      );
    }
    for (const contentType of ["application/pdf", "video/mp4", "image/avif", ""])
      expect(admissionAccepted({ admission: "reencode", contentType }, mediaPolicy)).toBe(false);
  });

  it("makes re-encoded media publishable only under the re-encode policy", () => {
    expect(isMediaPublishable(eligible, mediaPolicy)).toBe(true);
    expect(isMediaPublishable(eligible, scanFirstMediaPolicy)).toBe(false);
    expect(isMediaPublishable({ ...eligible, contentType: "application/pdf" })).toBe(false);
    // A re-encode never stands in for the other facts.
    expect(isMediaPublishable({ ...eligible, review: "pending" })).toBe(false);
    expect(isMediaPublishable({ ...eligible, scan: "failed" })).toBe(false);
    // Absent admission is the scanner, as for every asset before this rule.
    const { admission: _, ...scanned } = eligible;
    expect(isMediaPublishable(scanned, scanFirstMediaPolicy)).toBe(true);
  });

  it("tells a photo that still needs copying from one that was left out", () => {
    const legacy = { legacyReference: "https://makler-realty.com/x.jpg", sealedKey: null };
    expect(isLegacyPhotoAwaitingCarryOver({ ...legacy, processing: "pending" })).toBe(true);
    expect(isLegacyPhotoLeftOut({ ...legacy, processing: "pending" })).toBe(false);
    expect(isLegacyPhotoAwaitingCarryOver({ ...legacy, processing: "failed" })).toBe(false);
    expect(isLegacyPhotoLeftOut({ ...legacy, processing: "failed" })).toBe(true);
    const copied = { ...legacy, sealedKey: "sealed/x/y", processing: "ready" as const };
    expect(isLegacyPhotoAwaitingCarryOver(copied)).toBe(false);
    expect(isLegacyPhotoLeftOut(copied)).toBe(false);
    const upload = { legacyReference: null, sealedKey: null, processing: "pending" as const };
    expect(isLegacyPhotoAwaitingCarryOver(upload)).toBe(false);
  });
});
