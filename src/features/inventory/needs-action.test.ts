import { describe, expect, it } from "vitest";
import { listingAction } from "./needs-action";

const settled = {
  editorialState: "approved_revision",
  commercialState: "available",
  freshnessState: "current_under_policy",
};

describe("O10 listingAction", () => {
  it("needs nothing when approved, available and current", () => {
    expect(listingAction(settled)).toBeNull();
  });
  it("puts editorial work before availability", () => {
    expect(
      listingAction({
        ...settled,
        editorialState: "changes_requested",
        commercialState: "confirmation_required",
      }),
    ).toBe("changes");
    expect(listingAction({ ...settled, editorialState: "in_review" })).toBe("review");
    expect(listingAction({ ...settled, editorialState: "needs_facts" })).toBe("facts");
  });
  it("asks for availability when unconfirmed or due", () => {
    expect(listingAction({ ...settled, commercialState: "confirmation_required" })).toBe(
      "availability",
    );
    expect(listingAction({ ...settled, freshnessState: "review_due" })).toBe("availability");
  });
  it("does not count a plain draft as waiting", () => {
    expect(listingAction({ ...settled, editorialState: "draft" })).toBeNull();
  });
});
