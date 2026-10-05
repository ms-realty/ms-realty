import { describe, expect, it } from "vitest";
import type { FormOutcome, FormValues } from "@/ui/form/contract";
import {
  addState,
  canOfferAdd,
  changedCategory,
  checkState,
  listState,
  matchingHref,
  nextProperty,
  parseMatchingQuery,
} from "./matching-view";

const item = (
  reference: string,
  existingInterestId: string | null = null,
  unconfirmed: string[] = [],
) => ({
  reference,
  existingInterestId,
  unconfirmed,
});
const ready = (
  confirmed: ReturnType<typeof item>[],
  needsConfirmation: ReturnType<typeof item>[],
  stale = false,
) => ({ status: "ready" as const, confirmed, needsConfirmation, stale });

describe("O07 list frames", () => {
  it("maps each server read to its frame", () => {
    expect(listState({ status: "criteria_required", reason: "missing_or_invalid" })).toBe(
      "criteriaMissing",
    );
    expect(listState({ status: "criteria_required", reason: "kind_mismatch" })).toBe(
      "criteriaKind",
    );
    expect(listState("revision_conflict")).toBe("stale");
    expect(listState(ready([item("MS-00912")], [], true))).toBe("stale");
    expect(listState(ready([], []))).toBe("empty");
    expect(listState(ready([item("MS-00912")], [item("MS-00202", null, ["availability"])]))).toBe(
      "ready",
    );
    expect(listState(ready([], [item("MS-00202", null, ["availability"])]))).toBe(
      "needsConfirmation",
    );
  });

  it("starts with the first property to add, then the first to confirm, never a saved one", () => {
    const read = ready(
      [item("MS-00100", "saved"), item("MS-00912")],
      [item("MS-00202", null, ["availability"])],
    );
    expect(nextProperty(read)?.reference).toBe("MS-00912");
    expect(nextProperty(read, "MS-00912")?.reference).toBe("MS-00202");
    expect(nextProperty(ready([item("MS-00100", "saved")], []))).toBeNull();
  });
});

describe("O07 single-property frames", () => {
  const candidate = (
    match: "match" | "needs_confirmation" | "no_match",
    availability = "available",
    existingInterestId: string | null = null,
  ) => ({ kind: "candidate" as const, match, availability, existingInterestId });

  it("offers an add only for a fully confirmed property that is not saved yet", () => {
    expect(checkState(candidate("match"))).toBe("checkMatch");
    expect(checkState(candidate("match", "negotiating"))).toBe("checkNegotiating");
    expect(checkState(candidate("match", "reserved_with_recorded_basis"))).toBe("checkReserved");
    expect(checkState(candidate("needs_confirmation", "confirmation_required"))).toBe("checkNeeds");
    expect(checkState(candidate("no_match"))).toBe("checkNoMatch");
    // The row rule: a saved property swaps to «Вече е в списъка на клиента», whatever its verdict.
    for (const match of ["match", "needs_confirmation", "no_match"] as const)
      expect(checkState(candidate(match, "available", "interest-1"))).toBe("onList");
    expect(checkState({ kind: "unavailable" })).toBe("unavailable");
    expect(checkState({ kind: "not_found" })).toBe("notFound");
    expect(checkState({ kind: "stale" })).toBe("stale");

    expect(canOfferAdd("checkMatch", true)).toBe(true);
    expect(canOfferAdd("checkNegotiating", true)).toBe(true);
    expect(canOfferAdd("checkReserved", true)).toBe(true);
    expect(canOfferAdd("checkMatch", false)).toBe(false);
    for (const state of ["checkNeeds", "checkNoMatch", "onList", "stale"] as const)
      expect(canOfferAdd(state, true)).toBe(false);
  });
});

