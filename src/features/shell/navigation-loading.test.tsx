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
      <form method="get" action="/en/inventory">
        <input name="q" defaultValue="MS-1" aria-label="Search" />
        <button type="submit">Show</button>
      </form>
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

it("does not reactivate a completed navigation when history returns to its source", () => {
  const view = render(content());
  act(() =>
    window.dispatchEvent(
      new CustomEvent(navigationStartEvent, { detail: { href: "/en/inventory" } }),
    ),
  );
  expect(screen.getByRole("status")).toBeInTheDocument();
  route.pathname = "/en/inventory";
  window.history.replaceState(null, "", route.pathname);
  view.rerender(content());
  expect(screen.getByText("Authorized content")).toBeVisible();
  route.pathname = "/en/today";
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

it("shows the list skeleton for a GET search and keeps a POST or a cancelled submit untouched", () => {
  const stopSubmit = (event: Event) => event.preventDefault();
  window.addEventListener("submit", stopSubmit);
  try {
    render(content());
    // The suite cancels clicks (no real navigation in jsdom), so submit the form directly.
    const form = screen.getByRole("button", { name: "Show" }).closest("form");
    if (!form) throw new Error("Missing search form");
    fireEvent.submit(form);
    expect(screen.getByRole("status")).toHaveTextContent("Loading the list…");
    act(() => window.dispatchEvent(new Event("pageshow")));
    form.setAttribute("method", "post");
    fireEvent.submit(form);
    expect(screen.queryByRole("status")).toBeNull();
    form.setAttribute("method", "get");
    form.addEventListener("submit", stopSubmit, { once: true });
    fireEvent.submit(form);
    expect(screen.queryByRole("status")).toBeNull();
  } finally {
    window.removeEventListener("submit", stopSubmit);
  }
});

it("shows the page again when a leave prompt keeps the person here, or on Escape", async () => {
  vi.useFakeTimers();
  try {
    render(content());
    fireEvent.click(screen.getByRole("link", { name: "Inventory" }));
    expect(screen.getByRole("status")).toBeInTheDocument();
    const prompt = new Event("beforeunload", { cancelable: true });
    prompt.preventDefault();
    act(() => {
      window.dispatchEvent(prompt);
      vi.runAllTimers();
    });
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByText("Authorized content")).toBeVisible();

    fireEvent.click(screen.getByRole("link", { name: "Inventory" }));
    act(() => {
      window.dispatchEvent(new Event("beforeunload", { cancelable: true }));
      vi.runAllTimers();
    });
    expect(screen.getByRole("status")).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("status")).toBeNull();
  } finally {
    vi.useRealTimers();
  }
});
