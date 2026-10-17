import { expect, it } from "vitest";
import { contentRoute, parseContentReference } from "./inquiry-content";

const identity = {
  kind: "service",
  slug: "sell",
  versionId: "00000000-0000-4000-8000-000000000001",
} as const;
it("accepts only bounded immutable CMS identity, never client-supplied public facts or URLs", () => {
  expect(parseContentReference(JSON.stringify(identity))).toEqual(identity);
  for (const value of [
    "",
    "invalid",
    JSON.stringify({ ...identity, title: "Unreviewed service claim" }),
    JSON.stringify({ ...identity, sourceUrl: "https://other.example" }),
    JSON.stringify({ ...identity, slug: "../contact" }),
    JSON.stringify({ ...identity, kind: "listing" }),
    JSON.stringify({ ...identity, versionId: "not-an-immutable-id" }),
    "x".repeat(513),
  ])
    expect(parseContentReference(value)).toBeNull();
});
it("keeps the real public page destination for special and ordinary content routes", () => {
  expect(contentRoute(identity)).toBe("/sell");
  expect(contentRoute({ kind: "service", slug: "let" })).toBe("/let");
  expect(contentRoute({ kind: "help", slug: "contact" })).toBe("/contact");
  expect(contentRoute({ kind: "area", slug: "sandanski" })).toBe("/areas/sandanski");
  expect(contentRoute({ kind: "service", slug: "buying" })).toBe("/services/buying");
});
