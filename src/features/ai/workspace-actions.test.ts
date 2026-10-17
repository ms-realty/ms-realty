import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError, toErrorBody } from "@/server/errors";
import type { HandlerContext } from "@/server/http/next";
import { formFields } from "@/ui/form/contract";
import { initialFormState } from "@/ui/form/server";
import { workspaceAction } from "./workspace-actions";
import { workspaceCopy } from "./workspace-copy";
import {
  emptyWorkspaceValues,
  type WorkspaceMode,
  type WorkspaceValues,
  workspaceScope,
} from "./workspace-types";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  message: vi.fn(),
  research: vi.fn(),
  cancel: vi.fn(),
  revise: vi.fn(),
  materialize: vi.fn(),
  read: vi.fn(),
  host: vi.fn(),
  queue: vi.fn(),
  enabled: false,
}));
vi.mock("@/server/auth/pages", () => ({ requireAuthHost: mocks.host }));
vi.mock("@/server/ai/workspace-config", () => ({
  workspaceConfig: () => ({ enabled: mocks.enabled }),
}));
vi.mock("@/server/jobs/web", () => ({ getJobQueue: mocks.queue }));
vi.mock("@/server/ai/workspace", () => ({
  createWorkspace: mocks.create,
  appendWorkspaceMessage: mocks.message,
  requestWorkspaceRun: mocks.research,
  cancelWorkspace: mocks.cancel,
  reviseWorkspaceArtifact: mocks.revise,
  materializeWorkspaceArtifact: mocks.materialize,
  readWorkspace: mocks.read,
}));
vi.mock("@/server/http/next", () => ({
  action: async <T>(fn: (context: HandlerContext) => Promise<T>) => {
    try {
      return {
        ok: true,
        data: await fn({
          db: "unused",
          session: { actor: { kind: "staff" } },
        } as unknown as HandlerContext),
      };
    } catch (error) {
      return { ok: false, error: toErrorBody(error, "synthetic-workspace-action") };
    }
  },
}));
const id = "10000000-0000-4000-8000-000000000001";
const artifactId = "10000000-0000-4000-8000-000000000002";
const caseId = "10000000-0000-4000-8000-000000000003";
const listingId = "10000000-0000-4000-8000-000000000004";
const outcome = { id, version: 2, state: "idle", recordedAt: new Date(0).toISOString() };
function submission(mode: WorkspaceMode, changes: Partial<WorkspaceValues> = {}) {
  const initial = initialFormState<WorkspaceValues>(
    workspaceScope(mode, id, ["revise", "materialize"].includes(mode) ? artifactId : undefined),
    {
      ...emptyWorkspaceValues,
      goal: "Investigate the supplied evidence",
      message: "Keep the correction and its history",
      ...changes,
    },
    mode === "create" ? null : 2,
  );
  const data = new FormData();
  for (const [name, value] of Object.entries(initial.values)) data.set(name, value);
  data.set(formFields.operationId, initial.operationId);
  data.set(formFields.expectedRevision, mode === "create" ? "" : "2");
  data.set(formFields.intent, "submit");
  return { initial, data };
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.enabled = false;
  mocks.create.mockResolvedValue({ outcome });
  mocks.message.mockResolvedValue({ outcome });
  mocks.research.mockResolvedValue({ outcome });
  mocks.cancel.mockResolvedValue({ outcome });
  mocks.revise.mockResolvedValue({ outcome });
  mocks.read.mockResolvedValue({
    artifacts: [
      {
        id: artifactId,
        proposal: {
          kind: "task",
          title: "Saved proposal",
          body: "Saved contents",
          citations: [{ source: "case:synthetic", quote: "Exact supplied quotation" }],
        },
      },
    ],
  });
  mocks.materialize.mockResolvedValue({
    outcome: { ...outcome, result: { type: "task", id: artifactId } },
  });
  mocks.queue.mockResolvedValue({});
});

describe.each(["bg", "ru", "en"])("F29 signed adapter in %s", (locale) => {
  it("saves a durable free goal and permitted selections while generation is disabled", async () => {
    const { initial, data } = submission("create", {
      constraints: "One priority\nOne limit",
      caseId,
    });
    data.delete("listingIds");
    data.append("listingIds", listingId);
    data.append("listingIds", artifactId);
    data.set("apiKey", "must-not-be-retained");
    const result = await workspaceAction(locale, id, "create", null, [], null, initial, data);
    expect(mocks.host).toHaveBeenCalledWith("staff");
    expect(mocks.create.mock.calls[0]?.[2]).toMatchObject({
      id,
      goal: initial.values.goal,
      constraints: ["One priority", "One limit"],
      selection: { caseId, inquiryId: null, listingIds: [listingId, artifactId] },
    });
    expect(mocks.queue).not.toHaveBeenCalled();
    expect(mocks.research).not.toHaveBeenCalled();
    expect(result.outcome.kind).toBe("confirmed");
    expect(result.values.listingIds).toBe(listingId + "\n" + artifactId);
    expect(JSON.stringify(result)).not.toContain("must-not-be-retained");
  });

  it("requires a fresh human source review and qualified generation before requesting a run", async () => {
    const { initial, data } = submission("research");
    mocks.enabled = true;
    const unreviewed = await workspaceAction(locale, id, "research", null, [], null, initial, data);
    expect(unreviewed.outcome.kind).toBe("validation");
    expect(mocks.queue).not.toHaveBeenCalled();
    expect(mocks.research).not.toHaveBeenCalled();
    data.set("reviewed", "yes");
    mocks.enabled = false;
    const disabled = await workspaceAction(locale, id, "research", null, [], null, initial, data);
    expect(disabled.outcome.kind).toBe("rejected");
    expect(mocks.queue).not.toHaveBeenCalled();
    mocks.enabled = true;
    const confirmed = await workspaceAction(locale, id, "research", null, [], null, initial, data);
    expect(confirmed.outcome.kind).toBe("confirmed");
    expect(mocks.research.mock.calls[0]?.[2]).toMatchObject({
      id,
      operationId: initial.operationId,
      expectedVersion: 2,
      reviewed: true,
      acknowledgeUnknown: false,
    });
  });
});

