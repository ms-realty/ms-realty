import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
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

/** Private container-port service. No digest is claimed by process configuration. */
export function roleRuntime(role, image, execute) {
  if (!["web", "worker", "migrator"].includes(role)) throw new Error("Invalid runtime role");
  let proof = { ...image, role, state: "prepared" };
  let execution;
  return {
    identity: () => ({ ...proof }),
    async start(operationId) {
      if (execution) return execution;
      if (role === "migrator" && !uuid.test(operationId ?? ""))
        throw new Error("Migration operation identity is required");
      proof = { ...proof, state: "running", ...(operationId ? { operationId } : {}) };
      execution = Promise.resolve()
        .then(execute)
        .then(() => {
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
  try {
    const role = process.argv[2];
    // Fixed, root-owned/read-only Dockerfile output. No environment-variable path override.
    const image = imageIdentity(
      await readFile("/app/runtime-image.json", "utf8"),
      process.env.EXPECTED_SOURCE_COMMIT,
    );
    process.env.BUILD_SHA = image.sourceCommit;
    const runtime = roleRuntime(role, image, async () => {
      if (role === "web") await import(pathToFileURL("/app/server.js").href);
      else if (role === "worker") await import(pathToFileURL("/app/dist-runtime/worker.mjs").href);
      else {
        const { runMigrations } = await import(pathToFileURL("/app/dist-runtime/migrate.mjs").href);
        if (!process.env.DATABASE_URL) throw new Error("Migration database is required");
        await runMigrations(process.env.DATABASE_URL);
      }
    });
    const server = identityServer(runtime, role);
    server.listen(3001, "0.0.0.0");
    for (const signal of ["SIGTERM", "SIGINT"]) process.once(signal, () => server.close());
    if (role === "web") await runtime.start();
  } catch {
    console.error("Runtime identity/startup unavailable; source qualification remains closed");
    process.exitCode = 1;
  }
}
