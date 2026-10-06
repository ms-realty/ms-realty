// O04 cases index markup: rows from listCases only, search pass-through and its 120-character
// limit, the 50-row bound, and first-use empty, no-match and failed reads kept apart.
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Session } from "@/server/auth/sessions";
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
const caseList = () => screen.getByRole("list", { name: "Case list" });

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
  expect(screen.getByRole("heading", { level: 1, name: "Cases" })).toBeVisible();
  expect(screen.getByLabelText("Search")).toHaveValue("");
  expect(screen.getByLabelText("Search")).toHaveAccessibleDescription("Case number or title");
  expect(within(caseList()).getByRole("link")).toBe(
    screen.getByRole("link", {
      name: "CS-2026-000142 · Buying Synthetic family home search · Requirements to agree Accountable broker: Synthetic broker",
    }),
  );
  expect(within(caseList()).getByRole("link")).toHaveAttribute("href", "/en/cases/case-one");
  expect(screen.getByText("Cases: 1")).toBeVisible();
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
    "CS-2026-000142 · Selling Synthetic family home search · Preparing the listing Paused · Accountable broker: Synthetic broker",
    "CS-2026-000142 · Letting Synthetic family home search · Completion and handover Closed · Accountable broker: Synthetic broker",
    "CS-2026-000142 · Buying Synthetic family home search · Viewings Agency coverage · Last accepted owner: Former broker",
    "CS-2026-000142 · Service consultation Synthetic family home search · Consultation Accountable broker: No named owner",
  ]);
  expect(screen.getByText("Cases: 4")).toBeVisible();
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
      "Showing the 50 most recently updated cases you can access. To find another case, search by its number or title.",
    ),
  ).toBeVisible();
  expect(screen.queryByText(/^Cases: /)).toBeNull();
});

it("keeps first-use empty and a search without matches apart", async () => {
  listCases.mockResolvedValue([]);
  render(await CaseDirectoryScreen({ locale: "en", session }));
  expect(
    screen.getByRole("heading", { level: 2, name: "No cases are available to you." }),
  ).toBeVisible();
  expect(screen.getByRole("link", { name: "Open inquiries" })).toHaveAttribute(
    "href",
    "/en/inquiries",
  );
  expect(screen.queryByRole("list", { name: "Case list" })).toBeNull();
  cleanup();

  render(await CaseDirectoryScreen({ locale: "en", session, search: "no such case" }));
  expect(
    screen.getByRole("heading", { level: 2, name: "No case matches this search." }),
  ).toBeVisible();
  expect(screen.getByText("no such case")).toBeVisible();
  expect(screen.getByRole("link", { name: "Clear the search" })).toHaveAttribute(
    "href",
    "/en/cases",
  );
  expect(screen.queryByText("No cases are available to you.")).toBeNull();
});

it("shows a failed read as a failure with a retry, never as an empty list", async () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  listCases.mockRejectedValue(new Error("connection refused at synthetic host"));
  render(await CaseDirectoryScreen({ locale: "en", session, search: "CS-2026" }));
  expect(
    screen.getByRole("heading", { level: 2, name: "The case list could not be loaded." }),
  ).toBeVisible();
  expect(screen.getByText("Nothing was changed. Try again in a moment.")).toBeVisible();
  expect(screen.getByRole("link", { name: "Try again" })).toHaveAttribute(
    "href",
    "/en/cases?q=CS-2026",
  );
  expect(screen.queryByRole("list", { name: "Case list" })).toBeNull();
  expect(screen.queryByText(/No case|No cases|Cases: /)).toBeNull();
  expect(screen.queryByText(/connection refused/)).toBeNull();
  // The search stays available, and the log names the error type without its details.
  expect(screen.getByLabelText("Search")).toHaveValue("CS-2026");
  expect(log).toHaveBeenCalledWith("[O04] case list unavailable:", "Error");
});

it.each([
  [
    "bg",
    "Случаи",
    "Търсене",
    "Покажете",
    "CS-2026-000142 · Покупка Synthetic family home search · Изисквания за уточнение Отговорен брокер: Synthetic broker",
    "Случаи: 1",
  ],
  [
    "ru",
    "Дела",
    "Поиск",
    "Показать",
    "CS-2026-000142 · Покупка Synthetic family home search · Согласование требований Ответственный брокер: Synthetic broker",
    "Всего дел: 1",
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
