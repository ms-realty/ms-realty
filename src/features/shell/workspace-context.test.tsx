import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { WorkspaceContext } from "./workspace-context";

const location = vi.hoisted(() => ({ path: "/en/access/absence/member-1" }));
vi.mock("next/navigation", () => ({ usePathname: () => location.path }));
afterEach(cleanup);
const items = [
  { href: "/en/access/manage", matchPath: "/en/access", label: "Manage access" },
  { href: "/en/settings?section=security", matchPath: "/en/access/enrol", label: "Security" },
];
it("O23 nested absence and offboarding return to a real management page", () => {
  for (const path of ["/en/access/absence/member-1", "/en/access/offboard/member-1"]) {
    location.path = path;
    const { unmount } = render(
      <WorkspaceContext label="Workspace" navigationLabel="Breadcrumb" items={items} />,
    );
    expect(screen.getByRole("link", { name: "Manage access" })).toHaveAttribute(
      "href",
      "/en/access/manage",
    );
    unmount();
  }
});
it("backup enrolment belongs to Security, with no management breadcrumb", () => {
  location.path = "/en/access/enrol";
  render(<WorkspaceContext label="Workspace" navigationLabel="Breadcrumb" items={items} />);
  expect(screen.getByText("Security", { exact: true })).toHaveAttribute("aria-current", "page");
  expect(screen.queryByText("Manage access", { exact: true })).toBeNull();
});
