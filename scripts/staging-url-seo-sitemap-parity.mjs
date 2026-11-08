// R07: bounded observation only. No provider mutations, runtime preparation or route export.
import { constants } from "node:fs";
import { lstat, mkdir, open, readdir, readFile, realpath, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  encodeMember,
  fileRefSchema,
  jsonBytes,
  limits,
  observedIdentitySchema,
  origins,
  parseJson,
  producer,
  requestPlan,
  safePath,
  sha256,
  validateExpectations,
  validatePlan,
  verifyCapture,
} from "../src/release/staging-url-seo-sitemap-parity.mjs";
import { validateExactCheckout } from "./staging-http-qualification.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const save = (file, bytes) => writeFile(file, bytes, { flag: "wx", mode: 0o600 });
const requireValue = (condition, code) => {
  if (!condition) throw new Error(code);
};
const ref = (path, bytes) => ({ path, sha256: sha256(bytes), bytes: bytes.length });

/** Symlinks, devices, growing files and oversized reads are not accepted as receipts. */
async function boundedFile(directory, name, maximum) {
  const base = await realpath(directory),
    full = resolve(base, name);
  requireValue(full.startsWith(`${base}/`) && (await realpath(full)) === full, "unsafe_file_path");
  requireValue((await lstat(full)).isFile(), "not_regular_file");
  const handle = await open(full, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const before = await handle.stat();
    requireValue(before.size <= maximum, "file_size_limit");
    const buffer = Buffer.alloc(before.size + 1);
    let total = 0;
    while (total < buffer.length) {
      const { bytesRead } = await handle.read(buffer, total, buffer.length - total, total);
      if (!bytesRead) break;
      total += bytesRead;
    }
    const after = await handle.stat();
    requireValue(
      total === before.size && after.size === before.size && after.mtimeMs === before.mtimeMs,
      "file_changed_during_read",
    );
    return buffer.subarray(0, total);
  } finally {
    await handle.close();
  }
}

export async function loadParser(plan, sourceDir = root) {
  const lock = await boundedFile(sourceDir, "package-lock.json", limits.jsonBytes);
  requireValue(sha256(lock) === plan.parser.lockfileDigest, "parser_lock_mismatch");
  const locked = parseJson(lock).packages?.["node_modules/jsdom"]?.version;
  const require = createRequire(resolve(sourceDir, "package.json"));
  const installed = JSON.parse(await readFile(require.resolve("jsdom/package.json"), "utf8"));
  requireValue(
    installed.version === locked && locked === plan.parser.version,
    "parser_version_mismatch",
  );
  const { JSDOM } = await import(pathToFileURL(require.resolve("jsdom")).href);
  return JSDOM;
}

export function classifyLocation(value, origin) {
  if (!value) return { kind: null, value: null };
  try {
    const url = new URL(value, origin);
    if (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      /^[a-z0-9-]+\.cloudflareaccess\.com$/.test(url.hostname) &&
      url.pathname.startsWith("/cdn-cgi/access/login/")
    )
      return { kind: "access_login", value: null };
    if (url.origin !== origin) return { kind: "off_origin", value: null };
    const originalPath = value.startsWith("/") ? value : value.slice(origin.length);
    safePath(originalPath);
    requireValue(!url.username && !url.password && !url.hash, "unsafe_location");
    return { kind: "same_origin", value: url.href };
  } catch {
    return { kind: "unsafe", value: null };
  }
}

