// O04, F20, L16: the paged authorized read seam, native controls and truthful recovery.
import { cleanup, render, screen, within } from "@testing-library/react";
import { notFound } from "next/navigation";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Session } from "@/server/auth/sessions";
import { AppError } from "@/server/errors";
import { directoryCopy } from "./directory-copy";
import { CaseDirectoryScreen } from "./directory-screen";

const queryCaseIndex = vi.hoisted(() => vi.fn());
vi.mock("@/db/client", () => ({ getDb: () => "test-db" }));
vi.mock("@/server/cases/index-query", () => ({ queryCaseIndex }));
vi.mock("./directory-actions", () => ({ applyCaseDirectoryFilters: vi.fn() }));

const session = { account: { kind: "staff", id: "current-broker" } } as Session;
const filter = "9de056a5-8740-4280-af12-a541bf01edb5";
const row = (overrides: Record<string, unknown> = {}) => ({
  id: "case-one",
  reference: "CS-SYN-142",
  title: "Synthetic family home search",
  kind: "buyer",
  stage: "needs_agreed",
  disposition: "active",
  ownerId: "a34f47e5-a325-4983-b757-e1008b6448d3",
  ownerName: "Synthetic broker",
  partyLabel: "Synthetic participant",
  needsCoverage: false,
  nextAction: "Review synthetic requirements",
  nextActionState: "unscheduled",
  needsReasons: ["next_action_unscheduled"],
  ...overrides,
});
const page = (rows = [row()], extra: Record<string, unknown> = {}) => ({
  rows,
  total: rows.length,
  nextCursor: null,
  ...extra,
});
const table = () => screen.getByRole("table", { name: "Deal list" });

