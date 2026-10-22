import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { known } from "@/domain/facts";
import { discoveryCopy } from "./copy";
import { writeSelection } from "./local-selection";
import { savedCopy } from "./saved-copy";
import { SavedProperties } from "./saved-properties";
import type { SavedProperty } from "./saved-property-data";

const copy = discoveryCopy("en");
const labels = savedCopy("en");
const refs: [string, string, string, string] = ["MS-00001", "MS-00002", "MS-00003", "MS-00004"];
const savedKey = "ms-realty.saved.v1";
const compareKey = "ms-realty.compare.v1";
function item(reference: string): SavedProperty {
  return {
    reference,
    status: "listing",
    listing: {
      reference,
      slug: reference.toLowerCase(),
      manifestId: "10000000-0000-4000-8000-000000000001",
      locale: "en",
      purpose: "sale",
      propertyType: "apartment",
      title: `Synthetic property ${reference}`,
      price: known(
        { amountMinor: 12345678, currency: "EUR", period: "total", basis: "asking" },
        { sourceClass: "agency_observed" },
      ),
      area: known({ value: 76, unit: "m2", basis: "total" }, { sourceClass: "agency_observed" }),
      bedrooms: { state: "unknown" },
      place: {
        country: "BG",
        district: null,
        municipality: null,
        settlement: null,
        neighborhood: "Synthetic place",
        precision: "neighborhood",
      },
      availability: {
        presented: "available",
        freshness: "current_under_policy",
        confirmedAt: null,
        primaryAction: "request_viewing",
      },
      cover: null,
    },
  };
}
const load = vi.fn(async (references: readonly string[]) => references.map(item));
const checkbox = (reference: string) =>
  screen.getByRole("checkbox", { name: `${labels.select} ${reference}` });
beforeEach(() => {
  localStorage.clear();
  localStorage.setItem(savedKey, JSON.stringify(refs));
  load.mockClear();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  writeSelection("saved", []);
  writeSelection("compare", []);
  localStorage.clear();
});

it("selects second and fourth deliberately, retains all saves, and restores the ordered choice on reopening", async () => {
  const view = render(<SavedProperties locale="en" copy={copy} loadAction={load} />);
  await screen.findByRole("heading", { name: `Synthetic property ${refs[3]}` });
  expect(screen.getByRole("button", { name: labels.compareSelected })).toBeDisabled();
  fireEvent.click(checkbox(refs[1]));
  fireEvent.click(checkbox(refs[3]));
  expect(screen.getByRole("link", { name: labels.compareSelected })).toHaveAttribute(
    "href",
    `/en/compare?references=${refs[1]},${refs[3]}`,
  );
  expect(JSON.parse(localStorage.getItem(savedKey) ?? "null")).toEqual(refs);
  expect(JSON.parse(localStorage.getItem(compareKey) ?? "null")).toEqual([refs[1], refs[3]]);
  view.unmount();
  render(<SavedProperties locale="en" copy={copy} loadAction={load} />);
  await screen.findByRole("heading", { name: `Synthetic property ${refs[3]}` });
  expect(checkbox(refs[1])).toBeChecked();
  expect(checkbox(refs[3])).toBeChecked();
  expect(screen.getAllByRole("article")).toHaveLength(4);
  fireEvent.click(checkbox(refs[0]));
  expect(checkbox(refs[2])).toBeDisabled();
  expect(checkbox(refs[1])).toBeEnabled();
  fireEvent.click(checkbox(refs[1]));
  expect(checkbox(refs[2])).toBeEnabled();
});

it("removes locally and genuinely undoes the original saved and comparison order", async () => {
  localStorage.setItem(compareKey, JSON.stringify([refs[1], refs[3]]));
  render(<SavedProperties locale="en" copy={copy} loadAction={load} />);
  await screen.findByRole("heading", { name: `Synthetic property ${refs[3]}` });
  fireEvent.click(screen.getByRole("button", { name: `${copy.remove} ${refs[1]}` }));
  expect(JSON.parse(localStorage.getItem(savedKey) ?? "null")).toEqual([refs[0], refs[2], refs[3]]);
  expect(screen.getByRole("button", { name: labels.undo })).toHaveFocus();
  fireEvent.click(screen.getByRole("button", { name: labels.undo }));
  await screen.findByRole("heading", { name: `Synthetic property ${refs[1]}` });
  expect(JSON.parse(localStorage.getItem(savedKey) ?? "null")).toEqual(refs);
  expect(screen.getByRole("link", { name: labels.compareSelected })).toHaveAttribute(
    "href",
    `/en/compare?references=${refs[1]},${refs[3]}`,
  );
});

