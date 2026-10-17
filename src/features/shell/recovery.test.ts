import { describe, expect, it } from "vitest";
import { errorReference, recoveryLinks } from "./recovery";

const id = "00000000-0000-4000-8000-000000000001";

describe("safe parent recovery (M-140)", () => {
  it("returns Inventory receipts to the list and names Today as the staff home", () => {
    expect(recoveryLinks("staff", "en", `/en/inventory/operations/${id}`)).toEqual({
      parent: { href: "/en/inventory", label: "list" },
      home: { href: "/en/today", label: "staffHome" },
    });
  });
  it("returns nested staff pages to their record without putting its identity in the label", () => {
    expect(recoveryLinks("staff", "bg", "/bg/inventory/MS-00001/evidence").parent).toEqual({
      href: "/bg/inventory/MS-00001",
      label: "record",
    });
  });
  it("recovers a client receipt without a key to the deal named by its bounded command", () => {
    expect(
      recoveryLinks("client", "ru", `/ru/overview/operations?command=brief&id=${id}`).parent,
    ).toEqual({
      href: `/ru/overview/${id}`,
      label: "deal",
    });
    expect(
      recoveryLinks("client", "en", `/en/proposals/operations?command=create&id=${id}`).parent,
    ).toEqual({
      href: `/en/overview/${id}`,
      label: "deal",
    });
  });
  it("falls back to the deal list when a receipt gives no safe record context", () => {
    const links = recoveryLinks("client", "he", "/he/overview/operations?key=private-token");
    expect(links).toEqual({
      parent: undefined,
      home: { href: "/he/overview", label: "clientHome" },
    });
    expect(JSON.stringify(links)).not.toContain("private-token");
  });
  it("returns listing failures to public search", () => {
    expect(recoveryLinks("public", "he", "/he/properties/MS-00001/property").parent).toEqual({
      href: "/he/properties",
      label: "search",
    });
  });
  it.each([
    "https://external.test/en/cases",
    "//external.test/en/cases",
    "/en/\\external.test",
    "/ru/inventory",
    "/en/unknown/private-token",
    "/en/properties?next=https://external.test",
  ])("does not turn an untrusted staff address into a return link: %s", (path) => {
    expect(recoveryLinks("staff", "en", path)).toEqual({
      parent: undefined,
      home: { href: "/en/today", label: "staffHome" },
    });
  });
});

it("shows only a generated numeric support digest, never an error message or arbitrary digest", () => {
  expect(errorReference({ digest: "1234567890", message: "private payload" })).toBe("1234567890");
  for (const error of [
    new Error("private payload"),
    { digest: "secret@example.test" },
    { digest: "123\n456" },
    null,
    "1234567890",
  ])
    expect(errorReference(error)).toBeUndefined();
});