function redactBody(body, secrets) {
  // Preserve unchanged bytes exactly. Redacted bytes carry no full-response hash.
  let value = body.toString("utf8"),
    changed = false;
  for (const secret of secrets.filter(Boolean)) {
    for (const form of new Set([secret, encodeURIComponent(secret)])) {
      if (value.includes(form)) {
        changed = true;
        value = value.split(form).join("[REDACTED]");
      }
    }
  }
  value = value.replace(
    /(?:access_token|id_token|refresh_token|CF_Authorization|CF-Access-Client-Secret|authorization|cookie)\s*[=:]\s*[^\s<>"'&]+/gi,
    () => {
      changed = true;
      return "[REDACTED]";
    },
  );
  return { body: changed ? Buffer.from(value).subarray(0, limits.htmlBytes) : body, changed };
}

function headersEvidence(headers, origin, secrets) {
  let size = 0;
  for (const [key, value] of headers) size += Buffer.byteLength(key) + Buffer.byteLength(value);
  requireValue(size <= limits.headerBytes, "header_size_limit");
  const location = classifyLocation(headers.get("location"), origin);
  if (
    location.value &&
    secrets.some(
      (s) => location.value.includes(s) || location.value.includes(encodeURIComponent(s)),
    )
  ) {
    location.kind = "unsafe";
    location.value = null;
  }
  const result = {};
  for (const key of ["content-type", "content-length", "content-encoding", "x-robots-tag"]) {
    const value = headers.get(key);
    if (value !== null) {
      requireValue(value.length <= 1024, "header_value_limit");
      // Unknown response headers (Set-Cookie, Authorization, Access challenge, etc.) never persist.
      result[key] = redactBody(Buffer.from(value), secrets).body.toString("utf8");
    }
  }
  if (location.value) result.location = location.value;
  return { headers: result, locationKind: location.kind };
}

function timeout(ms, controller) {
  let timer;
  const promise = new Promise((_, reject) => {
    timer = setTimeout(
      () => {
        controller.abort();
        reject(new Error("request_timeout"));
      },
      Math.max(1, ms),
    );
  });
  return { promise, clear: () => clearTimeout(timer) };
}

async function bodyBounded(response, maximum, account, family, signal) {
  const parts = [];
  let receivedBytes = 0,
    retained = 0,
    failure = null;
  const reader = response.body?.getReader();
  if (!reader) return { body: Buffer.alloc(0), receivedBytes, failure };
  const abort = () => {
    void reader.cancel().catch(() => {});
  };
  signal.addEventListener("abort", abort, { once: true });
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) {
        if (signal.aborted) failure = "request_timeout";
        break;
      }
      const chunk = Buffer.from(value);
      receivedBytes += chunk.length;
      const familyLimit = family === "sitemap" ? limits.sitemapTotalBytes : limits.htmlTotalBytes;
      const available = Math.max(
        0,
        Math.min(
          maximum - retained,
          limits.captureBytes - account.total,
          familyLimit - account[family],
        ),
      );
      const kept = chunk.subarray(0, available);
      parts.push(kept);
      retained += kept.length;
      account.total += kept.length;
      account[family] += kept.length;
      if (kept.length !== chunk.length) {
        failure = "body_or_corpus_size_limit";
        break;
      }
      if (signal.aborted) {
        failure = "request_timeout";
        break;
      }
    }
  } catch {
    failure = signal.aborted ? "request_timeout" : "truncated_body";
  } finally {
    signal.removeEventListener("abort", abort);
    void reader.cancel().catch(() => {});
  }
  const body = Buffer.concat(parts);
  const contentLength = response.headers.get("content-length");
  // Fetch decompresses bodies. A compressed transfer length cannot validate decoded bytes.
  if (
    !failure &&
    contentLength !== null &&
    !response.headers.get("content-encoding") &&
    (!/^\d+$/.test(contentLength) || Number(contentLength) !== receivedBytes)
  )
    failure = "truncated_body";
  return { body, receivedBytes, failure };
}

