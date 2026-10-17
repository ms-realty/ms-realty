import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Session } from "@/server/auth/sessions";
import { AppError } from "@/server/errors";
import { GET } from "../../../app/staff/[locale]/(workspace)/operations/assistance/research/[id]/progress/route";

const mocks = vi.hoisted(() => ({
  host: vi.fn(),
  read: vi.fn(),
  identify: vi.fn(),
  db: {},
}));
vi.mock("@/db/client", () => ({ getDb: () => mocks.db }));
vi.mock("@/server/auth/pages", () => ({ requireAuthHost: mocks.host }));
vi.mock("@/server/ai/workspace", () => ({ readWorkspace: mocks.read }));
vi.mock("@/server/config/env", async (original) => {
  const actual = await original<typeof import("@/server/config/env")>();
  return { ...actual, getEnv: () => actual.parseEnv({ NODE_ENV: "test" }) };
});
vi.mock("@/server/http/request", async (original) => ({
  ...(await original<typeof import("@/server/http/request")>()),
  identify: mocks.identify,
}));

const id = "10000000-0000-4000-8000-000000000001";
const session = { actor: { kind: "staff", id: "synthetic-owner" } } as unknown as Session;
const progress = {
  state: "running",
  steps: 2,
  maxSteps: 8,
  reservedCostMicros: 25000,
  actualCostMicros: null,
  hasRun: true,
  recovery: { canResume: false, requiresUnknownAck: true },
  sourceChanged: false,
};
const readView = {
  workspace: { state: "running", goal: "Private goal", errorCode: "Private provider detail" },
  runs: [{ steps: 2, budget: { maxSteps: 8 }, reservedCostMicros: 25000, actualCostMicros: null }],
  availability: { budget: { maxSteps: 6, maxCostMicros: 15000 } },
  recovery: progress.recovery,
  sourceChanged: false,
  checkpoints: [{ turn: { message: "Private checkpoint" } }],
  context: { sources: [{ text: "Private source" }] },
  artifacts: [{ proposal: { body: "Private draft" } }],
};
const request = () =>
  new Request(`http://app.localhost/en/operations/assistance/research/${id}/progress`);
const params = (locale = "en", workspaceId = id) => ({
  params: Promise.resolve({ locale, id: workspaceId }),
});

beforeEach(() => {
  vi.resetAllMocks();
  mocks.identify.mockResolvedValue({ session, actor: session.actor, sessionToken: "synthetic" });
  mocks.read.mockResolvedValue(readView);
});

describe("O32 / F29 authenticated progress read", () => {
  it.each(["bg", "ru", "en"])(
    "reads current authorized progress on the staff host in %s",
    async (locale) => {
      const response = await GET(request(), params(locale));
      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toBe("private, no-store");
      expect(response.headers.get("x-content-type-options")).toBe("nosniff");
      expect(mocks.host).toHaveBeenCalledExactlyOnceWith("staff");
      expect(mocks.read).toHaveBeenCalledExactlyOnceWith(mocks.db, session, id);
      expect(await response.json()).toEqual(progress);
    },
  );

  it.each([
    ["de", id],
    ["en", "invalid-id"],
  ])("rejects invalid route values before reading the workspace", async (locale, workspaceId) => {
    const response = await GET(request(), params(locale, workspaceId));
    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.read).not.toHaveBeenCalled();
  });

  it("requires a current session", async () => {
    mocks.identify.mockResolvedValue({ session: null, actor: null, sessionToken: undefined });
    const response = await GET(request(), params());
    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.read).not.toHaveBeenCalled();
    expect(await response.json()).toMatchObject({ error: { code: "UNAUTHENTICATED" } });
  });

  it("denies the wrong host before exposing any progress", async () => {
    mocks.host.mockRejectedValue(new AppError("not_found"));
    const response = await GET(request(), params());
    expect(response.status).toBe(404);
    expect(mocks.read).not.toHaveBeenCalled();
  });

  it("honors retained-source authorization loss with a safe non-cacheable error", async () => {
    mocks.read.mockRejectedValue(new AppError("not_found", { detail: "Private retained source" }));
    const response = await GET(request(), params());
    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    const body = await response.json();
    expect(body).toMatchObject({ error: { code: "NOT_FOUND" } });
    expect(JSON.stringify(body)).not.toContain("Private");
  });

  it("does not serialize provider or database exceptions", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.read.mockRejectedValue(new Error("Private provider credential or SQL"));
    const response = await GET(request(), params());
    expect(response.status).toBe(500);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    const body = await response.json();
    expect(body).toMatchObject({ error: { code: "INTERNAL_ERROR" } });
    expect(JSON.stringify(body)).not.toContain("Private");
    log.mockRestore();
  });
});
