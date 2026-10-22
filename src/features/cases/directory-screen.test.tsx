// O04 cases index markup: rows from listCases only, search pass-through and its 120-character
// limit, the 50-row bound, and first-use empty, no-match and failed reads kept apart.
import { cleanup, render, screen, within } from "@testing-library/react";
import { notFound } from "next/navigation";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Session } from "@/server/auth/sessions";
import { AppError } from "@/server/errors";
import { CaseDirectoryScreen } from "./directory-screen";

const listCases = vi.hoisted(() => vi.fn());
vi.mock("@/db/client", () => ({ getDb: () => "test-db" }));
vi.mock("@/server/cases/queries", () => ({ listCases }));

const session = { account: { kind: "staff", id: "current-broker" } } as Session;
const row = (overrides: Record<string, unknown> = {}) => ({
  id: "case-one",
  reference: "CS-2026-000142",
  title: "Synthetic family home search",
  kind: "buyer",
  stage: "needs_agreed",
  disposition: "active",
  ownerName: "Synthetic broker",
  needsCoverage: false,
  ...overrides,
});
const caseList = () => screen.getByRole("list", { name: "Deal list" });

beforeEach(() => {
  vi.clearAllMocks();
  listCases.mockResolvedValue([row()]);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it("lists each visible case as one link with its type, purpose, stage and owner", async () => {
  render(await CaseDirectoryScreen({ locale: "en", session }));
  expect(listCases).toHaveBeenCalledWith("test-db", session, "");
  expect(screen.getByRole("heading", { level: 1, name: "Deals" })).toBeVisible();
  expect(screen.getByLabelText("Search")).toHaveValue("");
  expect(screen.getByLabelText("Search")).toHaveAccessibleDescription("Deal number or title");
  expect(within(caseList()).getByRole("link")).toBe(
    screen.getByRole("link", {
      name: "Synthetic family home search CS-2026-000142 · Buying · Agreeing requirements Accountable broker: Synthetic broker",
    }),
  );
  expect(within(caseList()).getByRole("link")).toHaveAttribute("href", "/en/cases/case-one");
  expect(screen.getByText("Deals: 1")).toBeVisible();
  expect(screen.getByRole("link", { name: "More tools" })).toHaveAttribute(
    "href",
    "/en/operations",
  );
});

it("shows paused and closed apart from the stage, and agency coverage for an unavailable owner", async () => {
  listCases.mockResolvedValue([
    row({ id: "paused", kind: "seller", stage: "preparing", disposition: "paused" }),
    row({
      id: "closed",
      kind: "landlord",
      stage: "completion_handover",
      disposition: "closed",
      needsCoverage: true,
    }),
    row({ id: "covered", stage: "viewing", needsCoverage: true, ownerName: "Former broker" }),
    row({ id: "service", kind: "service_intake", stage: "consultation", ownerName: null }),
  ]);
  render(await CaseDirectoryScreen({ locale: "en", session }));
  const links = within(caseList()).getAllByRole("link");
  expect(links.map((link) => link.textContent)).toEqual([
    "Synthetic family home search CS-2026-000142 · Selling · Preparing the listing Paused · Accountable broker: Synthetic broker",
    "Synthetic family home search CS-2026-000142 · Letting · Completion and handover Closed · Accountable broker: Synthetic broker",
    "Synthetic family home search CS-2026-000142 · Buying · Viewings Work without an owner · Last accepted owner: Former broker",
    "Synthetic family home search CS-2026-000142 · Service consultation · Consultation Accountable broker: No named owner",
  ]);
  expect(screen.getByText("Deals: 4")).toBeVisible();
});

it("searches the trimmed term and says when the address held more than 120 characters", async () => {
  render(await CaseDirectoryScreen({ locale: "en", session, search: "  CS-2026  " }));
  expect(listCases).toHaveBeenCalledWith("test-db", session, "CS-2026");
  expect(screen.getByLabelText("Search")).toHaveValue("CS-2026");
  expect(screen.queryByRole("status")).toBeNull();
  cleanup();

  render(await CaseDirectoryScreen({ locale: "en", session, search: "x".repeat(130) }));
  expect(listCases).toHaveBeenLastCalledWith("test-db", session, "x".repeat(120));
  expect(screen.getByLabelText("Search")).toHaveAttribute("maxlength", "120");
  expect(screen.getByRole("status")).toHaveTextContent(
    "Search uses up to 120 characters; the rest was left out.",
  );
});

it("states the 50-row bound instead of a count when the read may hold more cases", async () => {
  listCases.mockResolvedValue(
    Array.from({ length: 50 }, (_, index) => row({ id: `case-${index}` })),
  );
  render(await CaseDirectoryScreen({ locale: "en", session }));
  expect(within(caseList()).getAllByRole("link")).toHaveLength(50);
  expect(
    screen.getByText(
      "Showing the 50 most recently updated deals you can access. To find another deal, search by its number or title.",
    ),
  ).toBeVisible();
  expect(screen.queryByText(/^Deals: /)).toBeNull();
});

it("tells a search with 50 matches to narrow the search, not to start one", async () => {
  listCases.mockResolvedValue(
    Array.from({ length: 50 }, (_, index) => row({ id: `case-${index}` })),
  );
  render(await CaseDirectoryScreen({ locale: "en", session, search: "CS-2026" }));
  expect(
    screen.getByText(
      "Showing the 50 most recently updated matches. Narrow the search to find another deal.",
    ),
  ).toBeVisible();
  expect(screen.queryByText(/search by its number or title/)).toBeNull();
});

it("keeps first-use empty and a search without matches apart", async () => {
  listCases.mockResolvedValue([]);
  render(await CaseDirectoryScreen({ locale: "en", session }));
  expect(
    screen.getByRole("heading", { level: 2, name: "No deals are available to you." }),
  ).toBeVisible();
  expect(screen.getByRole("link", { name: "Open inquiries" })).toHaveAttribute(
    "href",
    "/en/inquiries",
  );
  expect(screen.queryByRole("list", { name: "Deal list" })).toBeNull();
  cleanup();

  render(await CaseDirectoryScreen({ locale: "en", session, search: "no such case" }));
  expect(
    screen.getByRole("heading", { level: 2, name: "No deal matches this search." }),
  ).toBeVisible();
  expect(screen.getByText("no such case")).toBeVisible();
  expect(screen.getByRole("link", { name: "Clear the search" })).toHaveAttribute(
    "href",
    "/en/cases",
  );
  expect(screen.queryByText("No deals are available to you.")).toBeNull();
});

it("shows a failed read as a failure with a retry, never as an empty list", async () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  listCases.mockRejectedValue(new Error("connection refused at synthetic host"));
  render(await CaseDirectoryScreen({ locale: "en", session, search: "CS-2026" }));
  expect(
    screen.getByRole("heading", { level: 2, name: "The deal list could not be loaded." }),
  ).toBeVisible();
  expect(
    screen.getByText("This does not mean there are no deals. Try again in a moment."),
  ).toBeVisible();
  expect(screen.getByRole("link", { name: "Try again" })).toHaveAttribute(
    "href",
    "/en/cases?q=CS-2026",
  );
  expect(screen.queryByRole("list", { name: "Deal list" })).toBeNull();
  expect(screen.queryByText(/No case|No deals|Deals: /)).toBeNull();
  expect(screen.queryByText(/connection refused/)).toBeNull();
  // The search stays available, and the log names the error type without its details.
  expect(screen.getByLabelText("Search")).toHaveValue("CS-2026");
  expect(log).toHaveBeenCalledWith("[O04] case list unavailable:", "Error");
});

it.each(["not_found", "forbidden"] as const)(
  "answers lost staff access (%s) with not found, not a failed read",
  async (code) => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    listCases.mockRejectedValue(new AppError(code));
    await expect(CaseDirectoryScreen({ locale: "en", session })).rejects.toMatchObject({
      digest: expect.stringContaining("404"),
    });
    expect(log).not.toHaveBeenCalled();
  },
);

