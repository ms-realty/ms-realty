import { cleanup, render, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";
import enA11y from "../../../messages/en/a11y.json";
import enCommon from "../../../messages/en/common.json";
import enTools from "../../../messages/staff/en/tools.json";
import enWorkspace from "../../../messages/staff/en/workspace.json";
import { permittedTools } from "./navigation";
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
    return (key: string) =>
      key
        .split(".")
        .reduce<unknown>(
          (value, part) => (value as Record<string, unknown>)[part],
          catalogs[namespace],
        ) as string;
  },
}));
afterEach(cleanup);

async function shell(search?: ReactNode) {
  const { container } = render(
    await WorkspaceShell({
      locale: "en",
      account: { name: "Synthetic Broker" },
      mayManageAccess: false,
      tools: permittedTools("en", new Set(["case.read_internal"])),
      search,
      children: <p>Authorized work</p>,
    }),
  );
  const [rail, bar] = container.querySelectorAll("header");
  const dialog = container.querySelector("dialog");
  if (!rail || !bar || !dialog) throw new Error("Missing shell landmark");
  return { rail, bar, dialog };
}

const hrefs = (root: Element) =>
  [...root.querySelectorAll("a")].map((link) => link.getAttribute("href"));

it("phones get the Figma context bar: logo, Butler and the X02 menu, no tabs or search", async () => {
  const { rail, bar } = await shell();
  expect(bar).toHaveClass("lg:hidden");
  expect(bar.querySelector('img[alt="MS Realty"]')).not.toBeNull();
  expect(within(bar).getByRole("link", { name: "Butler" })).toHaveAttribute(
    "href",
    "/en/operations/assistance",
  );
  const menu = within(bar).getByRole("link", { name: "Open menu" });
  expect(menu).toHaveAttribute("href", "/en/operations");
  expect(menu).toHaveAttribute("aria-controls", "agency-tools-menu");
  expect(hrefs(bar)).toEqual(["/en/operations/assistance", "/en/operations"]);
  expect([...bar.querySelectorAll("img")].map((icon) => icon.getAttribute("width"))).toEqual([
    "86",
    "20",
    "20",
  ]);
  expect(bar.querySelector("details, search, input, form")).toBeNull();
  // The wide-screen rail is untouched: six destinations, then Butler and More tools.
  expect(hrefs(rail).filter((href) => !href?.includes("/access/"))).toEqual([
    "/en/today",
    "/en/inquiries",
    "/en/cases",
    "/en/inventory",
    "/en/calendar",
    "/en/tasks",
    "/en/operations/assistance",
    "/en/operations",
  ]);
});

it("X02 waits closed, offers only permitted rows and marks the current page", async () => {
  const { dialog } = await shell();
  expect(dialog).not.toHaveAttribute("open");
  expect(dialog).toHaveAttribute("aria-labelledby", "agency-tools-menu-title");
  expect(dialog.querySelector("#agency-tools-menu-title")).toHaveTextContent("Agency tools");
  expect(dialog.querySelector("#agency-tools-menu-title")?.tagName).toBe("H2");
  const navigation = within(dialog).getAllByRole("navigation", { hidden: true });
  expect(navigation).toHaveLength(1);
  expect(navigation[0]).toHaveAccessibleName("Work");
  expect(hrefs(navigation[0] as HTMLElement)).toEqual([
    "/en/today",
    "/en/inquiries",
    "/en/cases",
    "/en/inventory",
    "/en/calendar",
    "/en/tasks",
    "/en/coverage",
  ]);
  const current = dialog.querySelectorAll('[aria-current="page"]');
  expect(current).toHaveLength(1);
  expect(current[0]).toHaveAttribute("href", "/en/cases");
  expect(current[0]).toHaveTextContent("Cases Context and next steps");
  // Below lg the foot keeps the person, the interface language and sign out.
  expect(dialog.querySelector("[data-workspace-account]")).toHaveTextContent("Synthetic Broker");
  expect(dialog.querySelector('a[hreflang="ru"]')).toHaveAttribute("href", "/ru/cases/case-1");
  expect(dialog.querySelector("form[method=post]")).toHaveAttribute("action", "/en/access/signout");
  expect(dialog.querySelector('form[method="dialog"] button')).toHaveAccessibleName("Close");
});

it("global search, once supplied, sits in the rail and in X02, never in the phone bar", async () => {
  const { rail, bar, dialog } = await shell(<input type="search" aria-label="Find records" />);
  expect(bar.querySelector("search, input")).toBeNull();
  for (const place of [rail, dialog])
    expect(place.querySelector('search[aria-label="Search records"] input')).toHaveAccessibleName(
      "Find records",
    );
});
