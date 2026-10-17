import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ClientRouteError, StaffRouteError, StaffShellError } from "./route-error";

const location = vi.hoisted(() => ({ locale: "en", pathname: "/en/inventory/operations/unknown" }));
vi.mock("next/navigation", () => ({
  useParams: () => ({ locale: location.locale }),
  usePathname: () => location.pathname,
}));
afterEach(() => {
  cleanup();
  location.locale = "en";
  location.pathname = "/en/inventory/operations/unknown";
});

it("keeps the staff shell, focuses the error title, retries the read and offers parent recovery", async () => {
  const retry = vi.fn();
  render(
    <main aria-label="Workspace">
      <StaffRouteError error={{ digest: "1234567890", message: "secret record" }} retry={retry} />
    </main>,
  );
  expect(screen.getByRole("main", { name: "Workspace" })).toBeInTheDocument();
  await waitFor(() => expect(screen.getByRole("heading", { level: 1 })).toHaveFocus());
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(retry).toHaveBeenCalledOnce();
  expect(screen.getByRole("link", { name: "Back to list" })).toHaveAttribute(
    "href",
    "/en/inventory",
  );
  expect(screen.getByRole("link", { name: "Back to Today" })).toHaveAttribute("href", "/en/today");
  expect(screen.getByText("Reference: 1234567890")).toBeInTheDocument();
  expect(screen.queryByText(/secret record/)).not.toBeInTheDocument();
  expect(screen.getByText(/check the same receipt/)).toBeInTheDocument();
});

it("renders Hebrew recovery without a translation provider and keeps phone text isolated", () => {
  location.locale = "he";
  location.pathname = "/he/properties/unknown";
  const { container } = render(
    <ClientRouteError error={new Error("private payload")} retry={vi.fn()} />,
  );
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("לא ניתן להציג את הדף");
  expect(screen.getByRole("link", { name: "חזרה לעסקאות שלי" })).toHaveAttribute(
    "href",
    "/he/overview",
  );
  expect(container.querySelector('a[href="tel:+359879696870"] bdi')).toHaveAttribute("dir", "ltr");
  expect(container.textContent).not.toContain("private payload");
});

it("provides a main landmark when an access or shell layout fails", () => {
  render(<StaffShellError error={{ digest: "secret@example.test" }} retry={vi.fn()} />);
  expect(screen.getByRole("main")).toHaveAttribute("id", "main");
  expect(screen.queryByText(/secret@example/)).not.toBeInTheDocument();
});
