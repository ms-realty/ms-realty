import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { createConnection } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath, pathToFileURL } from "node:url";

const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
export function imageIdentity(serialized, expectedSource) {
  const image = JSON.parse(serialized);
  if (
    image.schemaVersion !== 1 ||
    !/^[a-f0-9]{40}$/.test(image.sourceCommit ?? "") ||
    image.sourceCommit !== expectedSource ||
    !uuid.test(image.buildNonce ?? "")
  )
    throw new Error("Immutable image identity differs from the expected source");
  return image;
}

export function loopbackReady(port = 15432) {
  return new Promise((resolve) => {
    const socket = createConnection({ host: "127.0.0.1", port });
    const finish = (ready) => {
      socket.destroy();
      resolve(ready);
    };
    socket.setTimeout(500, () => finish(false));
    socket.once("error", () => finish(false));
    socket.once("connect", () => finish(true));
  });
}

/** One supervised process, no restart or role replay. Readiness proves only a loopback listener. */
export async function startDatabaseCompanion(
  env,
  onFailure,
  { spawnProcess = spawn, probe = loopbackReady, timeoutMs = 10_000, pollMs = 100, signal } = {},
) {
  if (signal?.aborted) throw new Error("Staging role startup interrupted");
  if (env.DATABASE_TRANSPORT === undefined || env.DATABASE_TRANSPORT === "direct") return;
  if (
    env.DATABASE_TRANSPORT !== "cloudflared-access-tcp" ||
    env.STAGING !== "true" ||
    (env.RELEASE_ENVIRONMENT && env.RELEASE_ENVIRONMENT !== "staging") ||
    !env.STAGING_DATABASE_HOST ||
    env.TUNNEL_SERVICE_HOSTNAME !== env.STAGING_DATABASE_HOST ||
    env.TUNNEL_SERVICE_URL !== "127.0.0.1:15432" ||
    !env.TUNNEL_SERVICE_TOKEN_ID?.trim() ||
    !env.TUNNEL_SERVICE_TOKEN_SECRET?.trim()
  )
    throw new Error("Explicit reviewed staging Access TCP companion inputs are required");
  if (await probe()) throw new Error("Staging Access TCP listener is already occupied");
  if (signal?.aborted) throw new Error("Staging Access TCP companion startup interrupted");
  const child = spawnProcess("/usr/local/bin/cloudflared", ["access", "tcp"], {
    // Credentials exist only in this child environment and never command arguments or output.
    env: Object.fromEntries(
      [
        "TUNNEL_SERVICE_HOSTNAME",
        "TUNNEL_SERVICE_URL",
        "TUNNEL_SERVICE_TOKEN_ID",
        "TUNNEL_SERVICE_TOKEN_SECRET",
      ].map((key) => [key, env[key]]),
    ),
    stdio: "ignore",
  });
  let failed = false,
    ready = false,
    stopping = false;
  const stop = (signal = "SIGTERM") => {
    stopping = true;
    child.kill(signal);
  };
  signal?.addEventListener(
    "abort",
    () => {
      failed = true;
      stop(signal.reason === "SIGINT" ? "SIGINT" : "SIGTERM");
    },
    { once: true },
  );
  const lost = () => {
    if (stopping || failed) return;
    failed = true;
    if (ready) onFailure();
  };
  child.once("error", lost);
  child.once("exit", lost);
  const deadline = Date.now() + timeoutMs;
  try {
    while (!failed && Date.now() < deadline) {
      if (await probe()) {
        if (failed) break;
        ready = true;
        return { stop };
      }
      await delay(pollMs);
    }
    throw new Error("Staging Access TCP companion readiness failed");
  } catch {
    stop();
    throw new Error("Staging Access TCP companion readiness failed");
  }
}

