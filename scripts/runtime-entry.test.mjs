import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { createServer } from "node:net";
import { test } from "node:test";
import {
  identityServer,
  imageIdentity,
  loopbackReady,
  roleRuntime,
  startDatabaseCompanion,
} from "./runtime-entry.mjs";

const image = {
  schemaVersion: 1,
  sourceCommit: "a".repeat(40),
  buildNonce: "12345678-1234-4321-9876-123456789abc",
};
const operationId = "12345678-5678-4321-9876-123456789abc";
test("private database diagnostics cannot import or start any runtime role", async (t) => {
  let executions = 0,
    probes = 0;
  const runtime = roleRuntime("web", image, async () => {
    executions++;
  });
  const server = identityServer(runtime, "web", async () => {
    probes++;
    return { status: "PASS" };
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(
    () =>
      new Promise((resolve) => {
        server.closeAllConnections();
        server.close(resolve);
      }),
  );
  const response = await fetch(`http://127.0.0.1:${server.address().port}/connectivity`, {
    method: "POST",
  });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).state, "prepared");
  assert.equal(probes, 1);
  assert.equal(executions, 0);
  runtime.fail();
  assert.equal(
    (await fetch(`http://127.0.0.1:${server.address().port}/connectivity`, { method: "POST" }))
      .status,
    503,
  );
  assert.equal(probes, 1);
});
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

