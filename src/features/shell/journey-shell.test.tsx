import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import enA11y from "../../../messages/en/a11y.json";
import enNav from "../../../messages/en/nav.json";
import heA11y from "../../../messages/he/a11y.json";
import heNav from "../../../messages/he/nav.json";
import { JourneyShell } from "./journey-shell";

const location = vi.hoisted(() => ({ pathname: "/en/overview", refresh: vi.fn() }));
vi.mock("next/navigation", () => ({
  usePathname: () => location.pathname,
  useSearchParams: () => new URLSearchParams("source=current"),
  useRouter: () => ({ refresh: location.refresh }),
}));
vi.mock("next-intl/server", () => ({
  getTranslations: async ({ locale, namespace }: { locale: string; namespace: string }) => {
    const catalogs = locale === "he" ? { nav: heNav, a11y: heA11y } : { nav: enNav, a11y: enA11y };
    return (key: string) =>
      key
        .split(".")
        .reduce<unknown>(
          (value, part) => (value as Record<string, unknown>)[part],
          catalogs[namespace as "nav" | "a11y"],
        ) as string;
  },
}));
afterEach(cleanup);

it.each(["en", "he"] as const)(
  "retains all five real native destinations, current state and private content in %s",
  async (locale) => {
    location.pathname = `/${locale}/overview`;
    const { container } = render(
      await JourneyShell({ locale, children: <p>Authorized Case content</p> }),
    );
    const expected = ["overview", "properties", "appointments", "messages", "documents"].map(
      (path) => `/${locale}/${path}`,
    );
    const navigations = container.querySelectorAll("nav");
    expect(navigations).toHaveLength(2);
    for (const navigation of navigations) {
      expect(
        [...navigation.querySelectorAll("a")].map((link) => link.getAttribute("href")),
      ).toEqual(expected);
      expect(navigation.querySelectorAll('[aria-current="page"]')).toHaveLength(1);
      expect(navigation.querySelector('[aria-current="page"]')).toHaveAttribute(
        "href",
        expected[0],
      );
      for (const icon of navigation.querySelectorAll("img")) {
        expect(icon).toHaveAttribute("width", "20");
        expect(icon).toHaveAttribute("height", "20");
        expect(icon.getAttribute("src")).toMatch(/^\/brand\/journey\/.+\.svg$/);
      }
    }
    expect(screen.getByRole("main")).toHaveAttribute("id", "main");
    expect(screen.getByRole("main")).toHaveAttribute("tabindex", "-1");
    expect(container.querySelector("a")).toHaveAttribute("href", "#main");
    expect(container.querySelector("[data-private-content]")).toHaveAttribute(
      "data-private-ready",
      "true",
    );
    expect(screen.getByText("Authorized Case content")).toBeVisible();
  },
);

it("keeps the native menu closed initially and locale links outside it so either disclosure remains usable", async () => {
  location.pathname = "/en/overview";
  const { container } = render(
    await JourneyShell({
      locale: "en",
      caseSwitcher: <a href="/en/overview">Complete Case identity</a>,
      children: <p>Authorized Case content</p>,
    }),
  );
  const menu = screen.getByRole("button", { name: "Menu" });
  const details = menu.closest("details");
  expect(menu.tagName).toBe("SUMMARY");
  expect(details).not.toHaveAttribute("open");
  expect(details?.querySelector("nav a")).toHaveAttribute("href", "/en/overview");
  expect(details).toHaveTextContent("Complete Case identity");
  expect(details?.querySelector("details")).toBeNull();
  const languageLinks = container.querySelectorAll('a[hreflang="he"]');
  expect(languageLinks).toHaveLength(2);
  for (const link of languageLinks)
    expect(link).toHaveAttribute("href", "/he/overview?source=current");
  expect(container.querySelector('a[href*="/help"]')).toBeNull();
});
