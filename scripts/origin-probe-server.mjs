import { createServer } from "node:http";
import { probeLegacyOrigin, sourceHosts } from "./legacy-origin-probe.mjs";

// This image has no application, SQL, customer, provider-token or delivery credentials.
const server = createServer(async (request, response) => {
  response.setHeader("Content-Type", "application/json");
  response.setHeader("Cache-Control", "private, no-store");
  const url = new URL(request.url ?? "/", "http://private-origin-probe");
  if (request.method !== "GET") {
    response.writeHead(405).end('{"code":"read_only"}');
    return;
  }
  if (url.pathname === "/healthz") {
    response.end('{"status":"listening"}');
    return;
  }
  const host = url.searchParams.get("host");
  if (url.pathname !== "/origin" || !sourceHosts.includes(host)) {
    response.writeHead(404).end('{"code":"unknown_original_host"}');
    return;
  }
  try {
    const proof = await probeLegacyOrigin(host, AbortSignal.timeout(18_000));
    response.end(JSON.stringify({ ...proof, sourceCommit: process.env.PROBE_SOURCE_COMMIT }));
  } catch {
    response.writeHead(502).end('{"code":"strict_original_origin_unverified"}');
  }
});
server.listen(3000, "0.0.0.0");
process.once("SIGTERM", () => server.close());
