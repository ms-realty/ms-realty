// O01 markup contract: section order, counts that link to their queues, truthful empty,
// overloaded and failed states, and a Butler entry that only opens the draft review.
import { cleanup, render, screen, within } from "@testing-library/react";
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
const queue = <T,>(rows: T[], hasMore = false) => ({ rows, hasMore, page: 1 });
const ordinary = () => ({
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
  keyReturns: null,
  asOf: now,
});
const empty = () => ({
  unassigned: queue([]),
  due: queue([]),
  mine: queue([]),
  handovers: queue([]),
  keyReturns: null,
  asOf: now,
});
const show = async (locale = "en") =>
  render(await TodayScreen({ locale, session, name: "Maria Example", now }));

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
    "Unassigned requests1",
    "My overdue tasks1",
    "Awaiting my acceptance1",
    "My open inquiries1",
  ]);
  for (const [name, href] of [
    [/^Unassigned requests/, "/en/inquiries?view=unassigned"],
    [/^My overdue tasks/, "/en/tasks?view=mine"],
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

it("offers Butler only as a draft review with the manual path beside it", async () => {
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
        needsCoverage: false,
      },
    ]),
  });
  await show();
  expect(
    screen.getAllByRole("heading", { level: 3 }).map((heading) => heading.textContent),
  ).toEqual([
    "Unassigned requests1",
    "My overdue tasks1",
    "Overdue key returns1",
    "Awaiting my acceptance1",
    "My open inquiries1",
  ]);
  const reminders = document.querySelector("[data-key-return-reminders]");
  expect(reminders).not.toBeNull();
  const row = within(reminders as HTMLElement).getByRole("link", { name: /KS-ONE/ });
  expect(row).toHaveAttribute("href", "/en/operations/keys/key-one");
  expect(row).toHaveTextContent(
    "Property PR-ONE · Holder: Synthetic custody holder · Overdue since",
  );
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

it("shows overload with aging and an escalation route, never a celebration", async () => {
  reads.today.mockResolvedValue({
    ...empty(),
    unassigned: queue(
      Array.from({ length: 30 }, (_, index) =>
        inquiry(`in-${index}`, { createdAt: minutesAgo(180 - index) }),
      ),
      true,
    ),
  });
  await show();
  expect(screen.getByText("Waiting for action: 30+. Start at the top of the list.")).toBeVisible();
  expect(screen.getByRole("link", { name: /^Unassigned requests/ })).toHaveTextContent("30+");
  const overload = screen.getByText("More than 30 requests have no owner").parentElement;
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
  expect(screen.queryByText("Nothing needs action right now")).not.toBeInTheDocument();
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
    "/en/tasks?view=mine",
  );
  expect(screen.getByRole("list", { name: "Awaiting my acceptance" })).toBeVisible();
});

it("says plainly when there is no work, scoped to the queues it read", async () => {
  reads.today.mockResolvedValue(empty());
  await show();
  expect(screen.getByText("Check the inquiries for new requests.")).toBeVisible();
  expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent(
    "Nothing needs action right now",
  );
  expect(
    screen.getByText(
      "These queues show the inquiries, follow-up tasks and key returns you can access. Other work is shown in its own workspace.",
    ),
  ).toBeVisible();
  expect(screen.getByRole("link", { name: "Open the inquiries" })).toHaveAttribute(
    "href",
    "/en/inquiries",
  );
  expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
  expect(reads.source).not.toHaveBeenCalled();
});

it("keeps open inquiries in view when nothing else waits", async () => {
  reads.today.mockResolvedValue({ ...empty(), mine: ordinary().mine });
  await show();
  expect(
    screen.getByText("Nothing needs your action right now. Continue with your open inquiries."),
  ).toBeVisible();
  expect(screen.getAllByText("Nothing waiting.")).toHaveLength(3);
  expect(screen.getByRole("list", { name: "My open inquiries" })).toBeVisible();
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
  for (const text of [/Nothing needs/, /Nothing waiting/, /Check the inquiries/])
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
