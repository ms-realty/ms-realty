import { spawn } from "node:child_process";
import { once } from "node:events";
import fs from "node:fs";
import { createServer } from "node:net";
import { fromRoot } from "../lib/paths.mjs";

const START_TIMEOUT_MS = 30_000;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function availablePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  assert(address && typeof address === "object" && address.port > 0, "Could not reserve a local port for Next runtime smoke");
  return address.port;
}

async function waitForHealth(baseUrl, output) {
  const deadline = Date.now() + START_TIMEOUT_MS;
  let lastFailure = "no response";
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/api/health`, { signal: AbortSignal.timeout(2_000) });
      if (response.status === 200) return response;
      lastFailure = `health returned ${response.status}`;
    } catch (error) {
      lastFailure = String(error);
    }
    await wait(200);
  }
  throw new Error(`Next runtime did not become healthy: ${lastFailure}\n${output()}`);
}

async function stop(child) {
  if (child.exitCode !== null || child.signalCode) return;
  child.kill("SIGTERM");
  await Promise.race([once(child, "exit"), wait(5_000)]);
  if (child.exitCode === null && !child.signalCode) {
    child.kill("SIGKILL");
    await once(child, "exit");
  }
}

function launchReady() {
  const report = JSON.parse(fs.readFileSync(fromRoot("production", "data", "launch-readiness.json"), "utf8"));
  return report.launch_ready === true || report.status === "ready";
}

const buildIdPath = fromRoot(".next", "BUILD_ID");
assert(fs.existsSync(buildIdPath), "Run npm run next:build before npm run next:smoke");

const redirect = JSON.parse(fs.readFileSync(fromRoot("production", "data", "deployable-redirects.json"), "utf8")).redirects[0];
assert(redirect?.old_url && redirect?.target_path && redirect?.source_domain, "Expected one reviewed legacy redirect for Next runtime smoke");

const port = await availablePort();
const baseUrl = `http://127.0.0.1:${port}`;
let processOutput = "";
const child = spawn(process.execPath, [fromRoot("node_modules", "next", "dist", "bin", "next"), "start", "-H", "127.0.0.1", "-p", String(port)], {
  cwd: fromRoot(),
  env: {
    ...process.env,
    NODE_ENV: "production",
    PAYLOAD_SECRET: "next-runtime-smoke-secret-not-for-production-0123456789",
    DATABASE_URL: "postgresql://next:next@127.0.0.1:5432/ms_realty_next_smoke",
  },
  stdio: ["ignore", "pipe", "pipe"],
});

for (const stream of [child.stdout, child.stderr]) {
  stream.on("data", (chunk) => {
    processOutput = `${processOutput}${chunk}`.slice(-4_000);
  });
}

try {
  const health = await waitForHealth(baseUrl, () => processOutput);
  const healthBody = await health.json();
  const expectedReady = launchReady();
  assert(healthBody.status === "ok", "Next /api/health did not return the health contract");
  assert(healthBody.launch_ready === expectedReady, "Next /api/health disagrees with launch authority");

  const readiness = await fetch(`${baseUrl}/api/ready`);
  assert(readiness.status === (expectedReady ? 200 : 503), "Next /api/ready returned the wrong readiness status");
  assert(readiness.headers.get("cache-control") === "no-store", "Next /api/ready must not be cached");

  const home = await fetch(`${baseUrl}/bg`);
  assert(home.status === 200, "Next localized home did not render");
  assert(home.headers.get("content-type")?.startsWith("text/html"), "Next localized home must render HTML");
  // The owner published the full catalog, so the home page now proves the
  // OPPOSITE of what it used to: approved listings must actually appear.
  assert((await home.text()).includes('data-listing-id="MS-CRAWL-'), "Next localized home shows no published listing");

  const listing = await fetch(`${baseUrl}/bg/imoti/MS-CRAWL-0001`);
  assert(listing.status === 200, "Next localized listing must preserve its approved URL");
  const listingHtml = await listing.text();
  // Published by the owner: the URL now serves the real listing page and is
  // indexable at the meta level (the preview host still adds x-robots-tag
  // noindex at the edge, keyed on hostname - that guard is unchanged).
  assert(listingHtml.includes('<meta name="robots" content="index,follow">'), "Next published listing must be indexable");
  assert(listingHtml.includes('data-react-public-ui="listing"'), "Next published listing must render the full listing page");

  const search = await fetch(`${baseUrl}/bg/tarsene?q=Sandanski`);
  assert(search.status === 503, "Next production search must fail closed without a configured engine");
  assert(search.headers.get("cache-control") === "no-store", "Next unavailable search must not be cached");

  const vendor = await fetch(`${baseUrl}/vendor/ms-realty-public.js`);
  assert(vendor.status === 200, "Next vendor asset did not render");
  assert(vendor.headers.get("cache-control")?.includes("immutable"), "Next vendor asset must be immutable");

  const oldUrl = new URL(redirect.old_url);
  const legacy = await fetch(`${baseUrl}${oldUrl.pathname}${oldUrl.search}`, {
    headers: { "x-forwarded-host": redirect.source_domain },
    redirect: "manual",
  });
  assert(legacy.status === redirect.status, "Next legacy redirect returned the wrong status");
  assert(legacy.headers.get("location") === redirect.target_path, "Next legacy redirect returned the wrong target");

  console.log(
    JSON.stringify({
      kind: "next_runtime_smoke",
      status: "passed",
      launch_ready: expectedReady,
      checked: ["health", "readiness", "home_inventory_gate", "listing_inventory_gate", "search_fail_closed", "vendor", "legacy_redirect"],
    }),
  );
} finally {
  await stop(child);
}
