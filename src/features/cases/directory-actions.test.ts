import { beforeEach, expect, it, vi } from "vitest";
import { applyCaseDirectoryFilters } from "./directory-actions";

const calls = vi.hoisted(() => ({
  session: { id: "session-one", account: { kind: "staff", id: "broker-one" } },
  require: vi.fn(),
  origin: vi.fn(),
  retain: vi.fn(),
}));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ origin: "https://staff.example.test" }),
}));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`REDIRECT:${path}`);
  },
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));
vi.mock("@/server/auth/pages", () => ({ requireStaffPage: calls.require }));
vi.mock("@/server/auth/native", () => ({ assertNativeAuthOrigin: calls.origin }));
vi.mock("@/server/config/env", () => ({
  getEnv: () => ({ hosts: { staff: "https://staff.example.test" } }),
}));
vi.mock("./directory-private", () => ({ retainCaseDirectoryFilter: calls.retain }));

beforeEach(() => {
  vi.clearAllMocks();
  calls.require.mockResolvedValue(calls.session);
  calls.retain.mockResolvedValue(true);
});
const form = (values: Record<string, string>) => {
  const result = new FormData();
  for (const [name, value] of Object.entries(values)) result.set(name, value);
  return result;
};
async function destination(values: Record<string, string>) {
  try {
    await applyCaseDirectoryFilters("en", form(values));
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("REDIRECT:"))
      return new URL(error.message.slice(9), "https://staff.example.test");
    throw error;
  }
  throw new Error("Expected redirect");
}

it("reauthorizes and checks same-origin before retaining text, then redirects without private prose", async () => {
  const target = await destination({
    q: "private q",
    party: "private party",
    purpose: "private purpose",
    nextAction: "private action",
    view: "needs",
    kind: "buyer",
    cursor: "old",
  });
  expect(calls.require).toHaveBeenCalledWith("en");
  expect(calls.origin).toHaveBeenCalledWith(expect.any(Headers), "https://staff.example.test");
  expect(calls.retain).toHaveBeenCalledWith(
    calls.session,
    "en",
    expect.stringMatching(/^[a-f0-9-]{36}$/u),
    expect.objectContaining({ party: "private party", q: "private q" }),
    false,
  );
  expect(target.searchParams.get("filter")).toMatch(/^[a-f0-9-]{36}$/u);
  expect(target.searchParams.get("view")).toBe("needs");
  expect(target.searchParams.get("kind")).toBe("buyer");
  for (const field of ["q", "party", "purpose", "nextAction", "cursor"])
    expect(target.searchParams.has(field)).toBe(false);
  expect(target.href).not.toContain("private");
});

it("keeps enum-only controls native and does not retain an empty private context", async () => {
  expect((await destination({ view: "mine", disposition: "paused", q: "  " })).pathname).toBe(
    "/en/cases",
  );
  expect(calls.retain).not.toHaveBeenCalled();
});

it("bounds oversized/control POST values and exposes a controlled recovery when cookie retention fails", async () => {
  await destination({ party: "x".repeat(10000), q: "\0".repeat(10000) });
  expect(calls.retain).toHaveBeenLastCalledWith(
    calls.session,
    "en",
    expect.any(String),
    expect.objectContaining({ party: "x".repeat(120), q: "\0" }),
    true,
  );
  calls.retain.mockResolvedValue(false);
  const target = await destination({ party: "synthetic private text", view: "mine" });
  expect(target.searchParams.get("filter")).toBe("unavailable");
  expect(target.searchParams.get("view")).toBe("mine");
  expect(target.href).not.toContain("synthetic");
});

it("never retains or redirects on cross-origin or unavailable staff access", async () => {
  calls.origin.mockImplementationOnce(() => {
    throw new Error("ORIGIN_DENIED");
  });
  await expect(applyCaseDirectoryFilters("en", form({ party: "private" }))).rejects.toThrow(
    "ORIGIN_DENIED",
  );
  expect(calls.require).not.toHaveBeenCalled();
  expect(calls.retain).not.toHaveBeenCalled();
  calls.require.mockRejectedValueOnce(new Error("ACCESS_DENIED"));
  await expect(applyCaseDirectoryFilters("en", form({ party: "private" }))).rejects.toThrow(
    "ACCESS_DENIED",
  );
  expect(calls.retain).not.toHaveBeenCalled();
});
