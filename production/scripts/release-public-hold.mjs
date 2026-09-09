import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { HOLD_WORKER, PUBLIC_HOLD_PATTERNS, SERVICE_ASSET_PATTERNS } from "./restore-public-hold.mjs";

export const PRODUCTION_WORKER = "ms-realty";

// The mirror of restore-public-hold.mjs. Restoring the hold points eighteen
// public patterns at the holding Worker; releasing it points the same patterns
// back at the production Worker, in one PUT per route rather than a delete and
// a later create, so no public URL is ever unrouted in between. A route the
// hold deleted rather than reassigned is created here instead.
export function publicReleaseRoutePlan(routes) {
  return [...SERVICE_ASSET_PATTERNS, ...PUBLIC_HOLD_PATTERNS].map((pattern) => {
    const matches = routes.filter((route) => route.pattern === pattern);
    if (matches.length > 1) throw new Error(`Expected at most one existing route: ${pattern}`);
    const route = matches[0];
    if (route && ![PRODUCTION_WORKER, HOLD_WORKER].includes(route.script)) {
      throw new Error(`Unexpected owner for ${pattern}`);
    }
    return { id: route?.id ?? null, pattern, previous: route?.script ?? null, script: PRODUCTION_WORKER };
  });
}

export async function releasePublicHold() {
  if (process.env.MS_REALTY_PUBLIC_CONSTRUCTION_HOLD === "true") {
    throw new Error("The repository construction hold must be cleared first");
  }
  const zone = process.env.ZONE_ID;
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!/^[a-f0-9]{32}$/i.test(zone || "") || !token) {
    throw new Error("Cloudflare zone and deployment authority are required");
  }

  // Never hand the zone to a Worker that cannot serve it. On its own
  // operational origin the production Worker must already render a localized
  // page and answer search with real inventory — a holding page can do the
  // first and an empty catalogue can pass the second, so both are required.
  const origin = "https://ms-realty.ms-realty-bg.workers.dev";
  const home = await fetch(`${origin}/bg`, { signal: AbortSignal.timeout(20000) });
  const html = await home.text();
  if (home.status !== 200 || !html.includes('lang="bg"')) {
    throw new Error("The production Worker does not render the Bulgarian home page");
  }
  const search = await fetch(`${origin}/api/search?locale=bg&q=Sandanski`, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(20000),
  });
  const matches = Number((await search.json())?.search?.total_matches);
  if (search.status !== 200 || !Number.isFinite(matches) || matches <= 0) {
    throw new Error("The production Worker does not answer search with inventory");
  }

  const endpoint = `https://api.cloudflare.com/client/v4/zones/${zone}/workers/routes`;
  const api = async (url, options = {}) => {
    const response = await fetch(url, {
      ...options,
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      signal: AbortSignal.timeout(20000),
    });
    const data = await response.json();
    if (!response.ok || data.success !== true) throw new Error(`Cloudflare route request failed (${response.status})`);
    return data.result;
  };

  const before = await api(endpoint);
  const plan = publicReleaseRoutePlan(before);
  fs.writeFileSync("public-release-before.json", JSON.stringify(before, null, 2));
  for (const route of plan) {
    if (route.previous !== route.script) {
      await api(route.id ? `${endpoint}/${route.id}` : endpoint, {
        method: route.id ? "PUT" : "POST",
        body: JSON.stringify({ pattern: route.pattern, script: route.script }),
      });
    }
    console.log(`${route.script}\t${route.pattern}`);
  }

  const after = await api(endpoint);
  if (publicReleaseRoutePlan(after).some((route) => route.previous !== route.script)) {
    throw new Error("Released route readback disagrees");
  }
  const targetPatterns = new Set(plan.map((route) => route.pattern));
  for (const route of before.filter((candidate) => !targetPatterns.has(candidate.pattern))) {
    const current = after.find((candidate) => candidate.id === route.id);
    if (!current || current.pattern !== route.pattern || current.script !== route.script) {
      throw new Error("An unrelated route changed during release");
    }
  }
  fs.writeFileSync("public-release-after.json", JSON.stringify(after, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await releasePublicHold();
