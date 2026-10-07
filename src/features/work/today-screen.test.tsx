// O01 markup contract: section order, counts from the server's totals that link to their
// queues, truthful empty, overloaded, unavailable and failed states, every queue the read
// model returns, and a Butler entry that only opens the draft review of one record.
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Session } from "@/server/auth/sessions";
import { AppError } from "@/server/errors";
import { TodayScreen } from "./today-screen";

const reads = vi.hoisted(() => ({
  today: vi.fn(),
  can: vi.fn(),
  source: vi.fn(),
  enabled: { value: false },
}));
vi.mock("@/db/client", () => ({ getDb: () => "test-db" }));
vi.mock("@/server/work/queries", () => ({ readToday: reads.today }));
vi.mock("@/server/authz", () => ({ can: reads.can }));
vi.mock("@/server/ai/assistance", () => ({ readAssistanceSource: reads.source }));
vi.mock("@/server/ai/config", () => ({
  assistanceAvailability: () => ({ enabled: reads.enabled.value }),
}));

const session = {
  account: { kind: "staff", id: "staff-one" },
  actor: { kind: "staff" },
} as Session;
// 07:30 UTC is 10:30 in Europe/Sofia (summer time): a morning greeting.
const now = new Date("2026-10-07T07:30:00Z");
const minutesAgo = (minutes: number) => new Date(now.getTime() - minutes * 60_000);
const inquiry = (id: string, overrides: Record<string, unknown> = {}) => ({
  inquiry: {
    id,
    reference: `RQ-${id}`,
    purpose: "viewing_request",
    preferredName: "Synthetic visitor",
    context: { listing: { reference: "MS-00202", title: "Synthetic listing" } },
    state: "received",
    createdAt: minutesAgo(12),
    followUpAt: null,
    firstResponseAt: null,
    ...overrides,
  },
  ownerName: null,
  needsCoverage: true,
});
const task = (id: string, overrides: Record<string, unknown> = {}) => ({
  task: {
    id,
    title: `Synthetic follow-up ${id}`,
    state: "open",
    dueAt: minutesAgo(90),
    followUpAt: null,
    promisedToClient: false,
    waitingOn: null,
    ...overrides,
  },
  ownerName: "Maria Example",
  needsCoverage: false,
});
const ownedBy = { ownerId: "staff-one", ownerName: "Maria Example", needsCoverage: false };
const viewing = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  reference: `AP-${id}`,
  state: "confirmed",
  format: "in_person",
  caseId: "case-one",
  caseReference: "CS-ONE",
  hostId: "staff-one",
  ownerName: "Maria Example",
  needsCoverage: false,
  awaitingAcceptance: false,
  startsAt: new Date(now.getTime() + 86_400_000),
  endsAt: new Date(now.getTime() + 88_200_000),
  timezone: "Europe/Sofia",
  reason: "upcoming_viewing",
  ...overrides,
});
// The read model's queue shape: the authorized total, more beyond the loaded page, its status.
const queue = <T,>(rows: T[], extra: Record<string, unknown> = {}) => ({
  status: "ready",
  rows,
  total: rows.length,
  hasMore: false,
  asOf: now,
  page: 1,
  ...extra,
});
const unavailable = <T,>(rows: T[] = []) => ({
  ...queue(rows),
  status: "unavailable",
  total: null,
});
const empty = () => ({
  unassigned: queue([]),
  due: queue([]),
  mine: queue([]),
  handovers: queue([]),
  keyReturns: null,
  viewings: queue([]),
  caseContinue: queue([]),
  draftContinue: queue([]),
  listingReviews: queue([]),
  translationReviews: queue([]),
  deliveryExceptions: queue([]),
  publicationExceptions: queue([]),
  operatorDeliveryExceptions: null,
  worker: null,
  scope: { state: "unknown", reason: "scope_policy_not_bound" },
  staffedSla: { state: "unknown", reason: "staffed_sla_policy_not_bound" },
  asOf: now,
});
const ordinary = () => ({
  ...empty(),
  unassigned: queue([inquiry("in-new")]),
  due: queue([task("task-due", { promisedToClient: true })]),
  mine: queue([
    {
      ...inquiry("in-mine", {
        state: "assigned",
        followUpAt: new Date(now.getTime() + 86_400_000),
        firstResponseAt: minutesAgo(600),
      }),
      ownerName: "Maria Example",
      needsCoverage: false,
    },
  ]),
  handovers: queue([
    {
      ...task("task-offered", { dueAt: new Date(now.getTime() + 3 * 86_400_000) }),
      ownerName: "Former broker",
      needsCoverage: true,
    },
  ]),
});
const show = async (locale = "en") =>
  render(await TodayScreen({ locale, session, name: "Maria Example", now }));