it("rejects forged signed metadata before any domain command and retains allowlisted text", async () => {
  const { initial, data } = submission("create");
  data.set(formFields.operationId, "forged-operation");
  const result = await workspaceAction("en", id, "create", null, [], null, initial, data);
  expect(result.outcome.kind).toBe("validation");
  expect(result.values.goal).toBe(initial.values.goal);
  expect(mocks.create).not.toHaveBeenCalled();
});

it("revises the stored artifact with new content while preserving its exact citations", async () => {
  const { initial, data } = submission("revise", {
    title: "Edited proposal",
    body: "Reviewed updated contents",
  });
  const result = await workspaceAction("en", id, "revise", artifactId, [], null, initial, data);
  expect(result.outcome.kind).toBe("confirmed");
  expect(mocks.revise.mock.calls[0]?.[2]).toMatchObject({
    id: artifactId,
    sessionId: id,
    expectedVersion: 2,
    proposal: {
      kind: "task",
      title: "Edited proposal",
      body: "Reviewed updated contents",
      citations: [{ source: "case:synthetic", quote: "Exact supplied quotation" }],
    },
  });
});

it("uses the reviewed parent version through the ordinary person command and resulting record", async () => {
  const { initial, data } = submission("materialize", { parent: "case", reviewed: "yes" });
  const parents = [
    { type: "case" as const, id: caseId, expectedVersion: 7, label: "CASE-SYNTHETIC" },
  ];
  const result = await workspaceAction(
    "en",
    id,
    "materialize",
    artifactId,
    parents,
    null,
    initial,
    data,
  );
  expect(mocks.materialize.mock.calls[0]?.[2]).toMatchObject({
    sessionId: id,
    id: artifactId,
    reviewed: true,
    expectedVersion: 2,
    command: { parent: { type: "case", id: caseId, expectedVersion: 7 } },
  });
  expect(result.outcome).toMatchObject({
    kind: "confirmed",
    receipt: { destination: { href: "/en/tasks/" + artifactId } },
  });
  expect(mocks.research).not.toHaveBeenCalled();
});

it("retains the original operation on uncertainty and does not issue another business command", async () => {
  const { initial, data } = submission("materialize", { parent: "none", reviewed: "yes" });
  mocks.materialize.mockRejectedValueOnce(new AppError("outcome_unknown"));
  const result = await workspaceAction(
    "en",
    id,
    "materialize",
    artifactId,
    [],
    null,
    initial,
    data,
  );
  expect(result.operationId).toBe(initial.operationId);
  expect(result.values.reviewed).toBe("yes");
  expect(result.outcome).toMatchObject({
    kind: "unknown",
    status: {
      href:
        "/en/operations/assistance/research/" +
        id +
        "?" +
        new URLSearchParams({ operation: initial.operationId, command: "materialize" }),
    },
  });
  expect(mocks.materialize).toHaveBeenCalledOnce();
});

it.each(["message", "cancel"] as const)(
  "binds the observed generation for %s without silently replacing it with current state",
  async (mode) => {
    const { initial, data } = submission(mode);
    const result = await workspaceAction("en", id, mode, null, [], 4, initial, data);
    expect(result.outcome.kind).toBe("confirmed");
    expect((mode === "message" ? mocks.message : mocks.cancel).mock.calls[0]?.[2]).toMatchObject({
      expectedVersion: 2,
      expectedGeneration: 4,
    });
    expect(mocks.read).not.toHaveBeenCalled();
  },
);

it.each(["bg", "ru", "en"] as const)(
  "keeps an evidence-invalid human edit recoverable with helpful %s copy",
  async (locale) => {
    const values = { title: "Retain the edited title", body: "The listing price is 1 EUR." };
    const { initial, data } = submission("revise", values);
    mocks.revise.mockRejectedValueOnce(
      new AppError("validation_failed", {
        fieldErrors: { body: ["workspace_evidence_invalid"] },
      }),
    );
    const result = await workspaceAction(locale, id, "revise", artifactId, [], null, initial, data);
    expect(result.values).toMatchObject(values);
    expect(result.outcome).toMatchObject({
      kind: "validation",
      fieldErrors: { body: [workspaceCopy(locale).evidenceInvalid] },
    });
    expect(result.operationId).not.toBe(initial.operationId);
    expect(mocks.materialize).not.toHaveBeenCalled();
    expect(mocks.research).not.toHaveBeenCalled();
  },
);
