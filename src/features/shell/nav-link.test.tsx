import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import enNav from "../../../messages/en/nav.json";
import heNav from "../../../messages/he/nav.json";
import { NavLink } from "./nav-link";

const location = vi.hoisted(() => ({ pathname: "" }));
vi.mock("next/navigation", () => ({ usePathname: () => location.pathname }));
afterEach(cleanup);

it.each([
  ["en", enNav.journey.appointments],
  ["he", heNav.journey.appointments],
] as const)(
  "gives a compact %s destination its full accessible name while retaining title and current section",
  (locale, label) => {
    location.pathname = `/${locale}/appointments/selected`;
    const href = `/${locale}/appointments`;
    const { rerender } = render(
      <NavLink href={href} aria-label={label} title={label}>
        <span>…</span>
      </NavLink>,
    );
    const link = screen.getByRole("link", { name: label });
    expect(link).toHaveAttribute("href", href);
    expect(link).toHaveAttribute("aria-current", "page");
    expect(link).toHaveAttribute("title", label);
    expect(link).toHaveTextContent("…");
    rerender(<NavLink href={href}>Visible destination</NavLink>);
    expect(screen.getByRole("link", { name: "Visible destination" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  },
);