beforeEach(() => {
  vi.clearAllMocks();
  queryCaseIndex.mockResolvedValue(page());
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it("uses the paged read and shows stable identity, all seven columns and the authorized next step", async () => {
  render(await CaseDirectoryScreen({ locale: "en", session }));
  expect(queryCaseIndex).toHaveBeenCalledWith(
    "test-db",
    session,
    expect.objectContaining({ collection: "all", search: "", pageSize: 25 }),
  );
  expect(screen.getByRole("heading", { level: 1, name: "Deals" })).toBeVisible();
  expect(
    within(table())
      .getAllByRole("columnheader")
      .map((cell) => cell.textContent),
  ).toEqual([
    "Purpose",
    "Party",
    "Type",
    "Stage",
    "Disposition",
    "Accountable broker",
    "Next action",
  ]);
  expect(
    within(table()).getByRole("link", { name: "Synthetic family home search" }),
  ).toHaveAttribute("href", "/en/cases/case-one");
  for (const value of [
    "CS-SYN-142",
    "Synthetic participant",
    "Buying",
    "Agreeing requirements",
    "Active",
    "Review synthetic requirements",
    "Next action needs a due date",
  ])
    expect(within(table()).getByText(value, { exact: true })).toBeVisible();
  expect(screen.getByText("Deals: 1")).toBeVisible();
  expect(screen.getByRole("link", { name: directoryCopy("en").openWaiting })).toHaveAttribute(
    "href",
    "/en/cases/case-one",
  );
  expect(screen.getByRole("link", { name: "More tools" })).toHaveAttribute(
    "href",
    "/en/operations",
  );
});

it("passes every filter to the server and preserves opaque context when changing scope or owner", async () => {
  render(
    await CaseDirectoryScreen({
      locale: "en",
      session,
      query: {
        filter,
        q: "  CS-SYN  ",
        purpose: "home",
        party: "Synthetic",
        kind: "buyer",
        stage: "needs_agreed",
        disposition: "active",
        owner: "me",
        nextAction: "requirements",
        actionState: "unscheduled",
        size: "10",
        cursor: "oldcursor",
        view: "needs",
      },
    }),
  );
  expect(queryCaseIndex).toHaveBeenCalledWith(
    "test-db",
    session,
    expect.objectContaining({
      collection: "needs",
      search: "CS-SYN",
      purpose: "home",
      party: "Synthetic",
      kind: "buyer",
      stage: "needs_agreed",
      disposition: "active",
      ownerId: session.account.id,
      nextAction: "requirements",
      nextActionState: "unscheduled",
      pageSize: 10,
      cursor: "oldcursor",
    }),
  );
  expect(screen.getByLabelText("Search")).toHaveValue("CS-SYN");
  expect(screen.getByLabelText("Search")).toHaveAccessibleDescription(
    "Deal number, purpose or linked party",
  );
  expect(screen.getByLabelText("Purpose")).toHaveValue("home");
  expect(screen.getByLabelText("Party")).toHaveValue("Synthetic");
  expect(screen.getByLabelText("Next action")).toHaveValue("requirements");
  expect(screen.getByLabelText("Accountable broker")).toHaveValue("me");
  const mine = within(screen.getByRole("navigation", { name: "Deal scope" })).getByRole("link", {
    name: "Mine",
  });
  const target = new URL(mine.getAttribute("href") ?? "", "https://example.test");
  expect(target.searchParams.get("filter")).toBe(filter);
  expect(target.searchParams.get("view")).toBe("mine");
  expect(target.searchParams.get("kind")).toBe("buyer");
  for (const field of ["q", "purpose", "party", "nextAction", "cursor"])
    expect(target.searchParams.has(field)).toBe(false);
  const owner = within(table()).getByRole("link", { name: "Accountable broker: Synthetic broker" });
  const ownerTarget = new URL(owner.getAttribute("href") ?? "", "https://example.test");
  expect(ownerTarget.searchParams.get("owner")).toBe(row().ownerId);
  expect(ownerTarget.searchParams.get("filter")).toBe(filter);
  expect(ownerTarget.searchParams.has("cursor")).toBe(false);
});

it("uses exact authorized totals independently of page size, with next and first page links", async () => {
  queryCaseIndex.mockResolvedValue(
    page(
      Array.from({ length: 25 }, (_, index) => row({ id: `case-${index}` })),
      { total: 51, nextCursor: "nextcursor" },
    ),
  );
  render(
    await CaseDirectoryScreen({
      locale: "en",
      session,
      query: { filter, q: "private", view: "needs", cursor: "previouscursor" },
    }),
  );
  expect(screen.getByText("Deals: 51")).toBeVisible();
  expect(screen.getByText("On this page: 25")).toBeVisible();
  const pagination = screen.getByRole("navigation", { name: "Deal pages" });
  expect(within(pagination).getByRole("link", { name: "Next page" })).toHaveAttribute(
    "href",
    `/en/cases?view=needs&cursor=nextcursor&filter=${filter}`,
  );
  expect(within(pagination).getByRole("link", { name: "Back to the first page" })).toHaveAttribute(
    "href",
    `/en/cases?view=needs&filter=${filter}`,
  );
});

it("keeps closed, paused, unavailable-owner and restricted-action projections truthful", async () => {
  queryCaseIndex.mockResolvedValue(
    page([
      row({
        id: "paused",
        disposition: "paused",
        needsCoverage: true,
        ownerName: "Former broker",
        nextAction: null,
        waitingOn: "Synthetic dependency",
        reviewAt: new Date("2030-01-01T08:00:00Z"),
        nextActionState: "review_due",
        needsReasons: ["paused_review_due"],
      }),
      row({
        id: "closed",
        disposition: "closed",
        needsCoverage: true,
        nextAction: null,
        nextActionState: "none",
        needsReasons: [],
      }),
      row({
        id: "restricted",
        partyLabel: null,
        nextAction: undefined,
        nextActionState: "restricted",
        needsReasons: [],
      }),
    ]),
  );
  render(await CaseDirectoryScreen({ locale: "en", session }));
  expect(within(table()).getByText("Paused", { exact: true })).toBeVisible();
  expect(within(table()).getByText("Closed", { exact: true })).toBeVisible();
  expect(
    within(table()).getByText("Work without an owner · Last accepted owner: Former broker"),
  ).toBeVisible();
  expect(within(table()).getByText("Synthetic dependency").closest("p")).toHaveTextContent(
    "Waiting on: Synthetic dependency",
  );
  expect(within(table()).getByText("Paused deal needs review")).toBeVisible();
  expect(within(table()).getByText("Internal action unavailable")).toBeVisible();
  expect(within(table()).getByText("No linked party")).toBeVisible();
  expect(within(table()).getByText("No active action")).toBeVisible();
  expect(table().querySelector("time")).toHaveAttribute("datetime", "2030-01-01T08:00:00.000Z");
});

it("keeps first-use, filtered, Mine and Needs empty states apart", async () => {
  queryCaseIndex.mockResolvedValue(page([]));
  render(await CaseDirectoryScreen({ locale: "en", session }));
  expect(screen.getByRole("heading", { level: 2, name: directoryCopy("en").empty })).toBeVisible();
  expect(screen.getByRole("link", { name: "Open inquiries" })).toHaveAttribute(
    "href",
    "/en/inquiries",
  );
  cleanup();
  render(
    await CaseDirectoryScreen({
      locale: "en",
      session,
      query: { view: "mine", filter, q: "private no match", kind: "buyer" },
    }),
  );
  expect(screen.getByRole("heading", { name: directoryCopy("en").noMatch })).toBeVisible();
  expect(screen.getByText("private no match")).toBeVisible();
  expect(
    screen
      .getAllByRole("link", { name: "Clear filters" })
      .every((link) => link.getAttribute("href") === "/en/cases?view=mine"),
  ).toBe(true);
  cleanup();
  for (const view of ["mine", "needs"] as const) {
    render(await CaseDirectoryScreen({ locale: "en", session, query: { view } }));
    expect(
      screen.getByRole("heading", {
        name: view === "mine" ? directoryCopy("en").noMine : directoryCopy("en").noNeeds,
      }),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: "Show all accessible deals" })).toHaveAttribute(
      "href",
      "/en/cases",
    );
    cleanup();
  }
});

