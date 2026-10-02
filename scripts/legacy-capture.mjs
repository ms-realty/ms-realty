// Read-only live delta capture. Only GET, allowed legacy hosts, bounded bodies and redirects.
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { gzipSync } from "node:zlib";
import { extractLiveSource } from "../src/server/legacy/capture.ts";
import { sha256, sourceIdentity, verifiedPrimaryCapture } from "../src/server/legacy/manifest.ts";

const { values } = parseArgs({
  options: {
    urls: { type: "string", multiple: true },
    output: { type: "string", default: "data/legacy/migration/live-delta.json" },
    append: { type: "boolean", default: false },
    input: { type: "string" },
  },
});
const requestedUrls =
  values.urls ?? (values.input ? JSON.parse(readFileSync(values.input, "utf8")) : []);
if (!requestedUrls.length || requestedUrls.length > 40)
  throw new Error(
    "Supply 1–40 explicit public sources with --urls or a reviewed input batch; no live writes.",
  );
const known = new Set(
  JSON.parse(readFileSync("data/legacy/url-decisions.json", "utf8")).decisions.map(
    (row) => sourceIdentity(row.source_url).id,
  ),
);
const captures = values.append
  ? JSON.parse(readFileSync(values.output, "utf8")).captures.filter(
      (capture) =>
        !requestedUrls.some(
          (requested) => sourceIdentity(requested).id === sourceIdentity(capture.url).id,
        ),
    )
  : [];
for (const requested of requestedUrls) {
  sourceIdentity(requested);
  const capturedAt = new Date().toISOString();
  let current = requested,
    observedStatus = null;
  try {
    const response = JSON.parse(
      execFileSync("python3", ["scripts/legacy-fetch.py", new URL(requested).href], {
        encoding: "utf8",
        timeout: 100000,
        maxBuffer: 5_000_000,
      }),
    );
    current = response.finalUrl;
    observedStatus = response.status;
    sourceIdentity(current);
    if (response.status !== 200) throw new Error(`Source status ${response.status}`);
    if (!/^text\/html\b/iu.test(response.contentType ?? ""))
      throw new Error("non_html_source_resource_requires_media_evidence");
    const bytes = Buffer.from(response.bodyBase64, "base64");
    const html = new TextDecoder(response.charset, { fatal: true }).decode(bytes);
    const extracted = extractLiveSource(html, current);
    const responseHash = sha256(bytes);
    const artifact = `data/legacy/migration/live-source-html/${responseHash}.html.gz`;
    if (html.trim() && !extracted.parked) {
      mkdirSync("data/legacy/migration/live-source-html", { recursive: true });
      writeFileSync(artifact, gzipSync(bytes));
    }
    captures.push({
      url: requested,
      final_url: current,
      status: response.status,
      captured_at_utc: capturedAt,
      response_sha256: responseHash,
      response_artifact: html.trim() && !extracted.parked ? artifact : null,
      provenance: "live",
      extractor: "legacy-main-v5",
      transport: "python_urllib_public_get",
      response_encoding: response.charset,
      redirects: response.redirects,
      ...extracted,
    });
  } catch (error) {
    captures.push({
      url: requested,
      final_url: current,
      captured_at_utc: capturedAt,
      status: observedStatus,
      error: error.stdout ? JSON.parse(String(error.stdout)).error : String(error.message),
    });
  }
  console.log(
    JSON.stringify({
      completed: captures.length,
      batchRequested: requestedUrls.length,
      lastSource: requested,
      status: captures.at(-1)?.status,
    }),
  );
}
const discovered = captures
  .filter((capture) => !capture.parked && capture.response_artifact && capture.title)
  .flatMap((capture) => capture.links ?? [])
  .filter(
    (link) =>
      !known.has(link.id) &&
      !/^\/wp-(?:content|includes)\//u.test(sourceIdentity(link.url).path) &&
      !/\.(?:jpe?g|png|webp|gif|svg|pdf|xml|css|js)$/iu.test(sourceIdentity(link.url).path),
  );
const output = {
  schemaVersion: 1,
  requestMethod: "GET",
  authority: "2026-10-01 owner zero-loss migration",
  status: "partial_delta_not_reconciled",
  independentCheckerBaseline: false,
  requestedSources: captures.length,
  capturedSources: captures.filter((capture) => !capture.error).length,
  verifiedPrimarySources: captures.filter(verifiedPrimaryCapture).length,
  parkedSources: captures.filter((capture) => capture.parked).length,
  completeSiteDelta: false,
  captures,
  discoveredOutsideFrozenUrls: discovered.filter(
    (link, index) => discovered.findIndex((other) => other.id === link.id) === index,
  ),
};
mkdirSync("data/legacy/migration", { recursive: true });
writeFileSync(values.output, `${JSON.stringify(output, null, 2)}\n`);
console.log(
  JSON.stringify({
    requested: output.requestedSources,
    captured: output.capturedSources,
    parked: output.parkedSources,
    newUrlCandidates: output.discoveredOutsideFrozenUrls.length,
    completeSiteDelta: false,
  }),
);