/** Private container-port service. No digest is claimed by process configuration. */
export function roleRuntime(role, image, execute) {
  if (!["web", "worker", "migrator"].includes(role)) throw new Error("Invalid runtime role");
  let proof = { ...image, role, state: "prepared" };
  let execution;
  return {
    identity: () => ({ ...proof }),
    fail: () => {
      proof = { ...proof, state: "failed" };
    },
    async start(operationId) {
      if (execution) return execution;
      if (proof.state === "failed") return;
      if (role === "migrator" && !uuid.test(operationId ?? ""))
        throw new Error("Migration operation identity is required");
      proof = { ...proof, state: "running", ...(operationId ? { operationId } : {}) };
      execution = Promise.resolve()
        .then(execute)
        .then(() => {
          if (proof.state !== "running") return;
          // The worker drains its queue and sets exitCode when startup fails without rejecting.
          if (role === "worker" && process.exitCode) throw new Error("Worker startup failed");
          if (role === "migrator")
            proof = { ...proof, state: "completed", completedAt: new Date().toISOString() };
        })
        .catch(() => {
          proof = { ...proof, state: "failed" };
        });
      return execution;
    },
  };
}

export function identityServer(runtime, role) {
  return createServer(async (request, response) => {
    response.setHeader("Content-Type", "application/json");
    response.setHeader("Cache-Control", "no-store");
    const reply = (status, value) => {
      response.writeHead(status);
      response.end(JSON.stringify(value));
    };
    if (request.method === "GET" && request.url === "/identity")
      return reply(200, runtime.identity());
    if (request.method !== "POST" || request.url !== "/start" || role === "web")
      return reply(405, { code: "method_not_allowed" });
    try {
      let bytes = 0;
      const chunks = [];
      for await (const chunk of request) {
        bytes += chunk.length;
        if (bytes > 128) return reply(413, { code: "invalid_operation" });
        chunks.push(chunk);
      }
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      if (role === "migrator" && !uuid.test(body.operationId ?? ""))
        return reply(400, { code: "invalid_operation" });
      const previous = runtime.identity();
      if (previous.operationId && previous.operationId !== body.operationId)
        return reply(409, { code: "operation_conflict" });
      void runtime.start(body.operationId);
      return reply(202, runtime.identity());
    } catch {
      return reply(400, { code: "invalid_operation" });
    }
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  let companion, runtime, server, shutdown;
  const startup = new AbortController();
  const terminate = (signal = "SIGTERM") => {
    startup.abort(signal);
    runtime?.fail();
    server?.closeAllConnections();
    server?.close();
    companion?.stop(signal);
    // Signal handlers drain where possible, but no role or migrator may outlive shutdown forever.
    shutdown ??= setTimeout(
      () => process.exit(process.exitCode || (signal === "SIGINT" ? 130 : 143)),
      15_000,
    );
    shutdown.unref();
  };
  for (const signal of ["SIGTERM", "SIGINT"]) process.once(signal, () => terminate(signal));
  try {
    const role = process.argv[2];
    // Fixed, root-owned/read-only Dockerfile output. No environment-variable path override.
    const image = imageIdentity(
      await readFile("/app/runtime-image.json", "utf8"),
      process.env.EXPECTED_SOURCE_COMMIT,
    );
    process.env.BUILD_SHA = image.sourceCommit;
    if (process.env.DATABASE_TRANSPORT === "cloudflared-access-tcp") {
      const { databaseTransport } = await import(
        pathToFileURL("/app/dist-runtime/transport.mjs").href
      );
      databaseTransport(process.env.DATABASE_URL, process.env);
    }
    companion = await startDatabaseCompanion(
      process.env,
      () => {
        terminate();
        process.exitCode = 1;
        // Existing worker signal handlers drain the queue; a bounded fallback also stops web.
        process.kill(process.pid, "SIGTERM");
      },
      { signal: startup.signal },
    );
    if (startup.signal.aborted) throw new Error("Staging role startup interrupted");
    delete process.env.TUNNEL_SERVICE_TOKEN_ID;
    delete process.env.TUNNEL_SERVICE_TOKEN_SECRET;
    runtime = roleRuntime(role, image, async () => {
      if (role === "web") await import(pathToFileURL("/app/server.js").href);
      else if (role === "worker") await import(pathToFileURL("/app/dist-runtime/worker.mjs").href);
      else {
        const { runMigrations } = await import(pathToFileURL("/app/dist-runtime/migrate.mjs").href);
        if (!process.env.DATABASE_URL) throw new Error("Migration database is required");
        await runMigrations(process.env.DATABASE_URL);
      }
    });
    server = identityServer(runtime, role);
    server.listen(3001, "0.0.0.0");
    if (role === "web") await runtime.start();
  } catch {
    terminate();
    console.error("Runtime identity/startup unavailable; source qualification remains closed");
    process.exitCode = 1;
  }
}
