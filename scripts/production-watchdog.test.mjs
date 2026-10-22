import assert from "node:assert/strict";
import { test } from "node:test";
import { routeWatchdog } from "./production-watchdog.mjs";

// Transport fixtures never qualify the independently deployed service.
test("mutations stay on the exact private watchdog; the local provider remains read only", async () => {
  const requests = [],
    local = {
      routes: async () => [],
      replace: () => assert.fail("direct write"),
      create: () => assert.fail("direct write"),
      remove: () => assert.fail("direct write"),
    };
  const client = routeWatchdog({
    secret: "x".repeat(64),
    operationId: "unit-operation",
    leaseId: "unit-lease",
    transport: async (url, options) => {
      requests.push({ url, body: JSON.parse(options.body) });
      return Response.json({ id: "1", pattern: "unit/*", script: "unit-worker" });
    },
  });
  const provider = client.provider(local, "unit-worker");
  await provider.create("unit-zone", "unit/*", "unit-worker");
  await provider.replace("unit-zone", { id: "1", pattern: "unit/*" }, "unit-worker");
  assert.equal(requests.length, 2);
  assert(
    requests.every(
      (r) => r.url === "https://ms-realty-route-watchdog.ms-realty-bg.workers.dev/mutate",
    ),
  );
  assert(
    requests.every(
      (r) => r.body.operationId === "unit-operation" && r.body.leaseId === "unit-lease",
    ),
  );
  assert.throws(() => provider.create("unit-zone", "unit/*", "foreign-worker"));
});
test("restoration preserves uncertainty until the independently stored baseline is observed", async () => {
  let status = "restoring",
    polls = 0,
    clock = 0;
  const client = routeWatchdog({
    secret: "x".repeat(64),
    operationId: "unit-operation",
    leaseId: "unit-lease",
    now: () => clock,
    wait: async () => {
      clock += 1000;
    },
    transport: async (url) => {
      if (url.endsWith("/restore")) return Response.json({ status });
      polls++;
      if (polls > 3) status = "restored";
      return Response.json({
        status,
        scope: { operationId: "unit-operation", leaseId: "unit-lease" },
      });
    },
  });
  assert.equal((await client.restore()).status, "restored");
  assert(polls > 3);
});
test("foreign operation and rehearsal receipts cannot become production custody", async () => {
  for (const state of [
    { status: "armed", scope: { operationId: "foreign", leaseId: "unit-lease" } },
    {
      status: "armed",
      mode: "rehearsal",
      scope: { operationId: "unit-operation", leaseId: "unit-lease" },
    },
  ]) {
    const client = routeWatchdog({
      secret: "x".repeat(64),
      operationId: "unit-operation",
      leaseId: "unit-lease",
      transport: async () => Response.json(state),
    });
    await assert.rejects(client.status());
  }
});
test("provider rejection has no direct-write fallback or automatic retry", async () => {
  let calls = 0;
  const client = routeWatchdog({
    secret: "x".repeat(64),
    transport: async () => {
      calls++;
      return new Response("unavailable", { status: 503 });
    },
  });
  await assert.rejects(client.reserve({}));
  assert.equal(calls, 1);
});