const companionEnv = () => ({
  DATABASE_TRANSPORT: "cloudflared-access-tcp",
  STAGING: "true",
  STAGING_DATABASE_HOST: "db.staging.example.invalid",
  TUNNEL_SERVICE_HOSTNAME: "db.staging.example.invalid",
  TUNNEL_SERVICE_URL: "127.0.0.1:15432",
  TUNNEL_SERVICE_TOKEN_ID: randomUUID(),
  TUNNEL_SERVICE_TOKEN_SECRET: randomUUID(),
  AUTH_SECRET: randomUUID(),
});
function fakeCompanion() {
  const child = new EventEmitter();
  child.signals = [];
  child.kill = (signal) => {
    child.signals.push(signal);
    child.emit("exit", 0, signal);
  };
  return child;
}
test("direct mode does not spawn and invalid/private production inputs stay closed", async () => {
  let starts = 0;
  const options = {
    spawnProcess: () => {
      starts++;
    },
    probe: async () => false,
  };
  await startDatabaseCompanion({}, () => {}, options);
  await startDatabaseCompanion({ DATABASE_TRANSPORT: "direct" }, () => {}, options);
  for (const changed of [
    { STAGING: "false" },
    { RELEASE_ENVIRONMENT: "production" },
    { DATABASE_TRANSPORT: "unknown" },
    { TUNNEL_SERVICE_HOSTNAME: "another.invalid" },
    { TUNNEL_SERVICE_URL: "0.0.0.0:15432" },
    { TUNNEL_SERVICE_TOKEN_ID: "" },
    { TUNNEL_SERVICE_TOKEN_SECRET: "" },
  ])
    await assert.rejects(
      startDatabaseCompanion({ ...companionEnv(), ...changed }, () => {}, options),
    );
  assert.equal(starts, 0);
});
test("readiness needs a real loopback listener; credentials go only to child env and termination forwards", async (t) => {
  const listener = createServer((socket) => socket.end());
  await new Promise((resolve) => listener.listen(0, "127.0.0.1", resolve));
  const port = listener.address().port;
  await new Promise((resolve) => listener.close(resolve));
  t.after(() => new Promise((resolve) => listener.close(resolve)));
  const env = companionEnv(),
    child = fakeCompanion();
  let spawnArguments;
  const companion = await startDatabaseCompanion(env, () => assert.fail("Unexpected loss"), {
    probe: () => loopbackReady(port),
    spawnProcess: (...args) => {
      spawnArguments = args;
      listener.listen(port, "127.0.0.1");
      return child;
    },
    pollMs: 1,
  });
  assert.deepEqual(spawnArguments.slice(0, 2), ["/usr/local/bin/cloudflared", ["access", "tcp"]]);
  assert.deepEqual(Object.keys(spawnArguments[2].env).sort(), [
    "TUNNEL_SERVICE_HOSTNAME",
    "TUNNEL_SERVICE_TOKEN_ID",
    "TUNNEL_SERVICE_TOKEN_SECRET",
    "TUNNEL_SERVICE_URL",
  ]);
  assert.equal(spawnArguments[2].env.TUNNEL_SERVICE_TOKEN_SECRET, env.TUNNEL_SERVICE_TOKEN_SECRET);
  assert.equal(spawnArguments[2].stdio, "ignore");
  companion.stop("SIGINT");
  assert.deepEqual(child.signals, ["SIGINT"]);
});
test("occupied listener, spawn failure and readiness timeout never start a role", async () => {
  let starts = 0;
  await assert.rejects(
    startDatabaseCompanion(companionEnv(), () => {}, {
      probe: async () => true,
      spawnProcess: () => {
        starts++;
      },
    }),
    /occupied/,
  );
  assert.equal(starts, 0);
  for (const exits of [true, false]) {
    const child = fakeCompanion();
    await assert.rejects(
      startDatabaseCompanion(companionEnv(), () => {}, {
        probe: async () => false,
        spawnProcess: () => {
          if (exits) queueMicrotask(() => child.emit("error", Error("redacted launch failure")));
          return child;
        },
        timeoutMs: 10,
        pollMs: 1,
      }),
      /readiness failed/,
    );
    assert.deepEqual(child.signals, ["SIGTERM"]);
  }
});
test("companion loss fails an in-flight migration and never replays it or promotes later resolution", async () => {
  let finish,
    executions = 0,
    notifications = 0;
  const pending = new Promise((resolve) => {
    finish = resolve;
  });
  const runtime = roleRuntime("migrator", image, async () => {
    executions++;
    await pending;
  });
  const child = fakeCompanion();
  let probes = 0;
  await startDatabaseCompanion(
    companionEnv(),
    () => {
      notifications++;
      runtime.fail();
    },
    {
      probe: async () => ++probes > 1,
      spawnProcess: () => child,
    },
  );
  const execution = runtime.start(operationId);
  await Promise.resolve();
  child.emit("exit", 1);
  child.emit("error", Error("ignored repeated loss"));
  finish();
  await execution;
  await runtime.start(operationId);
  assert.equal(notifications, 1);
  assert.equal(executions, 1);
  assert.equal(runtime.identity().state, "failed");
  assert.equal("completedAt" in runtime.identity(), false);
});
test("companion failure before the start command gates the role and startup termination forwards", async () => {
  let executions = 0;
  const runtime = roleRuntime("worker", image, async () => {
    executions++;
  });
  runtime.fail();
  await runtime.start();
  assert.equal(executions, 0);
  assert.equal(runtime.identity().state, "failed");
  const controller = new AbortController(),
    child = fakeCompanion();
  const startup = startDatabaseCompanion(companionEnv(), () => assert.fail("Intentional stop"), {
    probe: async () => false,
    spawnProcess: () => {
      queueMicrotask(() => controller.abort("SIGINT"));
      return child;
    },
    signal: controller.signal,
    pollMs: 1,
  });
  await assert.rejects(startup, /readiness failed/);
  assert.equal(child.signals[0], "SIGINT");
});
test("termination before direct startup prevents the role from executing", async () => {
  const controller = new AbortController();
  controller.abort("SIGTERM");
  let executions = 0;
  const runtime = roleRuntime("web", image, async () => {
    executions++;
  });
  await assert.rejects(async () => {
    await startDatabaseCompanion({ DATABASE_TRANSPORT: "direct" }, () => {}, {
      signal: controller.signal,
    });
    await runtime.start();
  }, /startup interrupted/);
  assert.equal(executions, 0);
});
