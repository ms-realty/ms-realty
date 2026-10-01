import { createHash, X509Certificate } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateConnectionProof } from "./staging-connection-proof.mjs";

export const launchBase = "e23d17b1ce71fce694e823643ea94a7440dd4912";
export const accountId = "921d0224dcd595c87b7928d2b3c479d1";
export const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const fail = (field) => {
  throw new Error(`Required staging input is missing or invalid: ${field}`);
};
const demand = (ok, field) => {
  if (!ok) fail(field);
};
const pin = (value) => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const id = (value) => typeof value === "string" && /^[a-f0-9-]{36}$/.test(value);
const address = (value) => typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const knownHosts = [
  "staging.makler-realty.com",
  "my.staging.makler-realty.com",
  "app.staging.makler-realty.com",
];
export const requiredSecrets = [
  "WEB_DATABASE_URL",
  "WORKER_DATABASE_URL",
  "MIGRATOR_DATABASE_URL",
  "AUTH_SECRET",
  "ORIGIN_VERIFY_SECRET",
  "EMAIL_RELAY_SECRET",
  "STAGING_CONTROL_SECRET",
  "ACCESS_SERVICE_CLIENT_SECRET",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
];

export function stagingRequiredSecrets(input) {
  return input.database?.transport === "cloudflared-access-tcp"
    ? [...requiredSecrets, "DATABASE_TLS_CA_PEM", "TUNNEL_SERVICE_TOKEN_SECRET"]
    : requiredSecrets;
}