it("does not call an exhausted later page a no-match result", async () => {
  queryCaseIndex.mockResolvedValue(page([], { total: 3 }));
  render(await CaseDirectoryScreen({ locale: "en", session, query: { cursor: "tail" } }));
  expect(screen.getByRole("heading", { name: directoryCopy("en").pageEmpty })).toBeVisible();
  expect(screen.getByText("Deals: 3")).toBeVisible();
  expect(screen.getByRole("link", { name: "Back to the first page" })).toHaveAttribute(
    "href",
    "/en/cases",
  );
  expect(screen.queryByText(directoryCopy("en").noMatch)).toBeNull();
});

it("keeps a failed read separate and retries the exact opaque page without exposing error detail", async () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  queryCaseIndex.mockRejectedValue(new Error("private database host"));
  render(
    await CaseDirectoryScreen({
      locale: "en",
      session,
      query: { filter, q: "private", view: "needs", cursor: "tail" },
    }),
  );
  expect(screen.getByRole("heading", { name: directoryCopy("en").failed })).toBeVisible();
  expect(screen.getByRole("link", { name: "Try again" })).toHaveAttribute(
    "href",
    `/en/cases?view=needs&cursor=tail&filter=${filter}`,
  );
  expect(screen.queryByRole("table")).toBeNull();
  expect(screen.queryByText(/^Deals: /)).toBeNull();
  expect(screen.queryByText("private database host")).toBeNull();
  expect(log).toHaveBeenCalledWith("[O04] case list unavailable:", "Error");
});

