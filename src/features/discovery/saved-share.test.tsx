import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { known } from "@/domain/facts";
import { formFields } from "@/ui/form/contract";
import { discoveryCopy } from "./copy";
import { writeSelection } from "./local-selection";
import { SavedProperties } from "./saved-properties";
import type { SavedProperty } from "./saved-property-data";
import { shareCopy } from "./share-copy";
import { type CreateShareAction, type ShareCreateState, shareFields } from "./share-state";

const copy = discoveryCopy("en");
const labels = shareCopy("en");
const savedKey = "ms-realty.saved.v1";
const key = "40000000-0000-4000-8000-000000000001";
const entryHref = "/api/public-shares/creator-session?locale=en";
const reference = (index: number) => `MS-${String(index).padStart(5, "0")}`;

function listing(ref: string, closed = false): SavedProperty {
  return {
    reference: ref,
    status: "listing",
    listing: {
      reference: ref,
      slug: ref.toLowerCase(),
      manifestId: "10000000-0000-4000-8000-000000000001",
      locale: "en",
      purpose: "sale",
      propertyType: "apartment",
      title: `Synthetic property ${ref}`,
      price: known(
        { amountMinor: 12345678, currency: "EUR", period: "total", basis: "asking" },
        { sourceClass: "agency_observed" },
      ),
      area: known({ value: 76, unit: "m2", basis: "total" }, { sourceClass: "agency_observed" }),
      bedrooms: known(2, { sourceClass: "agency_observed" }),
      place: {
        country: "BG",
        district: null,
        municipality: null,
        settlement: null,
        neighborhood: "Synthetic place",
        precision: "neighborhood",
      },
      availability: {
        presented: closed ? "sold" : "available",
        freshness: "current_under_policy",
        confirmedAt: null,
        primaryAction: closed ? "view_similar" : "request_viewing",
      },
      cover: null,
    },
  };
}

const idle: ShareCreateState = { operationId: key, outcome: { kind: "idle" } };
let action: ReturnType<typeof vi.fn<CreateShareAction>>;

function mount(
  saved: string[],
  options: { ready?: boolean; closed?: string[]; gone?: string[] } = {},
) {
  localStorage.setItem(savedKey, JSON.stringify(saved));
  const load = vi.fn(async (refs: readonly string[]) =>
    refs.map(
      (ref): SavedProperty =>
        options.gone?.includes(ref)
          ? { reference: ref, status: "unavailable" }
          : listing(ref, options.closed?.includes(ref)),
    ),
  );
  return render(
    <SavedProperties
      locale="en"
      copy={copy}
      loadAction={load}
      share={{ labels, ready: options.ready ?? true, entryHref, action, initialState: idle }}
    />,
  );
}
const panel = () => screen.getByRole("region", { name: labels.shareTitle });
const included = (ref: string) =>
  screen.getByRole("checkbox", { name: `${labels.include} ${ref}` });
const create = () => screen.getByRole("button", { name: labels.create });
const sent = (call = 0) => {
  const data = action.mock.calls[call]?.[1];
  if (!data) throw new Error("The share action was not called");
  return data;
};

beforeEach(() => {
  localStorage.clear();
  action = vi.fn<CreateShareAction>(async (previous) => previous);
});
afterEach(() => {
  cleanup();
  writeSelection("saved", []);
  writeSelection("compare", []);
  localStorage.clear();
});

describe("P08 share entry", () => {
  it("links to the creator-cookie entry, with the cookie caution, before any share form", async () => {
    mount([reference(1)], { ready: false });
    const scope = within(await screen.findByRole("region", { name: labels.shareTitle }));
    expect(scope.getByText(labels.entryBody)).toBeVisible();
    expect(scope.getByText(labels.entryCaution)).toBeVisible();
    expect(scope.getByRole("link", { name: labels.entryAction })).toHaveAttribute(
      "href",
      entryHref,
    );
    expect(scope.queryByRole("button", { name: labels.create })).toBeNull();
    expect(scope.queryByRole("checkbox")).toBeNull();
  });

  it("jumps from the toolbar to the panel", async () => {
    mount([reference(1)]);
    await screen.findByRole("region", { name: labels.shareTitle });
    expect(screen.getByRole("link", { name: labels.shareSelected })).toHaveAttribute(
      "href",
      "#share",
    );
  });
});

