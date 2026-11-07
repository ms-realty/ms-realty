// R07 / AT57 and bounded AT27. Pure comparisons; never an approval/trust loader.
import { createHash } from "node:crypto";
import { z } from "zod";

export const producer = "msr-staging-url-seo-sitemap-parity@1";
export const origins = Object.freeze({
  public: "https://staging.makler-realty.com",
  client: "https://staging-my.makler-realty.com",
  staff: "https://staging-app.makler-realty.com",
});
export const accountId = "921d0224dcd595c87b7928d2b3c479d1";
export const zoneId = "f0ac7af0721419e8129e5d10ff547372";
export const limits = Object.freeze({
  rows: 5000,
  sitemapParts: 32,
  workers: 6,
  pacingMs: 334,
  requestMs: 20_000,
  captureMs: 45 * 60_000,
  htmlBytes: 5_000_000,
  sitemapBytes: 2 * 1024 * 1024,
  providerBytes: 2 * 1024 * 1024,
  headerBytes: 32 * 1024,
  metadataBytes: 16 * 1024,
  htmlTotalBytes: 448 * 1024 * 1024,
  sitemapTotalBytes: 32 * 1024 * 1024,
  captureBytes: 512 * 1024 * 1024,
  shardBytes: 8 * 1024 * 1024,
  entries: 1024,
  fileBytes: 16 * 1024 * 1024,
  payloadBytes: 256 * 1024 * 1024,
  jsonBytes: 2 * 1024 * 1024,
});
// Historical audit facts remain visible even for a smaller synthetic/partial plan.
export const auditedBaseline = Object.freeze({
  application: "e130f5f72f98a85daff009304a653dfc11fe9cca",
  releaseTools: "7db050438f50c238d525d1cb51c09574c02c0a0e",
  frozenSpellings: 457,
  frozenNormalized: 454,
  unresolvedSources: 13,
  pendingSnapshots: 1257,
  stagingExclusions: 411,
  completeCurrentDelta: false,
  composedOrDeployedCandidate: false,
});
export const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
export const jsonBytes = (value) => Buffer.from(`${JSON.stringify(value)}\n`);
const canonical = (value) =>
  Array.isArray(value)
    ? value.map(canonical)
    : value !== null && typeof value === "object"
      ? Object.fromEntries(
          Object.keys(value)
            .sort()
            .map((key) => [key, canonical(value[key])]),
        )
      : value;