const scopeNote =
  "These lists show the work you can access: inquiries, tasks, key returns, viewings, Cases, listings, translations and delivery problems. Each record opens in its own workspace.";
const groupOf = (id: string) => document.querySelector(`[data-today-group="${id}"]`) as HTMLElement;
const quiet = (section: string) => document.querySelector(`[data-today-quiet="${section}"]`);

beforeEach(() => {
  vi.clearAllMocks();
  reads.enabled.value = false;
  reads.today.mockResolvedValue(ordinary());
  reads.can.mockResolvedValue(true);
  reads.source.mockResolvedValue({});
});
afterEach(cleanup);

it("orders the worklist by the contract and links every count to its real queue", async () => {
  await show();
  expect(reads.today).toHaveBeenCalledWith("test-db", session, now);
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
    "Good morning, Maria Example.",
  );
  expect(screen.getByText("Waiting for action: 3. Start at the top of the list.")).toBeVisible();
  expect(
    screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent),
  ).toEqual(["For your attention", "Continue from here", "Butler"]);
  expect(
    screen.getAllByRole("heading", { level: 3 }).map((heading) => heading.textContent),
  ).toEqual([
    "Unassigned requestsIn the queue: 1",
    "My overdue tasksIn the queue: 1",
    "Awaiting my acceptanceIn the queue: 1",
    "My open inquiriesIn the queue: 1",
  ]);
  // Lists that loaded empty are named once, in contract order, never drawn as empty groups.
  expect(quiet("attention")).toHaveTextContent(
    "Nothing waiting: Viewings · Listing corrections and reviews · Translations to review · Email delivery to check · Publication delivery to check",
  );
  expect(quiet("continue")).toHaveTextContent("Nothing waiting: My cases · My listing drafts");
  expect(screen.getByText(scopeNote)).toBeVisible();
  for (const [name, href] of [
    [/^Unassigned requests/, "/en/inquiries?view=unassigned"],
    [/^My overdue tasks/, "/en/tasks?view=overdue"],
    [/^Awaiting my acceptance/, "/en/tasks?view=handovers"],
    [/^My open inquiries/, "/en/inquiries?view=mine"],
    ["All tasks", "/en/tasks"],
  ] as const)
    expect(screen.getByRole("link", { name })).toHaveAttribute("href", href);
  const scope = within(screen.getByRole("navigation", { name: "Work scope" }));
  expect(scope.getByRole("link", { name: "For action" })).toHaveAttribute("aria-current", "page");
  expect(scope.getByRole("link", { name: "My tasks" })).toHaveAttribute(
    "href",
    "/en/tasks?view=mine",
  );
  expect(scope.getByRole("link", { name: "Team" })).toHaveAttribute("href", "/en/cases");
  expect(reads.can).toHaveBeenCalledWith("test-db", session.actor, "case.read", {
    type: "case",
    audience: "internal",
  });
});

