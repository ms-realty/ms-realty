import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Session } from "@/server/auth/sessions";
import { CaseIndexScreen, CaseScreen, ClientCaseOverview } from "./screens";

const reads = vi.hoisted(() => ({
  list: vi.fn(),
  detail: vi.fn(),
  messages: vi.fn(),
  appointments: vi.fn(),
}));
vi.mock("@/db/client", () => ({ getDb: () => "test-db" }));
vi.mock("@/server/cases/queries", () => ({
  listCases: reads.list,
  readCase: reads.detail,
  readCaseMessages: reads.messages,
  readInterestContext: vi.fn(),
}));
vi.mock("@/server/appointments/service", () => ({
  listAppointments: reads.appointments,
  readAppointment: vi.fn(),
}));
vi.mock("../work/screens", () => ({ privateRead: (read: () => Promise<unknown>) => read() }));

const session = { account: { kind: "client", id: "current-client" } } as Session;
const row = {
  id: "case-one",
  reference: "CA-ONE",
  title: "Recorded home search",
  kind: "buyer",
  stage: "needs_agreed",
  disposition: "active",
  ownerName: "Current accountable broker",
  needsCoverage: false,
};
const baseView = {
  record: {
    ...row,
    version: 1,
    nextAction: "Confirm the recorded step with your broker",
    clientSummary: "Confirm the recorded step with your broker",
    dueAt: new Date("2026-10-04T10:00:00Z"),
  },
  brief: [],
  ownerPreviews: [],
  interests: [],
  participants: [],
  canAcknowledge: false,
  canPost: false,
};
type SummaryView = Parameters<typeof ClientCaseOverview>[0]["view"];
const summary = (overrides: Record<string, unknown> = {}) =>
  ({ ...baseView, ...overrides }) as SummaryView;

beforeEach(() => {
  vi.clearAllMocks();
  reads.list.mockResolvedValue([row]);
  reads.detail.mockResolvedValue(baseView);
  reads.messages.mockResolvedValue([]);
  reads.appointments.mockResolvedValue([]);
});
afterEach(cleanup);

it("opens the sole authorized Case through its existing detail authorization and preserves its manual workflow routes", async () => {
  const entry = await CaseIndexScreen({ locale: "en", session, openSingleCase: true });
  expect(entry.type).toBe(CaseScreen);
  render(await CaseScreen(entry.props));
  expect(reads.list).toHaveBeenCalledWith("test-db", session);
  expect(reads.detail).toHaveBeenCalledWith("test-db", session, "case-one");
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
    "CA-ONE · Recorded home search",
  );
  expect(screen.getByRole("heading", { name: baseView.record.nextAction })).toBeVisible();
  expect(screen.getByRole("link", { name: "Requirements" })).toHaveAttribute("href", "#case-brief");
  expect(screen.getByRole("link", { name: "Conversation" })).toHaveAttribute(
    "href",
    "/en/messages/case-one",
  );
  expect(screen.queryByRole("link", { name: "Open case" })).not.toBeInTheDocument();
  expect(screen.getByRole("complementary", { name: "Accountable broker" })).toHaveTextContent(
    row.ownerName,
  );
});

it("does not fall back to cached Case content when detail authorization changes after listing", async () => {
  const entry = await CaseIndexScreen({ locale: "en", session, openSingleCase: true });
  const denied = new Error("Current Case access was revoked");
  reads.detail.mockRejectedValue(denied);
  await expect(CaseScreen(entry.props)).rejects.toBe(denied);
  expect(reads.messages).not.toHaveBeenCalled();
  expect(reads.appointments).not.toHaveBeenCalled();
});

it.each([2, 50])(
  "keeps the chooser for %i accessible Cases without choosing or reading one",
  async (count) => {
    reads.list.mockResolvedValue(
      Array.from({ length: count }, (_, index) => ({
        ...row,
        id: `case-${index}`,
        reference: `CA-${index}`,
        title: `Visible case ${index}`,
      })),
    );
    render(await CaseIndexScreen({ locale: "en", session, openSingleCase: true }));
    expect(reads.detail).not.toHaveBeenCalled();
    const list = screen.getByRole("list");
    expect(within(list).getAllByRole("listitem")).toHaveLength(count);
    expect(within(list).getByRole("link", { name: "CA-1 · Visible case 1" })).toHaveAttribute(
      "href",
      "/en/overview/case-1",
    );
    expect(list).toHaveTextContent("Buying · needs agreed · Active");
  },
);