it("retains a now-unavailable selected reference and requires explicit deselection without disclosing old facts", async () => {
  localStorage.setItem(compareKey, JSON.stringify([refs[0], refs[1], refs[3]]));
  const unavailableLoad = vi.fn(async () =>
    refs.map(
      (reference): SavedProperty =>
        reference === refs[3] ? { reference, status: "unavailable" } : item(reference),
    ),
  );
  render(<SavedProperties locale="en" copy={copy} loadAction={unavailableLoad} />);
  await screen.findByText(copy.unavailable);
  expect(checkbox(refs[3])).toBeChecked();
  expect(checkbox(refs[3])).toBeEnabled();
  expect(screen.getByRole("button", { name: labels.compareSelected })).toBeDisabled();
  expect(
    screen.queryByRole("heading", { name: `Synthetic property ${refs[3]}` }),
  ).not.toBeInTheDocument();
  fireEvent.click(checkbox(refs[3]));
  expect(checkbox(refs[3])).toBeDisabled();
  expect(screen.getByRole("link", { name: labels.compareSelected })).toHaveAttribute(
    "href",
    `/en/compare?references=${refs[0]},${refs[1]}`,
  );
  expect(JSON.parse(localStorage.getItem(savedKey) ?? "null")).toEqual(refs);
});

it("removing a save does not discard comparison properties saved elsewhere", async () => {
  localStorage.setItem(compareKey, JSON.stringify(["MS-99999", refs[1]]));
  render(<SavedProperties locale="en" copy={copy} loadAction={load} />);
  await screen.findByRole("heading", { name: `Synthetic property ${refs[3]}` });
  fireEvent.click(screen.getByRole("button", { name: `${copy.remove} ${refs[1]}` }));
  expect(JSON.parse(localStorage.getItem(compareKey) ?? "null")).toEqual(["MS-99999"]);
  fireEvent.click(screen.getByRole("button", { name: labels.undo }));
  await screen.findByRole("heading", { name: `Synthetic property ${refs[1]}` });
  expect(JSON.parse(localStorage.getItem(compareKey) ?? "null")).toEqual(["MS-99999", refs[1]]);
});

it("keeps failed reads distinct from unavailable and retries without discarding saves", async () => {
  const failing = vi
    .fn()
    .mockRejectedValueOnce(new Error("Synthetic read failure"))
    .mockImplementation(load);
  render(<SavedProperties locale="en" copy={copy} loadAction={failing} />);
  await screen.findAllByText(labels.loadFailed);
  expect(screen.queryByText(copy.unavailable)).not.toBeInTheDocument();
  expect(screen.queryByText(copy.emptySaved)).not.toBeInTheDocument();
  fireEvent.click(
    within(screen.getByRole("article", { name: refs[0] })).getByRole("button", {
      name: labels.retry,
    }),
  );
  await screen.findByRole("heading", { name: `Synthetic property ${refs[3]}` });
  expect(JSON.parse(localStorage.getItem(savedKey) ?? "null")).toEqual(refs);
});

it("ignores an older read after saved references change and rechecks on native pageshow", async () => {
  let finish: (items: SavedProperty[]) => void = () => {};
  const deferred = vi
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise<SavedProperty[]>((resolve) => {
          finish = resolve;
        }),
    )
    .mockImplementation(load);
  render(<SavedProperties locale="en" copy={copy} loadAction={deferred} />);
  await waitFor(() => expect(deferred).toHaveBeenCalledOnce());
  act(() => {
    writeSelection("saved", [refs[1]]);
  });
  await screen.findByRole("heading", { name: `Synthetic property ${refs[1]}` });
  await act(async () => finish(refs.map(item)));
  expect(screen.getAllByRole("article")).toHaveLength(1);
  act(() => window.dispatchEvent(new Event("pageshow")));
  await waitFor(() => expect(deferred).toHaveBeenCalledTimes(3));
});

it("labels blocked writes as temporary but keeps the deliberate comparison usable", async () => {
  render(<SavedProperties locale="en" copy={copy} loadAction={load} />);
  await screen.findByRole("heading", { name: `Synthetic property ${refs[3]}` });
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("Synthetic storage denial");
  });
  fireEvent.click(checkbox(refs[1]));
  fireEvent.click(checkbox(refs[3]));
  expect(screen.getByText(copy.storageFailed)).toBeInTheDocument();
  expect(screen.getByRole("link", { name: labels.compareSelected })).toHaveAttribute(
    "href",
    `/en/compare?references=${refs[1]},${refs[3]}`,
  );
});

it("does not misrepresent unreadable browser storage as an empty saved list", () => {
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
    throw new Error("Synthetic storage denial");
  });
  render(<SavedProperties locale="en" copy={copy} loadAction={load} />);
  expect(screen.getByText(labels.storageUnreadable)).toBeInTheDocument();
  expect(screen.queryByText(copy.emptySaved)).not.toBeInTheDocument();
  expect(load).not.toHaveBeenCalled();
});
