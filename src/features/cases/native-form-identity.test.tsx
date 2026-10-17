import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { InventoryDecisionValues } from "@/features/inventory/decision-contract";
import { InventoryDecisionForm } from "@/features/inventory/decision-form";
import type { Session } from "@/server/auth/sessions";
import type { FormAction, FormState, FormValues } from "@/ui/form/contract";
import { BoundWorkflowForm, CaseScreen } from "./screens";

const native = vi.hoisted(() => ({
  calls: [] as { permalink: string | undefined; initial: FormState<FormValues> }[],
  restored: new Map<string, FormState<FormValues>>(),
  sequence: 0,
  detail: vi.fn(),
}));
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useActionState(
      action: FormAction<FormValues>,
      initial: FormState<FormValues>,
      permalink?: string,
    ) {
      native.calls.push({ permalink, initial });
      // Exercise the real caller → ActionForm → React permalink seam. The browser's
      // native response lookup is simulated here; root's E2E owns actual POST proof.
      return actual.useActionState(
        action,
        native.restored.get(permalink ?? "") ?? initial,
        permalink,
      );
    },
  };
});
vi.mock("@/db/client", () => ({ getDb: () => "test-db" }));
vi.mock("@/server/config/env", () => ({
  getEnv: () => ({ hosts: { public: "https://example.test" } }),
}));
vi.mock("@/server/cases/queries", () => ({
  readCase: native.detail,
  readCaseMessages: async () => [],
}));
vi.mock("@/server/appointments/service", () => ({ listAppointments: async () => [] }));
vi.mock("../work/screens", () => ({ privateRead: (read: () => Promise<unknown>) => read() }));
vi.mock("./actions", () => ({ workflowAction: vi.fn() }));
vi.mock("@/ui/form/server", () => ({
  initialFormState: (
    _scope: string,
    values: FormValues,
    expectedRevision: number,
  ): FormState<FormValues> => ({
    operationId: `operation-${++native.sequence}`,
    responseId: `render-${native.sequence}`,
    expectedRevision,
    values,
    outcome: { kind: "idle" },
  }),
}));

const session = { account: { kind: "client", id: "client-one" } } as Session;
const view = (ids: string[], version = 1) => ({
  record: {
    id: "case-one",
    reference: "CA-ONE",
    title: "Recorded buyer search",
    kind: "buyer",
    stage: "shortlisting",
    disposition: "active",
    version,
    ownerName: "Recorded broker",
    nextAction: null,
    dueAt: null,
  },
  brief: [],
  ownerPreviews: [],
  participants: [],
  canRequestProposal: true,
  interests: ids.map((id) => ({
    id,
    reference: `MS-${id}`,
    state: "shortlisted",
    listingRevisionId: "revision-one",
    currentRevisionId: "revision-one",
    explanation: [],
    canRespond: false,
  })),
});
function restoredReceipt(initial: FormState<FormValues>, reference: string): FormState<FormValues> {
  return {
    ...initial,
    responseId: `accepted-${reference}`,
    outcome: {
      kind: "confirmed",
      receipt: {
        title: "Recorded for this source",
        reference,
        recordedAt: { dateTime: "2026-09-30T12:00:00Z", label: "Recorded time" },
        nextStep: "Review the source record",
        destination: { href: "/en/overview/case-one", label: "Open recorded source" },
      },
    },
  };
}
beforeEach(() => {
  native.calls.length = 0;
  native.restored.clear();
  native.sequence = 0;
});
afterEach(cleanup);

it("keeps a property's proposal-request response on that property after a fresh reordered render and new operation keys", async () => {
  native.detail.mockResolvedValue(view(["A", "B"]));
  render(await CaseScreen({ locale: "en", session, id: "case-one" }));
  const before = new Map(native.calls.map((call) => [call.initial.values.interestId, call]));
  const submitted = before.get("B");
  if (!submitted?.permalink) throw new Error("Missing native property form permalink");
  expect(before.get("A")?.permalink).not.toBe(submitted.permalink);
  native.restored.set(submitted.permalink, restoredReceipt(submitted.initial, "MS-B"));
  cleanup();
  native.calls.length = 0;
  native.detail.mockResolvedValue(view(["C", "B", "A"], 9));
  render(await CaseScreen({ locale: "en", session, id: "case-one" }));
  const after = new Map(native.calls.map((call) => [call.initial.values.interestId, call]));
  expect(after.get("A")?.permalink).toBe(before.get("A")?.permalink);
  expect(after.get("B")?.permalink).toBe(submitted.permalink);
  expect(after.get("B")?.initial.operationId).not.toBe(submitted.initial.operationId);
  expect(after.get("B")?.initial.expectedRevision).toBe(9);
  const submittedRow = screen.getByRole("link", { name: "MS-B" }).closest("li");
  if (!submittedRow) throw new Error("Missing property row");
  expect(
    within(submittedRow).getByRole("heading", { name: "Recorded for this source" }),
  ).toBeVisible();
  expect(within(submittedRow).queryByRole("button")).not.toBeInTheDocument();
  for (const reference of ["MS-A", "MS-C"]) {
    const row = screen.getByRole("link", { name: reference }).closest("li");
    if (!row) throw new Error("Missing unsubmitted property row");
    expect(
      within(row).queryByRole("heading", { name: "Recorded for this source" }),
    ).not.toBeInTheDocument();
    expect(within(row).getByRole("button", { name: "Request proposal preparation" })).toBeVisible();
  }
});

