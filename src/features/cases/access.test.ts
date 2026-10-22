import { afterEach, expect, it, vi } from "vitest";
import { clientReturnPath, requireClientPage } from "./access";

const mocks = vi.hoisted(() => ({ session: vi.fn() }));
vi.mock("@/server/auth/pages", async (original) => ({
  ...(await original<typeof import("@/server/auth/pages")>()),
  currentClientSession: mocks.session,
}));
vi.mock("@/server/config/env", () => ({
  getEnv: () => ({ hosts: { client: "https://client.example.test" } }),
}));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(path);
  },
  notFound: () => {
    throw new Error("not-found");
  },
}));
afterEach(() => vi.clearAllMocks());

it("C01 preserves the requested Case conversation through sign-in", async () => {
  mocks.session.mockResolvedValue(null);
  await expect(requireClientPage("en", "/en/messages/case-a")).rejects.toThrow(
    "/en/access?returnTo=%2Fen%2Fmessages%2Fcase-a",
  );
});
it.each([
  "https://other.example.test/en/messages/a",
  "//other.example.test/en/overview",
  "/ru/messages/a",
  "/en/../ru/messages/a",
])("C01 does not preserve an unsafe or wrong-locale destination: %s", async (path) => {
  mocks.session.mockResolvedValue(null);
  await expect(requireClientPage("en", path)).rejects.toThrow(
    "/en/access?returnTo=%2Fen%2Foverview",
  );
});
it("C01 returns the current session and leaves destination authorization to its page", async () => {
  const session = { id: "current" };
  mocks.session.mockResolvedValue(session);
  expect(await requireClientPage("bg", "/bg/documents/requests/a")).toBe(session);
});
it("C01 retains declared record/status keys without copying private query text", () => {
  expect(
    clientReturnPath(
      "/en/proposals/operations",
      {
        command: "revise",
        id: "proposal-a",
        key: "issued&key",
        reason: "Private reason",
        email: "synthetic@example.test",
        unknown: ["a", "b"],
      },
      ["command", "id", "key", "unknown"],
    ),
  ).toBe("/en/proposals/operations?command=revise&id=proposal-a&key=issued%26key");
});
