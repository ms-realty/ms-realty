// Disposable load harness only. No retries, response cache, body buffering or deployed routing.
import assert from "node:assert/strict";
import { Agent, createServer, type OutgoingHttpHeaders, request } from "node:http";

function forwardingHeaders(headers: OutgoingHttpHeaders): OutgoingHttpHeaders {
  const copy = { ...headers };
  const connection = String(copy.connection ?? "").split(",");
  for (const name of [
    "connection",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailer",
    "transfer-encoding",
    "upgrade",
    ...connection.map((token) => token.trim().toLowerCase()),
  ])
    delete copy[name];
  return copy;
}

export function localLoadBalancer(ports: readonly number[]) {
  assert(ports.length === 2 && new Set(ports).size === 2);
  assert(ports.every((port) => Number.isInteger(port) && port > 0 && port <= 65535));
  const agents = ports.map(() => new Agent({ keepAlive: true, maxSockets: 128 }));
  let cursor = 0;
  const server = createServer((incoming, outgoing) => {
    const index = cursor++ % ports.length;
    const upstream = request(
      {
        hostname: "127.0.0.1",
        port: ports[index],
        method: incoming.method,
        path: incoming.url,
        // Preserve the caller's Host and Origin: the application's host/CSRF checks still run.
        headers: forwardingHeaders(incoming.headers),
        agent: agents[index],
      },
      (response) => {
        outgoing.writeHead(response.statusCode ?? 502, forwardingHeaders(response.headers));
        response.once("error", () => outgoing.destroy());
        response.once("aborted", () => outgoing.destroy());
        response.pipe(outgoing);
      },
    );
    upstream.setTimeout(30_000, () => upstream.destroy(new Error("Load backend timeout")));
    upstream.once("error", () => {
      if (outgoing.destroyed) return;
      if (outgoing.headersSent) outgoing.destroy();
      else {
        outgoing.writeHead(502, { "Content-Type": "text/plain", "Cache-Control": "no-store" });
        outgoing.end("Local load backend unavailable");
      }
    });
    incoming.once("aborted", () => upstream.destroy());
    incoming.once("error", () => upstream.destroy());
    outgoing.once("close", () => {
      if (!outgoing.writableFinished) upstream.destroy();
    });
    incoming.pipe(upstream);
  });
  async function close() {
    for (const agent of agents) agent.destroy();
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
      server.closeAllConnections();
    });
  }
  return { server, close };
}
