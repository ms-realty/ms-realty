import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/server/errors";
import { formFields } from "@/ui/form/contract";
import { createFailure, revokeFailure } from "./share-server";
import { shareFields } from "./share-state";

const mocked = vi.hoisted(() => ({
  session: "c".repeat(43) as string | undefined,
  origin: "http://localhost:3000",
  create: vi.fn(),
  revoke: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ origin: mocked.origin, "cf-connecting-ip": "203.0.113.9" }),
  // The creator capability is the host-only cookie; no other cookie name may satisfy it.
  cookies: async () => ({
    get: (name: string) =>
      name === "msr_share_creator" && mocked.session ? { value: mocked.session } : undefined,
  }),
}));
vi.mock("next/cache", () => ({ refresh: mocked.refresh }));
vi.mock("@/db/client", () => ({ getDb: () => ({}) }));
vi.mock("@/server/shares/public", async (original) => ({
  ...(await original<typeof import("@/server/shares/public")>()),
  createPublicShare: mocked.create,
  revokePublicShare: mocked.revoke,
}));

import {
  createSavedShare,
  revokeSavedShare,
} from "../../../app/public/[locale]/(site)/saved/share-actions";

const key = "40000000-0000-4000-8000-000000000001";
const shareId = "50000000-0000-4000-8000-000000000001";
const idle = { operationId: key, outcome: { kind: "idle" } } as const;

function createData(overrides: Record<string, string | string[]> = {}) {
  const data = new FormData();
  const fields: Record<string, string | string[]> = {
    [formFields.operationId]: key,
    [shareFields.reviewed]: "yes",
    [shareFields.reference]: ["MS-00001", "MS-00002"],
    ...overrides,
  };
  for (const [name, value] of Object.entries(fields))
    for (const item of Array.isArray(value) ? value : [value]) data.append(name, item);
  return data;
}
function revokeData(overrides: Record<string, string> = {}) {
  const data = new FormData();
  const fields = { [formFields.operationId]: key, [shareFields.shareId]: shareId, ...overrides };
  for (const [name, value] of Object.entries(fields)) data.set(name, value);
  return data;
}

beforeEach(() => {
  mocked.session = "c".repeat(43);
  mocked.origin = "http://localhost:3000";
  mocked.create.mockReset();
  mocked.revoke.mockReset();
  mocked.refresh.mockReset();
});

describe("failure classification", () => {
  it("keeps the key when nothing was stored and rotates it after a stored failure", () => {
    expect(createFailure(new AppError("rate_limited"))).toEqual({
      outcome: { kind: "rejected", code: "rate_limited" },
      rotate: false,
    });
    expect(
      createFailure(
        new AppError("validation_failed", {
          fieldErrors: { references: ["selection_unavailable"] },
        }),
      ),
    ).toEqual({ outcome: { kind: "rejected", code: "selection_unavailable" }, rotate: true });
    expect(createFailure(new AppError("idempotency_key_reused"))).toEqual({
      outcome: { kind: "rejected", code: "failed" },
      rotate: true,
    });
  });

  it("treats a thrown non-application error and a parked operation as unknown, key kept", () => {
    for (const error of [
      new Error("connection reset"),
      new AppError("outcome_unknown"),
      new AppError("operation_pending"),
    ]) {
      expect(createFailure(error)).toEqual({ outcome: { kind: "unknown" }, rotate: false });
      expect(revokeFailure(error)).toEqual({ outcome: { kind: "unknown" }, rotate: false });
    }
  });

  it("says a link cannot be managed from here when the creator does not own it", () => {
    expect(revokeFailure(new AppError("not_found"))).toEqual({
      outcome: { kind: "rejected", code: "not_manageable" },
      rotate: true,
    });
  });
});

