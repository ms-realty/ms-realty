import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import type { MapBounds } from "@/domain/search/map-bounds";
import { mapCopy } from "./map-copy";
import { readFilters } from "./query";
import { SearchMap } from "./search-map";

const renderer = vi.hoisted(() => ({
  select: vi.fn(),
  destroy: vi.fn(),
  callbacks: null as null | { select(reference: string): void; moved(bounds: MapBounds): void },
  fail: null as null | (() => void),
}));
vi.mock("./map-renderer", () => ({
  renderMap: (
    _element: unknown,
    _items: unknown,
    _locale: unknown,
    _release: unknown,
    _copy: unknown,
    ready: () => void,
    failed: () => void,
    callbacks: NonNullable<typeof renderer.callbacks>,
  ) => {
    renderer.callbacks = callbacks;
    renderer.fail = failed;
    ready();
    return { select: renderer.select, destroy: renderer.destroy };
  },
}));
vi.mock("@/ui/announce", () => ({ announce: vi.fn() }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  renderer.callbacks = null;
  renderer.fail = null;
});
const props = {
  locale: "en",
  copy: mapCopy("en"),
  release: "a".repeat(64),
  items: [
    {
      reference: "MS-10001",
      href: "/en/properties/MS-10001/ms-10001",
      label: "MS-10001 · Synthetic town",
      price: "€100,000",
      point: { latitude: 41, longitude: 23, placeId: "place", level: "settlement" },
    },
  ],
} as const;
const list = (
  <section id="property-results" tabIndex={-1}>
    <article data-listing-reference="MS-10001">
      <a href={props.items[0].href}>Synthetic property</a>
    </article>
  </section>
);
it("UI16 renders the real list before hydration and never starts an optional renderer implicitly", () => {
  const html = renderToString(<SearchMap {...props}>{list}</SearchMap>);
  expect(html).toContain("Synthetic property");
  expect(html).toContain("disabled");
  expect(html).not.toContain("aria-busy");
  expect(renderer.callbacks).toBeNull();
});
it("UI16 leaves bounds as a draft until explicit GET and preserves the selected locality and other hard rules", async () => {
  render(
    <SearchMap
      {...props}
      filters={readFilters({
        purpose: "sale",
        places: "00000000-0000-4000-8000-000000000001",
        minPrice: "50000",
        sort: "price_asc",
      })}
    >
      {list}
    </SearchMap>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Show map" }));
  await waitFor(() => expect(renderer.callbacks).not.toBeNull());
  expect(screen.queryByRole("link", { name: "Search this area" })).not.toBeInTheDocument();
  act(() => renderer.callbacks?.moved({ west: 22, south: 40, east: 24, north: 42 }));
  const href = screen.getByRole("link", { name: "Search this area" }).getAttribute("href");
  const next = new URL(href ?? "", "https://example.test");
  expect(next.searchParams.get("mapBounds")).toBe("22,40,24,42");
  expect(next.searchParams.get("places")).toBe("00000000-0000-4000-8000-000000000001");
  expect(next.searchParams.get("minPrice")).toBe("50000");
  expect(next.searchParams.get("sort")).toBe("price_asc");
  expect(next.searchParams.has("cursor")).toBe(false);
  expect(next.hash).toBe("#results-heading");
  expect(window.location.pathname).not.toBe("/en/properties");
});
it("UI16 shares one selected card identity without moving focus on marker selection, and failure returns to the list", async () => {
  render(<SearchMap {...props}>{list}</SearchMap>);
  const toggle = screen.getByRole("button", { name: "Show map" });
  toggle.focus();
  fireEvent.click(toggle);
  await waitFor(() => expect(renderer.callbacks).not.toBeNull());
  act(() => renderer.callbacks?.select("MS-10001"));
  expect(toggle).toHaveFocus();
  expect(document.querySelector("article")).toHaveAttribute("data-map-selected", "true");
  act(() => screen.getByRole("link", { name: "Synthetic property" }).focus());
  expect(renderer.select).toHaveBeenLastCalledWith("MS-10001");
  act(() => renderer.fail?.());
  expect(screen.getByText(props.copy.error)).toBeInTheDocument();
  fireEvent.click(screen.getAllByRole("button", { name: "Go to list" }).at(-1) as HTMLElement);
  await waitFor(() => expect(document.getElementById("property-results")).toHaveFocus());
  expect(renderer.destroy).toHaveBeenCalled();
});