/** Injection is a test boundary, never a way to label fixtures as live observations. */
export async function collectCapture({
  planBytes,
  expectationBytes,
  inputFiles,
  observedBytes,
  outputDir,
  sourceDir = root,
  credentials = {},
  transport,
  testTiming,
}) {
  await mkdir(outputDir, { mode: 0o700 }); // Refuse an existing directory; never retry over evidence.
  const journal = await open(resolve(outputDir, "failure-events.jsonl"), "wx", 0o600);
  const failures = [],
    members = [],
    files = new Map();
  let shard = null,
    shardNumber = -1,
    shardSize = 0,
    shardPath = null;
  const evidenceClass = transport ? "test" : "live";
  const fetcher = transport ?? fetch;
  const startedAt = new Date().toISOString();
  let p, JSDOM;
  const addFile = async (name, bytes) => {
    const full = resolve(outputDir, name);
    await mkdir(dirname(full), { recursive: true, mode: 0o700 });
    await save(full, bytes);
    files.set(name, bytes);
  };
  const appendFailure = async (entry) => {
    failures.push(entry);
    await journal.write(jsonBytes(entry));
    await journal.sync();
  };
  const writeMember = async ({ metadata, body }) => {
    const bytes = encodeMember(metadata, body);
    if (!shard || shardSize + bytes.length > limits.shardBytes) {
      if (shard) {
        await shard.sync();
        await shard.close();
      }
      shardNumber++;
      shardSize = 0;
      shardPath = `raw-${String(shardNumber).padStart(4, "0")}.bin`;
      shard = await open(resolve(outputDir, shardPath), "wx", 0o600);
    }
    await shard.writeFile(bytes);
    await shard.sync();
    members.push({
      id: metadata.id,
      shard: shardPath,
      offset: shardSize,
      length: bytes.length,
      sha256: sha256(bytes),
    });
    shardSize += bytes.length;
    if (metadata.failure) await appendFailure({ id: metadata.id, code: metadata.failure });
  };
  try {
    p = validatePlan(parseJson(planBytes));
    validateExpectations(parseJson(expectationBytes), p, sha256(planBytes));
    requireValue(
      p.sourcePins.application === p.expectedContext.sourceCommit,
      "source_pin_mismatch",
    );
    requireValue(inputFiles instanceof Map && inputFiles.size === p.files.length, "input_file_set");
    let inputTotal = 0;
    for (const f of p.files) {
      const b = inputFiles.get(f.path);
      requireValue(
        Buffer.isBuffer(b) && b.length === f.bytes && sha256(b) === f.sha256,
        "input_hash_mismatch",
      );
      inputTotal += b.length;
    }
    requireValue(inputTotal <= limits.payloadBytes, "input_corpus_limit");
    for (const key of ["providerObservation", "runtimeObservation"]) {
      if (p.inputs[key])
        requireValue(
          inputFiles.get(p.inputs[key]).length <= limits.providerBytes,
          "provider_size_limit",
        );
    }
    const observed = observedIdentitySchema.parse(parseJson(observedBytes));
    for (const name of [
      observed.providerObservationRef,
      observed.runtimeObservationRef,
      observed.revisionBoundaryRef,
    ].filter(Boolean))
      requireValue(inputFiles.has(name), "observed_provenance_missing");
    if (!transport) {
      requireValue(
        !testTiming && process.env.NODE_TLS_REJECT_UNAUTHORIZED !== "0",
        "tls_or_timing_override",
      );
      validateExactCheckout(sourceDir, p.sourcePins.application);
      validateExactCheckout(root, p.sourcePins.releaseTools);
    }
    JSDOM = await loadParser(p, sourceDir);
    for (const name of ["clientId", "clientSecret"])
      requireValue(
        typeof credentials[name] === "string" &&
          credentials[name].length > 0 &&
          credentials[name].length <= 4096 &&
          !/[\r\n]/.test(credentials[name]),
        "access_credentials_required",
      );
    for (const bytes of [planBytes, expectationBytes, observedBytes, ...inputFiles.values()]) {
      requireValue(
        ![credentials.clientId, credentials.clientSecret].some(
          (s) =>
            bytes.includes(Buffer.from(s)) || bytes.includes(Buffer.from(encodeURIComponent(s))),
        ),
        "credential_in_input",
      );
    }
    await addFile("plan.json", planBytes);
    await addFile("expectations.json", expectationBytes);
    await addFile("observed-identity.json", observedBytes);
    for (const [name, bytes] of inputFiles) await addFile(name, bytes);
    await addFile("collector-source.mjs", await readFile(fileURLToPath(import.meta.url)));
    await addFile(
      "verifier-source.mjs",
      await readFile(resolve(root, "src/release/staging-url-seo-sitemap-parity.mjs")),
    );
    const sourceBinding = transport
      ? { kind: "injected_transport_test", exactCheckoutVerified: false }
      : {
          kind: "exact_checkouts",
          application: validateExactCheckout(sourceDir, p.sourcePins.application),
          releaseTools: validateExactCheckout(root, p.sourcePins.releaseTools),
        };
    await addFile("source-binding-before.json", jsonBytes(sourceBinding));
    const timing = {
      pacingMs: limits.pacingMs,
      requestMs: limits.requestMs,
      captureMs: limits.captureMs,
      ...testTiming,
    };
    for (const [key, value] of Object.entries(timing))
      requireValue(
        Number.isFinite(value) && value >= 0 && value <= limits[key],
        "timing_may_only_reduce_limits",
      );
    const deadline = Date.now() + timing.captureMs;
    let next = Date.now();
    const pace = async () => {
      const at = Math.max(next, Date.now());
      next = at + timing.pacingMs;
      await sleep(Math.max(0, Math.min(at - Date.now(), deadline - Date.now())));
    };
    const account = { total: 0, html: 0, sitemap: 0, robots: 0, protection: 0 };
    const secrets = [credentials.clientId, credentials.clientSecret];
    const observe = async (request) => {
      const metadata = {
        id: request.id,
        request,
        startedAt: new Date().toISOString(),
        finishedAt: null,
        status: null,
        headers: {},
        locationKind: null,
        bodyState: "partial",
        bodyRepresentation: "fetch_decoded",
        receivedBytes: 0,
        retainedBytes: 0,
        retainedSha256: sha256(Buffer.alloc(0)),
        fullResponseSha256: null,
        failure: null,
      };
      let body = Buffer.alloc(0),
        response;
      const controller = new AbortController();
      let timer;
      try {
        await pace();
        requireValue(Date.now() < deadline, "capture_deadline");
        requireValue(account.total < limits.captureBytes, "corpus_budget_exhausted");
        safePath(request.path);
        requireValue(
          Object.values(origins).includes(request.origin) &&
            ["GET", "HEAD"].includes(request.method),
          "unsafe_request",
        );
        const headers = { "accept-encoding": "identity" };
        if (request.authenticated) {
          headers["CF-Access-Client-Id"] = credentials.clientId;
          headers["CF-Access-Client-Secret"] = credentials.clientSecret;
        }
        if (request.legacyHost) headers["x-msr-legacy-host"] = request.legacyHost;
        timer = timeout(Math.min(timing.requestMs, deadline - Date.now()), controller);
        const url = request.origin + request.path;
        response = await Promise.race([
          fetcher(url, {
            method: request.method,
            redirect: "manual",
            headers,
            signal: controller.signal,
          }),
          timer.promise,
        ]);
        requireValue(
          response && !response.redirected && (!response.url || response.url === url),
          "transport_followed_redirect",
        );
        metadata.status = response.status;
        Object.assign(metadata, headersEvidence(response.headers, request.origin, secrets));
        if (request.method === "HEAD") {
          metadata.bodyState = "complete";
        } else if (
          [401, 403].includes(response.status) ||
          metadata.locationKind === "access_login" ||
          response.headers.get("cf-mitigated") === "challenge"
        ) {
          metadata.bodyState = "omitted";
          metadata.failure = "access_denied";
        } else if (
          [301, 302, 303, 307, 308].includes(response.status) &&
          (!request.followPath ||
            response.status !== 301 ||
            metadata.headers.location !== request.origin + request.followPath)
        ) {
          metadata.bodyState = "omitted";
          metadata.failure = "redirect_not_allowed";
        } else {
          const maximum =
            request.family === "sitemap"
              ? limits.sitemapBytes
              : request.family === "robots"
                ? 64 * 1024
                : limits.htmlBytes;
          const operation = bodyBounded(
            response,
            maximum,
            account,
            request.family,
            controller.signal,
          );
          // On a body timeout, abort, then retain the bytes already yielded by the stream.
          let result;
          try {
            result = await Promise.race([operation, timer.promise]);
          } catch {
            controller.abort();
            void response.body?.cancel().catch(() => {});
            result = await Promise.race([
              operation,
              sleep(25).then(() => ({
                body: Buffer.alloc(0),
                receivedBytes: 0,
                failure: "request_timeout",
              })),
            ]);
          }
          body = result.body;
          metadata.receivedBytes = result.receivedBytes;
          metadata.failure = result.failure;
          metadata.bodyState = result.failure ? "partial" : "complete";
        }
        const sanitized = redactBody(body, secrets);
        body = sanitized.body;
        if (sanitized.changed) {
          metadata.bodyState = "redacted";
          metadata.failure = "body_credentials_redacted";
        }
      } catch (error) {
        const codes = new Set([
          "capture_deadline",
          "corpus_budget_exhausted",
          "header_size_limit",
          "header_value_limit",
          "request_timeout",
          "transport_followed_redirect",
        ]);
        metadata.failure = codes.has(error?.message) ? error.message : "transport_failure";
      } finally {
        timer?.clear();
        controller.abort();
        void response?.body?.cancel().catch(() => {});
        metadata.finishedAt = new Date().toISOString();
        metadata.retainedBytes = body.length;
        metadata.retainedSha256 = sha256(body);
        if (metadata.bodyState === "complete") metadata.fullResponseSha256 = sha256(body);
      }
      return { metadata, body };
    };
    const requests = requestPlan(p);
    // Deterministic batch/member order bounds resident response buffers to six route bodies.
    for (let offset = 0; offset < requests.length; offset += limits.workers) {
      const batch = requests.slice(offset, offset + limits.workers);
      const results = await Promise.all(batch.map(observe));
      for (let i = 0; i < batch.length; i++) {
        const first = results[i],
          request = batch[i];
        await writeMember(first);
        if (
          request.followPath &&
          first.metadata.status === 301 &&
          !first.metadata.failure &&
          first.metadata.headers.location === request.origin + request.followPath
        ) {
          await writeMember(
            await observe({
              ...request,
              id: `${request.id}:hop`,
              path: request.followPath,
              legacyHost: null,
              followPath: null,
            }),
          );
        }
      }
    }
    if (shard) {
      await shard.sync();
      await shard.close();
      shard = null;
    }
    for (let n = 0; n <= shardNumber; n++) {
      const name = `raw-${String(n).padStart(4, "0")}.bin`;
      files.set(name, await boundedFile(outputDir, name, limits.shardBytes));
    }
    let after = sourceBinding;
    if (!transport) {
      try {
        after = {
          kind: "exact_checkouts",
          application: validateExactCheckout(sourceDir, p.sourcePins.application),
          releaseTools: validateExactCheckout(root, p.sourcePins.releaseTools),
        };
      } catch {
        after = { kind: "checkout_changed", exactCheckoutVerified: false };
      }
    }
    await addFile("source-binding-after.json", jsonBytes(after));
    await addFile(
      "raw-index.json",
      jsonBytes({
        schemaVersion: 1,
        producer,
        evidenceClass,
        startedAt,
        finishedAt: new Date().toISOString(),
        parser: p.parser,
        planSha256: sha256(planBytes),
        expectationsSha256: sha256(expectationBytes),
        members,
      }),
    );
    await addFile("failure-journal.json", jsonBytes(failures));
    await journal.close();
    files.set(
      "failure-events.jsonl",
      await boundedFile(outputDir, "failure-events.jsonl", limits.jsonBytes),
    );
    const supportingFiles = [...files].map(([name, bytes]) => ref(name, bytes));
    const report = verifyCapture({ files, supportingFiles, JSDOM });
    await addFile("staging-url-seo-sitemap-parity.json", jsonBytes(report));
    // Explicitly lists the report AND every dependency. Index contents are not imports.
    await save(
      resolve(outputDir, "supporting-files.json"),
      jsonBytes([...files].map(([name, bytes]) => ref(name, bytes))),
    );
    return report;
  } catch {
    // The rejected raw input may itself contain credentials. Persist only a bounded code.
    const entry = { id: "capture", code: "capture_setup_or_persistence_failed" };
    try {
      await appendFailure(entry);
    } catch {
      /* Existing durable failures remain untouched. */
    }
    try {
      await save(
        resolve(outputDir, "capture-failed.json"),
        jsonBytes({
          schemaVersion: 1,
          producer,
          evidenceClass,
          startedAt,
          status: "FAIL",
          captureComplete: false,
          failure: entry.code,
          productionQualified: false,
          publicationApproved: false,
          humanApproval: false,
          cutoverAuthorized: false,
          gateCompletion: false,
        }),
      );
    } catch {
      /* Never overwrite a previous receipt. */
    }
    throw new Error(entry.code);
  } finally {
    if (shard) await shard.close().catch(() => {});
    await journal.close().catch(() => {});
  }
}

