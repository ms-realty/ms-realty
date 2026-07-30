import { execFileSync } from "node:child_process";

// Dependency audit gate.
//
// `npm audit` alone is unusable as a CI gate here: some advisories sit inside a
// dependency's own bundled tree and npm's only "fix" is a major downgrade. A
// blanket `--audit-level=critical` would hide real findings instead, so this
// fails on every high/critical advisory except the ones explicitly accepted
// below — each with a reason and a review date, so an exception cannot quietly
// become permanent.

const ACCEPTED = [
  {
    advisory: "GHSA-f88m-g3jw-g9cj",
    packages: ["sharp", "next"],
    reason:
      "libvips CVEs reached through Next's own bundled sharp. npm's only offered fix is next@14 (major downgrade). " +
      "Exposure is limited: the image optimizer only processes images from the two allow-listed legacy hosts " +
      "(next.config.mjs remotePatterns), never visitor uploads.",
    reviewBy: "2026-10-01",
  },
  {
    advisory: "GHSA-v2hh-gcrm-f6hx",
    packages: ["fast-uri"],
    reason: "Transitive through the Payload/ajv toolchain; not reachable from any request path this app serves.",
    reviewBy: "2026-10-01",
  },
];

const today = new Date().toISOString().slice(0, 10);
const acceptedByAdvisory = new Map(ACCEPTED.map((entry) => [entry.advisory, entry]));

let audit;
try {
  audit = JSON.parse(execFileSync("npm", ["audit", "--omit=dev", "--json"], { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 }));
} catch (error) {
  // npm audit exits non-zero when it finds anything; the JSON is still on stdout.
  if (!error.stdout) throw error;
  audit = JSON.parse(error.stdout);
}

const unaccepted = [];
const stale = [];

for (const [name, vulnerability] of Object.entries(audit.vulnerabilities || {})) {
  if (!["high", "critical"].includes(vulnerability.severity)) continue;
  const advisories = (vulnerability.via || [])
    .filter((via) => typeof via === "object" && via.url)
    .map((via) => via.url.split("/").pop());
  // A package flagged only because a dependency of it is vulnerable carries no
  // advisory of its own; it is covered by whatever accepted entry names it.
  const covered = advisories.length
    ? advisories.every((advisory) => acceptedByAdvisory.has(advisory))
    : ACCEPTED.some((entry) => entry.packages.includes(name));
  if (!covered) {
    unaccepted.push({ name, severity: vulnerability.severity, advisories });
    continue;
  }
  for (const advisory of advisories) {
    const entry = acceptedByAdvisory.get(advisory);
    if (entry && entry.reviewBy < today) stale.push({ name, ...entry });
  }
}

for (const entry of unaccepted) {
  console.error(`UNACCEPTED ${entry.severity}: ${entry.name} ${entry.advisories.join(", ")}`);
}
for (const entry of stale) {
  console.error(`EXPIRED EXCEPTION: ${entry.advisory} (${entry.packages.join(", ")}) was due for review by ${entry.reviewBy}`);
}

if (unaccepted.length || stale.length) {
  console.error("\nAdd a dated exception in production/scripts/audit-dependencies.mjs only with an explicit reason.");
  process.exit(1);
}

const metadata = audit.metadata?.vulnerabilities || {};
console.log(
  `Dependency audit passed: ${ACCEPTED.length} documented exception(s); ` +
    `${metadata.critical || 0} critical, ${metadata.high || 0} high, ${metadata.moderate || 0} moderate, ${metadata.low || 0} low reported.`,
);