export const same = (a, b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const git = z.string().regex(/^[a-f0-9]{40}$/);
const label = z.string().regex(/^[a-zA-Z0-9_.:-]{1,160}$/);
const text = z.string().max(10_000);
const locale = z.enum(["bg", "en", "ru", "de", "nl", "el", "he"]);
const instant = z.string().datetime();
const path = z
  .string()
  .max(240)
  .regex(/^[a-zA-Z0-9_.-]+(?:\/[a-zA-Z0-9_.-]+)*$/)
  .refine((v) => v.split("/").every((p) => p !== "." && p !== ".."));
export const fileRefSchema = z
  .object({ path, sha256: hash, bytes: z.number().int().nonnegative().max(limits.captureBytes) })
  .strict();
const ref = path.nullable();
const identitySchema = z
  .object({
    sourceCommit: git.nullable(),
    sourceTree: git.nullable(),
    imageDigest: hash.nullable(),
    gatewayDigest: hash.nullable(),
    lockfileDigest: hash.nullable(),
    routesDigest: hash.nullable(),
    sourceDataDigest: hash.nullable(),
    importDigest: hash.nullable(),
    schemaDigest: hash.nullable(),
    configDigest: hash.nullable(),
    localePolicyDigest: hash.nullable(),
    catalogPolicyDigest: hash.nullable(),
    policyRevision: label.nullable(),
    policyDigest: hash.nullable(),
    providerDeploymentId: label.nullable(),
    workerVersionId: label.nullable(),
  })
  .strict();
const inputNames = [
  "frozenInventory",
  "routeManifest",
  "sourcePages",
  "decisions",
  "exclusions",
  "sourceCaptures",
  "eligibility",
  "revisionBoundary",
  "independentReview",
  "humanDecisions",
  "providerObservation",
  "runtimeObservation",
];
const inputsSchema = z.object(Object.fromEntries(inputNames.map((key) => [key, ref]))).strict();
const queryKeys = new Set(["p", "page", "paged", "lang", "s", "property_id"]);

function requireValue(condition, code) {
  if (!condition) throw new Error(code);
}
const hasControl = (value, space = false) =>
  [...value].some(
    (character) =>
      character.codePointAt(0) <= (space ? 32 : 31) || character.codePointAt(0) === 127,
  );

// URL() normalizes traversal before callers can inspect it. Inspect original bytes first.
export function safePath(value) {
  requireValue(
    typeof value === "string" &&
      value.length <= 4096 &&
      value.startsWith("/") &&
      !value.startsWith("//") &&
      !/[\\#]/.test(value) &&
      !hasControl(value, true),
    "unsafe_path",
  );
  const raw = value.split("?")[0];
  let decoded;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    throw new Error("unsafe_encoding");
  }
  requireValue(
    !decoded.includes("\\") &&
      !hasControl(decoded, true) &&
      !decoded.includes("//") &&
      !decoded.split("/").some((s) => s === "." || s === "..") &&
      !/%(?:2e|2f|5c|25)/i.test(decoded),
    "unsafe_path",
  );
  requireValue(!/^\/(?:api|__staging|cdn-cgi|auth|login)(?:\/|$)/i.test(decoded), "nonpublic_path");
  const parsed = new URL(value, origins.public);
  requireValue(
    parsed.origin === origins.public && !parsed.username && !parsed.password && !parsed.hash,
    "unsafe_origin",
  );
  for (const [key, val] of parsed.searchParams) {
    requireValue(queryKeys.has(key) && val.length <= 256 && !hasControl(val), "unsupported_query");
  }
  return value;
}

export function sourceIdentity(value) {
  requireValue(
    typeof value === "string" &&
      /^https?:\/\/(?:makler-realty\.com|makler-realty\.ru)\//.test(value),
    "unsupported_source",
  );
  const match = value.match(/^https?:\/\/[^/]+(\/.*)$/);
  safePath(match[1]);
  const url = new URL(value);
  requireValue(!url.port && !url.username && !url.password && !url.hash, "unsupported_source");
  requireValue(url.href === url.origin + match[1], "unsupported_source_serialization");
  const identity = {
    host: url.hostname,
    path: decodeURIComponent(url.pathname),
    query: url.search,
  };
  return {
    ...identity,
    id: sha256(JSON.stringify(identity)).slice(0, 24),
    // Preserve the validated raw request target, including a trailing '?'.
    // Spellings the transport URL serializer would rewrite are rejected above.
    pathAndQuery: match[1],
  };
}
export const urlId = (url) => sha256(url).slice(0, 24);
const sourceUrl = z
  .string()
  .max(4096)
  .refine((v) => {
    try {
      sourceIdentity(v);
      return true;
    } catch {
      return false;
    }
  });
const publicPath = z.string().refine((v) => {
  try {
    safePath(v);
    return true;
  } catch {
    return false;
  }
});
const alternateSchema = z
  .object({ locale: z.union([locale, z.literal("x-default")]), url: sourceUrl })
  .strict();
const planSchema = z
  .object({
    schemaVersion: z.literal(1),
    kind: z.literal("r07_observation_plan"),
    accountId: z.literal(accountId),
    zoneId: z.literal(zoneId),
    workerName: z.literal("ms-realty-staging"),
    expectedContext: identitySchema,
    sourcePins: z.object({ application: git, releaseTools: git }).strict(),
    parser: z.object({ name: z.literal("jsdom"), version: label, lockfileDigest: hash }).strict(),
    inputs: inputsSchema,
    files: z.array(fileRefSchema).min(1).max(limits.entries),
    currentDelta: z.enum(["pending", "recorded"]),
    urls: z
      .array(
        z
          .object({
            id: label,
            sourceUrl,
            normalizedId: z.string().regex(/^[a-f0-9]{24}$/),
            groups: z
              .array(z.enum(["frozen", "snapshot", "current"]))
              .min(1)
              .max(3),
            pendingSource: z.boolean(),
            capture: z.boolean(),
            exclusionReason: text.nullable(),
            followPath: publicPath.nullable(),
          })
          .strict(),
      )
      .min(1)
      .max(limits.rows),
    sitemapPaths: z.array(publicPath).min(1).max(limits.sitemapParts),
  })
  .strict();
const metaSchema = z.discriminatedUnion("state", [
  z.object({ state: z.literal("pending") }).strict(),
  z.object({ state: z.literal("absent") }).strict(),
  z.object({ state: z.literal("value"), value: text }).strict(),
]);
const revisionSchema = z
  .object({
    snapshotId: label,
    publication: hash.nullable(),
    facts: hash.nullable(),
    terms: hash.nullable(),
    localized: hash.nullable(),
    cms: hash.nullable(),
    source: hash,
  })
  .strict();
const expectationSchema = z
  .object({
    schemaVersion: z.literal(1),
    kind: z.literal("r07_expected_state"),
    planSha256: hash,
    context: identitySchema,
    provenanceRef: ref,
    eligibilityRef: ref,
    revisionBoundaryRef: ref,
    revision: z
      .object({ snapshotId: label, startSequence: label, endSequence: label })
      .strict()
      .nullable(),
    urls: z
      .array(
        z
          .object({
            id: label,
            state: z.enum(["pending", "recorded"]),
            disposition: z
              .object({
                status: z.union([z.literal(200), z.literal(301), z.literal(410)]),
                targetUrl: sourceUrl.nullable(),
                rationale: text.min(1),
                provenanceRef: path,
              })
              .strict()
              .nullable(),
            canonical: sourceUrl.nullable(),
            locale: locale.nullable(),
            eligibility: z.enum([
              "pending",
              "eligible",
              "held",
              "stale",
              "withdrawn",
              "unavailable",
              "fallback",
              "expired",
              "restricted",
              "superseded",
            ]),
            eligibilityRef: ref,
            revision: revisionSchema.nullable(),
            title: metaSchema,
            description: metaSchema,
            alternates: z.array(alternateSchema).max(8).nullable(),
            jsonLd: z.array(z.unknown()).max(32).nullable(),
            visible: z
              .object({ selector: z.enum(["main", "article"]), textSha256: hash })
              .strict()
              .nullable(),
          })
          .strict(),
      )
      .min(1)
      .max(limits.rows),
    sitemap: z
      .object({
        state: z.enum(["pending", "recorded"]),
        entries: z
          .array(
            z
              .object({
                url: sourceUrl,
                lastmod: text.nullable(),
                alternates: z.array(alternateSchema).max(8),
              })
              .strict(),
          )
          .max(limits.rows),
      })
      .strict(),
  })
  .strict();
export const observedIdentitySchema = z
  .object({
    schemaVersion: z.literal(1),
    kind: z.literal("r07_unverified_observed_identity"),
    context: identitySchema,
    providerObservationRef: ref,
    runtimeObservationRef: ref,
    revisionBoundaryRef: ref,
    revision: z
      .object({ snapshotId: label, startSequence: label, endSequence: label })
      .strict()
      .nullable(),
  })
  .strict();
const failureCode = z.enum([
  "request_timeout",
  "truncated_body",
  "body_or_corpus_size_limit",
  "body_credentials_redacted",
  "capture_deadline",
  "corpus_budget_exhausted",
  "header_size_limit",
  "header_value_limit",
  "transport_followed_redirect",
  "transport_failure",
  "access_denied",
  "redirect_not_allowed",
]);
const requestSchema = z
  .object({
    id: label,
    family: z.enum(["protection", "robots", "sitemap", "html"]),
    origin: z.enum(Object.values(origins)),
    path: publicPath,
    method: z.enum(["GET", "HEAD"]),
    authenticated: z.boolean(),
    legacyHost: z.enum(["makler-realty.com", "makler-realty.ru"]).nullable(),
    followPath: publicPath.nullable(),
  })
  .strict();
const memberSchema = z
  .object({
    id: label,
    request: requestSchema,
    startedAt: instant,
    finishedAt: instant,
    status: z.number().int().min(100).max(599).nullable(),
    headers: z
      .object({
        "content-type": text.optional(),
        "content-length": text.optional(),
        "content-encoding": text.optional(),
        "x-robots-tag": text.optional(),
        location: z.string().max(4096).optional(),
      })
      .strict(),
    locationKind: z.enum(["same_origin", "access_login", "off_origin", "unsafe"]).nullable(),
    bodyState: z.enum(["complete", "partial", "redacted", "omitted"]),
    bodyRepresentation: z.literal("fetch_decoded"),
    receivedBytes: z.number().int().nonnegative(),
    retainedBytes: z.number().int().nonnegative().max(limits.htmlBytes),
    retainedSha256: hash,
    fullResponseSha256: hash.nullable(),
    failure: failureCode.nullable(),
  })
  .strict();
const indexSchema = z
  .object({
    schemaVersion: z.literal(1),
    producer: z.literal(producer),
    evidenceClass: z.enum(["live", "test"]),
    startedAt: instant,
    finishedAt: instant,
    parser: planSchema.shape.parser,
    planSha256: hash,
    expectationsSha256: hash,
    members: z
      .array(
        z
          .object({
            id: label,
            shard: z.string().regex(/^raw-\d{4}\.bin$/),
            offset: z.number().int().nonnegative().max(limits.shardBytes),
            length: z.number().int().min(8).max(limits.shardBytes),
            sha256: hash,
          })
          .strict(),
      )
      .max(limits.rows * 2 + 100),
  })
  .strict();
export function parseJson(bytes) {
  requireValue(bytes.length <= limits.jsonBytes, "json_size_limit");
  const value = JSON.parse(bytes.toString("utf8"));
  function depth(v, n = 0) {
    requireValue(n <= 32, "json_depth_limit");
    if (v && typeof v === "object") for (const child of Object.values(v)) depth(child, n + 1);
  }
  depth(value);
  return value;
}
const unique = (values, code) => requireValue(new Set(values).size === values.length, code);
const freeze = (value) => {
  if (value && typeof value === "object") {
    for (const v of Object.values(value)) freeze(v);
    Object.freeze(value);
  }
  return value;
};
export function validatePlan(value) {
  const p = planSchema.parse(value);
  unique(
    p.files.map((f) => f.path),
    "duplicate_file",
  );
  requireValue(
    p.files.every((f) => f.path.startsWith("inputs/")),
    "input_path_namespace",
  );
  for (const key of inputNames) {
    requireValue(
      p.inputs[key] === null || p.files.some((f) => f.path === p.inputs[key]),
      "undeclared_input",
    );
  }
  for (const key of inputNames.slice(0, 6))
    requireValue(p.inputs[key] !== null, "missing_inventory_input");
  unique(
    p.urls.map((row) => row.id),
    "duplicate_url_id",
  );
  unique(
    p.urls.map((row) => row.sourceUrl),
    "duplicate_exact_url",
  );
  unique(p.sitemapPaths, "duplicate_sitemap_part");
  requireValue(p.sitemapPaths[0] === "/sitemap.xml", "sitemap_root_required");
  const normalized = new Map();
  for (const row of p.urls) {
    const identity = sourceIdentity(row.sourceUrl);
    requireValue(
      row.id === urlId(row.sourceUrl) && row.normalizedId === identity.id,
      "wrong_url_identity",
    );
    unique(row.groups, "duplicate_group");
    requireValue(
      row.capture ? row.exclusionReason === null : Boolean(row.exclusionReason),
      "unexplained_exclusion",
    );
    const mapping = { capture: row.capture, followPath: row.followPath };
    requireValue(
      !normalized.has(identity.id) || same(normalized.get(identity.id), mapping),
      "conflicting_url_mapping",
    );
    normalized.set(identity.id, mapping);
  }
  return freeze(p);
}
export function validateExpectations(value, plan, planHash) {
  const e = expectationSchema.parse(value);
  requireValue(e.planSha256 === planHash, "wrong_expectation_plan");
  requireValue(same(e.context, plan.expectedContext), "wrong_expectation_context");
  unique(
    e.urls.map((r) => r.id),
    "duplicate_expectation",
  );
  requireValue(
    same(e.urls.map((r) => r.id).sort(), plan.urls.map((r) => r.id).sort()),
    "missing_or_extra_expectation",
  );
  const references = [
    e.provenanceRef,
    e.eligibilityRef,
    e.revisionBoundaryRef,
    ...e.urls.flatMap((r) => [r.disposition?.provenanceRef, r.eligibilityRef]),
  ].filter(Boolean);
  requireValue(
    references.every((r) => plan.files.some((f) => f.path === r)),
    "undeclared_provenance",
  );
  for (const row of e.urls) {
    if (row.disposition)
      requireValue(
        row.disposition.status === 410
          ? row.disposition.targetUrl === null
          : row.disposition.targetUrl !== null,
        "disposition_target",
      );
    if (row.alternates)
      unique(
        row.alternates.map((a) => a.locale),
        "duplicate_expected_alternate",
      );
  }
  unique(
    e.sitemap.entries.map((r) => r.url),
    "duplicate_expected_sitemap_url",
  );
  for (const r of e.sitemap.entries)
    unique(
      r.alternates.map((a) => a.locale),
      "duplicate_expected_sitemap_alternate",
    );
  return freeze(e);
}
export function stagingTransform(url) {
  const identity = sourceIdentity(url);
  return `${origins.public}${identity.pathAndQuery}`;
}

export function requestPlan(plan) {
  return [
    ...Object.keys(origins).flatMap((host) => [
      {
        id: `anonymous:${host}`,
        family: "protection",
        origin: origins[host],
        path: "/",
        method: "HEAD",
        authenticated: false,
        legacyHost: null,
        followPath: null,
      },
      ...(host === "public"
        ? []
        : [
            {
              id: `private:${host}`,
              family: "protection",
              origin: origins[host],
              path: "/",
              method: "HEAD",
              authenticated: true,
              legacyHost: null,
              followPath: null,
            },
          ]),
    ]),
    {
      id: "robots",
      family: "robots",
      origin: origins.public,
      path: "/robots.txt",
      method: "GET",
      authenticated: true,
      legacyHost: null,
      followPath: null,
    },
    ...plan.sitemapPaths.map((path, i) => ({
      id: `sitemap:${i}`,
      family: "sitemap",
      origin: origins.public,
      path,
      method: "GET",
      authenticated: true,
      legacyHost: null,
      followPath: null,
    })),
    ...plan.urls
      .filter((r) => r.capture)
      .map((r) => ({
        id: r.id,
        family: "html",
        origin: origins.public,
        path: sourceIdentity(r.sourceUrl).pathAndQuery,
        method: "GET",
        authenticated: true,
        legacyHost: sourceIdentity(r.sourceUrl).host,
        followPath: r.followPath,
      })),
  ];
}

// Opaque binary members: 4-byte metadata length, 4-byte body length, metadata UTF-8, body.
export function encodeMember(metadata, body) {
  const meta = jsonBytes(metadata);
  requireValue(
    meta.length <= limits.metadataBytes && body.length <= limits.htmlBytes,
    "member_size_limit",
  );
  const prefix = Buffer.alloc(8);
  prefix.writeUInt32BE(meta.length);
  prefix.writeUInt32BE(body.length, 4);
  return Buffer.concat([prefix, meta, body]);
}
export function decodeMember(bytes) {
  requireValue(bytes.length >= 8, "truncated_member");
  const m = bytes.readUInt32BE(),
    b = bytes.readUInt32BE(4);
  requireValue(
    m <= limits.metadataBytes && b <= limits.htmlBytes && bytes.length === 8 + m + b,
    "member_length_mismatch",
  );
  return { metadata: parseJson(bytes.subarray(8, 8 + m)), body: bytes.subarray(8 + m) };
}
export function packageBudget(files) {
  const entries = [...files.entries()].map(([path, bytes]) => ({ path, bytes: bytes.length }));
  const totalBytes = entries.reduce((sum, f) => sum + f.bytes, 0);
  const violations = [
    ...(entries.length > limits.entries ? ["r10_entry_limit"] : []),
    ...(entries.some((f) => f.bytes > limits.fileBytes) ? ["r10_file_limit"] : []),
    ...(totalBytes > limits.payloadBytes ? ["r10_payload_limit"] : []),
    ...(entries.some((f) => f.path.endsWith(".json") && f.bytes > limits.jsonBytes)
      ? ["r10_json_limit"]
      : []),
  ];
  return {
    entries: entries.length,
    totalBytes,
    localFits: !violations.length,
    violations,
    packageAdmission: false,
    wholeCandidateBundleMeasured: false,
  };
}

export const normalizeVisible = (text) => text.replace(/\s+/gu, " ").trim();
export function htmlProjection(bytes, JSDOM) {
  const dom = new JSDOM(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  try {
    const d = dom.window.document;
    const jsonLd = [...d.querySelectorAll('script[type="application/ld+json"]')].map((s) =>
      parseJson(Buffer.from(s.textContent)),
    );
    const excluded = "script,style,template,noscript,[hidden],[aria-hidden=true i]";
    const visible = (selector) =>
      [...d.querySelectorAll(selector)]
        .filter((node) => !node.closest(excluded))
        .map((node) => {
          const copy = node.cloneNode(true);
          for (const hidden of copy.querySelectorAll(excluded)) hidden.remove();
          return sha256(normalizeVisible(copy.textContent));
        });
    return {
      lang: d.documentElement.lang,
      canonical: [...d.querySelectorAll('link[rel="canonical"]')].map((n) =>
        n.getAttribute("href"),
      ),
      alternates: [...d.querySelectorAll('link[rel="alternate"][hreflang]')].map((n) => ({
        locale: n.getAttribute("hreflang"),
        url: n.getAttribute("href"),
      })),
      // SVG accessibility titles are not document metadata. HTML metadata can also
      // be streamed by Next into the full document, so do not discard body HTML tags.
      title: [...d.querySelectorAll("title")]
        .filter((n) => n.namespaceURI === "http://www.w3.org/1999/xhtml")
        .map((n) => n.textContent),
      description: [...d.querySelectorAll('meta[name="description" i]')].map((n) =>
        n.getAttribute("content"),
      ),
      robots: [
        ...d.querySelectorAll(
          'meta[name="robots" i],meta[name="googlebot" i],meta[name="bingbot" i]',
        ),
      ].map((n) => n.getAttribute("content")),
      jsonLd,
      visible: { main: visible("main"), article: visible("article") },
    };
  } finally {
    dom.window.close();
  }
}
export function sitemapProjection(bytes, JSDOM) {
  const xml = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  requireValue(!/<!DOCTYPE|<!ENTITY/i.test(xml), "xml_entity_not_supported");
  const dom = new JSDOM(xml, { contentType: "text/xml" });
  try {
    const root = dom.window.document.documentElement;
    requireValue(
      root.namespaceURI === "http://www.sitemaps.org/schemas/sitemap/0.9",
      "sitemap_namespace",
    );
    const children = (n, name) =>
      [...n.children].filter((c) => c.localName === name && c.namespaceURI === root.namespaceURI);
    const single = (n, name, optional = false) => {
      const found = children(n, name);
      requireValue(found.length === 1 || (optional && found.length === 0), "sitemap_field_count");
      return found[0]?.textContent ?? null;
    };
    if (root.localName === "sitemapindex")
      return { kind: "index", parts: children(root, "sitemap").map((n) => single(n, "loc")) };
    requireValue(root.localName === "urlset", "sitemap_format");
    return {
      kind: "urlset",
      entries: children(root, "url").map((n) => ({
        url: single(n, "loc"),
        lastmod: single(n, "lastmod", true),
        alternates: [...n.children]
          .filter(
            (c) => c.localName === "link" && c.namespaceURI === "http://www.w3.org/1999/xhtml",
          )
          .map((c) => ({
            locale: c.getAttribute("hreflang"),
            url: c.getAttribute("href"),
            rel: c.getAttribute("rel"),
          })),
      })),
    };
  } finally {
    dom.window.close();
  }
}

const noindex = (v) =>
  typeof v === "string" &&
  /(?:^|[\s,:])noindex(?:$|[\s,])/i.test(v) &&
  !/(?:^|[\s,:])(?:index|all)(?:$|[\s,])/i.test(v);
const sorted = (rows) =>
  [...rows].sort((a, b) =>
    JSON.stringify(canonical(a)).localeCompare(JSON.stringify(canonical(b))),
  );
const metadataEqual = (actual, expected) =>
  expected.state === "absent"
    ? actual.length === 0
    : expected.state === "value" && same(actual, [expected.value]);
const receiptFlags = Object.freeze({
  productionQualified: false,
  publicationApproved: false,
  humanApproval: false,
  cutoverAuthorized: false,
  gateCompletion: false,
  fullLegacyParityQualified: false,
});

/** files contains the explicitly declared local bytes, never recursive index imports. */
export function verifyCapture({ files, supportingFiles, JSDOM }) {
  const checks = [],
    blockers = new Set();
  const check = (id, condition, row = null) =>
    checks.push({ id, row, status: condition ? "PASS" : "FAIL" });
  const blocked = (id, row = null) => {
    checks.push({ id, row, status: "BLOCKED" });
    blockers.add(id);
  };
  const budget = packageBudget(files);
  // Preserve only the finite declared class before any custody/binding failure.
  // This is an unverified raw label, never proof that transport was live.
  let declaredClass = null;
  try {
    const claim = parseJson(files.get("raw-index.json"))?.evidenceClass;
    if (["test", "live"].includes(claim)) declaredClass = claim;
  } catch {
    /* Missing, malformed or over-limit indices leave the class unknown. */
  }
  const report = {
    schemaVersion: 1,
    kind: "staging-url-seo-sitemap-parity",
    producer,
    environment: "staging",
    evidenceClass: declaredClass,
    evidenceClassAuthenticated: false,
    producerSourcesAuthenticated: false,
    status: "BLOCKED",
    technicalStatus: "BLOCKED",
    captureComplete: false,
    completeUniverseProven: false,
    observedAt: null,
    auditedBaseline,
    coverage: {},
    expectedIdentity: null,
    observedIdentity: null,
    identityAuthenticated: false,
    eligibilityAuthenticated: false,
    revisionCoherenceProven: false,
    redactionStatus: "bounded_allowlist_and_body_scan",
    checks,
    parsedObservations: [],
    blockers: [],
    package: budget,
    supportingFiles,
    ...receiptFlags,
  };
  try {
    const refs = z.array(fileRefSchema).max(limits.rows).parse(supportingFiles);
    unique(
      refs.map((f) => f.path),
      "duplicate_supporting_file",
    );
    for (const f of refs)
      requireValue(
        files.has(f.path) &&
          files.get(f.path).length === f.bytes &&
          sha256(files.get(f.path)) === f.sha256,
        "missing_or_tampered_supporting_file",
      );
    requireValue(
      same([...files.keys()].sort(), refs.map((f) => f.path).sort()),
      "undeclared_supporting_file",
    );
    for (const name of ["collector-source.mjs", "verifier-source.mjs"])
      requireValue(files.has(name) && files.get(name).length > 0, "missing_producer_source");
    const p = validatePlan(parseJson(files.get("plan.json")));
    const e = validateExpectations(
      parseJson(files.get("expectations.json")),
      p,
      sha256(files.get("plan.json")),
    );
    for (const f of p.files)
      requireValue(
        refs.some((r) => same(r, f)),
        "wrong_input_provenance",
      );
    const index = indexSchema.parse(parseJson(files.get("raw-index.json")));
    requireValue(
      index.schemaVersion === 1 &&
        index.producer === producer &&
        ["live", "test"].includes(index.evidenceClass),
      "index_contract",
    );
    requireValue(
      index.planSha256 === sha256(files.get("plan.json")) &&
        index.expectationsSha256 === sha256(files.get("expectations.json")),
      "index_context",
    );
    requireValue(same(index.parser, p.parser), "parser_identity");
    requireValue(
      p.sourcePins.application === p.expectedContext.sourceCommit,
      "source_pin_mismatch",
    );
    const bindingBefore = parseJson(files.get("source-binding-before.json"));
    const bindingAfter = parseJson(files.get("source-binding-after.json"));
    check("source_checkouts_unchanged", same(bindingBefore, bindingAfter));
    if (index.evidenceClass === "live")
      requireValue(
        bindingBefore.kind === "exact_checkouts" &&
          bindingBefore.application.sourceCommit === p.sourcePins.application &&
          bindingBefore.releaseTools.sourceCommit === p.sourcePins.releaseTools &&
          bindingBefore.application.sourceTree === p.expectedContext.sourceTree,
        "source_checkout_binding",
      );
    else requireValue(bindingBefore.kind === "injected_transport_test", "test_transport_label");
    requireValue(
      Number.isFinite(Date.parse(index.startedAt)) &&
        Number.isFinite(Date.parse(index.finishedAt)) &&
        Date.parse(index.finishedAt) >= Date.parse(index.startedAt),
      "capture_time",
    );
    report.evidenceClass = index.evidenceClass;
    report.observedAt = index.finishedAt;
    report.expectedIdentity = p.expectedContext;
    const observed = observedIdentitySchema.parse(parseJson(files.get("observed-identity.json")));
    report.observedIdentity = observed;
    for (const f of [
      observed.providerObservationRef,
      observed.runtimeObservationRef,
      observed.revisionBoundaryRef,
    ].filter(Boolean))
      requireValue(
        p.files.some((r) => r.path === f),
        "undeclared_observation_provenance",
      );
    check("expected_observed_identity_bytes", same(p.expectedContext, observed.context));
    if (Object.values(p.expectedContext).some((v) => v === null))
      blocked("candidate_identity_pending");
    // This bounded collector authenticates no human, data snapshot or provider envelope.
    // A matching JSON claim is deliberately insufficient, including in injected tests.
    blocked("independent_expectation_authority_required");
    blocked("candidate_eligibility_authority_required");
    blocked("durable_revision_authority_required");
    blocked("deployment_identity_authority_required");
    const requests = requestPlan(p),
      records = new Map(),
      spans = new Map();
    requireValue(
      Array.isArray(index.members) && index.members.length <= limits.rows * 2 + 100,
      "member_count",
    );
    for (const entry of index.members) {
      requireValue(
        typeof entry.id === "string" &&
          !records.has(entry.id) &&
          /^raw-\d{4}\.bin$/.test(entry.shard),
        "duplicate_or_invalid_member",
      );
      const bytes = files.get(entry.shard);
      requireValue(
        bytes &&
          Number.isSafeInteger(entry.offset) &&
          Number.isSafeInteger(entry.length) &&
          entry.offset >= 0 &&
          entry.length >= 8 &&
          entry.offset + entry.length <= bytes.length,
        "missing_or_truncated_shard",
      );
      const member = bytes.subarray(entry.offset, entry.offset + entry.length);
      requireValue(sha256(member) === entry.sha256, "member_hash_mismatch");
      const decoded = decodeMember(member);
      memberSchema.parse(decoded.metadata);
      requireValue(
        decoded.metadata.id === entry.id &&
          decoded.metadata.retainedBytes === decoded.body.length &&
          decoded.metadata.retainedSha256 === sha256(decoded.body),
        "member_body_mismatch",
      );
      requireValue(
        decoded.metadata.bodyState === "complete"
          ? decoded.metadata.fullResponseSha256 === sha256(decoded.body)
          : decoded.metadata.fullResponseSha256 === null,
        "partial_body_claimed_complete",
      );
      requireValue(
        decoded.metadata.bodyState !== "complete" || decoded.metadata.failure === null,
        "failed_body_claimed_complete",
      );
      const m = decoded.metadata;
      requireValue(
        m.bodyState === "complete" || m.failure !== null,
        "incomplete_body_missing_failure",
      );
      if (m.request.method === "HEAD")
        requireValue(m.receivedBytes === 0 && m.retainedBytes === 0, "head_body_byte_counts");
      if (m.bodyState === "complete")
        requireValue(
          m.receivedBytes === m.retainedBytes && m.status !== null,
          "complete_body_byte_counts",
        );
      else if (m.bodyState === "redacted")
        // Replacement text can expand retained bytes, so do not compare those
        // lengths. No redaction is possible without receiving source bytes.
        requireValue(
          m.receivedBytes > 0 && m.failure === "body_credentials_redacted",
          "redacted_body_byte_counts",
        );
      else if (m.bodyState === "omitted")
        requireValue(m.receivedBytes === 0 && m.retainedBytes === 0, "omitted_body_byte_counts");
      else requireValue(m.receivedBytes >= m.retainedBytes, "partial_body_byte_counts");
      if (
        m.bodyState === "complete" &&
        m.request.method === "GET" &&
        m.headers["content-length"] !== undefined &&
        !m.headers["content-encoding"]
      )
        requireValue(
          /^\d+$/.test(m.headers["content-length"]) &&
            Number(m.headers["content-length"]) === m.receivedBytes,
          "complete_content_length",
        );
      requireValue(
        Date.parse(decoded.metadata.finishedAt) >= Date.parse(decoded.metadata.startedAt) &&
          Date.parse(decoded.metadata.startedAt) >= Date.parse(index.startedAt) &&
          Date.parse(decoded.metadata.finishedAt) <= Date.parse(index.finishedAt),
        "member_observation_time",
      );
      records.set(entry.id, decoded);
      const list = spans.get(entry.shard) ?? [];
      list.push(entry);
      spans.set(entry.shard, list);
    }
    for (const [name, bytes] of files) {
      if (!name.startsWith("raw-") || !name.endsWith(".bin")) continue;
      let offset = 0;
      for (const row of (spans.get(name) ?? []).sort((a, b) => a.offset - b.offset)) {
        requireValue(row.offset === offset, "shard_gap_or_overlap");
        offset += row.length;
      }
      requireValue(
        offset === bytes.length && bytes.length <= limits.shardBytes,
        "unindexed_shard_bytes",
      );
    }
    const expectedIds = requests.flatMap((r) => [r.id, ...(r.followPath ? [`${r.id}:hop`] : [])]);
    requireValue(
      [...records.keys()].every((id) => expectedIds.includes(id)),
      "unexpected_capture_member",
    );
    const failures = z
      .array(z.object({ id: label, code: failureCode }).strict())
      .max(limits.rows * 2 + 100)
      .parse(parseJson(files.get("failure-journal.json")));
    unique(
      failures.map((f) => f.id),
      "duplicate_failure",
    );
    const events = files
      .get("failure-events.jsonl")
      .toString("utf8")
      .split("\n")
      .filter(Boolean)
      .map((line) => parseJson(Buffer.from(line)));
    requireValue(same(events, failures), "failure_event_reconciliation");
    let complete = true;
    const projections = new Map(),
      sitemapProjections = new Map();
    const retainedByFamily = { html: 0, sitemap: 0, robots: 0, protection: 0 };
    for (const [id, record] of records) {
      const m = record.metadata;
      if (m.failure)
        requireValue(
          failures.some((f) => f.id === id && f.code === m.failure),
          "missing_failure_journal_entry",
        );
      const initial = requests.find((r) => r.id === id || `${r.id}:hop` === id);
      requireValue(initial, "unknown_request_identity");
      const expectedRequest =
        id === initial.id
          ? initial
          : {
              ...initial,
              id,
              path: initial.followPath,
              legacyHost: null,
              followPath: null,
            };
      requireValue(same(m.request, expectedRequest), "request_identity_mismatch");
      if (id !== initial.id)
        requireValue(
          records.get(initial.id)?.metadata.status === 301 &&
            records.get(initial.id)?.metadata.headers.location ===
              origins.public + initial.followPath,
          "unrequested_redirect_hop",
        );
      const maximum =
        m.request.family === "sitemap"
          ? limits.sitemapBytes
          : m.request.family === "robots"
            ? 64 * 1024
            : m.request.family === "protection"
              ? 0
              : limits.htmlBytes;
      requireValue(record.body.length <= maximum, "family_body_size_limit");
      retainedByFamily[m.request.family] += record.body.length;
      if (m.failure || m.bodyState !== "complete") complete = false;
      if (m.failure || m.bodyState !== "complete" || m.status !== 200) continue;
      if (!["html", "sitemap"].includes(m.request.family)) continue;
      try {
        const parsed =
          m.request.family === "html"
            ? htmlProjection(record.body, JSDOM)
            : sitemapProjection(record.body, JSDOM);
        (m.request.family === "html" ? projections : sitemapProjections).set(id, parsed);
        report.parsedObservations.push({
          id,
          kind: m.request.family,
          status: "PASS",
          projectionSha256: sha256(jsonBytes(parsed)),
        });
      } catch {
        report.parsedObservations.push({
          id,
          kind: m.request.family,
          status: "FAIL",
          projectionSha256: null,
        });
        check(`${m.request.family}_parse`, false, id);
      }
    }
    requireValue(
      retainedByFamily.html <= limits.htmlTotalBytes &&
        retainedByFamily.sitemap <= limits.sitemapTotalBytes &&
        Object.values(retainedByFamily).reduce((a, b) => a + b, 0) <= limits.captureBytes,
      "capture_corpus_size_limit",
    );
    for (const request of requests) {
      const record = records.get(request.id);
      if (!record) {
        check("request_present", false, request.id);
        complete = false;
        continue;
      }
      const m = record.metadata;
      requireValue(same(m.request, request), "request_identity_mismatch");
      if (
        request.followPath &&
        m.status === 301 &&
        m.headers.location === origins.public + request.followPath &&
        !records.has(`${request.id}:hop`)
      ) {
        check("redirect_hop_present", false, request.id);
        complete = false;
      }
      if (m.failure || m.bodyState !== "complete") {
        blocked("incomplete_response", request.id);
        complete = false;
      }
      if (["redirect_not_allowed", "transport_followed_redirect"].includes(m.failure))
        check("redirect_safety", false, request.id);
      if (request.family === "protection") {
        check(
          "protected_noindex",
          request.authenticated
            ? noindex(m.headers["x-robots-tag"]) &&
                m.status >= 200 &&
                m.status < 400 &&
                !["access_login", "off_origin", "unsafe"].includes(m.locationKind)
            : [401, 403].includes(m.status) ||
                ([302, 303].includes(m.status) && m.locationKind === "access_login"),
          request.id,
        );
      } else check("response_noindex", noindex(m.headers["x-robots-tag"]), request.id);
    }
    requireValue(
      failures.every((f) => records.get(f.id)?.metadata.failure === f.code),
      "unmatched_failure_journal_entry",
    );
    const frozen = p.urls.filter((r) => r.groups.includes("frozen"));
    report.coverage = {
      plannedExactSpellings: p.urls.length,
      plannedNormalized: new Set(p.urls.map((r) => r.normalizedId)).size,
      frozenSpellings: frozen.length,
      frozenNormalized: new Set(frozen.map((r) => r.normalizedId)).size,
      pendingSources: new Set(p.urls.filter((r) => r.pendingSource).map((r) => r.normalizedId))
        .size,
      pendingSnapshotReviews: p.urls.filter(
        (r) =>
          r.groups.includes("snapshot") && e.urls.find((x) => x.id === r.id)?.state === "pending",
      ).length,
      exclusions: p.urls
        .filter((r) => !r.capture)
        .map((r) => ({ id: r.id, reason: r.exclusionReason })),
      requests: requests.length,
      retainedMembers: records.size,
      scope: [
        "AT57_exact_urls",
        "head_and_visible_projection",
        "bounded_AT27_sitemap_hreflang",
        "protected_staging",
      ],
    };
    if (p.currentDelta !== "recorded") blocked("current_delta_pending");
    if (p.urls.some((r) => !r.capture || r.pendingSource))
      blocked("excluded_or_unresolved_sources");
    if (
      index.evidenceClass === "live" &&
      (frozen.length < auditedBaseline.frozenSpellings ||
        new Set(frozen.map((r) => r.normalizedId)).size < auditedBaseline.frozenNormalized)
    )
      blocked("frozen_inventory_incomplete");
    for (const row of e.urls) {
      const input = p.urls.find((r) => r.id === row.id);
      if (!input.capture) continue;
      if (
        sourceIdentity(input.sourceUrl).host === "makler-realty.ru" &&
        row.disposition?.status === 200
      ) {
        blocked("retained_ru_200_unsupported", row.id);
        continue;
      }
      let record = records.get(row.id);
      if (record?.metadata.bodyState !== "complete" || record.metadata.failure) continue;
      if (row.state !== "recorded" || !row.disposition) {
        blocked("disposition_pending", row.id);
        continue;
      }
      check("exact_disposition", record.metadata.status === row.disposition.status, row.id);
      if (row.disposition.status !== 410)
        check("target_production_identity", row.disposition.targetUrl === row.canonical, row.id);
      if (row.disposition.status === 301) {
        const target = stagingTransform(row.disposition.targetUrl);
        check(
          "one_hop_target",
          input.followPath !== null &&
            `${origins.public}${input.followPath}` === target &&
            record.metadata.headers.location === target,
          row.id,
        );
        record = records.get(`${row.id}:hop`);
        if (!record) {
          check("redirect_hop_present", false, row.id);
          complete = false;
          continue;
        }
        const initialRequest = requests.find((r) => r.id === row.id);
        requireValue(
          same(record.metadata.request, {
            ...initialRequest,
            id: `${row.id}:hop`,
            path: input.followPath,
            legacyHost: null,
            followPath: null,
          }),
          "hop_request_identity",
        );
        check("one_hop_final_200", record.metadata.status === 200, row.id);
        check("redirect_target_noindex", noindex(record.metadata.headers["x-robots-tag"]), row.id);
        if (record.metadata.failure || record.metadata.bodyState !== "complete") {
          complete = false;
          blocked("incomplete_redirect_target", row.id);
          continue;
        }
      }
      if (row.disposition.status === 410) continue;
      if (record.metadata.status !== 200) continue;
      try {
        const actual = projections.get(record.metadata.id);
        requireValue(actual, "html_parse_failed");
        // A redirect alias shares the independently parsed explicit target observation.
        projections.set(row.id, actual);
        check(
          "html_content_type",
          /^text\/html(?:;|$)/i.test(record.metadata.headers["content-type"] ?? ""),
          row.id,
        );
        check(
          "html_noindex_contradiction",
          actual.robots.every((v) => !/(?:^|[\s,:])(?:index|all)(?:$|[\s,])/i.test(v)),
          row.id,
        );
        if (!row.canonical || !row.locale) blocked("canonical_locale_pending", row.id);
        else {
          check(
            "staging_canonical_transform",
            same(actual.canonical, [stagingTransform(row.canonical)]),
            row.id,
          );
          check("html_locale", actual.lang === row.locale, row.id);
        }
        for (const name of ["title", "description"])
          row[name].state === "pending"
            ? blocked(`${name}_pending`, row.id)
            : check(`${name}_exact_presence`, metadataEqual(actual[name], row[name]), row.id);
        if (row.jsonLd === null || !row.visible) blocked("content_projection_pending", row.id);
        else {
          check("jsonld_exact_projection", same(actual.jsonLd, row.jsonLd), row.id);
          check(
            "visible_exact_projection",
            same(actual.visible[row.visible.selector], [row.visible.textSha256]),
            row.id,
          );
        }
        if (row.alternates === null) blocked("alternates_pending", row.id);
        else
          check(
            "exact_hreflang_set",
            same(
              sorted(actual.alternates),
              sorted(row.alternates.map((a) => ({ ...a, url: stagingTransform(a.url) }))),
            ),
            row.id,
          );
        if (
          row.eligibility === "pending" ||
          row.eligibility === "stale" ||
          !row.revision ||
          !row.eligibilityRef
        )
          blocked("eligibility_or_revision_pending", row.id);
        if (row.revision && e.revision)
          check("same_snapshot", row.revision.snapshotId === e.revision.snapshotId, row.id);
        if (row.eligibility !== "eligible")
          check(
            "held_edition_excluded",
            !e.sitemap.entries.some((s) => s.url === row.canonical) &&
              (row.alternates?.length ?? 0) === 0,
            row.id,
          );
      } catch {
        check("html_parse", false, row.id);
      }
    }
    const eligible = e.urls.filter((r) => r.eligibility === "eligible");
    if (!eligible.length) blocked("positive_eligible_coverage_unobserved");
    for (const row of e.urls)
      for (const alt of row.alternates ?? []) {
        const siblings = eligible.filter(
          (r) =>
            r.canonical === alt.url &&
            r.locale === (alt.locale === "x-default" ? "bg" : alt.locale),
        );
        check(
          "hreflang_eligible_reciprocal",
          siblings.length > 0 &&
            siblings.every((s) => same(sorted(s.alternates ?? []), sorted(row.alternates))),
          row.id,
        );
        if (siblings.some((s) => !projections.has(s.id)))
          blocked("hreflang_target_observation_missing", row.id);
      }
    if (
      !e.revision ||
      !observed.revision ||
      !e.revisionBoundaryRef ||
      !observed.revisionBoundaryRef
    )
      blocked("revision_boundary_missing");
    else
      check(
        "revision_boundary_claim_consistency",
        same(e.revision, observed.revision) &&
          e.revision.startSequence === e.revision.endSequence &&
          e.revisionBoundaryRef === observed.revisionBoundaryRef,
      );
    const robots = records.get("robots");
    if (robots?.metadata.bodyState === "complete") {
      const lines = robots.body
        .toString("utf8")
        .split(/\r?\n/)
        .map((l) => l.replace(/#.*/, "").trim())
        .filter(Boolean);
      check(
        "robots_staging_disallow",
        robots.metadata.status === 200 &&
          same(
            lines.map((l) => l.toLowerCase()),
            ["user-agent: *", "disallow: /"],
          ),
      );
    }
    if (e.sitemap.state !== "recorded") blocked("sitemap_expectations_pending");
    else {
      check(
        "sitemap_exact_eligible_expectations",
        same(
          [...new Set(eligible.map((r) => r.canonical))].sort(),
          e.sitemap.entries.map((r) => r.url).sort(),
        ),
      );
      try {
        const maps = p.sitemapPaths.map((_, i) => {
          const r = records.get(`sitemap:${i}`);
          requireValue(
            r?.metadata.status === 200 &&
              r.metadata.bodyState === "complete" &&
              !r.metadata.failure,
            "sitemap_incomplete",
          );
          const parsed = sitemapProjections.get(`sitemap:${i}`);
          requireValue(parsed, "sitemap_parse_failed");
          return parsed;
        });
        if (maps[0].kind === "index") {
          check(
            "sitemap_parts_exact",
            same(
              sorted(maps[0].parts),
              sorted(p.sitemapPaths.slice(1).map((v) => origins.public + v)),
            ),
          );
          requireValue(
            maps.slice(1).every((m) => m.kind === "urlset"),
            "nested_sitemap_index",
          );
        } else check("sitemap_no_undeclared_parts", maps.length === 1);
        const entries = maps.flatMap((m) => m.entries ?? []);
        check("sitemap_no_duplicates", new Set(entries.map((r) => r.url)).size === entries.length);
        check(
          "sitemap_exact_entries",
          same(
            sorted(entries),
            sorted(
              e.sitemap.entries.map((r) => ({
                url: stagingTransform(r.url),
                lastmod: r.lastmod,
                alternates: r.alternates.map((a) => ({
                  ...a,
                  url: stagingTransform(a.url),
                  rel: "alternate",
                })),
              })),
            ),
          ),
        );
        for (const entry of e.sitemap.entries)
          check(
            "sitemap_hreflang_agrees_with_html",
            eligible.some(
              (r) =>
                r.canonical === entry.url &&
                same(sorted(r.alternates ?? []), sorted(entry.alternates)),
            ),
          );
      } catch {
        check("sitemap_parse_or_capture", false);
      }
    }
    report.captureComplete = complete;
  } catch (error) {
    // Codes only: schema input, parser messages and raw exceptions can contain credentials.
    check("capture_contract_or_integrity", false);
    report.integrityError =
      error instanceof z.ZodError
        ? "schema_invalid"
        : /^[a-z_]+$/.test(error?.message ?? "")
          ? error.message
          : "invalid_capture";
  }
  blocked("whole_candidate_bundle_admission_required");
  const authorityOnly = new Set([
    "independent_expectation_authority_required",
    "candidate_eligibility_authority_required",
    "durable_revision_authority_required",
    "deployment_identity_authority_required",
    "whole_candidate_bundle_admission_required",
  ]);
  // Include this receipt and the explicit supporting inventory in the local package sum.
  // The future full candidate bundle still has additional files and admission requirements.
  for (let pass = 0; pass < 8; pass++) {
    const before = jsonBytes(report).length;
    const measured = new Map(files);
    measured.set("staging-url-seo-sitemap-parity.json", jsonBytes(report));
    measured.set(
      "supporting-files.json",
      jsonBytes(
        [...measured].map(([path, bytes]) => ({
          path,
          bytes: bytes.length,
          sha256: sha256(bytes),
        })),
      ),
    );
    report.package = packageBudget(measured);
    for (const violation of report.package.violations)
      if (!blockers.has(violation)) blocked(violation);
    report.technicalStatus = checks.some((c) => c.status === "FAIL")
      ? "FAIL"
      : checks.some((c) => c.status === "BLOCKED" && !authorityOnly.has(c.id))
        ? "BLOCKED"
        : "PASS";
    report.status = report.technicalStatus === "FAIL" ? "FAIL" : "BLOCKED";
    report.blockers = [...blockers].sort();
    if (jsonBytes(report).length === before) break;
  }
  return report;
}
