// Offline public-source recovery only. Never requests a URL, signs evidence or grants approval.
import {
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { gunzipSync, gzipSync } from "node:zlib";
import { extractLiveSource } from "../src/server/legacy/capture.ts";
import { sha256, sourceIdentity, verifiedPrimaryCapture } from "../src/server/legacy/manifest.ts";

const demand = (ok, message) => {
  if (!ok) throw new Error(`Origin capture rejected: ${message}`);
};
const hex = (value) => typeof value === "string" && /^[a-f0-9]{64}$/u.test(value);
export const reviewedOriginIp = "185.80.2.102";
function sourceUrl(raw) {
  const identity = sourceIdentity(raw);
  demand(new URL(raw).protocol === "https:", "strict HTTPS source");
  return identity;
}
function sourceBytes(root, artifact) {
  demand(
    typeof artifact === "string" && /^html\/[a-f0-9]{64}\.hop[0-5]\.response\.gz$/u.test(artifact),
    "bounded response artifact path",
  );
  const base = realpathSync(root),
    path = resolve(base, artifact);
  demand(path.startsWith(base + sep), "response inside source directory");
  let current = base;
  for (const segment of relative(base, path).split(sep)) {
    current = join(current, segment);
    demand(!lstatSync(current).isSymbolicLink(), "no response symlinks");
  }
  demand(realpathSync(path) === path, "exact response location");
  return gunzipSync(readFileSync(path), { maxOutputLength: 4_000_000 });
}

export function verifyOriginReceipt(receipt, sourceRoot, originIp, indexHash, now = Date.now()) {
  demand(originIp === reviewedOriginIp && hex(indexHash), "reviewed origin and pinned input index");
  sourceUrl(receipt.requestedUrl);
  demand(
    Array.isArray(receipt.sourceSpellings) &&
      receipt.sourceSpellings.length > 0 &&
      receipt.sourceSpellings.every(
        (spelling) => sourceIdentity(spelling).id === sourceIdentity(receipt.requestedUrl).id,
      ),
    "original source spellings retain the exact request identity",
  );
  demand(
    receipt.method === "GET" &&
      receipt.transport === "curl_strict_https_explicit_resolve" &&
      receipt.originIp === originIp &&
      receipt.publicDnsPathObserved === false &&
      receipt.hostAndSniPreserved === true &&
      !receipt.error,
    "real read-only direct-origin transport",
  );
  demand(
    receipt.synthetic !== true &&
      receipt.collectionClass !== "synthetic" &&
      receipt.collectionClass !== "fixture",
    "no synthetic source evidence",
  );
  demand(
    Number.isFinite(receipt.startedAtUnix) &&
      receipt.startedAtUnix > 0 &&
      receipt.startedAtUnix * 1000 <= now,
    "actual observation instant",
  );
  demand(
    Array.isArray(receipt.hops) && receipt.hops.length >= 1 && receipt.hops.length <= 6,
    "bounded observed redirect chain",
  );
  let expected = receipt.requestedUrl,
    finalBytes;
  for (const [index, hop] of receipt.hops.entries()) {
    sourceUrl(hop.url);
    demand(
      hop.artifact === `html/${sha256(receipt.requestedUrl)}.hop${index}.response.gz`,
      "exact receipt artifact identity",
    );
    demand(
      hop.url === expected &&
        hop.remoteIp === originIp &&
        hop.sslVerifyResult === 0 &&
        hop.curlExitCode === 0,
      "exact Host/SNI origin and successful certificate verification",
    );
    demand(
      Number.isFinite(hop.observedAtUnix) &&
        hop.observedAtUnix >= receipt.startedAtUnix &&
        hop.observedAtUnix * 1000 <= now,
      "observed response instant",
    );
    demand(
      Number.isInteger(hop.httpStatus) &&
        hop.httpStatus >= 100 &&
        hop.httpStatus <= 599 &&
        hex(hop.responseSha256),
      "observed HTTP result/hash",
    );
    const bytes = sourceBytes(sourceRoot, hop.artifact);
    demand(
      bytes.length === hop.bytes && sha256(bytes) === hop.responseSha256,
      "immutable response bytes",
    );
    if (index < receipt.hops.length - 1) {
      demand(
        [301, 302, 303, 307, 308].includes(hop.httpStatus) && typeof hop.redirectUrl === "string",
        "actual redirect hop",
      );
      expected = new URL(hop.redirectUrl, hop.url).href;
      sourceUrl(expected);
    } else {
      demand(!hop.redirectUrl, "complete observed final response");
      demand(
        receipt.finalUrl === hop.url &&
          receipt.status === hop.httpStatus &&
          receipt.responseSha256 === hop.responseSha256 &&
          receipt.finalArtifact === hop.artifact,
        "exact final response binding",
      );
      demand(/^text\/html\b/iu.test(hop.contentType ?? ""), "public HTML response");
      finalBytes = bytes;
    }
  }
  demand(finalBytes !== undefined, "retained final response");
  const extracted = extractLiveSource(
    new TextDecoder("utf-8", { fatal: true }).decode(finalBytes),
    receipt.finalUrl,
  );
  demand(!extracted.parked, "parking page is not recovered source");
  const artifact = `data/legacy/migration/live-source-html/${receipt.responseSha256}.html.gz`;
  const last = receipt.hops.at(-1);
  const capture = {
    url: receipt.requestedUrl,
    source_spellings: receipt.sourceSpellings,
    final_url: receipt.finalUrl,
    status: receipt.status,
    captured_at_utc: new Date(last.observedAtUnix * 1000).toISOString(),
    response_sha256: receipt.responseSha256,
    response_artifact: artifact,
    response_encoding: "utf-8",
    provenance: "live",
    transport: receipt.transport,
    publicDnsPathObserved: false,
    source_index_sha256: indexHash,
    source_receipt_sha256: sha256(JSON.stringify(receipt)),
    source_extractor: "legacy-main-v6",
    ...extracted,
    ...(receipt.status === 200 ? {} : { error: `source_http_${receipt.status}` }),
    redirects: receipt.hops
      .filter((hop) => hop.redirectUrl)
      .map((hop) => ({ from: hop.url, status: hop.httpStatus, to: hop.redirectUrl })),
    originObservation: {
      originIp,
      hostAndSniPreserved: true,
      publicDnsPathObserved: false,
      requestMethod: "GET",
      hops: receipt.hops.map((hop) => ({
        url: hop.url,
        status: hop.httpStatus,
        responseSha256: hop.responseSha256,
        remoteIp: hop.remoteIp,
        sslVerifyResult: hop.sslVerifyResult,
        observedAtUnix: hop.observedAtUnix,
      })),
    },
  };
  return { capture, bytes: finalBytes };
}

/** Preserve earlier observations, including 404s and redirects; replay is idempotent. */
export function mergeCaptureHistory(existing, incoming) {
  const captures = existing.map((capture) => ({ ...capture }));
  for (const capture of incoming) {
    const previous = captures.find(
      (old) =>
        old.url === capture.url &&
        old.captured_at_utc === capture.captured_at_utc &&
        old.response_sha256 === capture.response_sha256 &&
        old.status === capture.status &&
        old.transport === capture.transport,
    );
    if (!previous) captures.push(capture);
    else if (
      previous.source_spellings === undefined &&
      previous.source_receipt_sha256 === capture.source_receipt_sha256 &&
      capture.source_spellings
    )
      previous.source_spellings = capture.source_spellings;
  }
  return captures;
}

export function importOriginBatch({
  indexBytes,
  expectedIndexHash,
  sourceRoot,
  selectedUrls,
  originIp,
  existing,
  workspace,
  knownSourceIds = [],
  now = Date.now(),
}) {
  demand(
    hex(expectedIndexHash) && sha256(indexBytes) === expectedIndexHash,
    "exact reviewed input index hash",
  );
  demand(
    Array.isArray(selectedUrls) &&
      selectedUrls.length >= 1 &&
      selectedUrls.length <= 40 &&
      new Set(selectedUrls).size === selectedUrls.length,
    "1–40 explicit distinct source URLs",
  );
  const index = JSON.parse(indexBytes.toString("utf8"));
  demand(
    index.requestMethod === "GET" &&
      Number.isInteger(index.workers) &&
      index.workers >= 1 &&
      index.workers <= 2 &&
      Array.isArray(index.captures),
    "bounded capture index",
  );
  const validated = selectedUrls.map((url) => {
    sourceUrl(url);
    const matches = index.captures.filter((receipt) => receipt.requestedUrl === url);
    demand(matches.length === 1, "one exact receipt per selected URL");
    return verifyOriginReceipt(matches[0], sourceRoot, originIp, expectedIndexHash, now);
  });
  // Every receipt is verified before this batch can write a public source artifact.
  const destinationRoot = realpathSync(workspace);
  for (const { capture, bytes } of validated) {
    const path = resolve(destinationRoot, capture.response_artifact);
    demand(path.startsWith(destinationRoot + sep), "workspace source archive");
    let directory = destinationRoot;
    for (const segment of relative(destinationRoot, dirname(path)).split(sep)) {
      directory = join(directory, segment);
      try {
        demand(
          lstatSync(directory).isDirectory() && !lstatSync(directory).isSymbolicLink(),
          "no archive directory symlinks",
        );
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
        mkdirSync(directory);
      }
    }
    try {
      demand(!lstatSync(path).isSymbolicLink(), "no archive file symlinks");
      demand(
        sha256(gunzipSync(readFileSync(path))) === capture.response_sha256,
        "existing immutable archive hash",
      );
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      writeFileSync(path, gzipSync(bytes));
    }
  }
  const captures = mergeCaptureHistory(
    existing.captures ?? [],
    validated.map((item) => item.capture),
  );
  const discovered = [...(existing.discoveredOutsideFrozenUrls ?? [])];
  for (const { capture } of validated)
    for (const link of capture.links ?? []) {
      if (!knownSourceIds.includes(link.id) && !discovered.some((old) => old.id === link.id))
        discovered.push(link);
    }
  return {
    ...existing,
    schemaVersion: 1,
    requestMethod: "GET",
    status: "partial_delta_not_reconciled",
    independentCheckerBaseline: false,
    completeSiteDelta: false,
    productionAllowed: false,
    requestedSources: captures.length,
    capturedSources: captures.filter((capture) => !capture.error).length,
    verifiedPrimarySources: captures.filter(verifiedPrimaryCapture).length,
    parkedSources: captures.filter((capture) => capture.parked).length,
    captures,
    discoveredOutsideFrozenUrls: discovered,
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({
    options: {
      index: { type: "string" },
      "index-sha256": { type: "string" },
      "origin-ip": { type: "string" },
      input: { type: "string" },
      urls: { type: "string", multiple: true },
      output: { type: "string", default: "data/legacy/migration/live-delta.json" },
    },
  });
  demand(
    values.index && values["index-sha256"] && values["origin-ip"],
    "index, reviewed hash and explicit origin pin",
  );
  demand(values.output === "data/legacy/migration/live-delta.json", "fixed public proposal output");
  const indexPath = realpathSync(values.index),
    workspace = realpathSync(process.cwd());
  const selectedUrls =
    values.urls ?? (values.input ? JSON.parse(readFileSync(values.input, "utf8")) : []);
  const outputPath = join(workspace, values.output),
    existing = JSON.parse(readFileSync(outputPath, "utf8"));
  const knownSourceIds = JSON.parse(
    readFileSync("data/legacy/url-decisions.json", "utf8"),
  ).decisions.map((row) => sourceIdentity(row.source_url).id);
  const output = importOriginBatch({
    indexBytes: readFileSync(indexPath),
    expectedIndexHash: values["index-sha256"],
    sourceRoot: dirname(indexPath),
    selectedUrls,
    originIp: values["origin-ip"],
    existing,
    workspace,
    knownSourceIds,
  });
  const temporary = `${outputPath}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(output, null, 2)}\n`);
  renameSync(temporary, outputPath);
  console.log(
    JSON.stringify({
      imported: selectedUrls.length,
      retainedObservations: output.captures.length,
      completeSiteDelta: false,
      publicDnsPathObserved: false,
    }),
  );
}