export async function verifyDirectory(directory, sourceDir = root) {
  const manifest = parseJson(
    await boundedFile(directory, "supporting-files.json", limits.jsonBytes),
  );
  requireValue(
    Array.isArray(manifest) && manifest.length <= limits.rows,
    "supporting_manifest_size",
  );
  const files = new Map(),
    references = [];
  const actualNames = [];
  async function enumerate(relative = "", depth = 0) {
    requireValue(depth <= 8 && actualNames.length <= limits.rows, "capture_directory_limit");
    for (const entry of await readdir(resolve(directory, relative), { withFileTypes: true })) {
      const name = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isDirectory()) await enumerate(name, depth + 1);
      else {
        requireValue(entry.isFile(), "nonregular_capture_entry");
        actualNames.push(name);
      }
    }
  }
  await enumerate();
  requireValue(
    JSON.stringify(actualNames.sort()) ===
      JSON.stringify([...manifest.map((f) => f.path), "supporting-files.json"].sort()),
    "undeclared_capture_file",
  );
  let total = 0;
  for (const entry of manifest) {
    const f = fileRefSchema.parse(entry);
    requireValue(!files.has(f.path), "duplicate_supporting_file");
    const bytes = await boundedFile(directory, f.path, limits.captureBytes);
    total += bytes.length;
    requireValue(total <= limits.captureBytes + limits.payloadBytes, "offline_corpus_size_limit");
    requireValue(
      bytes.length === f.bytes && sha256(bytes) === f.sha256,
      "supporting_file_hash_mismatch",
    );
    files.set(f.path, bytes);
    references.push(f);
  }
  const original = files.get("staging-url-seo-sitemap-parity.json");
  requireValue(original, "missing_original_report");
  files.delete("staging-url-seo-sitemap-parity.json");
  const plan = validatePlan(parseJson(files.get("plan.json")));
  const JSDOM = await loadParser(plan, sourceDir);
  const report = verifyCapture({
    files,
    supportingFiles: references.filter((f) => f.path !== "staging-url-seo-sitemap-parity.json"),
    JSDOM,
  });
  requireValue(
    sha256(jsonBytes(report)) === sha256(original),
    "offline_report_reproduction_mismatch",
  );
  return report;
}

