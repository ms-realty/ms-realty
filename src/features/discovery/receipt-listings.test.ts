import { describe, expect, it } from "vitest";
import { receiptListings } from "./receipt-listings";

const at = "2026-10-05T14:12:00Z";
const item = (reference: string, overrides: object = {}) => ({
  reference,
  title: `Saved title ${reference}`,
  locale: "bg" as const,
  sourceUrl: null,
  publicNow: true,
  ...overrides,
});

describe("P12 receipt listings", () => {
  it("keeps saved order and names, and links only a verifiably public listing", () => {
    const result = receiptListings(
      [
        item("MS-00202", {
          sourceUrl: "https://makler-realty.com/bg/properties/MS-00202/ms-00202",
        }),
        item("MS-00200", { publicNow: false }),
        item("MS-00912", { title: null, locale: null, publicNow: null }),
      ],
      "en",
      at,
    );
    expect(result?.heading).toBe("The properties in this inquiry · 3");
    const [open, gone, unknown] = result?.items ?? [];
    expect(open).toMatchObject({
      name: "Saved title MS-00202",
      nameLang: "bg",
      href: "https://makler-realty.com/bg/properties/MS-00202/ms-00202",
      link: { label: "View the property" },
    });
    expect(gone).toMatchObject({
      warning: "This listing is no longer active and cannot be opened.",
      link: { href: "/en/properties", label: "See similar properties" },
    });
    expect(gone?.href).toBeUndefined();
    expect(unknown).toMatchObject({
      name: "Property No. MS-00912",
      nameNote: "The property's name was not saved with this inquiry.",
      status: "We can't check whether this listing is active",
      link: {
        href: "/en/properties/MS-00912/ms-00912",
        label: "Check whether the listing is still active",
      },
    });
    expect(unknown?.href).toBeUndefined();
    expect(result?.note).toMatch(/^The name was saved when you sent this on .+\. If the listing/);
  });

  it("falls back to the detail route when no saved URL exists, and words a reference-only note", () => {
    const result = receiptListings([item("MS-00101", { title: null, locale: null })], "bg", at);
    expect(result?.heading).toBe("Имотът в запитването");
    expect(result?.items[0]?.href).toBe("/bg/properties/MS-00101/ms-00101");
    expect(result?.note).toMatch(/^Номерът е записан при изпращането на /);
  });

  it("names nothing when the inquiry was about no property", () => {
    expect(receiptListings([], "he", at)).toBeNull();
  });
});
