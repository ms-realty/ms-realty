// B10 / AT10 / AT11: chooser navigation and the real form's native response identity.
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Session } from "@/server/auth/sessions";
import type { FormAction, FormState, FormValues } from "@/ui/form/contract";
import { formFields } from "@/ui/form/contract";
import { workCopy } from "../work/copy";
import { agencyCopy } from "./copy";
import { partnerEntryPath } from "./partner-context";
import { PartnerScreen } from "./screens";

const state = vi.hoisted(() => ({
  choices: vi.fn(),
  selected: vi.fn(),
  sequence: 0,
  calls: [] as { initial: FormState<FormValues>; permalink?: string }[],
  restored: new Map<string, FormState<FormValues>>(),
}));
vi.mock("react", async (original) => {
  const actual = await original<typeof import("react")>();
  return {
    ...actual,
    useActionState(
      action: FormAction<FormValues>,
      initial: FormState<FormValues>,
      permalink?: string,
    ) {
      state.calls.push({ initial, permalink });
      return actual.useActionState(
        action,
        state.restored.get(permalink ?? "") ?? initial,
        permalink,
      );
    },
  };
});
vi.mock("@/db/client", () => ({
  getDb: () => ({
    select: () => ({
      from: () => ({ innerJoin: () => ({ where: () => ({ orderBy: async () => [] }) }) }),
    }),
  }),
}));
vi.mock("@/server/config/env", () => ({
  getEnv: () => ({ hosts: { staff: "http://app.localhost:3100" } }),
}));
vi.mock("@/server/work/shared", async (original) => ({
  ...(await original<object>()),
  liveStaff: async () => ({}),
}));
vi.mock("@/server/cases/queries", () => ({ listCases: async () => [] }));
vi.mock("@/server/cases/shared", async (original) => ({
  ...(await original<object>()),
  caseFor: async () => ({
    row: {
      id: "10000000-0000-4000-8000-000000000002",
      reference: "CA-SYNTHETIC",
      title: "Synthetic permitted Case",
    },
  }),
}));
vi.mock("./partner-picker", () => ({
  partnerChoices: state.choices,
  readPartnerChoice: state.selected,
}));
vi.mock("./actions", () => ({ agencyAction: vi.fn() }));
vi.mock("@/ui/form/server", async (original) => ({
  ...(await original<object>()),
  initialFormState: (
    _scope: string,
    values: FormValues,
    expectedRevision: number | null,
  ): FormState<FormValues> => ({
    operationId: `synthetic-operation-${++state.sequence}`,
    expectedRevision,
    responseId: `render-${state.sequence}`,
    values,
    outcome: { kind: "idle" },
  }),
}));

const draft = "10000000-0000-4000-8000-000000000001",
  caseId = "10000000-0000-4000-8000-000000000002",
  partyId = "10000000-0000-4000-8000-000000000003";
const context = { draft, caseId, page: 2, returnTo: `/en/cases/${caseId}` };
const props = {
  locale: "en",
  session: { account: { kind: "staff" } } as Session,
  id: "new",
  ...context,
};
const copy = agencyCopy("en");
afterEach(cleanup);
beforeEach(() => {
  state.calls.length = 0;
  state.restored.clear();
  state.selected.mockReset();
  state.choices.mockReset();
  state.selected.mockResolvedValue({ id: partyId, name: "Synthetic chosen party" });
  state.choices.mockResolvedValue({
    rows: [{ id: partyId, name: "Synthetic chosen party", reference: "RQ-SYNTHETIC" }],
    caseChoices: [],
    currentCase: null,
    page: 2,
    hasMore: true,
  });
});
it("renders a native initial chooser with later-page links and no terms form or issued operation", async () => {
  render(await PartnerScreen(props));
  expect(state.choices).toHaveBeenCalledWith(expect.anything(), props.session, 2, caseId);
  expect(screen.getByRole("link", { name: "Synthetic chosen party" })).toHaveAttribute(
    "href",
    partnerEntryPath("en", { ...context, partyId }),
  );
  const next = screen.getByRole("link", { name: workCopy("en").next });
  expect(
    new URL(next.getAttribute("href") ?? "", "http://localhost").searchParams.get("page"),
  ).toBe("3");
  expect(next.getAttribute("href")).toContain(`draft=${draft}`);
  expect(screen.getByRole("link", { name: copy.returnToRecord })).toHaveAttribute(
    "href",
    context.returnTo,
  );
  expect(screen.queryByLabelText(copy.fields.termsText)).not.toBeInTheDocument();
  expect(state.calls).toHaveLength(0);
});
it("drops an untrusted external return destination without echoing it into picker links", async () => {
  const { container } = render(
    await PartnerScreen({ ...props, returnTo: "https://outside.invalid/private-source" }),
  );
  for (const link of container.querySelectorAll("a"))
    expect(link.href).not.toContain("outside.invalid");
});
it.each(["validation", "unknown"] as const)(
  "keeps selected context, source and original operation mounted after native %s",
  async (kind) => {
    render(await PartnerScreen({ ...props, partyId }));
    const submitted = state.calls[0];
    if (!submitted?.permalink) throw new Error("Missing native selected-context permalink");
    expect(submitted.permalink).toContain(`party=${partyId}`);
    expect(submitted.permalink).toContain(`case=${caseId}`);
    expect(submitted.permalink).toContain("page=2");
    const restored: FormState<FormValues> = {
      ...submitted.initial,
      responseId: "restored-response",
      values: {
        ...submitted.initial.values,
        termsText: "Synthetic exact supplied source retained",
      },
      outcome:
        kind === "validation"
          ? {
              kind: "validation",
              code: "VALIDATION_FAILED",
              message: "Synthetic invalid source",
              fieldErrors: { termsText: ["Check this exact source"] },
            }
          : {
              kind: "unknown",
              code: "OUTCOME_UNKNOWN",
              message: "Synthetic unresolved action",
              status: {
                href: "/en/operations/agency/receipt?key=synthetic-original",
                label: "Check original action",
              },
            },
    };
    state.restored.set(submitted.permalink, restored);
    cleanup();
    state.calls.length = 0;
    const { container } = render(await PartnerScreen({ ...props, partyId }));
    expect(state.calls[0]?.permalink).toBe(submitted.permalink);
    expect(state.calls[0]?.initial.operationId).not.toBe(submitted.initial.operationId);
    expect(screen.getByLabelText(copy.fields.counterpartyPartyId)).toHaveValue(partyId);
    expect(screen.getByLabelText(copy.fields.termsText)).toHaveValue(restored.values.termsText);
    expect(container.querySelector(`input[name="${formFields.operationId}"]`)).toHaveValue(
      submitted.initial.operationId,
    );
    expect(state.choices).not.toHaveBeenCalled();
    if (kind === "validation")
      expect(
        screen.getByRole("link", { name: `${copy.fields.termsText}: Check this exact source` }),
      ).toBeVisible();
    else expect(screen.getByRole("link", { name: "Check original action" })).toBeVisible();
  },
);