async function main(args) {
  const [mode, ...rest] = args;
  const options = {};
  requireValue(rest.length % 2 === 0, "arguments");
  for (let i = 0; i < rest.length; i += 2) {
    requireValue(
      ["--packet", "--output", "--source", "--capture"].includes(rest[i]) && !options[rest[i]],
      "arguments",
    );
    options[rest[i]] = rest[i + 1];
  }
  let report;
  if (mode === "capture") {
    requireValue(
      options["--packet"] && options["--output"] && options["--source"] && !options["--capture"],
      "arguments",
    );
    const packet = options["--packet"];
    const planBytes = await boundedFile(packet, "plan.json", limits.jsonBytes);
    const plan = validatePlan(parseJson(planBytes));
    const inputFiles = new Map();
    for (const f of plan.files)
      inputFiles.set(f.path, await boundedFile(packet, f.path, limits.payloadBytes));
    report = await collectCapture({
      planBytes,
      expectationBytes: await boundedFile(packet, "expectations.json", limits.jsonBytes),
      observedBytes: await boundedFile(packet, "observed-identity.json", limits.providerBytes),
      inputFiles,
      sourceDir: options["--source"],
      outputDir: options["--output"],
      credentials: {
        clientId: process.env.MSR_PARITY_ACCESS_CLIENT_ID,
        clientSecret: process.env.MSR_PARITY_ACCESS_CLIENT_SECRET,
      },
    });
  } else if (mode === "verify") {
    requireValue(options["--capture"] && options["--output"] && !options["--packet"], "arguments");
    report = await verifyDirectory(options["--capture"], options["--source"] ?? root);
    await save(options["--output"], jsonBytes(report));
  } else throw new Error("arguments");
  console.log(
    JSON.stringify({
      status: report.status,
      technicalStatus: report.technicalStatus,
      captureComplete: report.captureComplete,
      evidenceClass: report.evidenceClass,
    }),
  );
  process.exitCode = report.status === "FAIL" ? 1 : report.status === "BLOCKED" ? 2 : 0;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch(async () => {
    // Never print raw input, credentials, response bodies or transport exceptions.
    console.error("R07 capture/verification failed; retained receipts are not overwritten.");
    process.exitCode = 1;
  });
}