it("gives each row its reason, owner with coverage, due or age, and one next step", async () => {
  await show();
  const unassigned = within(screen.getByRole("list", { name: "Unassigned requests" }));
  expect(unassigned.getByRole("link")).toHaveAttribute("href", "/en/inquiries/in-new");
  expect(unassigned.getByRole("link")).toHaveTextContent(
    "Viewing request · Synthetic visitor · MS-00202Owner: Agency coverage · Received 12 min. ago · Next step: accept and reply",
  );
  const due = within(screen.getByRole("list", { name: "My overdue tasks" })).getByRole("link");
  expect(due).toHaveAttribute("href", "/en/tasks/task-due");
  expect(due).toHaveTextContent("Owner: Maria Example · Overdue since");
  expect(due).toHaveTextContent("UTC · Promised to a client · Next step: record the outcome");
  expect(due.querySelector("time")).toHaveAttribute("datetime", minutesAgo(90).toISOString());
  const offered = within(screen.getByRole("list", { name: "Awaiting my acceptance" })).getByRole(
    "link",
  );
  expect(offered).toHaveTextContent(
    "Owner: Agency coverage (Last accepted owner: Former broker) · Due",
  );
  expect(offered).toHaveTextContent("Next step: accept or decline");
  const mine = within(screen.getByRole("list", { name: "My open inquiries" })).getByRole("link");
  expect(mine).toHaveTextContent("Owner: Maria Example · Due");
  expect(mine).toHaveTextContent("Next step: continue the conversation");
});

it("offers Butler only as a draft review of one record, with the manual path beside it", async () => {
  await show();
  const butler = within(screen.getByRole("complementary", { name: "Butler" }));
  expect(reads.source).toHaveBeenCalledWith("test-db", session, "in-new");
  expect(butler.getByText("Under your control")).toBeVisible();
  expect(butler.getByRole("button", { name: "Prepare a proposal" })).toBeDisabled();
  expect(butler.getByText("Draft generation is unavailable. Continue the manual workflow.")).toBe(
    document.getElementById("today-butler-unavailable"),
  );
  expect(butler.getByRole("link", { name: "Continue without Butler" })).toHaveAttribute(
    "href",
    "/en/inquiries/in-new",
  );
  // The Figma composer slot explains the boundary instead of offering an open chat.
  expect(
    butler.getByText(
      "Butler drafts only for the selected record, in its own review. There is no open chat here.",
    ),
  ).toBeVisible();
  expect(butler.queryByRole("textbox")).toBeNull();
  expect(document.querySelector("form")).toBeNull();

  cleanup();
  reads.enabled.value = true;
  await show();
  expect(screen.getByRole("link", { name: "Prepare a proposal" })).toHaveAttribute(
    "href",
    "/en/operations/assistance?source=in-new",
  );
  expect(document.querySelector("form, button:not([disabled])")).toBeNull();
});

it("hides Butler and the team scope where the person is not authorized", async () => {
  reads.can.mockResolvedValue(false);
  reads.source.mockRejectedValue(new AppError("forbidden"));
  await show();
  expect(screen.queryByRole("complementary", { name: "Butler" })).not.toBeInTheDocument();
  const scope = within(screen.getByRole("navigation", { name: "Work scope" }));
  expect(scope.getAllByRole("link").map((link) => link.textContent)).toEqual([
    "For action",
    "My tasks",
  ]);
});

it("keeps overdue key returns among the due commitments for key managers", async () => {
  const dueAt = new Date("2026-10-06T12:00:00Z");
  reads.today.mockResolvedValue({
    ...ordinary(),
    keyReturns: queue([
      {
        id: "key-one",
        reference: "KS-ONE",
        dueAt,
        propertyReference: "PR-ONE",
        holderName: "Synthetic custody holder",
        needsCoverage: true,
      },
    ]),
  });
  await show();
  expect(
    screen.getAllByRole("heading", { level: 3 }).map((heading) => heading.textContent),
  ).toEqual([
    "Unassigned requestsIn the queue: 1",
    "My overdue tasksIn the queue: 1",
    "Overdue key returnsIn the queue: 1",
    "Awaiting my acceptanceIn the queue: 1",
    "My open inquiriesIn the queue: 1",
  ]);
  const reminders = document.querySelector("[data-key-return-reminders]");
  expect(reminders).not.toBeNull();
  const row = within(reminders as HTMLElement).getByRole("link", { name: /KS-ONE/ });
  expect(row).toHaveAttribute("href", "/en/operations/keys/key-one");
  expect(row).toHaveTextContent(
    "Property PR-ONE · Holder: Synthetic custody holder (Agency coverage) · Overdue since",
  );
  expect(
    within(reminders as HTMLElement).getByText(
      "Current overdue sets are shown oldest first. A reminder changes neither custody nor the agreed deadline.",
    ),
  ).toBeVisible();
  expect(row.querySelector("time")).toHaveAttribute("datetime", dueAt.toISOString());
  expect(row.querySelector("time")).toHaveTextContent(
    `${new Intl.DateTimeFormat("en", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Europe/Sofia",
    }).format(dueAt)} Europe/Sofia`,
  );
  expect(screen.getByRole("link", { name: /^Overdue key returns/ })).toHaveAttribute(
    "href",
    "/en/operations/keys?state=overdue",
  );
});

