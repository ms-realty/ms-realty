import { beforeEach, expect, it, vi } from "vitest";
import type { Session } from "../auth/sessions";
import type { Executor } from "../db";
import { fileReceipt } from "./receipts";

const mocks = vi.hoisted(() => ({ live: vi.fn(), access: vi.fn() }));
vi.mock("../auth/sessions", () => ({ requireLiveSession: mocks.live }));
vi.mock("./access", () => ({ targetAccess: mocks.access }));
const session = { actor: { kind: "client", id: "client-a" } } as Session;
const uploadId = "10000000-0000-4000-8000-000000000001";
function dbFor(targetType: string, targetId: string, completedAt: Date | null = new Date()) {
  const where = vi.fn().mockResolvedValue([{ id: uploadId, targetType, targetId, completedAt }]);
  const db = { select: () => ({ from: () => ({ where }) }) } as unknown as Executor;
  return { db, where };
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.access.mockResolvedValue({});
});
it.each([
  ["document", "other-version"],
  ["media", "current-version"],
])("C08/C09 cannot confirm another task's completed %s upload", async (kind, id) => {
  const { db } = dbFor(kind, id);
  expect(
    await fileReceipt(db, session, uploadId, [{ kind: "document", id: "current-version" }]),
  ).toBeNull();
  expect(mocks.access).not.toHaveBeenCalled();
});
it("C09 confirms the displayed document version's sealed transfer after current access is rechecked", async () => {
  const { db, where } = dbFor("document", "current-version");
  expect(
    await fileReceipt(db, session, uploadId, [{ kind: "document", id: "current-version" }]),
  ).toBe(uploadId);
  expect(where).toHaveBeenCalledTimes(1);
  expect(mocks.access).toHaveBeenCalledWith(db, session, "document", "current-version");
});
it("C09 cannot confirm an incomplete transfer or an empty request list", async () => {
  const { db } = dbFor("document", "current-version", null);
  expect(
    await fileReceipt(db, session, uploadId, [{ kind: "document", id: "current-version" }]),
  ).toBeNull();
  expect(
    await fileReceipt(dbFor("document", "current-version").db, session, uploadId, []),
  ).toBeNull();
  expect(mocks.access).not.toHaveBeenCalled();
});
