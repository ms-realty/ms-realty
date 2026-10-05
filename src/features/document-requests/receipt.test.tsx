import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { DocumentRequestsScreen } from "./screens";

const mocks = vi.hoisted(() => ({ view: vi.fn(), receipt: vi.fn() }));
vi.mock("@/db/client", () => ({ getDb: () => "db" }));
vi.mock("@/server/auth/sessions", () => ({ isFresh: () => true }));
vi.mock("@/server/documents/requests", () => ({ documentRequestWorkbench: mocks.view }));
vi.mock("@/server/files/receipts", () => ({ fileReceipt: mocks.receipt }));
vi.mock("@/server/operations", () => ({ findOperation: vi.fn() }));
vi.mock("./actions", () => ({ documentRequestAction: async () => {} }));
vi.mock("../cases/screens", () => ({
  WorkflowPage: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
  WorkflowSection: ({ children }: { children: React.ReactNode }) => <section>{children}</section>,
  WorkflowTime: () => null,
  workflowLink: "",
}));
vi.mock("../cases/form", () => ({ WorkflowForm: () => null }));

const session = { actor: { kind: "client", id: "client-a" } } as Parameters<
  typeof DocumentRequestsScreen
>[0]["session"];
const request = (id: string, file: { id: string } | null) => ({
  id,
  version: 1,
  caseId: "case-a",
  reference: `DOC-${id}`,
  recipientName: "Synthetic recipient",
  title: "Synthetic request",
  purpose: "Synthetic purpose",
  instructions: "Synthetic instructions",
  alternatives: "Synthetic alternatives",
  allowedContentTypes: ["application/pdf"],
  maxBytes: 1024 * 1024,
  expiresAt: new Date("2099-01-01T00:00:00Z"),
  cancelledAt: null,
  clientOutcome: null,
  canUpload: false,
  canReview: false,
  file: file && {
    ...file,
    version: 1,
    number: 1,
    fileName: "synthetic.pdf",
    state: "ready_for_review",
    scan: "pending",
    byteSize: 10,
    reviewType: null,
    professionalValidation: null,
  },
});
const saved = "10000000-0000-4000-8000-000000000001";
beforeEach(() => {
  mocks.view.mockResolvedValue({
    case: null,
    canCreate: false,
    recipients: [],
    policies: [],
    requests: [request("request-a", { id: "version-a" }), request("request-b", null)],
  });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it.each([
  ["the displayed version's transfer", saved, true],
  ["any other upload or operation", null, false],
])("C09 confirms only %s", async (_label, result, confirmed) => {
  mocks.receipt.mockResolvedValue(result);
  render(await DocumentRequestsScreen({ locale: "en", session, query: { saved } }));
  // Only the file versions this screen displays can carry the upload confirmation.
  expect(mocks.receipt).toHaveBeenCalledWith("db", session, saved, [
    { kind: "document", id: "version-a" },
  ]);
  if (confirmed) expect(screen.getByText(/File transfer is recorded/)).toBeVisible();
  else expect(screen.queryByText(/File transfer is recorded/)).not.toBeInTheDocument();
});