describe("X11 creation review", () => {
  it("lists the exact public facts of every shareable save and posts only what is included", async () => {
    const user = userEvent.setup();
    mount([reference(1), reference(2), reference(3)]);
    await screen.findByRole("region", { name: labels.shareTitle });
    const scope = within(panel());
    expect(scope.getByText(labels.reviewLead)).toBeVisible();
    const row = scope.getByText("Synthetic property MS-00002").closest("li");
    expect(row).not.toBeNull();
    const facts = within(row as HTMLElement);
    expect(facts.getByText(/123,456\.78/)).toBeVisible();
    expect(facts.getByText("Synthetic place", { exact: false })).toBeVisible();
    expect(scope.getByText(/Included in the link:/).textContent).toContain("3 / 12");

    await user.click(included(reference(2)));
    expect(scope.getByText(/Included in the link:/).textContent).toContain("2 / 12");
    await user.click(screen.getByRole("checkbox", { name: labels.reviewed }));
    await user.click(create());

    const data = sent();
    expect(data.get(formFields.operationId)).toBe(key);
    expect(data.getAll(shareFields.reference)).toEqual([reference(1), reference(3)]);
    expect(data.get(shareFields.reviewed)).toBe("yes");
  });

  it("states expiry and the limit, and leaves closed saves out with a note", async () => {
    mount([reference(1), reference(2), reference(3)], {
      closed: [reference(2)],
      gone: [reference(3)],
    });
    await screen.findByRole("region", { name: labels.shareTitle });
    const scope = within(panel());
    expect(scope.getByText(labels.expiry)).toBeVisible();
    expect(scope.getByText(labels.limit)).toBeVisible();
    expect(scope.getByText(labels.skipped)).toBeVisible();
    expect(scope.queryByText("Synthetic property MS-00002")).toBeNull();
    expect(scope.getAllByRole("checkbox", { name: new RegExp(labels.include) })).toHaveLength(1);
  });

  it("includes the first twelve of thirteen shareable saves and frees a place when one is unticked", async () => {
    const user = userEvent.setup();
    const refs = Array.from({ length: 13 }, (_, index) => reference(index + 1));
    mount(refs);
    await screen.findByRole("region", { name: labels.shareTitle });
    expect(included(reference(12))).toBeChecked();
    expect(included(reference(13))).not.toBeChecked();
    expect(included(reference(13))).toBeDisabled();
    await user.click(included(reference(1)));
    expect(included(reference(13))).toBeEnabled();
    await user.click(included(reference(13)));
    await user.click(create());
    expect(sent().getAll(shareFields.reference)).toEqual([...refs.slice(1, 12), reference(13)]);
  });

  it("says nothing can be shared when no save is currently shareable", async () => {
    mount([reference(1)], { gone: [reference(1)] });
    expect(await screen.findByText(labels.none)).toBeVisible();
    expect(screen.queryByRole("button", { name: labels.create })).toBeNull();
  });
});

describe("X11 outcomes", () => {
  it("confirms a created link, points to it and clears the review", async () => {
    const user = userEvent.setup();
    action.mockResolvedValue({
      operationId: "40000000-0000-4000-8000-000000000002",
      outcome: { kind: "created", id: "20000000-0000-4000-8000-000000000001" },
    });
    mount([reference(1)]);
    await screen.findByRole("region", { name: labels.shareTitle });
    await user.click(screen.getByRole("checkbox", { name: labels.reviewed }));
    await user.click(create());

    expect(await screen.findByText(labels.created)).toBeVisible();
    expect(screen.getByText(labels.createdBody)).toBeVisible();
    expect(screen.getByRole("link", { name: labels.goToLink })).toHaveAttribute(
      "href",
      "#share-20000000-0000-4000-8000-000000000001",
    );
    expect(screen.getByRole("checkbox", { name: labels.reviewed })).not.toBeChecked();
    // The next link is a new request with the key the server issued.
    await user.click(screen.getByRole("checkbox", { name: labels.reviewed }));
    await user.click(create());
    expect(sent(1).get(formFields.operationId)).toBe("40000000-0000-4000-8000-000000000002");
  });

  it("names the missing review and keeps the person's choices", async () => {
    const user = userEvent.setup();
    action.mockImplementation(async (previous) => ({
      ...previous,
      outcome: { kind: "invalid", fields: ["reviewed"] },
    }));
    mount([reference(1), reference(2)]);
    await screen.findByRole("region", { name: labels.shareTitle });
    await user.click(included(reference(2)));
    await user.click(create());
    expect(await screen.findByText(labels.needReview)).toBeVisible();
    expect(included(reference(2))).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: labels.reviewed })).toHaveAttribute(
      "aria-invalid",
      "true",
    );
  });

  it.each([
    ["selection_unavailable", labels.selectionUnavailable],
    ["rate_limited", labels.rateLimited],
    ["failed", labels.createFailed],
  ] as const)("words a %s rejection", async (code, text) => {
    const user = userEvent.setup();
    action.mockImplementation(async (previous) => ({
      ...previous,
      outcome: { kind: "rejected", code },
    }));
    mount([reference(1)]);
    await screen.findByRole("region", { name: labels.shareTitle });
    await user.click(create());
    expect(await screen.findByText(text)).toBeVisible();
  });

  it("sends a browser without the creator cookie back to the entry", async () => {
    const user = userEvent.setup();
    action.mockImplementation(async (previous) => ({
      ...previous,
      outcome: { kind: "rejected", code: "session_required" },
    }));
    mount([reference(1)]);
    await screen.findByRole("region", { name: labels.shareTitle });
    await user.click(create());
    expect(await screen.findByText(labels.sessionLost)).toBeVisible();
    expect(screen.getByRole("link", { name: labels.entryAction })).toHaveAttribute(
      "href",
      entryHref,
    );
  });

  it("keeps the same key and says the outcome is unknown, so a retry cannot double the link", async () => {
    const user = userEvent.setup();
    action.mockImplementation(async (previous) => ({
      ...previous,
      outcome: { kind: "unknown" },
    }));
    mount([reference(1)]);
    await screen.findByRole("region", { name: labels.shareTitle });
    await user.click(create());
    expect(await screen.findByText(labels.createUnknown)).toBeVisible();
    await user.click(create());
    expect(sent(1).get(formFields.operationId)).toBe(key);
  });
});
