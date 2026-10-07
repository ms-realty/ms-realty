// O27 Jobs parameters: a malformed exception page or record is a 404 (null), never the overview.
import { expect, it } from "vitest";
import { externalActionView } from "./jobs-view";

const id = "00000000-0000-4000-8000-000000000001";

it("opens the overview, an exception page or one exact exception", () => {
  expect(externalActionView({})).toBeUndefined();
  expect(externalActionView({ view: "other" })).toBeUndefined();
  expect(externalActionView({ view: "exceptions" })).toEqual({ kind: "queue", page: 1 });
  expect(externalActionView({ view: "exceptions", page: "2" })).toEqual({ kind: "queue", page: 2 });
  expect(externalActionView({ action: id })).toEqual({ kind: "record", id });
  expect(externalActionView({ action: id.toUpperCase() })).toEqual({
    kind: "record",
    id: id.toUpperCase(),
  });
  // One exact exception wins over a queue page.
  expect(externalActionView({ action: id, view: "exceptions", page: "3" })).toEqual({
    kind: "record",
    id,
  });
});

it.each([
  ["a page below one", { view: "exceptions", page: "0" }],
  ["a negative page", { view: "exceptions", page: "-1" }],
  ["a fractional page", { view: "exceptions", page: "1.5" }],
  ["a page that is not a number", { view: "exceptions", page: "next" }],
  ["an empty page", { view: "exceptions", page: "" }],
  ["a repeated page", { view: "exceptions", page: ["1", "2"] }],
  ["a page past the safe offset", { view: "exceptions", page: String(Number.MAX_SAFE_INTEGER) }],
  ["an action that is not a UUID", { action: "../jobs" }],
  ["an empty action", { action: "" }],
  ["a repeated action", { action: [id, id] }],
])("rejects %s", (_, search) => {
  expect(externalActionView(search)).toBeNull();
});
