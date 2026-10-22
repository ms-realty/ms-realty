import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ownerInquiryReceipt, ownerInquirySchema } from "@/domain/owner-inquiry";
import { emptyInquiry } from "@/features/discovery/inquiry-state";
import { issueSubmissionKey, parseInquiry } from "./intake";
import {
  inquiryPayload,
  issueInquiryReview,
  reviewInquirySources,
  validInquiryReview,
} from "./review";

const source = vi.hoisted(() => vi.fn());
vi.mock("../listings/detail", () => ({ getPublicListing: source }));
const values = {
  ...emptyInquiry,
  name: "Synthetic visitor",
  message: "Please explain the area.",
  contactValue: "visitor@example.test",
  privacyNotice: "true",
};
beforeEach(() => {
  source.mockReset();
});

describe("P11 exact review authorization", () => {
  it("binds the exact values, operation, locale and session without putting personal data in the token", () => {
    const key = issueSubmissionKey(),
      now = Date.now();
    const token = issueInquiryReview(key, "en", "session A", values, now);
    expect(validInquiryReview(token, key, "en", "session A", values, now + 1)).toBe(true);
    for (const field of [
      "name",
      "contactValue",
      "message",
      "privacyNotice",
      "selectedListings",
      "comparisonReferences",
      "ownerLocality",
      "contentReference",
    ] as const)
      expect(
        validInquiryReview(
          token,
          key,
          "en",
          "session A",
          { ...values, [field]: `${values[field]}changed` },
          now,
        ),
      ).toBe(false);
    expect(validInquiryReview(token, issueSubmissionKey(), "en", "session A", values, now)).toBe(
      false,
    );
    expect(validInquiryReview(token, key, "bg", "session A", values, now)).toBe(false);
    expect(validInquiryReview(token, key, "en", "session B", values, now)).toBe(false);
    expect(validInquiryReview(token, key, "en", "session A", values, now + 30 * 60 * 1000)).toBe(
      false,
    );
    expect(validInquiryReview(`${token.slice(0, -1)}z`, key, "en", "session A", values, now)).toBe(
      false,
    );
    const encoded = token.split(".")[0];
    expect(encoded).toBeDefined();
    const payload = Buffer.from(encoded ?? "", "base64url").toString();
    expect(payload).not.toContain(values.contactValue);
    expect(payload).not.toContain(values.message);
    expect(payload).not.toContain("session A");
  });

  it("reads approved source cards in selected order and refuses one changed or unavailable item", async () => {
    const selected = [
      { reference: "MS-00002", observedManifestId: randomUUID() },
      { reference: "MS-00001", observedManifestId: randomUUID() },
    ];
    const input = inquiryPayload(
      { ...values, selectedListings: JSON.stringify(selected) },
      issueSubmissionKey(),
      "en",
    );
    source.mockImplementation(async (_db, query) => ({
      status: "listing",
      listing: {
        reference: query.reference,
        manifestId: selected.find((item) => item.reference === query.reference)?.observedManifestId,
        availability: { primaryAction: "ask" },
      },
    }));
    expect(
      (await reviewInquirySources({} as never, input)).map((listing) => listing.reference),
    ).toEqual(["MS-00002", "MS-00001"]);
    source.mockResolvedValueOnce({
      status: "listing",
      listing: { manifestId: randomUUID(), availability: { primaryAction: "ask" } },
    });
    await expect(reviewInquirySources({} as never, input)).rejects.toMatchObject({
      code: "version_conflict",
    });
    source.mockResolvedValueOnce({ status: "unavailable" });
    await expect(reviewInquirySources({} as never, input)).rejects.toMatchObject({
      code: "version_conflict",
    });
  });
});

describe("P18 self-declared owner input", () => {
  it("starts blank, permits unknown facts, retains document area text and keeps receipt free of location/source notes", () => {
    const input = inquiryPayload(
      {
        ...values,
        purpose: "seller_consultation",
        ownerLocality: "Synthetic broad area",
        ownerPropertyType: "unknown",
        ownerTransaction: "sale",
        ownerDocumentArea: "78,50",
        ownerRelationship: "representative",
        ownerPropertyStatus: "Not currently used",
        ownerDocumentSource: "Synthetic document description",
      },
      issueSubmissionKey(),
      "en",
    );
    expect(input.ownerInput).toEqual({
      version: 1,
      provenance: "self_declared",
      locality: "Synthetic broad area",
      propertyType: "unknown",
      transaction: "sale",
      documentArea: "78,50",
      relationship: "representative",
      propertyStatus: "Not currently used",
      documentSource: "Synthetic document description",
    });
    expect(ownerInquiryReceipt(input.ownerInput)).toEqual({
      version: 1,
      provenance: "self_declared",
      propertyType: "unknown",
      transaction: "sale",
      documentArea: "78,50",
      relationship: "representative",
    });
    const blank = inquiryPayload(
      { ...values, purpose: "landlord_consultation" },
      issueSubmissionKey(),
      "en",
    );
    expect(blank.ownerInput).toMatchObject({ version: 1, provenance: "self_declared" });
    expect(blank.ownerInput?.transaction).toBeUndefined();
  });
  it("rejects forged provenance, extra fields, invalid area, wrong purpose and conflicting transaction", () => {
    const ownerInput = { version: 1, provenance: "self_declared", transaction: "sale" };
    for (const change of [
      { provenance: "verified" },
      { documentArea: "-1" },
      { documentArea: "0" },
      { ownerId: randomUUID() },
    ])
      expect(ownerInquirySchema.safeParse({ ...ownerInput, ...change }).success).toBe(false);
    expect(() =>
      parseInquiry({ ...inquiryPayload(values, issueSubmissionKey(), "en"), ownerInput }),
    ).toThrow();
    expect(() =>
      inquiryPayload(
        { ...values, purpose: "landlord_consultation", ownerTransaction: "sale" },
        issueSubmissionKey(),
        "en",
      ),
    ).toThrow();
  });
});
