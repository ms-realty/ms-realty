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
  expect(screen.getByRole("link", { name: "Back to inventory" })).toHaveAttribute(
    "href",
    "/en/inventory",
  );
  expect(container.textContent).not.toContain("unknown");
  expect(container.firstChild).not.toHaveClass("mx-auto");
  expect(container.querySelector('a[href^="tel:"]')).toBeNull();
});

it("names a missing deal by its URL and links to the deal list, in Bulgarian", async () => {
  request.path = "/bg/cases/00000000-0000-4000-8000-000000000001";
  render(await NotFoundContent({ locale: "bg", surface: "staff" }));
  expect(screen.getByText(/^Не намерихме тази сделка\./)).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Обратно към сделките" })).toHaveAttribute(
    "href",
    "/bg/cases",
  );
  expect(screen.getByRole("link", { name: "Обратно към „Днес“" })).toHaveAttribute(
    "href",
    "/bg/today",
  );
});

it("sends a client back to their deals from a missing deal", async () => {
  request.path = "/en/overview/00000000-0000-4000-8000-000000000001";
  render(await NotFoundContent({ locale: "en", surface: "client" }));
  expect(screen.getByText(/^We could not find this deal\./)).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Back to my deals" })).toHaveAttribute(
    "href",
    "/en/overview",
  );
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
