import http from "node:http";
import { createHttpApp } from "./http.mjs";

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

export function createNodeServer(app = createHttpApp()) {
  return http.createServer(async (req, res) => {
    const response = await app({
      method: req.method,
      url: req.url,
      headers: req.headers,
      body: await readBody(req),
    });
    res.writeHead(response.status, response.headers);
    res.end(JSON.stringify(response.body));
  });
}

export function listen(server, port = 0, host = "127.0.0.1") {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => resolve(server.address()));
  });
}

export function close(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

export async function jsonFetch(baseUrl, path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...(options.headers || {}),
    },
  });
  return {
    status: response.status,
    body: await response.json(),
  };
}

export async function textFetch(baseUrl, path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, options);
  return {
    status: response.status,
    body: await response.text(),
  };
}

export function assertServerSmoke(smoke) {
  if (smoke.listing.status !== 200 || smoke.listing.body.dir !== "rtl") throw new Error("Server must serve Hebrew listing");
  if (smoke.search.status !== 200 || smoke.search.body.cards.length === 0) throw new Error("Server must serve search results");
  if (smoke.lead.status !== 201 || smoke.lead.body.admin_locale !== "en") throw new Error("Server must accept lead");
  if (smoke.badLead.status !== 400) throw new Error("Server must reject unknown buyer listing");
  if (smoke.sitemap.status !== 200 || smoke.sitemap.body.includes("/fr/")) throw new Error("Server must serve approved sitemap");
  if (smoke.robots.status !== 200 || !smoke.robots.body.includes("Sitemap:")) throw new Error("Server must serve robots");
  if (smoke.admin.status !== 200 || smoke.admin.body.workspace.locale !== "ru") throw new Error("Server must serve RU admin leads");
  if (smoke.adminUnauthorized.status !== 401) throw new Error("Server must reject unauthenticated admin leads");
  if (smoke.reply.status !== 201 || smoke.reply.body.status !== "queued_for_manual_send") {
    throw new Error("Server must queue broker-approved replies");
  }
  if (smoke.replyUnauthorized.status !== 401) throw new Error("Server must reject unauthenticated replies");
  return true;
}