describe("O07 add outcomes", () => {
  const flags = { pending: false, offline: false };
  const receipt = {
    title: "Recorded",
    reference: "CS-1",
    recordedAt: { dateTime: "2026-10-06T08:12:00.000Z", label: "" },
    nextStep: "",
    destination: { href: "/", label: "" },
  };
  const rejected = (code: string): FormOutcome<FormValues> => ({
    kind: "rejected",
    code,
    message: "",
    retryable: false,
  });

  it("shows added only for the command's confirmed readback", () => {
    expect(addState({ kind: "confirmed", receipt }, flags)).toBe("added");
    expect(addState({ kind: "idle" }, flags)).toBe("form");
    expect(addState({ kind: "idle" }, { pending: true, offline: false })).toBe("sending");
    expect(addState({ kind: "idle" }, { pending: false, offline: true })).toBe("offline");
    for (const outcome of [
      { kind: "unknown", code: "OUTCOME_UNKNOWN", message: "", status: { href: "/", label: "" } },
      { kind: "accepted", message: "", status: { href: "/", label: "" } },
    ] as const)
      expect(addState(outcome, flags)).toBe("unknown");
    expect(addState({ kind: "conflict", code: "REVISION_CONFLICT", message: "" }, flags)).toBe(
      "conflict",
    );
  });

  it("keeps the form for an explanation error and names every refusal safely", () => {
    const validation = (field: string): FormOutcome<FormValues> => ({
      kind: "validation",
      code: "VALIDATION_FAILED",
      message: "",
      fieldErrors: { [field]: ["invalid"] },
    });
    expect(addState(validation("explanation"), flags)).toBe("form");
    expect(addState(validation("matchReview"), flags)).toBe("reviewRejected");
    expect(addState(rejected("LISTING_UNAVAILABLE"), flags)).toBe("unavailable");
    expect(addState(rejected("TRANSITION_DENIED"), flags)).toBe("dealInactive");
    for (const code of ["NOT_FOUND", "NOT_AUTHORIZED", "UNAUTHENTICATED"])
      expect(addState(rejected(code), flags)).toBe("notFound");
    expect(addState(rejected("RATE_LIMITED"), flags)).toBe("failed");
  });

  it("names only the category that changed, in the command's order", () => {
    const review = JSON.stringify({
      briefRevision: 2,
      manifestId: "m-1",
      availability: "available",
      violated: [],
      unconfirmed: [],
      reviewed: true,
    });
    const current = {
      briefRevision: 2,
      manifestId: "m-1",
      availability: "available",
      violated: [],
      unconfirmed: [],
    };
    expect(changedCategory(review, { ...current, briefRevision: 3, manifestId: "m-2" })).toBe(
      "brief",
    );
    expect(changedCategory(review, { ...current, manifestId: "m-2" })).toBe("listing");
    expect(changedCategory(review, { ...current, availability: "negotiating" })).toBe(
      "availability",
    );
    expect(changedCategory(review, { ...current, violated: ["price"] })).toBe("assessment");
    expect(changedCategory(review, current)).toBe("deal");
    expect(changedCategory("not json", current)).toBe("deal");
    expect(
      changedCategory(JSON.stringify({ ...JSON.parse(review), unconfirmed: ["b", "a"] }), {
        ...current,
        unconfirmed: ["a", "b"],
      }),
    ).toBe("deal");
  });
});

describe("O07 URLs", () => {
  it("keeps the revision and load time, appends cursors and drops malformed values", () => {
    expect(
      parseMatchingQuery({
        property: " ms-00912 ",
        revision: "3",
        at: "2026-10-06T07:20:00.000Z",
        more: ["abc_DEF-1", "bad cursor!", "x".repeat(600)],
      }),
    ).toEqual({
      property: "MS-00912",
      revision: 3,
      at: "2026-10-06T07:20:00.000Z",
      more: ["abc_DEF-1"],
    });
    expect(parseMatchingQuery({ revision: "0", at: "yesterday" })).toEqual({ more: [] });
    expect(
      matchingHref("bg", "case-1", {
        revision: 3,
        at: "2026-10-06T07:20:00.000Z",
        more: ["a", "b"],
      }),
    ).toBe("/bg/cases/case-1/matching?revision=3&at=2026-10-06T07%3A20%3A00.000Z&more=a&more=b");
    expect(matchingHref("en", "case-1")).toBe("/en/cases/case-1/matching");
  });
});
