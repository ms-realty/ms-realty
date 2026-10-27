import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { type ContentBody, contentBody } from "@/domain/content-body";
import { localeDirection, publicLocales } from "@/i18n/config";
import { ContentBodyView } from "./body";

afterEach(cleanup);
const body: ContentBody = contentBody.parse({
  format: "blocks",
  title: "Synthetic page",
  blocks: [
    { type: "heading", text: "Reviewed process" },
    { type: "step", title: "First step", text: "Keep MS-00001 exact." },
    { type: "step", title: "Second step", text: "Second instruction." },
    { type: "list", items: ["First fact", "Second fact"] },
    { type: "callout", title: "Scope", text: "Reviewed boundary." },
    { type: "paragraph", text: '<script>alert("literal text")</script>' },
    { type: "link", text: "Reviewed contact", href: "/bg/contact" },
  ],
});

describe("P15/P16 semantic reviewed body", () => {
  it.each(publicLocales)(
    "renders ordered steps and native links inside %s language and direction",
    (locale) => {
      const { container } = render(
        <article lang={locale} dir={localeDirection(locale)}>
          <h1>Synthetic page</h1>
          <ContentBodyView body={body} />
        </article>,
      );
      expect(screen.getByRole("heading", { level: 2, name: "Reviewed process" })).toBeVisible();
      const lists = screen.getAllByRole("list");
      expect(lists[0]?.tagName).toBe("OL");
      expect(
        within(lists[0] as HTMLElement)
          .getAllByRole("listitem")
          .map((item) => item.textContent),
      ).toEqual(["First stepKeep MS-00001 exact.", "Second stepSecond instruction."]);
      expect(screen.getByRole("link", { name: "Reviewed contact" })).toHaveAttribute(
        "href",
        "/bg/contact",
      );
      expect(screen.getByRole("link", { name: "Reviewed contact" })).not.toHaveAttribute("target");
      expect(container.querySelector("script")).toBeNull();
      expect(container.querySelector("bdi")).toHaveTextContent("MS-00001");
      expect(container.querySelector("article")).toHaveAttribute("dir", localeDirection(locale));
    },
  );

  it("retains legacy paragraph text, repeated paragraphs and literal markup", () => {
    const { container } = render(
      <ContentBodyView
        body={{ title: "Legacy", paragraphs: ["Same", "Same", "<h2>Literal</h2>"] }}
      />,
    );
    expect([...container.querySelectorAll("p")].map((p) => p.textContent)).toEqual([
      "Same",
      "Same",
      "<h2>Literal</h2>",
    ]);
    expect(container.querySelector("h2")).toBeNull();
  });

  it("uses the next review heading level beneath its page title", () => {
    render(
      <>
        <h2>Preview</h2>
        <h3>Synthetic page</h3>
        <ContentBodyView body={body} headingLevel={4} />
      </>,
    );
    expect(screen.getByRole("heading", { level: 4, name: "Reviewed process" })).toBeVisible();
  });
});
