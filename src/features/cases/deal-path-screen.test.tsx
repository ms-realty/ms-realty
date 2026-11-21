import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { DealPathActor } from "@/config/tenant";
import type { PathStepStatus } from "@/domain/deal-path";
import type { Session } from "@/server/auth/sessions";
import type { FormState, FormValues } from "@/ui/form/contract";
import { ClientDealPath, type DealPathView, StaffDealPath } from "./deal-path-screen";

vi.mock("./actions", () => ({ workflowAction: vi.fn() }));
vi.mock("@/ui/form/server", () => ({
  initialFormState: (
    _scope: string,
    values: FormValues,
    expectedRevision: number,
  ): FormState<FormValues> => ({
    operationId: "operation-1",
    responseId: "render-1",
    expectedRevision,
    values,
    outcome: { kind: "idle" },
  }),
}));
afterEach(cleanup);

const derived = (key: string, status: PathStepStatus, actor: DealPathActor = "client") => ({
  key,
  source: "derived" as const,
  actor,
  clientVisible: true,
  evidenceExpected: false,
  doneAt: status === "done" ? new Date("2026-03-02T10:00:00Z") : null,
  expectedAt: null,
  settled: status === "done" ? ("done" as const) : null,
  status,
  clientNote: null,
});
const recorded = (key: string, status: PathStepStatus, actor: DealPathActor, extra = {}) => ({
  key,
  source: "recorded" as const,
  actor,
  clientVisible: true,
  evidenceExpected: true,
  doneAt: status === "done" ? "2026-03-10" : null,
  expectedAt: status === "current" ? "2026-04-01" : null,
  settled:
    status === "done" ? ("done" as const) : status === "skipped" ? ("skipped" as const) : null,
  status,
  clientNote: null,
  ...extra,
});
const view = (overrides: Partial<DealPathView> = {}) =>
  ({
    caseId: "case-one",
    caseVersion: 4,
    kind: "buyer",
    transaction: "sale",
    template: "BG.sale",
    recorded: true,
    steps: [
      derived("request_received", "done", "agency"),
      derived("terms_agreed", "done"),
      recorded("identity_checks", "done", "agency", { clientNote: "Passports checked." }),
      recorded("notary_deed", "current", "notary"),
      recorded("keys_handed_over", "next", "owner"),
    ],
    current: "notary_deed",
    next: "keys_handed_over",
    completion: null,
    canRecord: false,
    canComplete: false,
    completionBlocked: "steps_open",
    evidenceOptions: [],
    ...overrides,
  }) as DealPathView;

const section = () => screen.getByRole("region", { name: /deal path/i });
const order = () =>
  [...section().querySelectorAll<HTMLElement>("li[data-step]")].map((li) => li.dataset.step);

it("leads with progress and the current step, then the steps to come, with done steps folded", () => {
  render(<ClientDealPath locale="en" path={view()} />);
  const region = section();
  expect(within(region).getByText("3 of 5 steps done")).toBeVisible();
  // Reading order: current first, then what is still to come, then the finished steps.
  expect(order()).toEqual([
    "notary_deed",
    "keys_handed_over",
    "request_received",
    "terms_agreed",
    "identity_checks",
  ]);
  const current = region.querySelector<HTMLElement>('li[aria-current="step"]');
  if (!current) throw new Error("No current step");
  expect(current.dataset.status).toBe("current");
  expect(within(current).getByText("You are here")).toBeVisible();
  expect(within(current).getByText("Step 4 of 5")).toBeVisible();
  expect(within(current).getByRole("heading", { name: "Notary deed" })).toBeVisible();
  // Addressed to the buyer reading it, not to "the buyer".
  expect(
    within(current).getByText(
      "A notary prepares the deed and reads it with you and the seller before you sign.",
    ),
  ).toBeVisible();
  expect(within(current).getByText(/Who acts: The notary/)).toBeVisible();
  expect(current.querySelector("time")).toHaveAttribute("dateTime", "2026-04-01");
  // "You are here" is the only visible status word on the path.
  expect(within(region).queryByText("Next")).toBeNull();
  const toCome = region.querySelector<HTMLElement>('li[data-step="keys_handed_over"]');
  expect(toCome?.textContent).toContain("Step 5 of 5");
  expect(
    within(toCome as HTMLElement).getByText("The owner hands you the keys on the agreed day."),
  ).toBeVisible();
  const done = region.querySelector("details");
  expect(done).not.toHaveAttribute("open");
  expect(within(done as HTMLElement).getByText("3 steps done").tagName).toBe("SUMMARY");
  const request = region.querySelector<HTMLElement>('li[data-step="request_received"]');
  expect(request?.textContent).toContain("Step 1 of 5");
  expect(request?.textContent).not.toContain("Who acts");
  expect(within(region).getByText("Passports checked.").tagName).toBe("BDI");
  expect(screen.queryByRole("button")).toBeNull();
});

