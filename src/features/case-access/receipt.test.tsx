import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { issueFormOperation } from "@/ui/form/server";
import { accessScope } from "./contract";
import { CaseAccessScreen } from "./screens";

const mocks = vi.hoisted(() => ({ view: vi.fn(), receipt: vi.fn() }));
vi.mock("@/db/client", () => ({ getDb: () => "db" }));
vi.mock("@/server/config/env", () => ({ getEnv: () => ({ authSecret: "a".repeat(64) }) }));
vi.mock("@/server/cases/access-requests", () => ({ caseAccessWorkbench: mocks.view }));
vi.mock("@/server/operations", () => ({ findOperation: mocks.receipt }));
vi.mock("@/server/auth/sessions", () => ({ isFresh: () => true }));
vi.mock("../work/screens", () => ({ privateRead: (read: () => Promise<unknown>) => read() }));
vi.mock("./actions", () => ({ caseAccessAction: async () => {} }));
vi.mock("../cases/screens", () => ({
  WorkflowPage: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
  WorkflowSection: ({ children }: { children: React.ReactNode }) => <section>{children}</section>,
  WorkflowTime: () => null,
  workflowLink: "",
}));
vi.mock("../cases/form", () => ({ WorkflowForm: () => null }));
const session = { actor: { kind: "client", id: "client-a" } } as Parameters<
  typeof CaseAccessScreen
>[0]["session"];
beforeEach(() => {
  mocks.view.mockResolvedValue({
    case: { id: "case-a", reference: "CASE-A", version: 2 },
    roster: { participants: [] },
    requests: [],
    canRequest: false,
  });
  mocks.receipt.mockResolvedValue({ operationId: "receipt-a", status: "succeeded", outcome: {} });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it.each([
  { caseId: "case-b", host: "client" as const, command: "invite" as const },
  { caseId: "case-a", host: "client" as const, command: "remove" as const },
  { caseId: "case-a", host: "staff" as const, command: "invite" as const },
])(
  "C17 does not confirm a receipt issued for another Case, command or host: %j",
  async (binding) => {
    const key = issueFormOperation(accessScope(binding));
    render(
      await CaseAccessScreen({
        locale: "en",
        session,
        id: "case-a",
        query: { command: "invite", key },
      }),
    );
    expect(screen.queryByText("The action was recorded.")).not.toBeInTheDocument();
    expect(mocks.receipt).not.toHaveBeenCalled();
  },
);
it("C17 confirms the actor's operation only after its exact displayed Case/command scope matches", async () => {
  const key = issueFormOperation(
    accessScope({ caseId: "case-a", host: "client", command: "invite" }),
  );
  render(
    await CaseAccessScreen({
      locale: "en",
      session,
      id: "case-a",
      query: { command: "invite", key },
    }),
  );
  expect(screen.getByText("The action was recorded.")).toBeVisible();
  expect(mocks.receipt).toHaveBeenCalledWith("db", session.actor, "case.access.request", key);
});

it.each([
  ["bg", "Купувач", "Съкупувач", "Упълномощен представител"],
  ["en", "Buyer", "Co-buyer", "Authorized representative"],
  ["ru", "Покупатель", "Сопокупатель", "Уполномоченный представитель"],
])(
  "labels mixed current and invited participant roles in %s without model codes",
  async (locale, buyer, coBuyer, representative) => {
    mocks.view.mockResolvedValue({
      case: { id: "case-a", reference: "CASE-A", version: 2 },
      roster: {
        participants: [
          { id: "buyer-a", displayName: "Synthetic buyer", role: "buyer", accessExpiresAt: null },
          {
            id: "representative-a",
            displayName: "Synthetic representative",
            role: "authorized_representative",
            accessExpiresAt: null,
          },
        ],
        pendingInvitations: [
          {
            id: "invitation-a",
            displayName: "Synthetic co-buyer",
            role: "co_buyer",
            invitationExpiresAt: new Date(0),
            accessExpiresAt: null,
          },
        ],
      },
      requests: [],
      canRequest: false,
    });
    const { container } = render(
      await CaseAccessScreen({
        locale,
        session: { ...session, actor: { kind: "staff", id: "staff-a" } },
        id: "case-a",
        query: {},
      }),
    );
    expect(screen.getByText(`Synthetic buyer · ${buyer}`)).toBeVisible();
    expect(screen.getByText(`Synthetic representative · ${representative}`)).toBeVisible();
    expect(screen.getByText(`Synthetic co-buyer · ${coBuyer}`)).toBeVisible();
    expect(container.textContent).not.toContain("co_buyer");
    expect(container.textContent).not.toContain("authorized_representative");
  },
);
it.each([
  ["a displayed request", "request-a", true],
  ["a request this screen does not show", "request-z", false],
])("C17 confirms a withdrawal only for %s", async (_label, targetId, confirmed) => {
  mocks.view.mockResolvedValue({
    case: { id: "case-a", reference: "CASE-A", version: 2 },
    roster: { participants: [] },
    requests: [
      {
        id: "request-a",
        version: 1,
        kind: "invite",
        state: "withdrawn",
        targetName: "Synthetic invitee",
        targetEmail: null,
        requestedRole: null,
        targetParticipantId: null,
        reason: "Synthetic reason",
        clientOutcome: null,
      },
    ],
    canRequest: false,
  });
  const key = issueFormOperation(
    accessScope({ caseId: "case-a", host: "client", command: "withdraw", targetId }),
  );
  render(
    await CaseAccessScreen({
      locale: "en",
      session,
      id: "case-a",
      query: { command: "withdraw", key },
    }),
  );
  if (confirmed) {
    expect(screen.getByText("The action was recorded.")).toBeVisible();
    expect(mocks.receipt).toHaveBeenCalledWith("db", session.actor, "case.access.decide", key);
  } else {
    expect(screen.queryByText("The action was recorded.")).not.toBeInTheDocument();
    expect(mocks.receipt).not.toHaveBeenCalled();
  }
});
