import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { NotFoundContent } from "./not-found-content";

const request = vi.hoisted(() => ({ path: "/en/inventory/operations/unknown" }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-app-path": request.path }),
}));
afterEach(cleanup);

it("names Today and the parent list on a staff 404 without printing the missing URL", async () => {
  const { container } = render(await NotFoundContent({ locale: "en", surface: "staff" }));
  expect(screen.getByRole("link", { name: "Back to Today" })).toHaveAttribute("href", "/en/today");
  expect(screen.getByRole("link", { name: "Back to list" })).toHaveAttribute(
    "href",
    "/en/inventory",
  );
  expect(container.textContent).not.toContain("unknown");
  expect(container.firstChild).not.toHaveClass("mx-auto");
});

it("offers public search and the agency phone in the visitor's language", async () => {
  request.path = "/he/areas/missing";
  render(await NotFoundContent({ locale: "he", surface: "public" }));
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("הדף לא נמצא");
  expect(screen.getByRole("link", { name: "חיפוש נכסים" })).toHaveAttribute(
    "href",
    "/he/properties",
  );
  expect(screen.getByRole("link", { name: /359 879 696 870/ })).toHaveAttribute(
    "href",
    "tel:+359879696870",
  );
});