it("gives ordinary bound commands a stable record identity independent of issued keys, version and form values", () => {
  const form = (revision: number, body: string) => (
    <BoundWorkflowForm
      locale="en"
      session={session}
      command="message"
      id="case-one"
      revision={revision}
      path="/en/overview/case-one"
      fields={[{ name: "body", label: "Message" }]}
      values={{ body }}
      submit="Post in this case"
    />
  );
  render(form(1, "First draft"));
  const before = native.calls[0];
  cleanup();
  native.calls.length = 0;
  render(form(8, "Changed draft"));
  expect(native.calls[0]?.permalink).toBe(before?.permalink);
  expect(native.calls[0]?.permalink).toContain("workflow.message.case-one");
  expect(native.calls[0]?.initial.operationId).not.toBe(before?.initial.operationId);
});

it.each(["freeze", "availability"] as const)(
  "restores the listing's %s receipt when the native response introduces its first frozen revision",
  (intent) => {
    const action: FormAction<InventoryDecisionValues> = async (state) => state;
    const form = (revisionId: string, version: number) => (
      <InventoryDecisionForm
        context={{ locale: "en", reference: "MS-ONE", intent, revisionId }}
        title="Record listing decision"
        action={action}
        initialState={{
          operationId: `operation-${++native.sequence}`,
          responseId: `render-${native.sequence}`,
          expectedRevision: version,
          values: { scope: "Recorded evidence", confirmed: "yes", publicationLocale: "bg" },
          outcome: { kind: "idle" },
        }}
      />
    );
    render(form("", 1));
    const submitted = native.calls[0];
    if (!submitted?.permalink) throw new Error("Missing listing decision permalink");
    native.restored.set(submitted.permalink, restoredReceipt(submitted.initial, "MS-ONE"));
    cleanup();
    native.calls.length = 0;
    render(form("new-immutable-revision", 2));
    expect(native.calls[0]?.permalink).toBe(submitted.permalink);
    expect(native.calls[0]?.initial.operationId).not.toBe(submitted.initial.operationId);
    expect(native.calls[0]?.initial.expectedRevision).toBe(2);
    expect(screen.getByRole("heading", { name: "Recorded for this source" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Open recorded source" })).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Record listing decision" }),
    ).not.toBeInTheDocument();
  },
);

it("keeps a manifest activation receipt with its exact manifest when sibling forms move", () => {
  const action: FormAction<InventoryDecisionValues> = async (state) => state;
  const forms = (ids: string[], revision: number) => (
    <>
      {ids.map((id) => (
        <section key={id} aria-label={`Manifest ${id}`}>
          <InventoryDecisionForm
            context={{
              locale: "en",
              reference: "MS-ONE",
              intent: "activate",
              revisionId: "immutable-listing-revision",
              manifestId: id,
            }}
            title={`Activate ${id}`}
            action={action}
            initialState={{
              operationId: `operation-${++native.sequence}`,
              expectedRevision: revision,
              responseId: `render-${native.sequence}`,
              values: { scope: "Recorded scope", confirmed: "", publicationLocale: id },
              outcome: { kind: "idle" },
            }}
          />
        </section>
      ))}
    </>
  );
  render(forms(["BG-manifest", "EN-manifest"], 1));
  const before = new Map(native.calls.map((call) => [call.initial.values.publicationLocale, call]));
  const submitted = before.get("EN-manifest");
  if (!submitted?.permalink) throw new Error("Missing manifest permalink");
  native.restored.set(submitted.permalink, restoredReceipt(submitted.initial, "MS-ONE / EN"));
  cleanup();
  native.calls.length = 0;
  render(forms(["EN-manifest", "BG-manifest", "RU-manifest"], 5));
  const after = new Map(native.calls.map((call) => [call.initial.values.publicationLocale, call]));
  expect(after.get("BG-manifest")?.permalink).toBe(before.get("BG-manifest")?.permalink);
  expect(after.get("EN-manifest")?.permalink).toBe(submitted.permalink);
  expect(after.get("EN-manifest")?.initial.operationId).not.toBe(submitted.initial.operationId);
  expect(
    within(screen.getByRole("region", { name: "Manifest EN-manifest" })).getByRole("heading", {
      name: "Recorded for this source",
    }),
  ).toBeVisible();
  expect(
    within(screen.getByRole("region", { name: "Manifest BG-manifest" })).getByRole("button", {
      name: "Activate BG-manifest",
    }),
  ).toBeVisible();
  expect(
    within(screen.getByRole("region", { name: "Manifest RU-manifest" })).getByRole("button", {
      name: "Activate RU-manifest",
    }),
  ).toBeVisible();
});
