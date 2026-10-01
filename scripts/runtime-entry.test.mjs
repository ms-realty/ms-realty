import assert from "node:assert/strict";
import { test } from "node:test";
import { identityServer, imageIdentity, roleRuntime } from "./runtime-entry.mjs";

const image = {
  schemaVersion: 1,
  sourceCommit: "a".repeat(40),
  buildNonce: "12345678-1234-4321-9876-123456789abc",
};
const operationId = "12345678-5678-4321-9876-123456789abc";
test("Worker configuration cannot replace the fixed image identity", () => {
  assert.equal(
    imageIdentity(JSON.stringify(image), image.sourceCommit).sourceCommit,
    image.sourceCommit,
  );
  assert.throws(() => imageIdentity(JSON.stringify(image), "b".repeat(40)), /image identity/);
  assert.throws(() => imageIdentity(JSON.stringify(image), undefined));
  assert.throws(() =>
    imageIdentity(
      JSON.stringify({ ...image, buildNonce: "configured-digest" }),
      image.sourceCommit,
    ),
  );
});
test("real private-port requests report completion only after the migration resolves", async (t) => {
  let finish;
  let executions = 0;
  const pending = new Promise((resolve) => {
    finish = resolve;
  });
  const runtime = roleRuntime("migrator", image, async () => {
    executions++;
    await pending;
  });
  const server = identityServer(runtime, "migrator");
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(
    () =>
      new Promise((resolve) => {
        server.closeAllConnections();
        server.close(resolve);
      }),
  );
  const url = `http://127.0.0.1:${server.address().port}`;
  const start = (id) =>
    fetch(`${url}/start`, { method: "POST", body: JSON.stringify({ operationId: id }) });
  assert.equal((await start("missing-identity")).status, 400);
  assert.equal(executions, 0);
  assert.equal((await start(operationId)).status, 202);
  assert.equal((await (await fetch(`${url}/identity`)).json()).state, "running");
  assert.equal((await start("87654321-5678-4321-9876-123456789abc")).status, 409);
  assert.equal((await start(operationId)).status, 202);
  assert.equal(executions, 1);
  finish();
  await runtime.start(operationId);
  const proof = await (await fetch(`${url}/identity`)).json();
  assert.equal(proof.state, "completed");
  assert.equal(proof.operationId, operationId);
  assert.equal(proof.sourceCommit, image.sourceCommit);
  assert.equal(proof.buildNonce, image.buildNonce);
  assert.ok(Number.isFinite(Date.parse(proof.completedAt)));
  assert.equal("digest" in proof, false);
});
test("migration failure remains a failure and preparing a queue does not execute jobs", async () => {
  const failed = roleRuntime("migrator", image, async () => {
    throw Error("synthetic failure");
  });
  await failed.start(operationId);
  assert.equal(failed.identity().state, "failed");
  assert.equal("completedAt" in failed.identity(), false);
  let starts = 0;
  const worker = roleRuntime("worker", image, async () => {
    starts++;
  });
  assert.equal(worker.identity().state, "prepared");
  assert.equal(starts, 0);
  await worker.start();
  await worker.start();
  assert.equal(starts, 1);
  assert.equal(worker.identity().state, "running");
});
test("a worker that drains after startup failure cannot report a running queue", async () => {
  const previous = process.exitCode;
  try {
    const worker = roleRuntime("worker", image, async () => {
      // scripts/worker.ts uses this failure contract after draining the queue.
      process.exitCode = 1;
    });
    await worker.start();
    assert.equal(worker.identity().state, "failed");
  } finally {
    process.exitCode = previous;
  }
});
