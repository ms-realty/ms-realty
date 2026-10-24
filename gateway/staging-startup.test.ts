/// <reference path="./cloudflare-runtime.generated.d.ts" />
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("cloudflare:workers", () => ({ DurableObject: class {} }));
vi.mock("@cloudflare/containers", () => ({ Container: class {} }));
vi.mock("./staging-artifacts.generated", () => ({
  stagingArtifacts: { fixture: false, sourceCommit: "a".repeat(40), routes: "[]", media: "[]" },
}));
vi.mock("./access", () => ({ accessAuthorized: vi.fn(async () => true) }));
vi.mock("./worker", () => ({ gateway: vi.fn(async () => new Response("public asset")) }));

import staging from "./cloudflare";
import { gateway } from "./worker";

function fixture() {
  const digest = `sha256:${"b".repeat(64)}`;
  const web = {
    startWeb: vi.fn(async () => {}),
    fetch: vi.fn(async () => new Response("application")),
  };
  const queue = { startQueue: vi.fn(async () => {}) };
  const migrator = {
    result: vi.fn(async () => ({
      status: "completed",
      configuredDigest: digest,
      sourceCommit: "a".repeat(40),
    })),
  };
  const env = {
    STAGING: "true",
    STAGING_CONNECTIVITY_ONLY: "false",
    BUILD_SHA: "a".repeat(40),
    IMAGE_DIGEST: digest,
    PUBLIC_ORIGIN: "https://staging.makler-realty.com",
    CLIENT_ORIGIN: "https://staging-my.makler-realty.com",
    STAFF_ORIGIN: "https://staging-app.makler-realty.com",
    MS_REALTY: { getByName: () => web },
    MS_REALTY_WORKER: { getByName: () => queue },
    MS_REALTY_MIGRATOR: { getByName: () => migrator },
  };
  const request = new Request(`${env.PUBLIC_ORIGIN}/bg`);
  return { web, queue, migrator, env, request };
}

beforeEach(() => {
  vi.mocked(gateway).mockReset();
  vi.mocked(gateway).mockImplementation(async () => new Response("public asset"));
});

describe("R01 protected staging request startup", () => {
  it("serves an eligible gateway response without starting unrelated application roles", async () => {
    const f = fixture();
    expect((await staging.fetch(f.request, f.env as never)).status).toBe(200);
    expect(gateway).toHaveBeenCalledOnce();
    expect(f.migrator.result).toHaveBeenCalledOnce();
    expect(f.web.startWeb).not.toHaveBeenCalled();
    expect(f.queue.startQueue).not.toHaveBeenCalled();
  });

  it("keeps migration custody closed before any gateway or application request", async () => {
    const f = fixture();
    f.migrator.result.mockResolvedValue({
      status: "unknown",
      configuredDigest: f.env.IMAGE_DIGEST,
      sourceCommit: f.env.BUILD_SHA,
    });
    expect((await staging.fetch(f.request, f.env as never)).status).toBe(503);
    expect(gateway).not.toHaveBeenCalled();
    expect(f.web.startWeb).not.toHaveBeenCalled();
    expect(f.queue.startQueue).not.toHaveBeenCalled();
  });

  it("starts both needed roles together and waits for both before forwarding", async () => {
    const f = fixture();
    let release: () => void = () => {};
    f.queue.startQueue.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    vi.mocked(gateway).mockImplementation(async (request, _env, upstream) => {
      if (!upstream) throw new Error("Missing unit origin transport");
      await upstream(request);
      return upstream(request);
    });
    const pending = staging.fetch(f.request, f.env as never);
    try {
      await vi.waitFor(() => expect(f.web.startWeb).toHaveBeenCalledOnce());
      expect(f.web.fetch).not.toHaveBeenCalled();
    } finally {
      release();
      await pending;
    }
    expect(f.queue.startQueue).toHaveBeenCalledOnce();
    expect(f.web.startWeb).toHaveBeenCalledOnce();
    expect(f.web.fetch).toHaveBeenCalledTimes(2);
  });

  it("never forwards an application request after a role readiness failure", async () => {
    const f = fixture();
    f.web.startWeb.mockRejectedValue(new Error("not ready"));
    vi.mocked(gateway).mockImplementation(async (request, _env, upstream) => {
      if (!upstream) throw new Error("Missing unit origin transport");
      return upstream(request);
    });
    expect((await staging.fetch(f.request, f.env as never)).status).toBe(503);
    expect(f.web.fetch).not.toHaveBeenCalled();
  });
});
