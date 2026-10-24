/// <reference path="./cloudflare-runtime.generated.d.ts" />
import { describe, expect, it, vi } from "vitest";

vi.mock("cloudflare:workers", () => ({ DurableObject: class {} }));
vi.mock("@cloudflare/containers", () => ({ Container: class {} }));
vi.mock("./staging-artifacts.generated", () => ({
  stagingArtifacts: { fixture: false, sourceCommit: "a".repeat(40), routes: "[]", media: "[]" },
}));

import { MsRealtyContainer } from "./cloudflare";
import { ProductionWeb } from "./production";

const source = "a".repeat(40);
const nonce = "3f310bab-b56b-4e71-a71e-a913e65ff59c";
const gateways = [
  ["protected staging", MsRealtyContainer],
  ["production", ProductionWeb],
] as const;

function fixture(Web: (typeof gateways)[number][1], initialState = "prepared") {
  let state = initialState;
  let releasePort: () => void = () => {};
  const ready = new Promise<void>((resolve) => {
    releasePort = resolve;
  });
  const waitForPorts = vi.fn(async (ports: number[]) => {
    if (ports.includes(3000)) await ready;
  });
  const containerFetch = vi.fn(async (url: string, init: RequestInit) => {
    if (url === "http://runtime/identity" && init.method === "GET") {
      return Response.json({
        schemaVersion: 1,
        role: "web",
        sourceCommit: source,
        buildNonce: nonce,
        state,
      });
    }
    if (url === "http://runtime/start" && init.method === "POST") {
      state = "running";
      return Response.json({ state }, { status: 202 });
    }
    throw new Error("Unexpected private runtime request");
  });
  // Actual gateway methods; only the Cloudflare platform transport is substituted.
  const web = Object.assign(Object.create(Web.prototype), {
    role: "web",
    env: { BUILD_SHA: source },
    ctx: { id: { toString: () => "b".repeat(64) } },
    startAndWaitForPorts: waitForPorts,
    containerFetch,
  }) as InstanceType<typeof Web>;
  return { web, waitForPorts, containerFetch, releasePort };
}

function heldControlResponse(status: number) {
  // The SDK proxies private replies through an IdentityTransformStream and retains its
  // inflight slot until the consumer drains that stream. A small unread reply still blocks.
  const stream = new TransformStream<Uint8Array, Uint8Array>();
  const writer = stream.writable.getWriter();
  let released = false;
  const finished = writer
    .write(new TextEncoder().encode('{"state":"running"}'))
    .then(() => writer.close())
    .then(
      () => {
        released = true;
      },
      () => {
        released = true;
      },
    );
  const response = new Response(stream.readable, { status });
  return {
    response,
    released: () => released,
    async cleanup() {
      await response.body?.cancel().catch(() => {});
      await finished;
    },
  };
}

describe.each(gateways)("%s deferred web readiness", (_name, Web) => {
  it.each([
    ["start", 202],
    ["start", 503],
    ["identity", 503],
    ["connectivity", 503],
  ] as const)(
    "releases the private %s response at HTTP %i before returning",
    async (operation, status) => {
      const f = fixture(Web);
      const control = heldControlResponse(status);
      const original = f.containerFetch.getMockImplementation();
      if (!original) throw new Error("Missing unit transport");
      f.containerFetch.mockImplementation(async (url, init) =>
        url === `http://runtime/${operation}` ? control.response : original(url, init),
      );
      f.releasePort();
      try {
        const request = operation === "start" ? f.web.startWeb() : f.web[operation]();
        if (status === 202) await request;
        else await expect(request).rejects.toThrow(/unavailable|requires reconciliation/);
        await vi.waitFor(() => expect(control.released()).toBe(true), { timeout: 150 });
        if (operation === "identity")
          expect(f.containerFetch.mock.calls.map(([url]) => url)).toEqual([
            "http://runtime/identity",
          ]);
      } finally {
        await control.cleanup();
      }
    },
  );

  it("keeps the first request waiting until the web port accepts connections", async () => {
    const f = fixture(Web);
    let settled = false;
    const starting = f.web.startWeb().then(() => {
      settled = true;
    });
    await vi.waitFor(() => expect(f.waitForPorts).toHaveBeenCalledWith([3000]));
    expect(f.waitForPorts.mock.calls[0]).toEqual([[3001]]);
    expect(f.containerFetch).toHaveBeenCalledWith(
      "http://runtime/start",
      expect.objectContaining({ method: "POST" }),
      3001,
    );
    expect(settled).toBe(false);
    f.releasePort();
    await starting;
    expect(settled).toBe(true);
  });

  it("fails closed when the control port is healthy but the web port never becomes ready", async () => {
    const f = fixture(Web);
    f.waitForPorts.mockImplementation(async (ports) => {
      if (ports.includes(3000)) throw new Error("Web port unavailable");
    });
    await expect(f.web.startWeb()).rejects.toThrow("Web port unavailable");
  });

  it("does not start a failed web process or report it ready", async () => {
    const f = fixture(Web, "failed");
    await expect(f.web.startWeb()).rejects.toThrow(/requires reconciliation/);
    expect(f.containerFetch.mock.calls.map(([url]) => url)).toEqual(["http://runtime/identity"]);
    expect(f.waitForPorts).toHaveBeenCalledTimes(1);
  });
});
