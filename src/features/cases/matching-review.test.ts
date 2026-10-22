import { describe, expect, it } from "vitest";
import { encodeMatchReview, matchReviewFromForm } from "./matching-review";

const read = {
  briefRevision: 2,
  candidate: {
    manifestId: "8f6d1c2e-1c1b-4f6f-9a43-3f3c1f5f6e11",
    availability: { presented: "negotiating" },
  },
  violated: [],
  unconfirmed: [],
};

describe("O07 matchReview transport", () => {
  it("carries exactly what the property check returned", () => {
    const value = encodeMatchReview(read);
    expect(matchReviewFromForm(value)).toEqual({
      briefRevision: 2,
      manifestId: read.candidate.manifestId,
      availability: "negotiating",
      violated: [],
      unconfirmed: [],
      reviewed: true,
    });
  });

  it("refuses a missing, malformed or embellished review instead of guessing one", () => {
    expect(matchReviewFromForm(undefined)).toBeUndefined();
    expect(matchReviewFromForm("")).toBeUndefined();
    expect(matchReviewFromForm("{not json")).toBeUndefined();
    const review = JSON.parse(encodeMatchReview(read));
    expect(matchReviewFromForm(JSON.stringify({ ...review, reviewed: false }))).toBeUndefined();
    expect(
      matchReviewFromForm(JSON.stringify({ ...review, availability: "sold!" })),
    ).toBeUndefined();
    expect(
      matchReviewFromForm(JSON.stringify({ ...review, requirements: "private text" })),
    ).toBeUndefined();
  });
});
