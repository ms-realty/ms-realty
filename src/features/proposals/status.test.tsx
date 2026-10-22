import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Session } from "@/server/auth/sessions";
import { AppError } from "@/server/errors";
import { issueFormOperation } from "@/ui/form/server";
import { caseCopy } from "../cases/copy";
import { proposalScope } from "./contract";
import { ProposalStatusScreen } from "./screens";

const reads = vi.hoisted(() => ({ proposal: vi.fn(), receipt: vi.fn() }));
vi.mock("@/db/client", () => ({ getDb: () => "synthetic-db" }));
vi.mock("@/server/proposals/queries", () => ({ readProposal: reads.proposal }));
vi.mock("@/server/operations", () => ({ findOperation: reads.receipt }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));
vi.mock("./actions", () => ({ proposalAction: async () => {} }));

const id = "10000000-0000-4000-8000-000000000001";
const session = {
  account: { kind: "client", id: "synthetic-client" },
  actor: { kind: "client", id: "synthetic-client" },
} as Session;
const copy = caseCopy("en");
function props(keyValue = issueFormOperation(proposalScope("revise", id))) {
  return { locale: "en", session, command: "revise", id, keyValue };
}
beforeEach(() => {
  vi.clearAllMocks();
  // After a counteroffer the old submitted revision is still readable, while the new draft
  // remains outside the client's projection. The result needs no revise form on this page.
  reads.proposal.mockResolvedValue({ current: false, canRespond: false });
  reads.receipt.mockResolvedValue(null);
});
afterEach(cleanup);

it("renders the durable saved result only from the authorized actor's exact operation", async () => {
  const input = props();
  reads.receipt.mockResolvedValue({ status: "succeeded", outcome: { id } });
  render(await ProposalStatusScreen(input));
  expect(reads.proposal).toHaveBeenCalledWith("synthetic-db", session, id);
  expect(reads.receipt).toHaveBeenCalledWith(
    "synthetic-db",
    session.actor,
    "proposal.revise",
    input.keyValue,
  );
  expect(reads.proposal.mock.invocationCallOrder[0]).toBeLessThan(
    reads.receipt.mock.invocationCallOrder[0] ?? 0,
  );
  expect(screen.getByRole("heading", { name: copy.status })).toBeVisible();
  expect(screen.getByText(copy.statusSaved)).toBeVisible();
  expect(screen.getByRole("link", { name: copy.back })).toHaveAttribute(
    "href",
    `/en/proposals/${id}`,
  );
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
  cleanup();
  render(await ProposalStatusScreen(input));
  expect(screen.getByText(copy.statusSaved)).toBeVisible();
  expect(reads.receipt).toHaveBeenCalledTimes(2);
});

it.each([null, "accepted", "in_progress", "outcome_unknown", "failed"] as const)(
  "keeps receipt status %j honest without a new command",
  async (status) => {
    reads.receipt.mockResolvedValue(status ? { status, outcome: { id } } : null);
    const input = props();
    render(await ProposalStatusScreen(input));
    expect(screen.queryByText(copy.statusSaved)).not.toBeInTheDocument();
    const checkAgain = screen.queryByRole("link", { name: "Check this action again" });
    if (status && status !== "failed") {
      expect(checkAgain).toHaveAttribute(
        "href",
        `/en/proposals/operations?command=revise&id=${id}&key=${encodeURIComponent(input.keyValue)}`,
      );
    } else expect(checkAgain).not.toBeInTheDocument();
    expect(
      screen.getByText(
        !status ? copy.statusAbsent : status === "failed" ? copy.statusFailed : copy.statusUnknown,
      ),
    ).toBeVisible();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  },
);

it.each(["forbidden", "not_found"] as const)(
  "does not read the operation when proposal access is %s",
  async (code) => {
    reads.proposal.mockRejectedValueOnce(new AppError(code));
    await expect(ProposalStatusScreen(props())).rejects.toThrow("NOT_FOUND");
    expect(reads.receipt).not.toHaveBeenCalled();
  },
);

it("rejects a foreign or malformed operation scope before any private read", async () => {
  for (const key of [
    "unissued",
    issueFormOperation(proposalScope("decide", id)),
    issueFormOperation(proposalScope("revise", "another-proposal")),
  ])
    await expect(ProposalStatusScreen(props(key))).rejects.toThrow("NOT_FOUND");
  expect(reads.proposal).not.toHaveBeenCalled();
  expect(reads.receipt).not.toHaveBeenCalled();
});
