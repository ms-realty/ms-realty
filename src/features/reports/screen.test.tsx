import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Session } from "@/server/auth/sessions";
import { ReportsScreen } from "./screen";

const readReports = vi.hoisted(() => vi.fn());
vi.mock("@/db/client", () => ({ getDb: () => "synthetic-db" }));
vi.mock("@/server/reports/queries", () => ({ readReports }));
const session = { account: { id: "synthetic-staff", kind: "staff" } } as Session;
const filter = { days: 7 as const, scope: "mine" as const };
function report() {
  return {
    definition: "O22-v3",
    filter,
    from: new Date(Date.now() - 604800000),
    asOf: new Date(),
    timezone: "Europe/Sofia",
    response: {
      received: 0,
      responded: 0,
      missing: 0,
      invalid: 0,
      medianMinutes: null,
      smallSample: true,
    },
    staffedResponse: {
      state: "unobserved",
      eligible: 0,
      known: 0,
      unknown: 0,
      medianMinutes: null,
      smallSample: false,
      reason: null,
      unknownReasons: {},
      rows: [],
      hasMore: false,
    },
    correctionEffort: {
      state: "unobserved",
      observations: null,
      correctionMinutes: null,
      reentryMinutes: null,
      rows: [],
      hasMore: false,
    },
    metrics: [
      { id: "unowned", state: "observed", count: 0, rows: [], hasMore: false },
      { id: "nextActions", state: "denied", count: null, rows: [], hasMore: false },
      {
        id: "promises",
        state: "observed",
        count: 21,
        rows: [
          { id: "synthetic-task", reference: "Synthetic promise", path: "/tasks/synthetic-task" },
        ],
        hasMore: true,
      },
    ],
  };
}
beforeEach(() => {
  vi.clearAllMocks();
  readReports.mockResolvedValue(report());
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it("offers native filters and matching private export while distinguishing denied, zero and unknown", async () => {
  render(await ReportsScreen({ locale: "en", session, filter }));
  expect(readReports).toHaveBeenCalledWith("synthetic-db", session, filter);
  expect(screen.getByLabelText("Observation period")).toHaveValue("7");
  expect(screen.getByLabelText("Responsibility")).toHaveValue("mine");
  expect(screen.getByRole("button", { name: "Show report" }).closest("form")).toHaveAttribute(
    "method",
    "get",
  );
  expect(screen.getByRole("link", { name: "Download these totals" })).toHaveAttribute(
    "href",
    "/en/reports/export?days=7&scope=mine",
  );
  expect(screen.getByRole("link", { name: "Synthetic promise" })).toHaveAttribute(
    "href",
    "/en/tasks/synthetic-task",
  );
  const denied = screen.getByRole("region", { name: "Deals with a due next step or review" });
  expect(within(denied).getByText("Unknown")).toBeVisible();
  expect(within(denied).queryByText("0")).toBeNull();
  expect(screen.getByText(/Response time within staffed hours is unknown/)).toBeVisible();
  expect(screen.getByText(/No time has been recorded/)).toBeVisible();
  expect(screen.getByText(/Only the first 20/)).toBeVisible();
});

it("labels a staffed median as known observations only and exposes unknown coverage and scoped records", async () => {
  readReports.mockResolvedValue({
    ...report(),
    staffedResponse: {
      state: "observed",
      eligible: 3,
      known: 2,
      unknown: 1,
      medianMinutes: 30,
      smallSample: true,
      reason: null,
      unknownReasons: { no_reviewed_policy: 1 },
      rows: [{ id: "permitted", reference: "Permitted response", path: "/inquiries/permitted" }],
      hasMore: false,
    },
  });
  render(await ReportsScreen({ locale: "en", session, filter }));
  const staffed = screen.getByRole("region", { name: "Response within staffed hours" });
  expect(within(staffed).getByText(/not the whole response cohort/)).toBeVisible();
  expect(within(staffed).getByText("No reviewed policy captured at receipt: 1")).toBeVisible();
  expect(within(staffed).getByRole("link", { name: "Permitted response" })).toHaveAttribute(
    "href",
    "/en/inquiries/permitted",
  );
  expect(within(staffed).getByText("30")).toBeVisible();
});

it("holds an oversized cohort with a narrower-period/manual path and no invented duration", async () => {
  readReports.mockResolvedValue({
    ...report(),
    staffedResponse: {
      state: "held",
      eligible: 1001,
      known: null,
      unknown: null,
      medianMinutes: null,
      smallSample: false,
      reason: "cohort_limit",
      unknownReasons: {},
      rows: [],
      hasMore: false,
    },
  });
  render(await ReportsScreen({ locale: "en", session, filter }));
  const staffed = screen.getByRole("region", { name: "Response within staffed hours" });
  expect(within(staffed).getByText(/more than 1,000 valid responses/)).toBeVisible();
  expect(within(staffed).getByText(/narrower observation period/)).toBeVisible();
  expect(within(staffed).getAllByText("Unknown")).toHaveLength(3);
  expect(within(staffed).queryByText("0")).toBeNull();
});

it.each(["bg", "ru"] as const)("provides staff %s native labels", async (locale) => {
  render(await ReportsScreen({ locale, session, filter }));
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
    locale === "bg" ? "Справки за работата" : "Отчёты о работе",
  );
  expect(screen.getAllByRole("combobox")).toHaveLength(2);
});

it("read failure exposes no invented zeroes and preserves filters in a read-only retry", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  readReports.mockRejectedValue(new Error("Synthetic database unavailable"));
  render(await ReportsScreen({ locale: "en", session, filter }));
  expect(screen.getByText(/The totals are unknown/)).toBeVisible();
  expect(screen.queryByRole("region", { name: "Useful human response" })).toBeNull();
  expect(screen.getByRole("link", { name: "Try reading again" })).toHaveAttribute(
    "href",
    "/en/reports?days=7&scope=mine",
  );
  expect(screen.queryByRole("link", { name: "Download these totals" })).toBeNull();
});
