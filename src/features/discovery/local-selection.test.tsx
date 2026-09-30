import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { discoveryCopy } from "./copy";
import {
  LocalActions,
  LocalSelection,
  RemoveComparison,
  selectedReferences,
} from "./local-selection";

const copy = discoveryCopy("en");
const key = "ms-realty.compare.v1";
beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  localStorage.clear();
});

it("lets the URL selection populate empty storage without showing an empty or competing browser list", () => {
  const refs = ["MS-00003", "MS-00001", "MS-00002"];
  const { rerender } = render(
    <LocalSelection kind="compare" locale="en" copy={copy} canonicalReferences={refs} />,
  );
  expect(JSON.parse(localStorage.getItem(key) ?? "null")).toEqual(refs);
  expect(screen.queryByText(copy.emptySaved)).not.toBeInTheDocument();
  expect(screen.queryByRole("list")).not.toBeInTheDocument();
  expect(screen.getByText(copy.localOnly)).toBeVisible();
  rerender(
    <>
      <LocalSelection kind="compare" locale="en" copy={copy} canonicalReferences={refs} />
      <LocalActions reference="MS-00003" copy={copy} />
    </>,
  );
  expect(screen.getByRole("button", { name: copy.compare })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  rerender(
    <LocalSelection
      kind="compare"
      locale="en"
      copy={copy}
      canonicalReferences={["MS-00003", "MS-00002"]}
    />,
  );
  expect(JSON.parse(localStorage.getItem(key) ?? "null")).toEqual(["MS-00003", "MS-00002"]);
  rerender(<LocalSelection kind="compare" locale="en" copy={copy} canonicalReferences={[]} />);
  expect(localStorage.getItem(key)).toBe("[]");
  expect(screen.queryByText(copy.emptySaved)).not.toBeInTheDocument();
});

it("restores a cached comparison URL's ordered selection on Back/pageshow", () => {
  const refs = ["MS-00001", "MS-00002", "MS-00003"];
  render(<LocalSelection kind="compare" locale="en" copy={copy} canonicalReferences={refs} />);
  localStorage.setItem(key, JSON.stringify(["MS-00001", "MS-00003"]));
  act(() => window.dispatchEvent(new Event("pageshow")));
  expect(JSON.parse(localStorage.getItem(key) ?? "null")).toEqual(refs);
  expect(screen.queryByText(copy.emptySaved)).not.toBeInTheDocument();
});

it("removes via an actual URL and synchronizes browser storage during the click", () => {
  localStorage.setItem(key, JSON.stringify(["MS-00001", "MS-00002", "MS-00003"]));
  render(
    <RemoveComparison
      reference="MS-00002"
      remaining={["MS-00001", "MS-00003"]}
      locale="en"
      copy={copy}
    />,
  );
  const link = screen.getByRole("link", { name: `${copy.remove} MS-00002` });
  expect(link).toHaveAttribute("href", "/en/compare?references=MS-00001,MS-00003");
  // jsdom cannot navigate; retain the real default GET target while testing its storage side effect.
  link.addEventListener("click", (event) => event.preventDefault(), { once: true });
  fireEvent.click(link);
  expect(JSON.parse(localStorage.getItem(key) ?? "null")).toEqual(["MS-00001", "MS-00003"]);
});

it("keeps the saved page as an explicit browser-local list", () => {
  localStorage.setItem("ms-realty.saved.v1", JSON.stringify(["MS-00002", "MS-00001"]));
  render(<LocalSelection kind="saved" locale="en" copy={copy} />);
  expect(screen.getByRole("list")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: copy.compare })).toHaveAttribute(
    "href",
    "/en/compare?references=MS-00002,MS-00001",
  );
  fireEvent.click(screen.getByRole("button", { name: `${copy.remove} MS-00002` }));
  expect(screen.queryByRole("link", { name: "MS-00002" })).not.toBeInTheDocument();
  expect(JSON.parse(localStorage.getItem("ms-realty.saved.v1") ?? "null")).toEqual(["MS-00001"]);
});

it("bounds corrupt browser-local data without affecting strict URL validation", () => {
  expect(
    selectedReferences(
      '["MS-00003",false,"bad","MS-00003","MS-00001","MS-00002","MS-00004"]',
      "compare",
    ),
  ).toEqual(["MS-00003", "MS-00001", "MS-00002"]);
  expect(selectedReferences("not JSON", "compare")).toEqual([]);
});

it("shows storage failure while retaining the canonical selection for this document", () => {
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("Synthetic storage denial");
  });
  const { rerender } = render(
    <LocalSelection kind="compare" locale="en" copy={copy} canonicalReferences={["MS-00003"]} />,
  );
  expect(screen.getByRole("status")).toHaveTextContent(copy.storageFailed);
  expect(screen.queryByText(copy.emptySaved)).not.toBeInTheDocument();
  rerender(
    <>
      <LocalSelection kind="compare" locale="en" copy={copy} canonicalReferences={["MS-00003"]} />
      <LocalActions reference="MS-00003" copy={copy} />
    </>,
  );
  expect(screen.getByRole("button", { name: copy.compare })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  // A successful canonical write clears the module's temporary fallback before the next test.
  vi.restoreAllMocks();
  rerender(<LocalSelection kind="compare" locale="en" copy={copy} canonicalReferences={[]} />);
  expect(localStorage.getItem(key)).toBe("[]");
});
