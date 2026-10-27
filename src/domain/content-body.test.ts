import { describe, expect, it } from "vitest";
import { publicLocales } from "@/i18n/config";
import { contentBody, contentParagraphs, isContentLink } from "./content-body";

describe("P15/P16 / O21 bounded content composition", () => {
  it("keeps legacy bodies and paragraph order intact without adding a format or binding", () => {
    const legacy = {
      title: "Синтетичен източник",
      paragraphs: ["First exact paragraph.", "Second\nline.", "First exact paragraph."],
    };
    expect(contentBody.parse(legacy)).toEqual(legacy);
    expect(contentParagraphs(contentBody.parse(legacy))).toEqual(legacy.paragraphs);
  });

  it.each(publicLocales)(
    "retains every factual text and link in reading order for %s",
    (locale) => {
      const body = contentBody.parse({
        format: "blocks",
        title: "Synthetic approved composition",
        blocks: [
          { type: "heading", text: "Context" },
          {
            type: "paragraph",
            text: "MS-00001 · 123 EUR · 45 m² · 2 bedrooms · Sandanski · https://example.test/source",
          },
          { type: "step", title: "Synthetic first step", text: "First reviewed instruction." },
          { type: "step", title: "Synthetic second step", text: "Second reviewed instruction." },
          { type: "list", items: ["First supplied item", "Second supplied item"] },
          {
            type: "callout",
            title: "Scope",
            text: "Synthetic boundary, not a real service claim.",
          },
          { type: "link", text: "Contact", href: `/${locale}/contact` },
        ],
      });
      expect(contentParagraphs(body)).toEqual([
        "Context",
        "MS-00001 · 123 EUR · 45 m² · 2 bedrooms · Sandanski · https://example.test/source",
        "Synthetic first step",
        "First reviewed instruction.",
        "Synthetic second step",
        "Second reviewed instruction.",
        "First supplied item",
        "Second supplied item",
        "Scope",
        "Synthetic boundary, not a real service claim.",
        "Contact",
        `/${locale}/contact`,
      ]);
    },
  );

  it.each([
    "javascript:alert(1)",
    "data:text/html,test",
    "https://example.test",
    "//example.test/bg/contact",
    "/bg/../staff",
    "/bg/%2e%2e/staff",
    "/bg/contact?returnTo=/staff",
    "/bg/contact#x",
    "/bg\\contact",
    "/staff/bg/content",
    "/bg/documents/private",
    "/bg/properties/asset.jpg",
    "/bg/contact\n",
    "/bg/contact\u0000",
  ])("rejects unsafe or unreviewable link %s", (href) => {
    expect(isContentLink(href)).toBe(false);
    expect(
      contentBody.safeParse({
        format: "blocks",
        title: "Synthetic",
        blocks: [{ type: "link", text: "Link", href }],
      }).success,
    ).toBe(false);
  });

  it("rejects mixed shapes, arbitrary HTML, media and unbounded input", () => {
    for (const value of [
      {
        title: "Synthetic",
        paragraphs: ["Legacy"],
        format: "blocks",
        blocks: [{ type: "paragraph", text: "Extra" }],
      },
      { title: "Synthetic", format: "blocks", blocks: [{ type: "html", html: "<h2>Unsafe</h2>" }] },
      {
        title: "Synthetic",
        format: "blocks",
        blocks: [{ type: "paragraph", text: "Safe text", html: "<img>" }],
      },
      { title: "Synthetic", format: "blocks", blocks: [{ type: "media", src: "/private" }] },
      {
        title: "Synthetic",
        format: "blocks",
        blocks: Array.from({ length: 31 }, () => ({ type: "paragraph", text: "Extra" })),
      },
      {
        title: "Synthetic",
        format: "blocks",
        blocks: Array.from({ length: 11 }, () => ({ type: "paragraph", text: "x".repeat(5000) })),
      },
    ])
      expect(contentBody.safeParse(value).success).toBe(false);
  });
});