it("lets Next.js control flow from the read through instead of calling it a failed read", async () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  listCases.mockImplementation(async () => notFound());
  await expect(CaseDirectoryScreen({ locale: "en", session })).rejects.toMatchObject({
    digest: expect.stringContaining("404"),
  });
  expect(log).not.toHaveBeenCalled();
});

it.each([
  [
    "bg",
    "Сделки",
    "Търсене",
    "Покажете",
    "Synthetic family home search CS-2026-000142 · Покупка · Уточняване на изискванията Отговорен брокер: Synthetic broker",
    "Сделки: 1",
  ],
  [
    "ru",
    "Сделки",
    "Поиск",
    "Показать",
    "Synthetic family home search CS-2026-000142 · Покупка · Согласование требований Ответственный брокер: Synthetic broker",
    "Всего сделок: 1",
  ],
])("keeps %s labels", async (locale, title, search, apply, rowText, count) => {
  render(await CaseDirectoryScreen({ locale, session }));
  expect(screen.getByRole("heading", { level: 1, name: title })).toBeVisible();
  expect(screen.getByLabelText(search)).toBeVisible();
  expect(screen.getByRole("button", { name: apply })).toBeVisible();
  expect(screen.getByRole("link", { name: rowText })).toHaveAttribute(
    "href",
    `/${locale}/cases/case-one`,
  );
  expect(screen.getByText(count)).toBeVisible();
});