it("rejects an invalid cursor with first-page recovery and never silently retries unfiltered", async () => {
  queryCaseIndex.mockRejectedValue(
    new AppError("validation_failed", { fieldErrors: { cursor: ["Invalid"] } }),
  );
  render(
    await CaseDirectoryScreen({
      locale: "en",
      session,
      query: { filter, q: "private", kind: "buyer", cursor: "tampered" },
    }),
  );
  expect(screen.getByRole("heading", { name: directoryCopy("en").invalidPage })).toBeVisible();
  expect(screen.getByRole("link", { name: "Back to the first page" })).toHaveAttribute(
    "href",
    `/en/cases?kind=buyer&filter=${filter}`,
  );
  expect(queryCaseIndex).toHaveBeenCalledTimes(1);
  expect(screen.queryByText(/^Deals: /)).toBeNull();
});

it("keeps unsupported filters visible for correction rather than widening the read", async () => {
  queryCaseIndex.mockRejectedValue(
    new AppError("validation_failed", { fieldErrors: { kind: ["Invalid"] } }),
  );
  render(await CaseDirectoryScreen({ locale: "en", session, query: { kind: "unsupported" } }));
  expect(screen.getByRole("heading", { name: directoryCopy("en").invalidFilters })).toBeVisible();
  expect(screen.getByLabelText("Type")).toHaveAttribute("aria-invalid", "true");
  expect(screen.getByLabelText("Type")).toHaveValue("unsupported");
  expect(screen.queryByRole("table")).toBeNull();
});

it("requires legacy private search to be applied by POST before any scope/page links can widen it", async () => {
  render(
    await CaseDirectoryScreen({ locale: "en", session, query: { q: "legacy private search" } }),
  );
  expect(screen.getByRole("heading", { name: directoryCopy("en").legacySearch })).toBeVisible();
  expect(screen.getByLabelText("Search")).toHaveValue("legacy private search");
  expect(
    within(screen.getByRole("navigation", { name: "Deal scope" })).queryByRole("link"),
  ).toBeNull();
  expect(queryCaseIndex).not.toHaveBeenCalled();
  for (const anchor of document.querySelectorAll("a"))
    expect(anchor.getAttribute("href")).not.toContain("legacy");
});

it("fails closed on an unavailable private context and offers explicit clearing", async () => {
  render(
    await CaseDirectoryScreen({
      locale: "en",
      session,
      query: { filter, view: "mine" },
      privateFilterUnavailable: true,
    }),
  );
  expect(
    screen.getByRole("heading", { name: directoryCopy("en").privateUnavailable }),
  ).toBeVisible();
  expect(queryCaseIndex).not.toHaveBeenCalled();
  expect(
    screen
      .getAllByRole("link", { name: "Clear filters" })
      .every((link) => link.getAttribute("href") === "/en/cases?view=mine"),
  ).toBe(true);
});

it.each(["not_found", "forbidden", "unauthenticated"] as const)(
  "answers lost access (%s) with not found",
  async (code) => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    queryCaseIndex.mockRejectedValue(new AppError(code));
    await expect(CaseDirectoryScreen({ locale: "en", session })).rejects.toMatchObject({
      digest: expect.stringContaining("404"),
    });
    expect(log).not.toHaveBeenCalled();
  },
);

it("lets Next.js control flow pass through", async () => {
  queryCaseIndex.mockImplementation(async () => notFound());
  await expect(CaseDirectoryScreen({ locale: "en", session })).rejects.toMatchObject({
    digest: expect.stringContaining("404"),
  });
});

it.each(["bg", "ru"])("keeps %s private workspace labels", async (locale) => {
  const copy = directoryCopy(locale);
  render(await CaseDirectoryScreen({ locale, session }));
  expect(screen.getByRole("heading", { level: 1, name: "Сделки" })).toBeVisible();
  expect(screen.getByLabelText(copy.search)).toBeVisible();
  expect(screen.getByRole("button", { name: copy.apply })).toBeVisible();
  expect(screen.getByRole("table", { name: copy.list })).toBeVisible();
  expect(screen.getByText(copy.count.replace("{n}", "1"))).toBeVisible();
});
