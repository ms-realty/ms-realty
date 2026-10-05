import { beforeEach, expect, it, vi } from "vitest";
import { getEnv } from "../config/env";
import { AppError } from "../errors";
import { privacyFormRoute } from "./native";
import { reviewPrivacyRequest } from "./requests";

vi.mock("@/db/client", () => ({ getDb: () => ({}) }));
vi.mock("../auth/pages", () => ({
  currentStaffAccess: async () => ({
    state: "ready",
    session: { actor: { kind: "staff", id: "synthetic-staff" } },
  }),
  currentClientSession: async () => null,
}));
vi.mock("./requests", async (original) => ({
  ...(await original<typeof import("./requests")>()),
  reviewPrivacyRequest: vi.fn(),
}));

const operationId = "00000000-0000-4000-8000-000000000001";
const token = Buffer.from(
  JSON.stringify({ updatedAt: "2026-09-30T10:00:00.123456Z", id: operationId }),
).toString("base64url");
const post = privacyFormRoute("operations/privacy");
beforeEach(() => {
  vi.mocked(reviewPrivacyRequest).mockReset();
  vi.mocked(reviewPrivacyRequest).mockResolvedValue({
    operationId,
    replayed: false,
    outcome: { id: operationId, reference: "PR-SYNTHETIC", state: "verifying" },
  });
});
async function submit(query: string, crossOrigin = false) {
  const origin = getEnv().hosts.staff;
  const form = new FormData();
  form.set("intent", "review");
  form.set("id", operationId);
  form.set("operationId", operationId);
  form.set("expectedVersion", "7");
  form.set("confirmed", "yes");
  return post(
    new Request(`${origin}/en/operations/privacy/submit${query}`, {
      method: "POST",
      body: form,
      headers: {
        host: new URL(origin).host,
        origin: crossOrigin ? "https://foreign.example.test" : origin,
      },
    }),
    { params: Promise.resolve({ locale: "en" }) },
  );
}

it.each(["after", "before"])(
  "keeps the %s position alongside the exact successful review receipt",
  async (direction) => {
    const response = await submit(`?${direction}=${token}`);
    expect(response.status).toBe(303);
    const target = new URL(response.headers.get("location") ?? "");
    expect(target.pathname).toBe("/en/operations/privacy");
    expect(target.searchParams.get(direction)).toBe(token);
    expect(target.searchParams.get("receipt")).toBe(operationId);
    expect(vi.mocked(reviewPrivacyRequest).mock.calls[0]?.[2]).toMatchObject({
      operationId,
      id: operationId,
      expectedVersion: 7,
      confirmed: true,
    });
  },
);
it("keeps the queue position through fresh authentication without replaying the review", async () => {
  vi.mocked(reviewPrivacyRequest).mockRejectedValue(new AppError("step_up_required"));
  const response = await submit(`?after=${token}`);
  const target = new URL(response.headers.get("location") ?? "");
  expect(target.pathname).toBe("/en/access/reauth");
  expect(target.searchParams.get("returnTo")).toBe(`/en/operations/privacy?after=${token}`);
  expect(target.searchParams.has("receipt")).toBe(false);
  expect(reviewPrivacyRequest).toHaveBeenCalledTimes(1);
});
it.each(["version_conflict", "operation_pending", "outcome_unknown"] as const)(
  "preserves %s and the queue cursor without manufacturing a receipt",
  async (code) => {
    vi.mocked(reviewPrivacyRequest).mockRejectedValue(new AppError(code));
    const response = await submit(`?before=${token}`);
    const target = new URL(response.headers.get("location") ?? "");
    expect(target.searchParams.get("error")).toBe(
      code === "version_conflict" ? "REVISION_CONFLICT" : code.toUpperCase(),
    );
    expect(target.searchParams.get("before")).toBe(token);
    expect(target.searchParams.has("receipt")).toBe(false);
  },
);
it.each([`?after=${token}&before=${token}`, `?after=${token}&after=${token}`, "?after=malformed"])(
  "never propagates an invalid queue position: %s",
  async (query) => {
    const response = await submit(query);
    const target = new URL(response.headers.get("location") ?? "");
    expect(target.searchParams.has("after")).toBe(false);
    expect(target.searchParams.has("before")).toBe(false);
    expect(target.searchParams.get("receipt")).toBe(operationId);
  },
);
it("preserves origin denial before any domain action or navigation recovery", async () => {
  const response = await submit(`?after=${token}`, true);
  expect(response.status).toBe(403);
  expect(response.headers.has("location")).toBe(false);
  expect(reviewPrivacyRequest).not.toHaveBeenCalled();
});
