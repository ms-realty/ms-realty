import fs from "node:fs";
import { pathToFileURL } from "node:url";

export const HOLD_WORKER = "ms-realty-under-construction";
export const PUBLIC_HOLD_PATTERNS = ["makler-realty.com", "www.makler-realty.com"].flatMap((host) =>
  ["", "*", ...["bg", "en", "de", "nl", "ru", "el", "he"].map((locale) => `${locale}*`)].map((suffix) => `${host}/${suffix}`),
);
export const SERVICE_ASSET_PATTERNS = ["makler-realty.com/vendor/*", "www.makler-realty.com/vendor/*"];

export function publicHoldRoutePlan(routes) {
  return [...SERVICE_ASSET_PATTERNS, ...PUBLIC_HOLD_PATTERNS].map((pattern) => {
    const asset = SERVICE_ASSET_PATTERNS.includes(pattern);
    const script = asset ? "ms-realty" : HOLD_WORKER;
    const matches = routes.filter((route) => route.pattern === pattern);
    if (asset && matches.length === 0) return { id: null, pattern, previous: null, script };
    if (matches.length !== 1 || !matches[0].id) throw new Error(`Expected one existing route: ${pattern}`);
    const route = matches[0];
    if (!["ms-realty", HOLD_WORKER].includes(route.script)) throw new Error(`Unexpected owner for ${pattern}`);
    return { id: route.id, pattern, previous: route.script, script };
  });
}

export async function restorePublicHold() {
  if (process.env.MS_REALTY_PUBLIC_CONSTRUCTION_HOLD !== "true") throw new Error("The repository construction hold must be enabled first");
  const zone = process.env.ZONE_ID;
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!/^[a-f0-9]{32}$/i.test(zone || "") || !token) throw new Error("Cloudflare zone and deployment authority are required");
  const preview = await fetch("https://ms-realty-under-construction.ms-realty-bg.workers.dev/", { signal: AbortSignal.timeout(15000) });
  if (preview.status !== 503 || !preview.headers.get("x-robots-tag")?.includes("noindex")) throw new Error("The existing holding Worker is not ready");
  const endpoint = `https://api.cloudflare.com/client/v4/zones/${zone}/workers/routes`;
  const api = async (url, options = {}) => {
    const response = await fetch(url, { ...options, headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, signal: AbortSignal.timeout(20000) });
    const data = await response.json();
    if (!response.ok || data.success !== true) throw new Error(`Cloudflare route request failed (${response.status})`);
    return data.result;
  };
  const before = await api(endpoint);
  const plan = publicHoldRoutePlan(before);
  fs.writeFileSync("public-hold-before.json", JSON.stringify(before, null, 2));
  for (const route of plan) {
    if (route.previous !== route.script) await api(route.id ? `${endpoint}/${route.id}` : endpoint, { method: route.id ? "PUT" : "POST", body: JSON.stringify({ pattern: route.pattern, script: route.script }) });
    console.log(`${route.script}\t${route.pattern}`);
  }
  const after = await api(endpoint);
  if (publicHoldRoutePlan(after).some((route) => route.previous !== route.script)) throw new Error("Holding route readback disagrees");
  const targetIds = new Set(plan.map((route) => route.id));
  for (const route of before.filter((route) => !targetIds.has(route.id))) {
    const current = after.find((candidate) => candidate.id === route.id);
    if (!current || current.pattern !== route.pattern || current.script !== route.script) throw new Error("An unrelated route changed during restoration");
  }
  fs.writeFileSync("public-hold-after.json", JSON.stringify(after, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await restorePublicHold();
