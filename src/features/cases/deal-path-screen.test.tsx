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
      derived("request_received", "done"),
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

it("puts done, you are here and next in one ordered list with who acts and by when", () => {
  render(<ClientDealPath locale="en" path={view()} />);
  const list = screen.getByRole("list");
  const items = within(list).getAllByRole("listitem");
  expect(items.map((item) => item.dataset.status)).toEqual([
    "done",
    "done",
    "done",
    "current",
    "next",
  ]);
  const current = items[3] as HTMLElement;
  expect(current).toHaveAttribute("aria-current", "step");
  expect(within(current).getByText("You are here")).toBeVisible();
  expect(within(current).getByRole("heading", { name: "Notary deed" })).toBeVisible();
  expect(
    within(current).getByText(
      "A notary prepares the deed and reads it with the buyer and the seller before they sign.",
    ),
  ).toBeVisible();
  expect(within(current).getByText(/Who acts: The notary/)).toBeVisible();
  expect(
    within(current)
      .getByText(/Expected by/)
      .querySelector("time"),
  ).toHaveAttribute("dateTime", "2026-04-01");
  expect(within(items[0] as HTMLElement).getByText(/Who acts: You/)).toBeVisible();
  expect(within(items[2] as HTMLElement).getByText("Passports checked.")).toBeVisible();
  expect(screen.queryByRole("button")).toBeNull();
});

it("shows a seller their own steps as theirs and the completed summary after completion", () => {
  render(
    <ClientDealPath
      locale="en"
      path={view({
        kind: "seller",
        completion: { completedOn: "2026-05-04", registryReference: "Entry 77" },
        steps: [recorded("keys_handed_over", "done", "owner")],
        current: null,
        next: null,
      })}
    />,
  );
  expect(screen.getByText("Deal completed")).toBeVisible();
  expect(screen.getByText(/Entry 77/)).toBeVisible();
  expect(screen.getByText(/Who acts: You/)).toBeVisible();
});

it("writes Hebrew steps in Hebrew and keeps a recorded note isolated", () => {
  render(
    <div dir="rtl">
      <ClientDealPath locale="he" path={view()} />
    </div>,
  );
  expect(screen.getByRole("heading", { name: "מסלול העסקה שלכם" })).toBeVisible();
  expect(screen.getByText("אתם כאן")).toBeVisible();
  expect(screen.getByText("Passports checked.").tagName).toBe("BDI");
});

it("gives staff one-step actions on recorded steps only, and the completion form when ready", () => {
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
          derived("terms_agreed", "done"),
          recorded("identity_checks", "done", "agency", { internalNote: "Copies filed." }),
          recorded("notary_deed", "current", "notary"),
        ],
      })}
    />,
  );
  const items = screen.getAllByRole("listitem");
  expect(within(items[0] as HTMLElement).queryByText("Record this step")).toBeNull();
  expect(within(items[1] as HTMLElement).getByText("Copies filed.")).toBeVisible();
  expect(
    within(items[1] as HTMLElement).getByRole("button", { name: "Reopen" }),
  ).toBeInTheDocument();
  const current = items[2] as HTMLElement;
  expect(within(current).getByText("Current step")).toBeVisible();
  expect(within(current).getByRole("button", { name: "Mark done" })).toBeVisible();
  expect(within(current).getByLabelText("Date it happened")).toHaveAttribute("type", "date");
  expect(within(current).getByRole("option", { name: "deed.pdf · DC-1" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Complete the deal" })).toBeVisible();
  expect(
    screen.getByLabelText("I checked every step on this path and the date above."),
  ).toBeRequired();
});
