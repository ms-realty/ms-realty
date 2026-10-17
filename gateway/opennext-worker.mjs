import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import worker from "../.open-next/worker.js";
import { withRequestDatabase } from "../src/db/request-scope";
import * as schema from "../src/db/schema";
import { isStagingHost, stagingResponse, verifyAccess } from "./staging";
import { gateway } from "./worker";

export * from "../.open-next/worker.js";

// Close the request's Hyperdrive client only after its streaming response finishes.
function managedResponse(response, client, ctx) {
  const close = () => ctx.waitUntil(client.end({ timeout: 5 }));
  if (!response.body) {
    close();
    return response;
  }
  const reader = response.body.getReader();
  let closed = false;
  const finish = () => {
    if (closed) return;
    closed = true;
    reader.releaseLock();
    close();
  };
  const body = new ReadableStream({
    async pull(controller) {
      try {
        const chunk = await reader.read();
        if (chunk.done) {
          finish();
          controller.close();
        } else controller.enqueue(chunk.value);
      } catch (error) {
        finish();
        controller.error(error);
      }
    },
    async cancel(reason) {
      try {
        await reader.cancel(reason);
      } finally {
        finish();
      }
    },
  });
  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    // This deploy entrypoint is staging-only. No workers.dev, origin or production host.
    if (env.STAGING !== "true" || !isStagingHost(url.hostname))
      return stagingResponse(new Response(null, { status: 404 }));
    if (
      !(await verifyAccess(
        request.headers.get("Cf-Access-Jwt-Assertion"),
        env.ACCESS_TEAM_DOMAIN,
        env.ACCESS_AUD,
      ))
    )
      return stagingResponse(new Response(null, { status: 403 }));
    if (url.pathname === "/robots.txt")
      return stagingResponse(
        new Response("User-agent: *\nDisallow: /\n", {
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        }),
      );
    if (!env.HYPERDRIVE?.connectionString)
      return stagingResponse(new Response(null, { status: 503 }));
    return stagingResponse(
      await gateway(request, env, async (outbound) => {
        const client = postgres(env.HYPERDRIVE.connectionString, {
          max: 1,
          idle_timeout: 2,
          connect_timeout: 10,
          max_lifetime: 60,
          fetch_types: false,
          onnotice: () => {},
        });
        const database = drizzle(client, { schema });
        try {
          const response = await withRequestDatabase(database, () =>
            worker.fetch(outbound, env, ctx),
          );
          return managedResponse(response, client, ctx);
        } catch (error) {
          await client.end({ timeout: 5 });
          throw error;
        }
      }),
    );
  },
};
