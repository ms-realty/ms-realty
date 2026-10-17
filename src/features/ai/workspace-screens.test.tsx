import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Session } from "@/server/auth/sessions";
import { AppError } from "@/server/errors";
import { workspaceCopy } from "./workspace-copy";
import { WorkspaceDetailScreen, WorkspaceEntryScreen } from "./workspace-screens";
import type { WorkspaceView } from "./workspace-types";

const fixture = vi.hoisted(() => ({ view: null as unknown, operation: null as unknown }));
const choices = vi.hoisted(() => ({
  inventory: [] as { listing: { id: string } }[],
  resolve: vi.fn(),
}));
vi.mock("@/db/client", () => ({ getDb: () => ({}) }));
vi.mock("@/server/ai/workspace", () => ({
  readWorkspace: async () => fixture.view,
  readWorkspaceOperation: async () => fixture.operation,
  listWorkspaces: async () => [],
}));
vi.mock("./workspace-actions", () => ({ workspaceAction: async (...args: unknown[]) => args[6] }));
vi.mock("@/server/work/shared", () => ({
  liveStaff: async () => ({ actor: { kind: "staff", id: "synthetic-staff" } }),
}));
vi.mock("@/server/cases/queries", () => ({ listCases: async () => [] }));
vi.mock("@/server/work/queries", () => ({
  listInbox: async () => ({ rows: [], total: 0, hasMore: false, page: 1 }),
  inquiryIdByReference: async () => null,
}));
vi.mock("@/server/inventory/queries", () => ({
  inventoryListPage: async () => ({ rows: choices.inventory }),
}));
vi.mock("@/server/ai/workspace-context", () => ({ resolveWorkspaceContext: choices.resolve }));
const session = { account: { id: "synthetic-staff" } } as Session;
const budget = { maxSteps: 8, maxCostMicros: 25000 };
const id = "10000000-0000-4000-8000-000000000001";
function view(canResume: boolean, requiresUnknownAck = false): WorkspaceView {
  return {
    workspace: {
      id,
      ownerId: session.account.id,
      goal: "Investigate the supplied evidence",
      locale: "en",
      constraints: [],
      selection: { caseId: null, inquiryId: null, listingIds: [] },
      questions: [],
      decisions: [],
      plan: [],
      conversation: [],
      contextPins: [],
      contextDigest: "current",
      state: "running",
      version: 2,
      generation: 1,
      errorCode: null,
    },
    context: { sources: [], pins: [], digest: "current", truncated: false },
    artifacts: [],
    runs: [
      { state: "running", steps: 1, budget, reservedCostMicros: 25000, actualCostMicros: null },
    ],
    checkpoints: [],
    sourceChanged: false,
    availability: { enabled: true, budget },
    recovery: { canResume, requiresUnknownAck },
  } as unknown as WorkspaceView;
}
beforeEach(() => {
  fixture.operation = null;
  choices.inventory = [];
  choices.resolve.mockReset();
  window.sessionStorage.clear();
});
afterEach(cleanup);
it("opens a goal with approved choices while unpublished and withdrawn inventory fails qualification", async () => {
  choices.inventory = ["approved", "unpublished", "withdrawn"].map((id) => ({ listing: { id } }));
  choices.resolve.mockImplementation(
    async (_db: unknown, _actor: unknown, selection: { listingIds: string[] }) => {
      const listingId = selection.listingIds[0];
      if (listingId !== "approved") throw new AppError("listing_unavailable");
      return {
        sources: [
          { key: "listing:approved", title: "Approved home", facts: { reference: "MS-54321" } },
        ],
      };
    },
  );
  render(await WorkspaceEntryScreen({ locale: "en", session, id }));
  expect(screen.getByRole("heading", { name: workspaceCopy("en").title })).toBeVisible();
  expect(screen.getByRole("checkbox", { name: "MS-54321" })).toBeVisible();
  expect(screen.getAllByRole("checkbox")).toHaveLength(1);
  expect(choices.resolve).toHaveBeenCalledTimes(3);
});

it("propagates unexpected qualification failures instead of hiding them as unavailable choices", async () => {
  choices.inventory = [{ listing: { id: "approved" } }];
  choices.resolve.mockRejectedValueOnce(new Error("unexpected_database_failure"));
  await expect(WorkspaceEntryScreen({ locale: "en", session, id })).rejects.toThrow(
    "unexpected_database_failure",
  );
});

it("keeps an active worker fenced but exposes a server-authorized expired resume with fresh review", async () => {
  fixture.view = view(false);
  const current = render(await WorkspaceDetailScreen({ locale: "en", session, id }));
  expect(
    screen.queryByRole("button", { name: workspaceCopy("en").resume }),
  ).not.toBeInTheDocument();
  current.unmount();
  fixture.view = view(true, true);
  render(await WorkspaceDetailScreen({ locale: "en", session, id }));
  expect(screen.getByText(workspaceCopy("en").recovery)).toBeVisible();
  expect(screen.getByRole("button", { name: workspaceCopy("en").resume })).toBeVisible();
  expect(screen.getByRole("checkbox", { name: workspaceCopy("en").reviewed })).not.toBeChecked();
  expect(
    screen.getByRole("checkbox", { name: workspaceCopy("en").unknownReview }),
  ).not.toBeChecked();
});
it("keeps all new commands locked on a missing original receipt and preserves its refresh URL", async () => {
  fixture.view = view(true, true);
  render(
    await WorkspaceDetailScreen({
      locale: "en",
      session,
      id,
      operationKey: "synthetic-original-operation",
      command: "research",
    }),
  );
  expect(screen.getByText(workspaceCopy("en").notFoundOperation)).toBeVisible();
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
  const href =
    "/en/operations/assistance/research/" +
    id +
    "?operation=synthetic-original-operation&command=research";
  expect(
    screen
      .getAllByRole("link", { name: workspaceCopy("en").refresh })
      .every((link) => link.getAttribute("href") === href),
  ).toBe(true);
});
