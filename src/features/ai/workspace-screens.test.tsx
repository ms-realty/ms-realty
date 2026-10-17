import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Session } from "@/server/auth/sessions";
import { workspaceCopy } from "./workspace-copy";
import { WorkspaceDetailScreen } from "./workspace-screens";
import type { WorkspaceView } from "./workspace-types";

const fixture = vi.hoisted(() => ({ view: null as unknown, operation: null as unknown }));
vi.mock("@/db/client", () => ({ getDb: () => ({}) }));
vi.mock("@/server/ai/workspace", () => ({
  readWorkspace: async () => fixture.view,
  readWorkspaceOperation: async () => fixture.operation,
  listWorkspaces: async () => [],
}));
vi.mock("./workspace-actions", () => ({ workspaceAction: async (...args: unknown[]) => args[6] }));
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
  window.sessionStorage.clear();
});
afterEach(cleanup);
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