it("puts the completed summary first and every step in the closed done group", () => {
  render(
    <ClientDealPath
      locale="en"
      path={view({
        kind: "seller",
        completion: { completedOn: "2026-05-04", registryReference: "Entry 77" },
        steps: [
          derived("request_received", "done", "agency"),
          recorded("keys_handed_over", "done", "owner"),
        ],
        current: null,
        next: null,
      })}
    />,
  );
  const region = section();
  const summary = within(region).getByRole("status");
  expect(summary).toHaveTextContent("Deal completed");
  expect(summary).toHaveTextContent("Entry 77");
  expect(region.querySelector('li[aria-current="step"]')).toBeNull();
  const details = region.querySelector("details");
  expect(details?.querySelectorAll("li[data-step]")).toHaveLength(2);
  expect(
    summary.compareDocumentPosition(details as Node) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
});

it("writes Hebrew steps in Hebrew, addressed to the reader", () => {
  render(
    <div dir="rtl">
      <ClientDealPath locale="he" path={view()} />
    </div>,
  );
  expect(screen.getByRole("heading", { name: "מסלול העסקה שלכם" })).toBeVisible();
  expect(screen.getByText("אתם כאן")).toBeVisible();
  expect(screen.getByText("בוצעו 3 מתוך 5 שלבים")).toBeVisible();
  expect(
    screen.getByText("נוטריון מכין את השטר וקורא אותו איתכם ועם המוכר לפני שאתם חותמים."),
  ).toBeVisible();
});

it("gives staff the deal kind in words, neutral sentences and one-step actions on recorded steps", () => {
  const session = { account: { kind: "staff", id: "staff-one" } } as Session;
  render(
    <StaffDealPath
      locale="en"
      session={session}
      pagePath="/en/cases/case-one"
      path={view({
        canRecord: true,
        canComplete: true,
        evidenceOptions: [{ id: "file-one", fileName: "deed.pdf", reference: "DC-1" }],
        steps: [
          derived("needs_agreed", "not_recorded", "agency"),
          derived("terms_agreed", "done"),
          recorded("identity_checks", "done", "agency", { internalNote: "Copies filed." }),
          recorded("notary_deed", "current", "notary"),
        ],
      })}
    />,
  );
  const region = section();
  expect(within(region).getByText("Sale in Bulgaria")).toBeVisible();
  expect(region.textContent).not.toContain("BG.sale");
  const passed = region.querySelector<HTMLElement>('li[data-step="needs_agreed"]');
  expect(passed?.textContent).toContain("Passed without a record in the app");
  expect(within(passed as HTMLElement).queryByText("Record this step")).toBeNull();
  const checked = region.querySelector<HTMLElement>('li[data-step="identity_checks"]');
  expect(within(checked as HTMLElement).getByText("Copies filed.")).toBeInTheDocument();
  expect(checked?.querySelector("summary")?.textContent).toMatch(/^Reopen/);
  const current = region.querySelector<HTMLElement>('li[aria-current="step"]') as HTMLElement;
  expect(within(current).getByText("Current step")).toBeVisible();
  expect(
    within(current).getByText(
      "A notary prepares the deed and reads it with the buyer and the seller before they sign.",
    ),
  ).toBeVisible();
  expect(within(current).getByRole("button", { name: "Mark done" })).toBeVisible();
  expect(within(current).getByLabelText("Date it happened")).toHaveAttribute("type", "date");
  expect(within(current).getByRole("option", { name: "deed.pdf (DC-1)" })).toBeInTheDocument();
  for (const summary of region.querySelectorAll("summary"))
    expect(summary.className).toContain("min-h-control");
  expect(screen.getByRole("button", { name: "Complete the deal" })).toBeVisible();
  expect(
    screen.getByLabelText("I checked every step on this path and the date above."),
  ).toBeRequired();
});
