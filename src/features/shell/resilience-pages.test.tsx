import { beforeEach, expect, it, vi } from "vitest";
import { AppError } from "@/server/errors";
import InventoryReceiptPage from "../../../app/staff/[locale]/(workspace)/inventory/operations/[id]/page";
import InventoryPage from "../../../app/staff/[locale]/(workspace)/inventory/page";
import { PermissionState } from "./permission-state";

const calls = vi.hoisted(() => ({
  session: {
    actor: { kind: "staff", id: "synthetic-staff" },
    account: { kind: "staff", id: "synthetic-staff" },
  },
  list: vi.fn(),
  operations: [] as unknown[],
  missing: new Error("NEXT_HTTP_ERROR_FALLBACK;404"),
}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw calls.missing;
  },
  redirect: vi.fn(),
}));
vi.mock("@/db/client", () => ({
  getDb: () => {
    const selection = {
      from: () => selection,
      where: () => selection,
      limit: async () => calls.operations,
    };
    return { select: () => selection };
  },
}));
vi.mock("@/server/auth/pages", () => ({ requireStaffPage: async () => calls.session }));
vi.mock("@/server/authz", () => ({ can: async () => false }));
vi.mock("@/server/inventory/queries", () => ({ inventoryListPage: calls.list }));
vi.mock("@/server/inventory/commands", () => ({ inventoryDetail: vi.fn() }));
beforeEach(() => {
  vi.clearAllMocks();
  calls.operations = [];
});

it("shows the permission state when a no-grant staff member opens Inventory (M-003)", async () => {
  calls.list.mockRejectedValueOnce(new AppError("forbidden"));
  const result = await InventoryPage({
    params: Promise.resolve({ locale: "en" }),
    searchParams: Promise.resolve({}),
  });
  expect(result.type).toBe(PermissionState);
  expect(result.props).toMatchObject({ locale: "en", title: "Inventory", session: calls.session });
  expect(calls.list).toHaveBeenCalledOnce();
});

it("does not mask a database failure as a permission state", async () => {
  const unavailable = new Error("database unavailable");
  calls.list.mockRejectedValueOnce(unavailable);
  await expect(
    InventoryPage({ params: Promise.resolve({ locale: "en" }), searchParams: Promise.resolve({}) }),
  ).rejects.toBe(unavailable);
});

it("uses the protected 404 for an unknown Inventory receipt instead of printing its raw key", async () => {
  await expect(
    InventoryReceiptPage({
      params: Promise.resolve({ locale: "en", id: "00000000-0000-4000-8000-000000000001" }),
      searchParams: Promise.resolve({}),
    }),
  ).rejects.toBe(calls.missing);
});
