import { beforeEach, expect, it, vi } from "vitest";
import { AppError } from "@/server/errors";
import { PermissionState } from "../shell/permission-state";
import { AuditHistoryPage } from "./page";
import { HistoryErrorScreen } from "./screens";

const calls = vi.hoisted(() => ({
  session: { actor: { kind: "staff", id: "synthetic" } },
  list: vi.fn(),
  read: vi.fn(),
  authenticate: vi.fn(),
  missing: new Error("Protected missing"),
}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw calls.missing;
  },
}));
vi.mock("@/db/client", () => ({ getDb: () => ({}) }));
vi.mock("@/server/audit-history/queries", () => ({
  listListingHistory: calls.list,
  readListingHistory: calls.read,
}));
vi.mock("@/server/auth/pages", () => ({ requireStaffPage: calls.authenticate }));
beforeEach(() => {
  vi.clearAllMocks();
  calls.authenticate.mockResolvedValue(calls.session);
});

it("uses the workspace PermissionState when current access is denied", async () => {
  calls.list.mockRejectedValue(new AppError("forbidden"));
  const result = await AuditHistoryPage({ locale: "en" });
  expect(result.type).toBe(PermissionState);
  expect(result.props.session).toBe(calls.session);
});
it("authenticates every read and lets expired-session navigation happen before loading events", async () => {
  calls.authenticate.mockRejectedValue(new Error("Expired session redirect"));
  await expect(AuditHistoryPage({ locale: "en", id: "synthetic-id" })).rejects.toThrow(
    "Expired session redirect",
  );
  expect(calls.read).not.toHaveBeenCalled();
});
it("uses protected missing behavior for scoped-out events", async () => {
  calls.read.mockRejectedValue(new AppError("not_found"));
  await expect(AuditHistoryPage({ locale: "en", id: "synthetic-id" })).rejects.toBe(calls.missing);
});
it("shows a safe error for invalid filters and an unavailable database", async () => {
  calls.list.mockRejectedValueOnce(new AppError("validation_failed"));
  const invalid = await AuditHistoryPage({ locale: "en", search: { reference: ["A", "B"] } });
  expect(invalid.type).toBe(HistoryErrorScreen);
  expect(invalid.props.invalid).toBe(true);
  expect(calls.list.mock.calls[0]?.[2]).toEqual({ reference: ["A", "B"] });
  calls.list.mockRejectedValueOnce(new Error("PRIVATE_DATABASE_DETAIL"));
  const failed = await AuditHistoryPage({ locale: "en" });
  expect(failed.type).toBe(HistoryErrorScreen);
  expect(failed.props.invalid).toBe(false);
});
