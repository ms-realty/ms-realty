import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NavigationLoading } from "./navigation-loading";
import { navigationErrorEvent, navigationStartEvent } from "./navigation-loading-state";

const route = vi.hoisted(() => ({ pathname: "/en/today", search: "" }));
vi.mock("next/navigation", () => ({
  usePathname: () => route.pathname,
  useSearchParams: () => new URLSearchParams(route.search),
}));
const preventBrowserNavigation = (event: Event) => event.preventDefault();
beforeEach(() => {
  route.pathname = "/en/today";
  route.search = "";
  window.history.replaceState(null, "", "/en/today");
  window.addEventListener("click", preventBrowserNavigation);
});
afterEach(() => {
  cleanup();
  window.removeEventListener("click", preventBrowserNavigation);
});

function content() {
  return (
    <>
      <a href="/en/inventory">Inventory</a>
      <a href="/en/cases" onClick={(event) => event.preventDefault()}>
        Cancelled navigation
      </a>
      <main>
        <NavigationLoading surface="staff" />
        <div data-route-content="">Authorized content</div>
      </main>
    </>
  );
}

it("keeps the actual server HTML visible when JavaScript is disabled", () => {
  const html = renderToString(
    <main>
      <NavigationLoading surface="public" />
      <div data-route-content="">Server listing content</div>
    </main>,
  );
  expect(html).toContain("Server listing content");
  expect(html).not.toContain("data-navigation-loading");
  expect(html).not.toContain("hidden");
});

it("shows the list skeleton on an ordinary native GET and keeps navigation usable", () => {
  render(content());
  fireEvent.click(screen.getByRole("link", { name: "Inventory" }));
  expect(screen.getByRole("status")).toHaveTextContent("Loading the list…");
  expect(screen.getByText("Authorized content")).not.toBeVisible();
  expect(screen.getByRole("link", { name: "Inventory" })).toBeVisible();
  act(() => window.dispatchEvent(new Event("pageshow")));
  expect(screen.getByText("Authorized content")).toBeVisible();
});

it("ignores cancelled clicks and modifier clicks", () => {
  render(content());
  fireEvent.click(screen.getByRole("link", { name: "Cancelled navigation" }));
  fireEvent.click(screen.getByRole("link", { name: "Inventory" }), { ctrlKey: true });
  expect(screen.queryByRole("status")).toBeNull();
  expect(screen.getByText("Authorized content")).toBeVisible();
});

it("responds to accepted Next navigation and clears when the route commits", () => {
  const view = render(content());
  act(() =>
    window.dispatchEvent(
      new CustomEvent(navigationStartEvent, { detail: { href: "/en/inventory/MS-00001" } }),
    ),
  );
  expect(screen.getByRole("status")).toHaveTextContent("Loading the record…");
  route.pathname = "/en/inventory/MS-00001";
  window.history.replaceState(null, "", route.pathname);
  view.rerender(content());
  expect(screen.queryByRole("status")).toBeNull();
  expect(screen.getByText("Authorized content")).toBeVisible();
});

it("does not leave a same-path filter navigation hidden after its query commits", () => {
  route.pathname = "/en/inventory";
  route.search = "view=mine";
  window.history.replaceState(null, "", "/en/inventory?view=mine");
  const view = render(content());
  act(() =>
    window.dispatchEvent(
      new CustomEvent(navigationStartEvent, { detail: { href: "/en/inventory?view=needs" } }),
    ),
  );
  expect(screen.getByRole("status")).toBeInTheDocument();
  route.search = "view=needs";
  window.history.replaceState(null, "", "/en/inventory?view=needs");
  view.rerender(content());
  expect(screen.queryByRole("status")).toBeNull();
  expect(screen.getByText("Authorized content")).toBeVisible();
});

it("reveals recovery when a render error replaces the destination", () => {
  render(content());
  act(() =>
    window.dispatchEvent(
      new CustomEvent(navigationStartEvent, { detail: { href: "/en/inventory" } }),
    ),
  );
  act(() => window.dispatchEvent(new Event(navigationErrorEvent)));
  expect(screen.queryByRole("status")).toBeNull();
  expect(screen.getByText("Authorized content")).toBeVisible();
});
