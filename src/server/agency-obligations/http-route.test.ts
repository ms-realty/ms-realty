// B10 / AT10 / AT11 / AT40: real request wrapper, host guard and safe HTTP errors.
import { randomUUID } from "node:crypto";
import { beforeEach, expect, it, vi } from "vitest";
import type { Session } from "../auth/sessions";
import { AppError } from "../errors";

const fixture = vi.hoisted(() => ({
  headers: new Headers(),
  session: null as Session | null,
  execute: vi.fn(),
}));
const hosts = {
  public: "https://makler-realty.com",
  client: "https://my.makler-realty.com",
  staff: "https://app.makler-realty.com",
};
vi.mock("next/headers", () => ({ headers: async () => fixture.headers }));
vi.mock("@/db/client", () => ({ getDb: () => "synthetic-db" }));
vi.mock("../config/env", () => ({
  getEnv: () => ({
    nodeEnv: "test",
    hosts: {
      public: "https://makler-realty.com",
      client: "https://my.makler-realty.com",
      staff: "https://app.makler-realty.com",
    },
  }),
}));
vi.mock("../auth/access", () => ({
  staffAccess: async () =>
    fixture.session ? { state: "ready", session: fixture.session } : { state: "signed_out" },
}));
vi.mock("../auth/sessions", async (original) => ({
  ...(await original<typeof import("../auth/sessions")>()),
  readSession: async () => fixture.session,
}));
vi.mock("./commands", () => ({ executeAgencyCommand: fixture.execute }));

import { POST } from "../../../app/api/agency/[command]/route";

function session(kind: "client" | "staff") {
  fixture.session = {
    account: { kind, id: randomUUID() },
    actor: { kind, id: randomUUID() },
  } as Session;
}
function post(
  surface: "client" | "staff",
  command: string,
  body = JSON.stringify({ synthetic: true }),
  extra: Record<string, string> = {},
) {
  const origin = hosts[surface];
  fixture.headers = new Headers({
    host: new URL(origin).host,
    origin,
    cookie: `__Host-msr_${surface}_session=synthetic`,
    "content-type": "application/json",
    "x-request-id": "synthetic-http-request",
    ...extra,
  });
  return POST(
    new Request(`${origin}/api/agency/${command}`, {
      method: "POST",
      headers: fixture.headers,
      body,
    }),
    {
      params: Promise.resolve({ command }),
    },
  );
}
beforeEach(() => {
  fixture.session = null;
  fixture.execute.mockReset();
  fixture.execute.mockResolvedValue({
    operationId: randomUUID(),
    replayed: false,
    outcome: { id: randomUUID() },
  });
});

it.each([
  "partnerSave",
  "partnerDecision",
  "reviewSave",
  "reviewDocumentConsent",
  "reviewVerify",
  "photography",
])(
  "dispatches %s only on its current staff surface through the shared command",
  async (command) => {
    session("staff");
    const response = await post("staff", command);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("x-correlation-id")).toBe("synthetic-http-request");
    expect(fixture.execute).toHaveBeenCalledWith("synthetic-db", fixture.session, command, {
      synthetic: true,
    });
    fixture.execute.mockClear();
    session("client");
    expect((await post("client", command)).status).toBe(404);
    expect(fixture.execute).not.toHaveBeenCalled();
  },
);
it("allows the author's clientConsent command only on the client host", async () => {
  session("client");
  expect((await post("client", "clientConsent")).status).toBe(200);
  fixture.execute.mockClear();
  session("staff");
  expect((await post("staff", "clientConsent")).status).toBe(404);
  expect(fixture.execute).not.toHaveBeenCalled();
});
it("rejects unknown commands, unauthenticated callers and a wrong private session role", async () => {
  session("staff");
  for (const name of ["unknown", "constructor", "toString"])
    expect((await post("staff", name)).status).toBe(404);
  fixture.session = null;
  expect((await post("staff", "partnerSave")).status).toBe(401);
  session("client");
  expect((await post("staff", "partnerSave")).status).toBe(401);
  session("staff");
  expect((await post("client", "clientConsent")).status).toBe(401);
  expect(fixture.execute).not.toHaveBeenCalled();
});
it("rejects cross-origin, non-JSON and malformed JSON before dispatch", async () => {
  session("staff");
  expect((await post("staff", "partnerSave", "{}", { origin: hosts.client })).status).toBe(403);
  expect(
    (
      await post("staff", "partnerSave", "x=y", {
        "content-type": "application/x-www-form-urlencoded",
      })
    ).status,
  ).toBe(422);
  expect((await post("staff", "partnerSave", "{")).status).toBe(422);
  expect(fixture.execute).not.toHaveBeenCalled();
  expect(
    (
      await post("staff", "partnerSave", "{}", {
        "content-type": "Application/JSON; charset=utf-8",
      })
    ).status,
  ).toBe(200);
});
it("preserves downstream current-authority denials as unstored safe errors", async () => {
  session("staff");
  fixture.execute.mockRejectedValue(new AppError("not_found"));
  const response = await post("staff", "partnerSave");
  expect(response.status).toBe(404);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(await response.json()).toMatchObject({
    error: { code: "NOT_FOUND", outcome: "not_applied" },
  });
});