it("preserves the empty state and never selects a Case for another destination", async () => {
  render(
    await CaseIndexScreen({
      locale: "en",
      session,
      destination: "properties",
      openSingleCase: true,
    }),
  );
  expect(screen.getByRole("link", { name: "CA-ONE · Recorded home search" })).toHaveAttribute(
    "href",
    "/en/properties/case-one",
  );
  expect(reads.detail).not.toHaveBeenCalled();
  cleanup();
  reads.list.mockResolvedValue([]);
  render(await CaseIndexScreen({ locale: "en", session, openSingleCase: true }));
  expect(screen.getByText("No cases are available to this account.")).toBeVisible();
  expect(reads.detail).not.toHaveBeenCalled();
});

it("retains the full broker identity and states an absent next action without inventing one", () => {
  const ownerName = "R".repeat(120);
  render(
    <ClientCaseOverview
      locale="en"
      view={summary({
        record: {
          ...baseView.record,
          ownerName,
          nextAction: null,
          clientSummary: null,
          dueAt: null,
        },
      })}
    />,
  );
  expect(screen.getByRole("heading", { name: ownerName })).toBeVisible();
  expect(
    screen.getByRole("heading", { name: "No client action summary has been recorded." }),
  ).toBeVisible();
  expect(screen.getByRole("link", { name: "Requirements" })).toHaveAttribute("href", "#case-brief");
  expect(document.querySelector("time")).toBeNull();
});

it.each(["paused", "closed"])(
  "shows %s status without resurfacing a stale next action or deadline",
  (disposition) => {
    render(
      <ClientCaseOverview
        locale="en"
        view={summary({ record: { ...baseView.record, disposition } })}
      />,
    );
    expect(screen.queryByText(baseView.record.nextAction)).not.toBeInTheDocument();
    expect(document.querySelector("time")).toBeNull();
    expect(
      screen.getByRole("heading", { name: new RegExp(`This case is ${disposition}`) }),
    ).toBeVisible();
  },
);

it.each([
  {
    disposition: "paused",
    dispositionReason: "The participant requested a pause.",
    waitingOn: "The participant's recorded availability.",
    reviewAt: new Date("2026-11-06T09:30:00Z"),
    closureOutcome: null,
  },
  {
    disposition: "closed",
    dispositionReason: "The participant ended this search.",
    closureOutcome: "Search ended without choosing a property.",
    waitingOn: null,
    reviewAt: null,
  },
])(
  "retains supplied $disposition lifecycle facts without treating them as an active next step",
  (lifecycle) => {
    render(
      <ClientCaseOverview
        locale="en"
        view={summary({ record: { ...baseView.record, ...lifecycle } })}
      />,
    );
    const panel = screen.getByRole("region", { name: "Client-visible next action summary" });
    expect(panel).toHaveTextContent(`Recorded reason: ${lifecycle.dispositionReason}`);
    if (lifecycle.waitingOn) expect(panel).toHaveTextContent(`Waiting for: ${lifecycle.waitingOn}`);
    if (lifecycle.closureOutcome)
      expect(panel).toHaveTextContent(`Recorded outcome: ${lifecycle.closureOutcome}`);
    if (lifecycle.reviewAt) {
      expect(panel).toHaveTextContent("Review date:");
      expect(panel.querySelector("time")).toHaveAttribute(
        "datetime",
        lifecycle.reviewAt.toISOString(),
      );
      expect(panel.querySelector("time")).toBeVisible();
    } else expect(panel.querySelector("time")).toBeNull();
    expect(panel).not.toHaveTextContent(baseView.record.nextAction);
    expect(
      panel.querySelector(`time[datetime="${baseView.record.dueAt.toISOString()}"]`),
    ).toBeNull();
  },
);
