import { cleanup, render } from "@testing-library/react";
import type { AnchorHTMLAttributes, ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { requestPathHeader } from "@/i18n/config";
import { PublicShell } from "./public-shell";

const state = vi.hoisted(() => ({ path: "/ru/legacy/0442585901845f0312ec1ad0" }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ [requestPathHeader]: state.path, "accept-language": "en" }),
  cookies: async () => new Map(),
}));
vi.mock("next/navigation", () => ({
  usePathname: () => state.path,
  useSearchParams: () => new URLSearchParams("source=kept"),
}));
vi.mock("next-intl/server", () => ({ getTranslations: async () => (key: string) => key }));
vi.mock("next/link", () => ({
  default: ({
    children,
    onNavigate: _onNavigate,
    prefetch: _prefetch,
    ...props
  }: AnchorHTMLAttributes<HTMLAnchorElement> & { onNavigate?: unknown; prefetch?: unknown }) => (
    <a {...props}>{children}</a>
  ),
}));
vi.mock("next/image", () => ({ default: () => null }));
vi.mock("./sticky-header", () => ({
  StickyHeader: ({ children }: { children: ReactNode }) => (
    <header data-public-header>{children}</header>
  ),
}));
vi.mock("./navigation-loading", () => ({ NavigationLoading: () => null }));
afterEach(cleanup);

it("P21 PublicShell binds both the server suggestion and native header options to the actual retained edition", async () => {
  state.path = "/ru/legacy/0442585901845f0312ec1ad0";
  const { container } = render(
    await PublicShell({ locale: "ru", children: <p>Recorded source context</p> }),
  );
  const header = container.querySelector("header[data-public-header]");
  expect(header?.querySelector('a[hreflang="en"]')).toBeNull();
  expect(header?.querySelector('a[hreflang="ru"]')).toHaveAttribute(
    "href",
    `${state.path}?source=kept`,
  );
  expect(container.querySelector('section[lang="en"]')).toBeNull();
});

it("F01 PublicShell retains ordinary same-page language choices and a supported browser-language suggestion", async () => {
  state.path = "/ru/properties";
  const { container } = render(
    await PublicShell({ locale: "ru", children: <p>Current search context</p> }),
  );
  expect(container.querySelector('header a[hreflang="en"]')).toHaveAttribute(
    "href",
    "/en/properties?source=kept",
  );
  expect(container.querySelector('section[lang="en"] a[hreflang="en"]')).toHaveAttribute(
    "href",
    "/en/properties?source=kept",
  );
});
