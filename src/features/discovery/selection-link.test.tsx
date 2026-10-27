import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import { discoveryCopy } from "./copy";
import { LocalActions, writeSelection } from "./local-selection";
import { SelectionLink } from "./selection-link";

vi.mock("@/features/shell/public-nav-link", () => ({
  PublicNavLink: ({ href, children }: { href: string; children: ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));
afterEach(() => {
  cleanup();
  writeSelection("saved", []);
  writeSelection("compare", []);
  localStorage.clear();
});

it("P08/P07 keeps stable, contextual toggles and exposes their current selection in real global links", () => {
  const copy = discoveryCopy("en");
  const baseline = renderToStaticMarkup(<LocalActions reference="MS-00001" copy={copy} />);
  expect(baseline.match(/<button/g)).toHaveLength(2);
  expect(baseline.match(/disabled=/g)).toHaveLength(2);
  render(
    <>
      <SelectionLink kind="saved" locale="en">
        Saved
      </SelectionLink>
      <SelectionLink kind="compare" locale="en">
        Compare
      </SelectionLink>
      <LocalActions reference="MS-00001" copy={copy} />
    </>,
  );
  const save = screen.getByRole("button", { name: "Save in this browser · MS-00001" });
  fireEvent.click(save);
  expect(save).toHaveAttribute("aria-pressed", "true");
  expect(save).toHaveTextContent("Save in this browser");
  expect(screen.getByRole("link", { name: "Saved 1" })).toHaveAttribute("href", "/en/saved");
  fireEvent.click(screen.getByRole("button", { name: "Compare · MS-00001" }));
  expect(screen.getByRole("link", { name: "Compare 1" })).toHaveAttribute(
    "href",
    "/en/compare?references=MS-00001",
  );
  fireEvent.click(save);
  expect(save).toHaveAttribute("aria-pressed", "false");
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
});