it("shows overload with its total, aging and an escalation route, never a celebration", async () => {
  reads.today.mockResolvedValue({
    ...empty(),
    unassigned: queue(
      Array.from({ length: 30 }, (_, index) =>
        inquiry(`in-${index}`, { createdAt: minutesAgo(180 - index) }),
      ),
      { total: 34, hasMore: true },
    ),
  });
  await show();
  // The count is the server's total for the whole queue, not the thirty rows it loaded.
  expect(screen.getByText("Waiting for action: 34. Start at the top of the list.")).toBeVisible();
  expect(screen.getByRole("link", { name: /^Unassigned requests/ })).toHaveTextContent(
    "In the queue: 34",
  );
  const overload = screen.getByText("Requests without an owner: 34").parentElement;
  expect(overload).toHaveTextContent(
    "The oldest arrived 3 hr. ago. Agency coverage holds them until someone accepts them. Ask a manager to share out the work.",
  );
  expect(overload?.querySelector("time")).toHaveAttribute(
    "datetime",
    minutesAgo(180).toISOString(),
  );
  expect(screen.getByRole("link", { name: "Agency coverage" })).toHaveAttribute(
    "href",
    "/en/coverage",
  );
  expect(screen.getByRole("link", { name: "More in this queue" })).toHaveAttribute(
    "href",
    "/en/inquiries?view=unassigned",
  );
  // The oldest five stay in view, oldest first; the count and the link carry the rest.
  const shown = within(screen.getByRole("list", { name: "Unassigned requests" })).getAllByRole(
    "link",
  );
  expect(shown.map((link) => link.getAttribute("href"))).toEqual(
    [0, 1, 2, 3, 4].map((index) => `/en/inquiries/in-${index}`),
  );
  expect(screen.queryByText("Nothing in today's lists needs action")).not.toBeInTheDocument();
});

it("keeps every group in view when one queue is long", async () => {
  reads.today.mockResolvedValue({
    ...ordinary(),
    due: queue(Array.from({ length: 6 }, (_, index) => task(`task-${index}`))),
  });
  await show();
  expect(screen.getByRole("link", { name: /^My overdue tasks/ })).toHaveTextContent("6");
  expect(
    within(screen.getByRole("list", { name: "My overdue tasks" })).getAllByRole("link"),
  ).toHaveLength(5);
  expect(screen.getByRole("link", { name: "More in this queue" })).toHaveAttribute(
    "href",
    "/en/tasks?view=overdue",
  );
  expect(screen.getByRole("list", { name: "Awaiting my acceptance" })).toBeVisible();
});

it("says plainly when there is no work, scoped to the lists it read", async () => {
  reads.today.mockResolvedValue(empty());
  await show();
  expect(screen.getByText("Check the inquiries for new requests.")).toBeVisible();
  expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent(
    "Nothing in today's lists needs action",
  );
  expect(screen.getByText(scopeNote)).toBeVisible();
  expect(screen.getByRole("link", { name: "Open the inquiries" })).toHaveAttribute(
    "href",
    "/en/inquiries",
  );
  expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
  expect(reads.source).not.toHaveBeenCalled();
});

it("keeps my own work in view when nothing else waits", async () => {
  reads.today.mockResolvedValue({ ...empty(), mine: ordinary().mine });
  await show();
  expect(
    screen.getByText(
      "Nothing in today's lists is waiting for your action. Continue with your own work below.",
    ),
  ).toBeVisible();
  expect(quiet("attention")).toHaveTextContent(
    /^Nothing waiting: Unassigned requests · My overdue tasks · Awaiting my acceptance · Viewings/,
  );
  expect(screen.getByRole("list", { name: "My open inquiries" })).toBeVisible();
});

