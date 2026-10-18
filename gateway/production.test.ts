/// <reference path="./cloudflare-runtime.generated.d.ts" />
import { generateKeyPairSync, randomUUID, sign } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

// In-memory Workers/Containers substitutes exercise control behavior only, never live proof.
vi.mock("cloudflare:workers", () => ({
  DurableObject: class {
    constructor(
      public ctx: unknown,
      public env: unknown,
    ) {}
  },
}));
vi.mock("@cloudflare/containers", () => ({ Container: class {} }));
vi.mock("./staging-artifacts.generated", () => ({
  stagingArtifacts: { fixture: false, sourceCommit: "a".repeat(40), routes: "[]", media: "[]" },
}));
vi.mock("./access", () => ({ accessAuthorized: vi.fn(async () => true) }));
vi.mock("./worker", () => ({ gateway: vi.fn(async () => new Response("unit-public")) }));

import { accessAuthorized } from "./access";
import worker, { ProductionReleaseControl } from "./production";
import { gateway } from "./worker";

function fixture() {
  const pair = generateKeyPairSync("ed25519"),
    nonce = randomUUID(),
    operationId = randomUUID();
  const proof = (role: string) => ({
    schemaVersion: 1,
    role,
    sourceCommit: "a".repeat(40),
    buildNonce: nonce,
    actorId: role === "web" ? "1".repeat(64) : "2".repeat(64),
    state: "running",
  });
  const web = {
    identity: vi.fn(async () => proof("web")),
    connectivity: vi.fn(),
    startWeb: vi.fn(async () => proof("web")),
  };
  const queue = {
    identity: vi.fn(async () => proof("worker")),
    connectivity: vi.fn(),
    startQueue: vi.fn(async () => proof("worker")),
    stopQueue: vi.fn(async () => ({ status: "stop_requested", drainVerification: "unqualified" })),
  };
  const migrator = {
    identity: vi.fn(async () => ({ ...proof("migrator"), state: "completed" })),
    connectivity: vi.fn(),
    result: vi.fn(async () => ({
      status: "completed",
      configuredDigest: `sha256:${"b".repeat(64)}`,
      sourceCommit: "a".repeat(40),
      buildNonce: nonce,
    })),
    runMigration: vi.fn(),
  };
  const control = {
    active: vi.fn(async () => false),
    emailAllowed: vi.fn(async () => false),
    activate: vi.fn(),
    deactivate: vi.fn(),
  };
  const env = {
    STAGING: "false",
    RELEASE_ENVIRONMENT: "production",
    BUILD_SHA: "a".repeat(40),
    IMAGE_DIGEST: `sha256:${"b".repeat(64)}`,
    PRODUCTION_WORKER_NAME: `ms-realty-production-${"a".repeat(12)}`,
    PRODUCTION_INPUTS_SHA256: "c".repeat(64),
    PRODUCTION_SCHEMA_SHA256: "d".repeat(64),
    PRODUCTION_ACCEPTED_REPORT_SHA256: "e".repeat(64),
    PRODUCTION_OWNERSHIP_SHA256: "f".repeat(64),
    PRODUCTION_CONTROLLER_PUBLIC_KEY: pair.publicKey
      .export({ type: "spki", format: "pem" })
      .toString(),
    PUBLIC_ORIGIN: "https://makler-realty.com",
    CLIENT_ORIGIN: "https://my.makler-realty.com",
    STAFF_ORIGIN: "https://app.makler-realty.com",
    PRODUCTION_CONTROL_SECRET: randomUUID(),
    EMAIL_RELAY_SECRET: randomUUID(),
    MS_REALTY: { getByName: () => web },
    MS_REALTY_WORKER: { getByName: () => queue },
    MS_REALTY_MIGRATOR: { getByName: () => migrator },
    RELEASE_CONTROL: { getByName: () => control },
    EMAIL_RECEIPTS: { getByName: vi.fn() },
  };
  const grant = (operation: string) => {
    const now = Date.now(),
      payload = JSON.stringify({
        schemaVersion: 1,
        purpose: "production-runtime",
        operation,
        operationId,
        sourceCommit: env.BUILD_SHA,
        digest: env.IMAGE_DIGEST,
        inputsSha256: env.PRODUCTION_INPUTS_SHA256,
        schemaSha256: env.PRODUCTION_SCHEMA_SHA256,
        acceptedReportSha256: env.PRODUCTION_ACCEPTED_REPORT_SHA256,
        ownershipSha256: env.PRODUCTION_OWNERSHIP_SHA256,
        issuedAt: new Date(now - 1).toISOString(),
        expiresAt: new Date(now + 30_000).toISOString(),
      });
    return {
      payload,
      signature: sign(null, Buffer.from(payload), pair.privateKey).toString("base64"),
    };
  };
  const values = new Map<string, unknown>();
  const ctx = {
    storage: {
      get: async (key: string) => values.get(key),
      put: async (key: string, value: unknown) => {
        values.set(key, structuredClone(value));
      },
    },
    blockConcurrencyWhile: <T>(fn: () => Promise<T>) => fn(),
  };
  const instance = new ProductionReleaseControl(ctx as never, env as never);
  const request = (path: string, origin = env.STAFF_ORIGIN, authorized = true) =>
    new Request(`${origin}${path}`, {
      method: "POST",
      headers: authorized ? { Authorization: `Bearer ${env.PRODUCTION_CONTROL_SECRET}` } : {},
    });
  return { env, web, queue, migrator, control, values, instance, grant, request };
}
beforeEach(() => vi.clearAllMocks());
describe("production gateway boundary with injected unit namespaces", () => {
  it("rejects staging/forged control hosts and stops public intake until explicit activation", async () => {
    const f = fixture();
    expect(
      (await worker.fetch(f.request("/__release/runtime", f.env.PUBLIC_ORIGIN), f.env as never))
        .status,
    ).toBe(403);
    expect(
      (
        await worker.fetch(
          f.request("/__release/runtime", f.env.STAFF_ORIGIN, false),
          f.env as never,
        )
      ).status,
    ).toBe(403);
    expect(
      (await worker.fetch(new Request(`${f.env.PUBLIC_ORIGIN}/__staging/runtime`), f.env as never))
        .status,
    ).toBe(404);
    expect(
      (await worker.fetch(new Request(`${f.env.PUBLIC_ORIGIN}/bg`), f.env as never)).status,
    ).toBe(503);
    expect(f.web.startWeb).not.toHaveBeenCalled();
    expect(f.queue.startQueue).not.toHaveBeenCalled();
  });
  it("read-only role diagnostics remain unqualified and cannot start or migrate a role", async () => {
    const f = fixture(),
      response = await worker.fetch(f.request("/__release/runtime"), f.env as never);
    expect(response.status).toBe(200);
    expect(((await response.json()) as { digestVerification: string }).digestVerification).toBe(
      "unqualified",
    );
    expect(response.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
    expect(f.migrator.runMigration).not.toHaveBeenCalled();
    expect(f.queue.startQueue).not.toHaveBeenCalled();
    const unsigned = new Request(`${f.env.STAFF_ORIGIN}/__release/migrate`, {
      method: "POST",
      headers: { Authorization: `Bearer ${f.env.PRODUCTION_CONTROL_SECRET}` },
      body: JSON.stringify({ status: "PASS" }),
    });
    expect((await worker.fetch(unsigned, f.env as never)).status).toBe(503);
    expect(f.migrator.runMigration).not.toHaveBeenCalled();
  });
  it("public requests use production gateway behavior after activation and never borrow staging Access/noindex", async () => {
    const f = fixture();
    f.control.active.mockResolvedValue(true);
    const response = await worker.fetch(new Request(`${f.env.PUBLIC_ORIGIN}/bg`), f.env as never);
    expect(response.status).toBe(200);
    expect(response.headers.get("X-Robots-Tag")).toBeNull();
    expect(gateway).toHaveBeenCalledTimes(1);
    expect(f.web.startWeb).toHaveBeenCalledTimes(1);
    expect(accessAuthorized).not.toHaveBeenCalled();
    expect((await worker.fetch(f.request("/__release/email"), f.env as never)).status).toBe(403);
    expect(f.env.EMAIL_RECEIPTS.getByName).not.toHaveBeenCalled();
  });
  it("activation requires a controller grant plus actual migration and common immutable build identities", async () => {
    const f = fixture();
    await expect(f.instance.activate({ armed: true })).rejects.toThrow(/controller-signed/);
    expect(f.queue.startQueue).not.toHaveBeenCalled();
    expect((await f.instance.activate(f.grant("activate"))).status).toBe("active");
    expect(await f.instance.active()).toBe(true);
    expect(await f.instance.emailAllowed()).toBe(false);
    await f.instance.activate(f.grant("activate"));
    expect(f.queue.startQueue).toHaveBeenCalledTimes(1);
    const stopped = await f.instance.deactivate(f.grant("deactivate"));
    expect(stopped.status).toBe("stop_requested");
    expect(stopped.drainVerification).toBe("unqualified");
    expect(await f.instance.active()).toBe(false);
  });
  it("uncertain queue activation closes intake, requests stop and cannot silently replay", async () => {
    const f = fixture();
    f.queue.startQueue.mockRejectedValue(new Error("unit failure"));
    await expect(f.instance.activate(f.grant("activate"))).rejects.toThrow(
      /requires reconciliation/,
    );
    expect(await f.instance.active()).toBe(false);
    expect(f.queue.stopQueue).toHaveBeenCalledTimes(1);
    await expect(f.instance.activate(f.grant("activate"))).rejects.toThrow(/Uncertain activation/);
    expect(f.queue.startQueue).toHaveBeenCalledTimes(1);
  });
});
