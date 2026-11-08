import { expect, it, vi } from "vitest";
import type { Session } from "../auth/sessions";
import { getEnv } from "../config/env";
import type { Executor } from "../db";
import { AppError } from "../errors";
import { saveProposalReauthDraft } from "./service";

it("R09 removes private SQL parameters before a save failure can reach the action logger", async () => {
  const reason = "Synthetic private text that must not reach logs";
  const db = {
    transaction: vi.fn().mockRejectedValue(new Error(`insert reauth_drafts params: ${reason}`)),
  } as unknown as Executor;
  let caught: unknown;
  try {
    await saveProposalReauthDraft(db, {} as Session, getEnv().hosts.client, {
      proposalId: "10000000-0000-4000-8000-000000000001",
      revisionId: "20000000-0000-4000-8000-000000000002",
      expectedVersion: 3,
      state: "declined",
      reason,
    });
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(AppError);
  expect(caught).toMatchObject({ code: "unavailable" });
  expect(String(caught)).not.toContain(reason);
  expect((caught as Error).cause).toBeUndefined();
});
