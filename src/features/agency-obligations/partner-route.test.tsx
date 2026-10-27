import { beforeEach, expect, it, vi } from "vitest";
import Page from "../../../app/staff/[locale]/(workspace)/operations/agency/partners/[id]/page";

const calls = vi.hoisted(() => ({
  session: { id: "synthetic-session", account: { kind: "staff", id: "synthetic-broker" } },
  access: vi.fn(),
  screen: vi.fn(),
}));
vi.mock("@/server/auth/pages", () => ({ requireStaffPage: calls.access }));
vi.mock("@/features/work/screens", () => ({
  checkLocale: vi.fn(),
  queryPage: vi.fn(() => 1),
  privateRead: (read: () => unknown) => read(),
}));
vi.mock("./screens", () => ({ PartnerScreen: calls.screen }));

beforeEach(() => {
  vi.clearAllMocks();
  calls.access.mockResolvedValue(calls.session);
  calls.screen.mockResolvedValue(null);
});
const route = (returnTo?: string | string[]) =>
  Page({
    params: Promise.resolve({ locale: "en", id: "new" }),
    searchParams: Promise.resolve({ draft: "synthetic-draft", returnTo }),
  });

it("passes a single return destination to the guarded partner screen", async () => {
  await route("/en/operations/agency");
  expect(calls.screen).toHaveBeenCalledWith(
    expect.objectContaining({ returnTo: "/en/operations/agency", session: calls.session }),
  );
});

it("discards repeated return destinations before they can crash the private path guard", async () => {
  await route(["/en/cases/synthetic-case", "/en/operations/agency"]);
  expect(calls.screen).toHaveBeenCalledWith(expect.objectContaining({ returnTo: undefined }));
});

it("requires staff access before entering the picker or reading return context", async () => {
  calls.access.mockRejectedValueOnce(new Error("ACCESS_DENIED"));
  await expect(route("/en/operations/agency")).rejects.toThrow("ACCESS_DENIED");
  expect(calls.screen).not.toHaveBeenCalled();
});
