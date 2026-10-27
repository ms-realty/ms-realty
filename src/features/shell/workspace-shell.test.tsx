import { cleanup, render, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";
import enA11y from "../../../messages/en/a11y.json";
import enCommon from "../../../messages/en/common.json";
import enTools from "../../../messages/staff/en/tools.json";
import enWorkspace from "../../../messages/staff/en/workspace.json";
import { permittedTools, workspacePrimaryNav } from "./navigation";
import { WorkspaceShell } from "./workspace-shell";

const location = vi.hoisted(() => ({ pathname: "/en/cases/case-1", refresh: vi.fn() }));
vi.mock("next/navigation", () => ({
  usePathname: () => location.pathname,
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ refresh: location.refresh }),
}));
vi.mock("next-intl/server", () => ({
  getTranslations: async ({ namespace }: { namespace: string }) => {
    const catalogs: Record<string, unknown> = {
      a11y: enA11y,
      common: enCommon,
      tools: enTools,
      workspace: enWorkspace,
    };
    const read = (key: string) =>
      key
        .split(".")
        .reduce<unknown>(
          (value, part) => (value as Record<string, unknown>)[part],
          catalogs[namespace],
        ) as string;
    return Object.assign(read, { raw: read });
  },
}));
afterEach(cleanup);

async function shell(search?: ReactNode) {
  const { container } = render(
    await WorkspaceShell({
      locale: "en",
      account: { name: "Synthetic Broker", detail: "broker@example.test" },
      mayManageAccess: false,
      primary: workspacePrimaryNav,
      tools: permittedTools(
        "en",
        new Set([
          "inquiry.read",
          "case.read",
          "listing.read",
          "appointment.manage",
          "task.manage",
          "case.read_internal",
        ]),
      ),
      search,
      children: <p>Authorized work</p>,
    }),
  );
  const rail = container.querySelector("aside");
  const bar = container.querySelector<HTMLElement>("header > div.lg\\:hidden");
  const dialog = container.querySelector("dialog");
  if (!rail || !bar || !dialog) throw new Error("Missing shell landmark");
  return { rail, bar, dialog, container };
}
const hrefs = (root: Element) =>
  [...root.querySelectorAll("a")].map((link) => link.getAttribute("href"));

it("O01 groups everyday work and people/property in one rail, with a single page-picker entry", async () => {
  const { rail, bar } = await shell();
  expect(within(rail).getByRole("heading", { name: "Work" })).toHaveAttribute(
    "id",
    "sidebar-work-title",
  );
  expect(within(rail).getByRole("heading", { name: "People & property" })).toHaveAttribute(
    "id",
    "sidebar-records-title",
  );
  expect(hrefs(rail).filter((href) => href?.startsWith("/en/operations"))).toEqual([
    "/en/operations",
    "/en/operations/assistance",
  ]);
  expect(hrefs(rail)).toContain("/en/contacts");
  expect(hrefs(bar)).toEqual(["/en/operations", "/en/today", "/en/operations/assistance"]);
  expect(within(bar).getByRole("link", { name: enWorkspace.openNavigation })).toHaveAttribute(
    "aria-controls",
    "agency-tools-menu",
  );
  expect(bar.querySelector("search, input, form, details")).toBeNull();
});

it("X02 starts closed, offers permitted native page links and preserves a personal destination", async () => {
  const { dialog } = await shell();
  expect(dialog).not.toHaveAttribute("open");
  expect(dialog).toHaveAttribute("aria-labelledby", "agency-tools-menu-title");
  expect(dialog.querySelector("#agency-tools-menu-title")).toHaveTextContent("All pages");
  const navigation = within(dialog).getAllByRole("navigation", { hidden: true });
  expect(navigation).toHaveLength(2);
  expect(hrefs(navigation[0] as HTMLElement)).toEqual([
    "/en/today",
    "/en/inquiries",
    "/en/cases",
    "/en/inventory",
    "/en/calendar",
    "/en/tasks",
    "/en/contacts",
    "/en/operations/consultations",
    "/en/coverage",
  ]);
  expect(hrefs(navigation[1] as HTMLElement)).toEqual(["/en/settings"]);
  expect(dialog.querySelector("[data-workspace-account]")?.closest("a")).toHaveAccessibleName(
    "Profile & settings: Synthetic Broker broker@example.test",
  );
  expect(hrefs(dialog)).not.toContain("/en/access/manage");
  const current = dialog.querySelectorAll('[aria-current="page"]');
  expect(current).toHaveLength(1);
  expect(current[0]).toHaveAttribute("href", "/en/cases");
  expect(dialog.querySelector('form[method="dialog"] button')).toHaveAccessibleName("Close");
  expect(dialog.querySelector("form[method=post]")).toHaveAttribute("action", "/en/access/signout");
});

it("personal account uses a native disclosure; the sidebar toggle has a guarded native POST", async () => {
  const { rail, container } = await shell();
  const account = rail.querySelector("details");
  expect(account).not.toHaveAttribute("open");
  expect(account?.querySelector("summary")).toHaveAccessibleName(
    "Account: Synthetic Broker broker@example.test",
  );
  expect(account?.querySelector('a[href="/en/settings"]')).toHaveTextContent("Profile & settings");
  expect(account?.querySelector('a[href="/en/access/manage"]')).toBeNull();
  expect(container.querySelector('form[action="/en/settings/navigation"]')).toHaveAttribute(
    "method",
    "post",
  );
});

it("an actual supplied record search stays distinct from the page-name filter", async () => {
  const { rail, bar, dialog } = await shell(<input type="search" aria-label="Find records" />);
  expect(bar.querySelector("search, input")).toBeNull();
  for (const place of [rail, dialog])
    expect(place.querySelector('search[aria-label="Search records"] input')).toHaveAccessibleName(
      "Find records",
    );
  expect(dialog.querySelector("[data-page-filter]")).toHaveAccessibleName(enTools.searchPages);
});