export function validateStaging(
  input,
  artifacts,
  runtime = undefined,
  { imageRequired = true, connectivityProbe = false } = {},
) {
  demand(
    input?.schemaVersion === 1 && input.environment === "staging" && input.runtime === "containers",
    "environment/runtime",
  );
  demand(
    input.accountId === accountId && /^[a-f0-9]{32}$/.test(input.zoneId ?? ""),
    "Cloudflare account/zone",
  );
  demand(input.workerName === "ms-realty-staging", "isolated Worker name");
  demand(
    ["complete_parity", "protected_partial_preview"].includes(input.purpose),
    "explicit staging purpose",
  );
  demand(
    input.baseCommit === launchBase && /^[a-f0-9]{40}$/.test(input.sourceCommit ?? ""),
    "exact source/base commits",
  );
  if (imageRequired)
    demand(
      new RegExp(`^registry\\.cloudflare\\.com/${accountId}/[a-z0-9-]+@sha256:[a-f0-9]{64}$`).test(
        input.image ?? "",
      ),
      "digest-pinned image",
    );
  for (const [i, surface] of ["public", "client", "staff"].entries())
    demand(input.origins?.[surface] === `https://${knownHosts[i]}`, `${surface} isolated origin`);
  const access = input.access;
  demand(
    id(access?.applicationId) && id(access?.controllerGroupId) && id(access?.serviceTokenId),
    "Access application/group/service identities",
  );
  demand(
    address(access.ownerEmail) &&
      pin(access.audience) &&
      /^[a-z0-9-]+\.access$/.test(access.serviceClientId ?? ""),
    "Access owner/audience/service client",
  );
  demand(
    Array.isArray(access.controllerEmails) &&
      access.controllerEmails.length > 0 &&
      access.controllerEmails.every(address),
    "reviewed controller Access identities",
  );
  demand(
    /^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(access.teamDomain ?? ""),
    "Access team domain",
  );
  demand(
    input.database?.engineVersion === "16.14" &&
      input.database.productionName === "ms_realty_payload" &&
      /^[a-z][a-z0-9_]+$/.test(input.database.stagingName ?? "") &&
      input.database.stagingName !== input.database.productionName,
    "isolated PostgreSQL 16.14 database",
  );
  demand(
    /^[a-z0-9.-]+$/.test(input.database.stagingHost ?? "") &&
      !["localhost", "127.0.0.1"].includes(input.database.stagingHost),
    "reviewed private staging database host",
  );
  demand(
    ["web", "worker", "migrator"].every((role) =>
      /^[a-z][a-z0-9_]+$/.test(input.database.roles?.[role] ?? ""),
    ) && new Set(Object.values(input.database.roles)).size === 3,
    "three reviewed staging database roles",
  );
  demand(
    ["direct", "cloudflared-access-tcp"].includes(input.database.transport),
    "explicit reviewed database transport",
  );
  if (input.database.transport === "cloudflared-access-tcp")
    demand(
      /(?:^|\.)(?:stage|staging)(?:\.|$)/.test(input.database.stagingHost) &&
        !knownHosts.includes(input.database.stagingHost) &&
        id(input.database.access?.applicationId) &&
        pin(input.database.access?.audience) &&
        id(input.database.access?.serviceTokenId) &&
        typeof input.database.access?.serviceClientId === "string" &&
        /^[A-Za-z0-9_-]+\.access$/.test(input.database.access.serviceClientId) &&
        input.database.access.serviceTokenId !== input.access.serviceTokenId &&
        input.database.access.serviceClientId !== input.access.serviceClientId,
      "separate staging database Access application and service token",
    );
  demand(
    pin(input.database.originIsolationSha256) &&
      sha256(artifacts.isolation ?? "") === input.database.originIsolationSha256,
    "pinned origin isolation inspection",
  );
  const isolation = JSON.parse(artifacts.isolation);
  demand(
    isolation.status === "PASS" &&
      isolation.from === "origin-read-only-inspection" &&
      isolation.environment === "staging" &&
      isolation.database === input.database.stagingName &&
      isolation.engineVersion === "16.14" &&
      isolation.exposesPublicPostgres === false &&
      isolation.productionChanged === false &&
      typeof isolation.inspectedAt === "string" &&
      Number.isFinite(Date.parse(isolation.inspectedAt)),
    "actual isolated PostgreSQL origin inspection",
  );
  if (!connectivityProbe) {
    demand(
      pin(input.database.privateConnectivitySha256) &&
        sha256(artifacts.connectivity ?? "") === input.database.privateConnectivitySha256,
      "private database connectivity evidence",
    );
    const network = JSON.parse(artifacts.connectivity);
    demand(
      network.status === "PASS" &&
        network.database === input.database.stagingName &&
        network.engineVersion === "16.14" &&
        network.transport === input.database.transport &&
        network.tlsVerification === "verify-full" &&
        network.from === "cloudflare-containers" &&
        network.exposesPublicPostgres === false,
      "actual private TLS connection from Containers",
    );
    demand(
      network.schemaVersion === 2 &&
        network.sourceCommit === input.sourceCommit &&
        network.image === input.image &&
        network.originIsolationSha256 === input.database.originIsolationSha256,
      "connection proof bound to source, immutable image and origin isolation",
    );
    validateConnectionProof(input, network.runtime, network.connections);
  }
  const buckets = input.buckets;
  demand(
    buckets?.productionMedia === "ms-realty-media" &&
      buckets.productionCache === "ms-realty-production-opennext-cache",
    "recorded production buckets",
  );
  demand(
    [buckets.stagingMedia, buckets.stagingCache].every(
      (x) => typeof x === "string" && /^ms-realty-staging-[a-z0-9-]+$/.test(x),
    ) && new Set(Object.values(buckets)).size === 4,
    "separate staging media/cache buckets",
  );
  demand(
    address(input.email?.from) &&
      input.email.from.endsWith("@notifications.makler-realty.com") &&
      Array.isArray(input.email.allowedRecipients) &&
      input.email.allowedRecipients.length === 1 &&
      input.email.allowedRecipients.every(address),
    "verified sender and one reviewed test inbox",
  );
  demand(
    input.email.replyDomain === null ||
      /^(?:[a-z0-9-]+\.)+[a-z]{2,63}$/.test(input.email.replyDomain ?? ""),
    "reviewed reply domain",
  );
  demand(
    typeof input.email.inquiryCoverageNoticeEnabled === "boolean" &&
      typeof input.email.testInboxReviewed === "boolean" &&
      (!input.email.inquiryCoverageNoticeEnabled || input.email.testInboxReviewed),
    "inquiry notice requires explicit reviewed staging inbox",
  );
  demand(
    pin(input.artifacts?.routesSha256) &&
      sha256(artifacts.routes ?? "") === input.artifacts.routesSha256,
    "exact legacy route artifact",
  );
  demand(
    pin(input.artifacts.mediaSha256) &&
      sha256(artifacts.media ?? "") === input.artifacts.mediaSha256,
    "exact public media allowlist",
  );
  const routes = JSON.parse(artifacts.routes),
    manifest = JSON.parse(artifacts.manifest),
    media = JSON.parse(artifacts.media);
  demand(
    pin(input.artifacts.routeManifestSha256) &&
      sha256(artifacts.manifest) === input.artifacts.routeManifestSha256,
    "exact staging manifest artifact",
  );
  const partial = input.purpose === "protected_partial_preview";
  demand(
    (partial
      ? manifest.status === "ready_partial" &&
        manifest.scope === "staging_only" &&
        manifest.productionAllowed === false
      : manifest.status === "ready") &&
      manifest.routeArtifactSha256 === input.artifacts.routesSha256 &&
      Array.isArray(manifest.blockers) &&
      manifest.blockers.length === 0 &&
      Number.isInteger(manifest.uniqueSources) &&
      manifest.uniqueSources > 0,
    "reviewed staging route manifest for explicit purpose",
  );
  if (partial)
    demand(
      Array.isArray(manifest.exclusions) &&
        pin(input.artifacts.exclusionsSha256) &&
        sha256(JSON.stringify(manifest.exclusions)) === input.artifacts.exclusionsSha256 &&
        manifest.exclusions.every(
          (x) =>
            typeof x.id === "string" &&
            typeof x.sourceUrl === "string" &&
            typeof x.reason === "string" &&
            x.reason,
        ),
      "explicit pinned partial-preview exclusions",
    );
  demand(
    Array.isArray(routes) && routes.length === manifest.uniqueSources,
    "100 percent normalized route identities",
  );
  const seen = new Set();
  for (const row of routes) {
    const key = JSON.stringify([row.host, row.path, row.query]);
    demand(
      /^makler-realty\.(com|ru)$/.test(row.host) &&
        row.path?.startsWith("/") &&
        !row.path.startsWith("//") &&
        !/[\\\r\n?#]/.test(row.path) &&
        typeof row.query === "string" &&
        (row.query === "" || row.query.startsWith("?")) &&
        [200, 301].includes(row.status) &&
        row.targetHost === "makler-realty.com" &&
        row.targetPath?.startsWith("/") &&
        !row.targetPath.startsWith("//") &&
        !/[\\\r\n#]/.test(row.targetPath) &&
        !seen.has(key),
      "zero-loss route identity/target",
    );
    seen.add(key);
    demand(
      !(row.host === "makler-realty.ru" && row.status === 200),
      ".ru retained 200 external-host self-canonical qualification is required",
    );
  }
  for (const row of routes.filter((x) => x.status === 301)) {
    const target = new URL(row.targetPath, "https://makler-realty.com");
    demand(
      !routes.some(
        (x) =>
          x.host === "makler-realty.com" &&
          x.path === decodeURIComponent(target.pathname) &&
          x.query === target.search &&
          x.status === 301,
      ),
      "single-hop legacy redirect",
    );
  }
  demand(
    Array.isArray(media) &&
      media.length > 0 &&
      media.every(
        (x) =>
          /^makler-realty\.(com|ru)$/.test(x.host) &&
          x.path.startsWith("/wp-content/uploads/") &&
          !/[\\\r\n?#%]/.test(x.path) &&
          !x.path.split("/").some((segment) => segment === "." || segment === "..") &&
          x.key === `${x.host}${x.path}`,
      ) &&
      new Set(media.map((x) => x.key)).size === media.length,
    "public media identities",
  );
  demand(
    input.runtimeVars &&
      Object.values(input.runtimeVars).every(
        (value) => typeof value === "string" && Buffer.byteLength(value) <= 5 * 1024,
      ) &&
      Object.keys(input.runtimeVars).every((k) =>
        [
          "WEBAUTHN_RP_NAME",
          "CLAMAV_HOST",
          "CLAMAV_PORT",
          "CLAMAV_MAX_SIGNATURE_AGE_HOURS",
          "GTM_CONTAINER_ID",
          "SITE_GOOGLE_VERIFICATION",
        ].includes(k),
      ),
    "allowlisted runtime variables",
  );
  demand(
    input.runtimeVars.GTM_CONTAINER_ID === undefined ||
      /^GTM-[A-Z0-9]+$/.test(input.runtimeVars.GTM_CONTAINER_ID),
    "reviewed GTM container ID",
  );
  demand(
    input.runtimeVars.SITE_GOOGLE_VERIFICATION === undefined ||
      /^[A-Za-z0-9_-]{20,128}$/.test(input.runtimeVars.SITE_GOOGLE_VERIFICATION),
    "nonsecret Search Console verification token",
  );
  demand(
    typeof input.runtimeVars?.CLAMAV_HOST === "string" &&
      /^[a-z0-9.-]+$/.test(input.runtimeVars.CLAMAV_HOST) &&
      /^[0-9]+$/.test(input.runtimeVars.CLAMAV_PORT ?? ""),
    "isolated private ClamAV endpoint",
  );
  demand(
    input.rollback?.retainDays >= 90 &&
      pin(input.rollback.evidenceSha256) &&
      /^https:\/\//.test(input.rollback.legacyOrigin ?? "") &&
      !knownHosts.some((h) => input.rollback.legacyOrigin.includes(h)),
    "untouched WordPress rollback retained for 90 days",
  );
  if (runtime) {
    for (const name of stagingRequiredSecrets(input))
      demand(
        typeof runtime[name] === "string" &&
          runtime[name].length > 0 &&
          Buffer.byteLength(runtime[name]) <= 5 * 1024,
        name,
      );
    for (const name of [
      "AUTH_SECRET",
      "ORIGIN_VERIFY_SECRET",
      "EMAIL_RELAY_SECRET",
      "STAGING_CONTROL_SECRET",
      "ACCESS_SERVICE_CLIENT_SECRET",
    ])
      demand(runtime[name].length >= 32, `${name} strength`);
    if (input.database.transport === "cloudflared-access-tcp") {
      demand(runtime.TUNNEL_SERVICE_TOKEN_SECRET.length >= 32, "database Access token strength");
      try {
        const pem = runtime.DATABASE_TLS_CA_PEM.trim();
        demand(
          /^-----BEGIN CERTIFICATE-----[\s\S]+-----END CERTIFICATE-----$/.test(pem) &&
            (pem.match(/-----BEGIN CERTIFICATE-----/g) ?? []).length === 1,
          "one staging database CA certificate",
        );
        const ca = new X509Certificate(pem);
        demand(
          ca.ca && Date.parse(ca.validFrom) <= Date.now() && Date.parse(ca.validTo) > Date.now(),
          "valid staging database CA certificate",
        );
      } catch {
        fail("valid staging database CA certificate");
      }
    }
    const roles = ["WEB_DATABASE_URL", "WORKER_DATABASE_URL", "MIGRATOR_DATABASE_URL"].map(
      (name, index) => {
        let url;
        try {
          url = new URL(runtime[name]);
        } catch {
          fail(name);
        }
        demand(
          /^postgres(?:ql)?:$/.test(url.protocol) &&
            url.pathname.slice(1) === input.database.stagingName &&
            url.hostname === input.database.stagingHost &&
            url.searchParams.get("sslmode") === "verify-full" &&
            (input.database.transport !== "cloudflared-access-tcp" ||
              (url.searchParams.getAll("sslmode").length === 1 &&
                [...url.searchParams.keys()].every((key) => key === "sslmode"))) &&
            url.username === input.database.roles[["web", "worker", "migrator"][index]] &&
            url.password,
          name,
        );
        return url;
      },
    );
    demand(
      new Set(roles.map((x) => x.username)).size === 3 &&
        new Set(roles.map((x) => x.host)).size === 1,
      "distinct least-privilege roles on the same staging database",
    );
  }
  return input;
}

export function stagingConfig(input, artifacts, { connectivityProbe = false } = {}) {
  validateStaging(input, artifacts, undefined, { connectivityProbe });
  const imageDigest = input.image.split("@")[1];
  const config = {
    $schema: "../gateway/node_modules/wrangler/config-schema.json",
    name: input.workerName,
    account_id: input.accountId,
    main: "../gateway/cloudflare.ts",
    compatibility_date: "2026-09-28",
    compatibility_flags: ["nodejs_compat"],
    workers_dev: false,
    preview_urls: false,
    routes: knownHosts.map((host) => ({ pattern: `${host}/*`, zone_id: input.zoneId })),
    observability: { enabled: true },
    triggers: { crons: ["*/5 * * * *"] },
    containers: ["MsRealtyContainer", "MsRealtyWorkerContainer", "MsRealtyMigratorContainer"].map(
      (class_name) => ({
        class_name,
        image: input.image,
        instance_type: "basic",
        max_instances: 1,
      }),
    ),
    durable_objects: {
      bindings: [
        { name: "MS_REALTY", class_name: "MsRealtyContainer" },
        { name: "MS_REALTY_WORKER", class_name: "MsRealtyWorkerContainer" },
        { name: "MS_REALTY_MIGRATOR", class_name: "MsRealtyMigratorContainer" },
        { name: "EMAIL_RECEIPTS", class_name: "EmailReceipt" },
      ],
    },
    migrations: [
      {
        tag: "staging-v1",
        new_sqlite_classes: [
          "MsRealtyContainer",
          "MsRealtyWorkerContainer",
          "MsRealtyMigratorContainer",
          "EmailReceipt",
        ],
      },
    ],
    r2_buckets: [
      { binding: "MEDIA", bucket_name: input.buckets.stagingMedia },
      { binding: "NEXT_CACHE", bucket_name: input.buckets.stagingCache },
    ],
    send_email: [
      {
        name: "EMAIL",
        allowed_destination_addresses: input.email.allowedRecipients,
        allowed_sender_addresses: [input.email.from],
      },
    ],
    vars: {
      STAGING: "true",
      STAGING_CONNECTIVITY_ONLY: connectivityProbe ? "true" : "false",
      IMAGE_DIGEST: imageDigest,
      BUILD_SHA: input.sourceCommit,
      STAGING_DATABASE_NAME: input.database.stagingName,
      STAGING_DATABASE_HOST: input.database.stagingHost,
      DATABASE_TRANSPORT: input.database.transport,
      ...(input.database.transport === "cloudflared-access-tcp"
        ? {
            TUNNEL_SERVICE_HOSTNAME: input.database.stagingHost,
            TUNNEL_SERVICE_URL: "127.0.0.1:15432",
            TUNNEL_SERVICE_TOKEN_ID: input.database.access.serviceClientId,
          }
        : {}),
      STAGING_WEB_DATABASE_ROLE: input.database.roles.web,
      STAGING_WORKER_DATABASE_ROLE: input.database.roles.worker,
      STAGING_MIGRATOR_DATABASE_ROLE: input.database.roles.migrator,
      ORIGIN_URL: "https://container.invalid",
      PUBLIC_ORIGIN: input.origins.public,
      CLIENT_ORIGIN: input.origins.client,
      STAFF_ORIGIN: input.origins.staff,
      APP_ORIGIN: input.origins.public,
      CANONICAL_ORIGIN: input.origins.public,
      LEGACY_TARGET_HOST: "makler-realty.com",
      LEGACY_ROUTES_SHA256: input.artifacts.routesSha256,
      PUBLIC_MEDIA_SHA256: input.artifacts.mediaSha256,
      ACCESS_TEAM_DOMAIN: input.access.teamDomain,
      ACCESS_AUD: input.access.audience,
      ACCESS_SERVICE_CLIENT_ID: input.access.serviceClientId,
      EMAIL_FROM: input.email.from,
      EMAIL_ALLOWED_RECIPIENTS: JSON.stringify(input.email.allowedRecipients),
      EMAIL_REPLY_DOMAIN: input.email.replyDomain ?? "",
      INQUIRY_COVERAGE_NOTICE_ENABLED: input.email.inquiryCoverageNoticeEnabled ? "1" : "0",
      INQUIRY_COVERAGE_TEST_INBOX_REVIEWED: input.email.testInboxReviewed ? "true" : "false",
      INQUIRY_COVERAGE_TEST_INBOX: input.email.allowedRecipients[0],
      R2_ACCOUNT_ID: input.accountId,
      R2_BUCKET: input.buckets.stagingMedia,
      MEDIA_PUBLIC_BASE_URL: `${input.origins.public}/media`,
      FILE_STORAGE: "r2",
      MAP_RELEASE_ID: "",
      ...input.runtimeVars,
    },
  };
  demand(
    Object.values(config.vars).every(
      (value) => typeof value === "string" && Buffer.byteLength(value) <= 5 * 1024,
    ),
    "Workers binding size/type limits",
  );
  return config;
}

export async function readStagingInputs(path, root = process.cwd()) {
  const input = JSON.parse(await readFile(path, "utf8"));
  const local = async (name) => {
    demand(
      typeof name === "string" && !name.includes("..") && !name.startsWith("/"),
      "local artifact path",
    );
    return readFile(resolve(root, name), "utf8");
  };
  const [routes, manifest, media, connectivity, isolation] = await Promise.all([
    local(input.artifacts?.routes),
    local(input.artifacts?.routeManifest),
    local(input.artifacts?.media),
    input.database?.privateConnectivityReport == null
      ? ""
      : local(input.database.privateConnectivityReport),
    local(input.database?.originIsolationReport),
  ]);
  return { input, artifacts: { routes, manifest, media, connectivity, isolation } };
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const { input, artifacts } = await readStagingInputs(process.argv[2]);
    validateStaging(
      input,
      artifacts,
      process.argv.includes("--require-secrets") ? process.env : undefined,
      {
        imageRequired: !process.argv.includes("--before-image"),
        connectivityProbe: process.argv.includes("--connectivity-probe"),
      },
    );
    const output = process.argv[3];
    if (output && !output.startsWith("--")) {
      demand(
        dirname(resolve(output)) === resolve("deploy") && output.endsWith(".generated.json"),
        "generated config destination",
      );
      await writeFile(
        output,
        `${JSON.stringify(stagingConfig(input, artifacts, { connectivityProbe: process.argv.includes("--connectivity-probe") }), null, 2)}\n`,
      );
      // Workers limits each variable to 5 KB. Preserve large artifact bytes in the bundled
      // immutable module instead; the corresponding SHA bindings still validate every read.
      const payload = {
        fixture: false,
        sourceCommit: input.sourceCommit,
        routes: artifacts.routes,
        media: artifacts.media,
      };
      await writeFile(
        "gateway/staging-artifacts.generated.ts",
        `export const stagingArtifacts: {fixture:boolean;sourceCommit:string;routes:string;media:string} = ${JSON.stringify(payload)};\n`,
      );
    }
    console.log("Staging inputs validated; this is not deployment or launch evidence.");
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Staging inputs unavailable");
    process.exitCode = 1;
  }
}