it("counts overdue follow-ups of my own inquiries as waiting, in the server's order", async () => {
  const open = (id: string, followUpAt: Date | null) => ({
    ...inquiry(id, { state: "assigned", createdAt: minutesAgo(900), followUpAt }),
    ownerName: "Maria Example",
    needsCoverage: false,
  });
  // The read model orders my inquiries by follow-up time, so the overdue ones arrive first.
  reads.today.mockResolvedValue({
    ...empty(),
    mine: queue([
      open("in-late", minutesAgo(30)),
      open("in-later", minutesAgo(5)),
      ...[1, 2, 3, 4, 5].map((index) => open(`in-${index}`, null)),
    ]),
  });
  await show();
  // Review FIX: the headline never says nothing waits while overdue follow-ups are listed.
  expect(
    screen.getByText("Overdue in your own work: 2. Start under “Continue from here”."),
  ).toBeVisible();
  expect(screen.queryByText(/Nothing in today's lists/)).not.toBeInTheDocument();
  const rows = within(screen.getByRole("list", { name: "My open inquiries" })).getAllByRole("link");
  expect(rows.map((row) => row.getAttribute("href"))).toEqual([
    "/en/inquiries/in-late",
    "/en/inquiries/in-later",
    "/en/inquiries/in-1",
    "/en/inquiries/in-2",
    "/en/inquiries/in-3",
  ]);
  expect(rows[0]).toHaveTextContent("Overdue since");
});

it("distinguishes a list that did not load from a ready empty one", async () => {
  reads.today.mockResolvedValue({
    ...empty(),
    unassigned: unavailable(),
    // Rows that reach an unavailable queue are never drawn as work.
    viewings: unavailable([viewing("unread")]),
  });
  await show();
  expect(
    screen.getByText(
      "Some lists could not load, so this is not all of today's work. Reload the page.",
    ),
  ).toBeVisible();
  expect(document.querySelector("[data-today-state=empty]")).toBeNull();
  for (const [id, heading] of [
    ["unassigned", "Unassigned requestsNot loaded"],
    ["viewings", "ViewingsNot loaded"],
  ] as const) {
    const failed = groupOf(id);
    expect(failed).toHaveAttribute("data-today-status", "unavailable");
    expect(within(failed).getByRole("heading", { level: 3 })).toHaveTextContent(heading);
    expect(within(failed).queryByText(/In the queue/)).toBeNull();
    expect(
      within(failed).getByText("This list could not load. Work may be waiting in it."),
    ).toBeVisible();
    expect(within(failed).getByRole("link", { name: "Reload the page" })).toHaveAttribute(
      "href",
      "/en/today",
    );
    expect(within(failed).queryByRole("list")).toBeNull();
  }
  expect(screen.queryByRole("link", { name: /AP-unread/ })).toBeNull();
  // The heading of a counted queue still opens that queue.
  expect(screen.getByRole("link", { name: /^Unassigned requests/ })).toHaveAttribute(
    "href",
    "/en/inquiries?view=unassigned",
  );
  expect(quiet("attention")).toHaveTextContent(/^Nothing waiting: My overdue tasks · /);
  expect(quiet("attention")).not.toHaveTextContent(/Unassigned requests|Viewings/);
});

it("still counts the lists that loaded when others did not", async () => {
  reads.today.mockResolvedValue({ ...ordinary(), deliveryExceptions: unavailable() });
  await show();
  expect(
    screen.getByText(
      "Waiting for action: 3, but some lists could not load. Reload the page to see all of today's work.",
    ),
  ).toBeVisible();
  expect(groupOf("email-deliveries")).toHaveAttribute("data-today-status", "unavailable");
});

it("uses the authorized total and keeps every loaded row reachable without JavaScript", async () => {
  reads.today.mockResolvedValue({
    ...empty(),
    viewings: queue(
      Array.from({ length: 30 }, (_, index) => viewing(`${index}`)),
      { total: 67, hasMore: true },
    ),
  });
  await show();
  const viewings = within(groupOf("viewings"));
  expect(viewings.getByRole("heading", { level: 3 })).toHaveTextContent("ViewingsIn the queue: 67");
  expect(viewings.queryByText(/67\+/)).toBeNull();
  expect(screen.getByText("Waiting for action: 67. Start at the top of the list.")).toBeVisible();
  expect(viewings.getByRole("link", { name: /^Upcoming viewing · AP-0/ })).toBeVisible();
  expect(
    viewings.getByRole("link", { name: /^Upcoming viewing · AP-5/, hidden: true }),
  ).not.toBeVisible();
  const more = viewings.getByText("Show 25 more");
  expect(more.tagName).toBe("SUMMARY");
  await userEvent.setup().click(more);
  expect(viewings.getByRole("link", { name: /^Upcoming viewing · AP-29/ })).toBeVisible();
  expect(viewings.getByRole("link", { name: /^Upcoming viewing · AP-29/ })).toHaveAttribute(
    "href",
    "/en/calendar/29",
  );
  // No queue page reproduces this list: the count stays here and names the nearest workspace.
  expect(viewings.getByText(/^Today shows the first 30 of 67\./)).toBeVisible();
  expect(viewings.getByRole("link", { name: "Calendar" })).toHaveAttribute("href", "/en/calendar");
  expect(viewings.queryByRole("link", { name: /^Viewings/ })).toBeNull();
});

it("labels a bounded preview when the server total is unknown", async () => {
  reads.today.mockResolvedValue({
    ...empty(),
    viewings: queue([viewing("one")], { total: null, hasMore: true }),
  });
  await show();
  expect(within(groupOf("viewings")).getByRole("heading", { level: 3 })).toHaveTextContent(
    "ViewingsIn the queue: 1+",
  );
  expect(screen.getByText("Waiting for action: 1+. Start at the top of the list.")).toBeVisible();
});

it("opens each newly read record in its own workspace with its reason and next step", async () => {
  reads.today.mockResolvedValue({
    ...empty(),
    viewings: queue([
      viewing("past", { reason: "record_outcome", startsAt: minutesAgo(120) }),
      viewing("offered", { awaitingAcceptance: true, needsCoverage: true }),
      viewing("open", { reason: "arrange_viewing", startsAt: null, endsAt: null }),
    ]),
    listingReviews: queue([
      {
        ...ownedBy,
        id: "review",
        reference: "MS-REVIEW",
        editorialState: "in_review",
        commercialState: "confirmation_required",
        freshnessState: "review_due",
        dueAt: minutesAgo(60),
        canEdit: false,
        canReviewFacts: true,
        canRelease: false,
      },
      {
        ...ownedBy,
        id: "facts",
        reference: "MS-FACTS",
        editorialState: "needs_facts",
        commercialState: "available",
        freshnessState: "current",
        dueAt: null,
        canEdit: true,
        canReviewFacts: false,
        canRelease: false,
      },
    ]),
    translationReviews: queue([
      {
        ...ownedBy,
        id: "translation",
        listingId: "listing",
        reference: "MS-RU",
        sourceRevisionId: "source",
        locale: "ru",
        requestedAt: minutesAgo(30),
      },
    ]),
    deliveryExceptions: queue([
      {
        ...ownedBy,
        id: "message",
        caseId: "case-email",
        reference: "CS-EMAIL",
        state: "outcome_unknown",
        recordedAt: minutesAgo(45),
      },
    ]),
    publicationExceptions: queue([
      {
        ...ownedBy,
        id: "publication",
        listingId: "listing",
        reference: "MS-PUBLISH",
        state: "failed",
        kind: "publish",
        destination: "website",
        locale: "bg",
        generation: 1,
        currentGeneration: 2,
        recordedAt: minutesAgo(15),
      },
    ]),
    operatorDeliveryExceptions: queue([
      {
        id: "action",
        kind: "email_send",
        state: "failed",
        attempts: 3,
        lastAttemptAt: minutesAgo(10),
      },
    ]),
    caseContinue: queue([
      {
        ...ownedBy,
        id: "case",
        reference: "CS-1",
        title: "Synthetic purchase case",
        kind: "buyer",
        stage: "needs_agreed",
        disposition: "active",
        nextAction: "Check the shared brief $& $$",
        nextActionDueAt: minutesAgo(20),
        waitingOn: null,
        reviewAt: null,
        dueAt: minutesAgo(20),
      },
    ]),
    draftContinue: queue([
      { ...ownedBy, id: "draft", reference: "MS-DRAFT", editorialState: "draft", updatedAt: now },
    ]),
  });
  await show();
  for (const [name, href, text] of [
    [/^Viewing outcome to record · AP-past/, "/en/calendar/past", "Next step: record the outcome"],
    [
      /^Viewing offered to you to host · AP-offered/,
      "/en/calendar/offered",
      "Host: Agency coverage (Last accepted owner: Maria Example)",
    ],
    [/^Viewing to arrange · AP-open/, "/en/calendar/open", "No time agreed yet · Case CS-ONE"],
    [/^Review needed · MS-REVIEW/, "/en/inventory/MS-REVIEW?tab=review", "Overdue since"],
    [/^Facts needed · MS-FACTS/, "/en/inventory/MS-FACTS?tab=facts", "add the missing facts"],
    [
      /^Translation to review · RU · MS-RU/,
      "/en/inventory/MS-RU/translations/ru",
      "Requested 30 min. ago",
    ],
    [
      /^Result unknown — requires reconciliation before any further send · CS-EMAIL/,
      "/en/cases/case-email/email",
      "Next step: confirm the result before trying again",
    ],
    [
      /^Publishing · MS-PUBLISH/,
      "/en/inventory/MS-PUBLISH?tab=review",
      "Failed · Website · BG · An earlier version; check the current one",
    ],
    [/^Email sending/, "/en/operations/jobs", "Failed · Attempts: 3 · Last attempt 10 min. ago"],
    [/^Synthetic purchase case/, "/en/cases/case", "CS-1 · Owner: Maria Example · Overdue since"],
    [/^Draft · MS-DRAFT/, "/en/inventory/MS-DRAFT", "Next step: continue editing"],
  ] as const) {
    const link = screen.getByRole("link", { name });
    expect(link).toHaveAttribute("href", href);
    expect(link).toHaveTextContent(text);
  }
  // Staff-typed next actions print as typed.
  expect(screen.getByRole("link", { name: /^Synthetic purchase case/ })).toHaveTextContent(
    "Next step: Check the shared brief $& $$",
  );
  // Rows keep the server's order inside their group.
  expect(
    within(groupOf("viewings"))
      .getAllByRole("link")
      .map((link) => link.getAttribute("href")),
  ).toEqual(["/en/calendar/past", "/en/calendar/offered", "/en/calendar/open"]);
  // Attention: 3 viewings, 2 listing, 1 translation, 1 email, 1 publication, 1 operation; and
  // the Case whose next action is already due.
  expect(screen.getByText("Waiting for action: 10. Start at the top of the list.")).toBeVisible();
  expect(
    screen.getAllByRole("heading", { level: 3 }).map((heading) => heading.textContent),
  ).toEqual([
    "ViewingsIn the queue: 3",
    "Listing corrections and reviewsIn the queue: 2",
    "Translations to reviewIn the queue: 1",
    "Email delivery to checkIn the queue: 1",
    "Publication delivery to checkIn the queue: 1",
    "Delivery operations to checkIn the queue: 1",
    "My casesIn the queue: 1",
    "My listing draftsIn the queue: 1",
  ]);
  // Today only links: nothing here approves, sends or publishes.
  expect(screen.queryByRole("button")).toBeNull();
  expect(document.querySelector("form")).toBeNull();
});

it("omits role-gated queues that the read model withholds", async () => {
  reads.today.mockResolvedValue({
    ...ordinary(),
    keyReturns: null,
    operatorDeliveryExceptions: null,
  });
  await show();
  for (const name of ["Overdue key returns", "Delivery operations to check"]) {
    expect(screen.queryByRole("heading", { name: new RegExp(`^${name}`) })).toBeNull();
    expect(quiet("attention")).not.toHaveTextContent(name);
  }
});

it("reports a failed read as a failure, never as a day without work", async () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  reads.today.mockRejectedValue(new TypeError("synthetic connection reset"));
  await show();
  expect(
    screen.getByText("We could not load today's work. This does not mean there is none."),
  ).toBeVisible();
  expect(
    screen.getByText("Reload the page. If that does not help, check the system status."),
  ).toBeVisible();
  expect(screen.getByRole("link", { name: "Reload the page" })).toHaveAttribute(
    "href",
    "/en/today",
  );
  expect(document.querySelector("[data-today-state=failed]")).not.toBeNull();
  for (const text of [/Nothing in today's lists/, /Nothing waiting/, /Check the inquiries/])
    expect(screen.queryByText(text)).not.toBeInTheDocument();
  expect(screen.queryByRole("heading", { level: 2 })).not.toBeInTheDocument();
  expect(log).toHaveBeenCalledWith("[O01] Today queues unavailable:", "TypeError");
  log.mockRestore();
});

it("lets an access change during the read reach the access flow", async () => {
  const ended = new AppError("unauthenticated");
  reads.today.mockRejectedValue(ended);
  await expect(TodayScreen({ locale: "en", session, name: null, now })).rejects.toBe(ended);
});

it("keeps the queues in view when only the Butler check fails", async () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  reads.source.mockRejectedValue(new RangeError("synthetic pool exhausted"));
  await show();
  expect(screen.queryByRole("complementary", { name: "Butler" })).not.toBeInTheDocument();
  expect(screen.getByRole("list", { name: "Unassigned requests" })).toBeVisible();
  expect(log).toHaveBeenCalledWith("[O01] Butler entry unavailable:", "RangeError");
  log.mockRestore();

  const ended = new AppError("unauthenticated");
  reads.source.mockRejectedValue(ended);
  await expect(TodayScreen({ locale: "en", session, name: null, now })).rejects.toBe(ended);
});

it("prints staff-typed text exactly, including dollar signs", async () => {
  reads.today.mockResolvedValue({
    ...ordinary(),
    due: queue([
      {
        ...task("task-dollar", { state: "waiting", waitingOn: "bank $& $$ $' approval" }),
        ownerName: "Name $& Example",
      },
    ]),
  });
  await show();
  const row = within(screen.getByRole("list", { name: "My overdue tasks" })).getByRole("link");
  expect(row).toHaveTextContent("Owner: Name $& Example");
  expect(row).toHaveTextContent("Waiting on: bank $& $$ $' approval");
  expect(row).toHaveTextContent("Next step: check the dependency");
});

it.each([
  [
    "bg",
    "Добро утро, Maria Example.",
    ["За действие", "Моите задачи", "Екип"],
    "Неразпределени запитвания",
    "Отговорник: Дежурна опашка",
  ],
  [
    "ru",
    "Доброе утро, Maria Example.",
    ["К действию", "Мои задачи", "Команда"],
    "Запросы без исполнителя",
    "Ответственный: Очередь подхвата",
  ],
])("speaks %s", async (locale, title, tabs, group, owner) => {
  await show(locale);
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(title);
  expect(
    within(screen.getByRole("navigation"))
      .getAllByRole("link")
      .map((link) => link.textContent),
  ).toEqual(tabs);
  expect(within(screen.getByRole("list", { name: group })).getByRole("link")).toHaveTextContent(
    owner,
  );
});

it.each([
  ["bg", "Не е заредено", "Някои списъци не се заредиха"],
  ["ru", "Не загружено", "Некоторые списки не загрузились"],
])("names a list that did not load in %s", async (locale, status, lead) => {
  reads.today.mockResolvedValue({ ...empty(), due: unavailable() });
  await show(locale);
  expect(screen.getAllByText(status)).toHaveLength(1);
  expect(screen.getByText(new RegExp(`^${lead}`))).toBeVisible();
});