describe("createSavedShare", () => {
  it("creates under the creator cookie, with the review, the key and the edge client address", async () => {
    mocked.create.mockResolvedValue({ share: { id: shareId }, replayed: false, operationId: "x" });
    const state = await createSavedShare("en", idle, createData());
    expect(mocked.create).toHaveBeenCalledWith(
      {},
      { kind: "anonymous", sessionToken: "c".repeat(43) },
      {
        operationId: key,
        locale: "en",
        references: ["MS-00001", "MS-00002"],
        reviewed: true,
      },
      { clientIp: "203.0.113.9" },
    );
    expect(state.outcome).toEqual({ kind: "created", id: shareId });
    // A new link is a new request: the next key is fresh.
    expect(state.operationId).not.toBe(key);
    expect(mocked.refresh).toHaveBeenCalledTimes(1);
  });

  it("does not create without the creator cookie and tells the browser how to get one", async () => {
    mocked.session = undefined;
    const state = await createSavedShare("en", idle, createData());
    expect(mocked.create).not.toHaveBeenCalled();
    expect(state).toEqual({
      operationId: key,
      outcome: { kind: "rejected", code: "session_required" },
    });
  });

  it("asks for the missing review or selection without calling the server", async () => {
    const unreviewed = await createSavedShare("en", idle, createData({ reviewed: "" }));
    expect(unreviewed.outcome).toEqual({ kind: "invalid", fields: ["reviewed"] });
    const empty = await createSavedShare("en", idle, createData({ reference: [] }));
    expect(empty.outcome).toEqual({ kind: "invalid", fields: ["references"] });
    expect(mocked.create).not.toHaveBeenCalled();
    expect(unreviewed.operationId).toBe(key);
  });

  it("refuses a forged or repeated operation key with a fresh one", async () => {
    const forged = await createSavedShare(
      "en",
      idle,
      createData({ [formFields.operationId]: "x" }),
    );
    expect(forged.outcome).toEqual({ kind: "rejected", code: "failed" });
    expect(forged.operationId).not.toBe("x");
    const data = createData();
    data.append(formFields.operationId, key);
    expect((await createSavedShare("en", idle, data)).outcome.kind).toBe("rejected");
    expect(mocked.create).not.toHaveBeenCalled();
  });

  it("rotates the key after an unavailable selection and keeps it when the outcome is unknown", async () => {
    mocked.create.mockRejectedValueOnce(
      new AppError("validation_failed", { fieldErrors: { references: ["selection_unavailable"] } }),
    );
    const rejected = await createSavedShare("en", idle, createData());
    expect(rejected.outcome).toEqual({ kind: "rejected", code: "selection_unavailable" });
    expect(rejected.operationId).not.toBe(key);

    mocked.create.mockRejectedValueOnce(new Error("socket hang up"));
    const unknown = await createSavedShare("en", idle, createData());
    expect(unknown).toEqual({ operationId: key, outcome: { kind: "unknown" } });
    expect(mocked.refresh).not.toHaveBeenCalled();
  });

  it("rejects a cross-origin post before reading anything", async () => {
    mocked.origin = "https://elsewhere.test";
    await expect(createSavedShare("en", idle, createData())).rejects.toMatchObject({
      code: "cross_origin_request",
    });
    expect(mocked.create).not.toHaveBeenCalled();
  });

  it("rejects an unknown locale", async () => {
    await expect(createSavedShare("xx", idle, createData())).rejects.toThrow("Invalid locale");
  });
});

describe("revokeSavedShare", () => {
  it("revokes under the creator cookie and words the acknowledged time for the locale", async () => {
    mocked.revoke.mockResolvedValue({
      operationId: "x",
      replayed: false,
      outcome: { id: shareId, revokedAt: "2026-03-01T12:00:00.000Z" },
    });
    const state = await revokeSavedShare("en", idle as never, revokeData());
    expect(mocked.revoke).toHaveBeenCalledWith(
      {},
      { kind: "anonymous", sessionToken: "c".repeat(43) },
      { id: shareId, operationId: key },
    );
    expect(state.operationId).toBe(key);
    expect(state.outcome).toMatchObject({
      kind: "revoked",
      revokedAt: { dateTime: "2026-03-01T12:00:00.000Z" },
    });
    expect(mocked.refresh).toHaveBeenCalledTimes(1);
  });

  it("is not manageable without the creator cookie or with a malformed share id", async () => {
    mocked.session = undefined;
    expect((await revokeSavedShare("en", idle as never, revokeData())).outcome).toEqual({
      kind: "rejected",
      code: "not_manageable",
    });
    mocked.session = "c".repeat(43);
    expect(
      (await revokeSavedShare("en", idle as never, revokeData({ [shareFields.shareId]: "nope" })))
        .outcome,
    ).toEqual({ kind: "rejected", code: "not_manageable" });
    expect(mocked.revoke).not.toHaveBeenCalled();
  });

  it("reports an unknown outcome on the same key so a retry replays the operation", async () => {
    mocked.revoke.mockRejectedValue(new Error("statement timeout"));
    const state = await revokeSavedShare("en", idle as never, revokeData());
    expect(state).toEqual({ operationId: key, outcome: { kind: "unknown" } });
    expect(mocked.refresh).not.toHaveBeenCalled();
  });

  it("rotates the key when the server answers that this creator does not own the link", async () => {
    mocked.revoke.mockRejectedValue(new AppError("not_found"));
    const state = await revokeSavedShare("en", idle as never, revokeData());
    expect(state.outcome).toEqual({ kind: "rejected", code: "not_manageable" });
    expect(state.operationId).not.toBe(key);
  });
});
