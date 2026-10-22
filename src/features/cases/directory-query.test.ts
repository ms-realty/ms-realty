import { expect, it } from "vitest";
import { caseDirectoryHref, caseDirectoryState } from "./directory-query";

it("reads first repeated values, trims and bounds text, and maps Mine owner to the current reader", () => {
  const state = caseDirectoryState(
    {
      q: ["  synthetic  ", "ignored"],
      purpose: "x".repeat(121),
      owner: "me",
      size: "10",
      unknown: "ignored",
    },
    "broker-id",
  );
  expect(state.input).toMatchObject({
    collection: "all",
    search: "synthetic",
    purpose: "x".repeat(120),
    ownerId: "broker-id",
    pageSize: 10,
  });
  expect(state.shortened).toBe(true);
  expect(state.values).not.toHaveProperty("unknown");
});

it("retains invalid controls as invalid criteria even when they occur after the text limit", () => {
  for (const field of ["q", "purpose", "party", "nextAction"])
    for (const value of ["\n", `${"x".repeat(200)}\0`, "\0".repeat(10000)]) {
      const state = caseDirectoryState({ [field]: value }, "broker-id");
      expect(state.values[field as "q"]).toBe("\0");
      expect(state.filtered).toBe(true);
    }
});

it("preserves opaque filter identity and safe filters but never emits private text or an old cursor", () => {
  const values = {
    q: "private search",
    purpose: "private purpose",
    party: "private party",
    nextAction: "private action",
    filter: "opaque-context",
    view: "needs",
    kind: "buyer",
    cursor: "old",
  };
  expect(caseDirectoryHref("bg", values, { view: "mine" })).toBe(
    "/bg/cases?view=mine&kind=buyer&filter=opaque-context",
  );
  expect(caseDirectoryHref("ru", values, { cursor: "next" })).toBe(
    "/ru/cases?view=needs&kind=buyer&cursor=next&filter=opaque-context",
  );
  expect(caseDirectoryHref("en", { q: "legacy private value" })).toBe("/en/cases");
});

it("passes unsupported filters through for authoritative validation instead of converting them to All", () => {
  expect(
    caseDirectoryState({ view: "unsupported", kind: "unsupported", size: "wrong" }, "broker-id")
      .input,
  ).toMatchObject({ collection: "unsupported", kind: "unsupported", pageSize: Number.NaN });
});
