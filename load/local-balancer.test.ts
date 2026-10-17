import { once } from "node:events";
import { createServer, request, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { localLoadBalancer } from "./local-balancer";

const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close();
});
async function listen(server: Server) {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  cleanup.push(
    () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
        server.closeAllConnections();
      }),
  );
  return (server.address() as AddressInfo).port;
}
async function balance(ports: number[]) {
  const balancer = localLoadBalancer(ports);
  const port = await listen(balancer.server);
  cleanup.push(balancer.close);
  return `http://127.0.0.1:${port}`;
}

describe("local two-process load transport", () => {
  it("distributes requests while preserving host, origin, body and separate cookies", async () => {
    const ports = await Promise.all(
      ["first", "second"].map((name) =>
        listen(
          createServer(async (req, res) => {
            let body = "";
            for await (const chunk of req) body += chunk;
            res.writeHead(201, { "Set-Cookie": ["one=1; HttpOnly", "two=2; SameSite=Lax"] });
            res.end(
              JSON.stringify({ name, host: req.headers.host, origin: req.headers.origin, body }),
            );
          }),
        ),
      ),
    );
    const url = await balance(ports);
    const names = [];
    for (let i = 0; i < 4; i++) {
      // Native request preserves a custom Host; fetch may replace it with the URL's host.
      const response = await new Promise<{ status: number; cookies: string[]; body: string }>(
        (resolve, reject) => {
          const call = request(
            url,
            {
              method: "POST",
              headers: { Host: "app.localhost:3185", Origin: "http://app.localhost:3185" },
            },
            async (reply) => {
              try {
                let body = "";
                for await (const chunk of reply) body += chunk;
                resolve({
                  status: reply.statusCode ?? 0,
                  cookies: reply.headers["set-cookie"] ?? [],
                  body,
                });
              } catch (error) {
                reject(error);
              }
            },
          );
          call.once("error", reject);
          call.end("unchanged=command");
        },
      );
      expect(response.status).toBe(201);
      expect(response.cookies).toEqual(["one=1; HttpOnly", "two=2; SameSite=Lax"]);
      const record = JSON.parse(response.body);
      expect(record).toMatchObject({
        host: "app.localhost:3185",
        origin: "http://app.localhost:3185",
        body: "unchanged=command",
      });
      names.push(record.name);
    }
    expect(names).toEqual(["first", "second", "first", "second"]);
  });

  it("does not retry a failed command against the other process", async () => {
    let received = 0;
    const ports = await Promise.all([
      listen(createServer((req) => req.socket.destroy())),
      listen(
        createServer((_req, res) => {
          received++;
          res.end("ok");
        }),
      ),
    ]);
    const url = await balance(ports);
    expect((await fetch(url, { method: "POST", body: "command" })).status).toBe(502);
    expect(received).toBe(0);
    expect(await (await fetch(url)).text()).toBe("ok");
  });

  it("streams the first bytes before the backend completes", async () => {
    let release: (() => void) | undefined;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    const ports = await Promise.all(
      [0, 1].map(() =>
        listen(
          createServer(async (_req, res) => {
            res.write("first");
            await pending;
            res.end("last");
          }),
        ),
      ),
    );
    const url = await balance(ports);
    try {
      const reader = (await fetch(url)).body?.getReader();
      expect(reader).toBeDefined();
      expect(new TextDecoder().decode((await reader?.read())?.value)).toBe("first");
      release?.();
      expect(new TextDecoder().decode((await reader?.read())?.value)).toBe("last");
      expect((await reader?.read())?.done).toBe(true);
    } finally {
      release?.();
    }
  });

  it("closes the upstream response when the caller aborts", async () => {
    let closed: (() => void) | undefined;
    const backendClosed = new Promise<void>((resolve) => {
      closed = resolve;
    });
    const ports = await Promise.all(
      [0, 1].map(() =>
        listen(
          createServer((_req, res) => {
            res.once("close", () => closed?.());
            res.write("first");
          }),
        ),
      ),
    );
    const url = await balance(ports);
    const controller = new AbortController();
    const reply = await fetch(url, { signal: controller.signal });
    await reply.body?.getReader().read();
    controller.abort();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        backendClosed,
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error("Backend remained open after abort")), 2000);
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  });
});
