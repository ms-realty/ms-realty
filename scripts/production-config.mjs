// Local guarded configuration generation only. No provider API, shell, deploy or rebuild.

import { createPublicKey } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { productionRuntimeEnvironment } from "../gateway/production-runtime-env.ts";
import { promotionGate, signedPayload } from "./launch-gate.mjs";
import { accountId, sha256 } from "./staging-config.mjs";

const demand = (condition, field) => {
  if (!condition) throw new Error(`Production configuration blocked: ${field}`);
};
const hex = (value) => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const uuid = (value) => /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(value ?? "");
const address = (value) =>
  typeof value === "string" && /^[^\s@\r\n]+@[^\s@\r\n]+\.[^\s@\r\n]+$/.test(value);
const json = (bytes) => JSON.parse(bytes.toString());
const runtimeNames = new Set([
  "WEBAUTHN_RP_NAME",
  "FILE_SCAN_MODE",
  "CLAMAV_HOST",
  "CLAMAV_PORT",
  "CLAMAV_MAX_SIGNATURE_AGE_HOURS",
  "R2_JURISDICTION",
  "MAP_RELEASE_ID",
  "GTM_CONTAINER_ID",
  "SITE_GOOGLE_VERIFICATION",
]);
export const productionSecrets = [
  "WEB_DATABASE_URL",
  "WORKER_DATABASE_URL",
  "MIGRATOR_DATABASE_URL",
  "AUTH_SECRET",
  "ORIGIN_VERIFY_SECRET",
  "PRODUCTION_CONTROL_SECRET",
  "EMAIL_RELAY_SECRET",
  "ACCESS_SERVICE_CLIENT_SECRET",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
];

export function productionConfig(
  inputBytes,
  artifacts,
  evidence,
  trustedKeys,
  { runtime, now = Date.now() } = {},
) {
  const input = json(inputBytes),
    inputSha256 = sha256(inputBytes);
  demand(
    input.schemaVersion === 1 &&
      input.environment === "production" &&
      input.runtime === "containers" &&
      input.purpose === "complete_parity" &&
      input.accountId === accountId &&
      /^[a-f0-9]{40}$/.test(input.sourceCommit ?? ""),
    "explicit production identity",
  );
  const acceptance = promotionGate(
    evidence.report,
    evidence.approvals,
    trustedKeys,
    evidence.expected,
    now,
  );
  demand(
    acceptance.sourceCommit === input.sourceCommit &&
      input.workerName === `ms-realty-production-${input.sourceCommit.slice(0, 12)}` &&
      input.image?.endsWith(`@${acceptance.digest}`) &&
      new RegExp(
        `^registry\\.cloudflare\\.com/${accountId}/[a-z0-9._-]+@sha256:[a-f0-9]{64}$`,
      ).test(input.image),
    "same accepted immutable image and dedicated Worker",
  );
  for (const role of ["owner", "controller"]) {
    const approval = signedPayload(evidence.approvals[role], trustedKeys[role]);
    demand(
      approval.productionInputsSha256 === inputSha256,
      `${role} exact production configuration approval`,
    );
  }
  demand(
    input.control?.zoneId === "f0ac7af0721419e8129e5d10ff547372" &&
      input.control.pattern === "app.makler-realty.com/__release/*",
    "only the reviewed private staff control path",
  );
  demand(
    input.origins?.public === "https://makler-realty.com" &&
      input.origins.client === "https://my.makler-realty.com" &&
      input.origins.staff === "https://app.makler-realty.com" &&
      input.buckets?.media === "ms-realty-media" &&
      input.buckets.cache === "ms-realty-production-opennext-cache",
    "exact production surfaces and existing bucket identities",
  );
  for (const name of ["routes", "media", "manifest", "ownership"])
    demand(
      hex(input.artifacts?.[name]) && sha256(artifacts[name] ?? "") === input.artifacts[name],
      `exact ${name} artifact`,
    );
  demand(
    input.artifacts.routes === evidence.expected.routesSha256 &&
      input.artifacts.media === evidence.expected.mediaSha256,
    "accepted route/media bytes",
  );
  const manifest = json(artifacts.manifest),
    routes = json(artifacts.routes),
    media = json(artifacts.media);
  demand(
    manifest.status === "ready" &&
      manifest.productionAllowed !== false &&
      manifest.completeCurrentDelta !== false &&
      Array.isArray(manifest.blockers) &&
      manifest.blockers.length === 0 &&
      (!manifest.exclusions || manifest.exclusions.length === 0) &&
      manifest.routeArtifactSha256 === input.artifacts.routes &&
      manifest.sourceRows >= 457 &&
      manifest.uniqueSources > 0 &&
      Array.isArray(routes) &&
      routes.length >= 454 &&
      Array.isArray(media) &&
      media.length > 0,
    "complete production routing/source/media manifest; partial previews cannot generate production config",
  );
  const database = input.database;
  demand(
    database?.name === "ms_realty_payload" &&
      database.engineVersion === "16.14" &&
      hex(database.schemaSha256) &&
      /^[a-z0-9.-]+$/.test(database.host ?? "") &&
      !/(?:^|[.-])(?:stage|staging|localhost)(?:[.-]|$)/.test(database.host) &&
      database.host.includes(".") &&
      ["direct", "cloudflared-access-tcp"].includes(database.transport) &&
      ["web", "worker", "migrator"].every((role) =>
        /^[a-z][a-z0-9_]+$/.test(database.roles?.[role] ?? ""),
      ) &&
      new Set(Object.values(database.roles)).size === 3,
    "explicit PostgreSQL production schema/transport/roles",
  );
  const access = input.access;
  demand(
    uuid(access?.applicationId) &&
      uuid(access?.serviceTokenId) &&
      hex(access?.audience) &&
      /^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(access.teamDomain ?? "") &&
      /^[a-zA-Z0-9_-]+\.access$/.test(access.serviceClientId ?? ""),
    "separate exact production control Access identities",
  );
  if (database.transport === "cloudflared-access-tcp")
    demand(
      uuid(database.access?.applicationId) &&
        uuid(database.access?.serviceTokenId) &&
        hex(database.access?.audience) &&
        /^[a-zA-Z0-9_-]+\.access$/.test(database.access?.serviceClientId ?? "") &&
        database.access.serviceTokenId !== access.serviceTokenId &&
        database.access.serviceClientId !== access.serviceClientId,
      "separate production database Access service identity",
    );
  const ownership = json(artifacts.ownership);
  demand(
    ownership.schemaVersion === 1 &&
      ownership.environment === "production" &&
      ownership.sourceCommit === input.sourceCommit &&
      ownership.digest === acceptance.digest &&
      ownership.intake?.activeOwner === input.workerName &&
      ownership.intake.oldConsequentialWorkersDisabled === true &&
      hex(ownership.intake.acceptedWritesLedgerSha256) &&
      ownership.databasePolicy === "preserve-current" &&
      uuid(ownership.recoveryPointId) &&
      Date.parse(ownership.measuredAt) <= now &&
      now - Date.parse(ownership.measuredAt) <= 300_000,
    "actual production intake/accepted-write ownership receipt",
  );
  let features = { CASE_EMAIL_ENABLED: "0", CASE_INBOUND_ENABLED: "0", BUTLER_ENABLED: "0" },
    featureHash = "",
    emailHash = "",
    butlerVars = {};
  const policy = (name, purpose) => {
    demand(
      hex(input.artifacts[name]) && sha256(artifacts[name] ?? "") === input.artifacts[name],
      `exact ${name} policy artifact`,
    );
    const payload = signedPayload(json(artifacts[name]), trustedKeys.controller);
    demand(
      payload.schemaVersion === 1 &&
        payload.purpose === purpose &&
        payload.environment === "production" &&
        payload.sourceCommit === input.sourceCommit &&
        payload.digest === acceptance.digest &&
        payload.ownershipSha256 === input.artifacts.ownership &&
        Date.parse(payload.observedAt) <= now &&
        now - Date.parse(payload.observedAt) <= 86_400_000 &&
        hex(payload.evidenceSha256),
      `actual controller ${name} policy evidence`,
    );
    return payload;
  };
  if (input.artifacts.features != null) {
    const reviewed = policy("features", "production-feature-policy");
    demand(
      reviewed.features &&
        Object.keys(reviewed.features).length === 3 &&
        Object.keys(features).every((key) => ["0", "1"].includes(reviewed.features[key])),
      "explicit feature disposition",
    );
    features = reviewed.features;
    featureHash = input.artifacts.features;
    if (features.BUTLER_ENABLED === "1") {
      demand(
        reviewed.butlerVars &&
          Object.keys(reviewed.butlerVars).length > 0 &&
          Object.entries(reviewed.butlerVars).every(
            ([name, value]) =>
              /^BUTLER_[A-Z0-9_]+$/.test(name) &&
              !/(?:^|_)(?:DATABASE|ENCRYPTION|KEY|SECRET|OPERATOR|ACCESS|REFRESH|TOKEN)(?:_|$)/.test(
                name,
              ) &&
              typeof value === "string" &&
              Buffer.byteLength(value) <= 5 * 1024,
          ),
        "reviewed non-secret Butler route/budget variables",
      );
      butlerVars = reviewed.butlerVars;
    }
  }
  demand(
    address(input.email?.from) &&
      input.email.from.endsWith("@notifications.makler-realty.com") &&
      Array.isArray(input.email.allowedRecipients) &&
      input.email.allowedRecipients.length <= 100 &&
      input.email.allowedRecipients.every(address),
    "reviewed sender/recipient policy; no wildcard recipient",
  );
  if (input.artifacts.emailPolicy != null) {
    const reviewed = policy("emailPolicy", "production-email-policy");
    demand(
      reviewed.from === input.email.from &&
        JSON.stringify(reviewed.allowedRecipients) ===
          JSON.stringify(input.email.allowedRecipients) &&
        input.email.allowedRecipients.length > 0,
      "exact measured sender and authorized recipients",
    );
    emailHash = input.artifacts.emailPolicy;
  }
  demand(
    ![features.CASE_EMAIL_ENABLED, features.CASE_INBOUND_ENABLED].includes("1") || emailHash,
    "email features require independent delivery/ownership policy",
  );
  const runtimeVars = input.runtimeVars ?? {};
  demand(
    Object.entries(runtimeVars).every(
      ([name, value]) =>
        runtimeNames.has(name) && typeof value === "string" && Buffer.byteLength(value) <= 5 * 1024,
    ) &&
      runtimeVars.FILE_SCAN_MODE === "clamav" &&
      runtimeVars.CLAMAV_HOST,
    "reviewed runtime variable allowlist and production scanner",
  );
  if (runtimeVars.MAP_RELEASE_ID)
    demand(
      typeof input.buckets.mapAssets === "string" &&
        /^ms-realty-[a-z0-9-]+$/.test(input.buckets.mapAssets) &&
        !input.buckets.mapAssets.includes("staging"),
      "explicit reviewed production map asset bucket",
    );
  const controller = createPublicKey(trustedKeys.controller)
    .export({ type: "spki", format: "pem" })
    .toString();
  const config = {
    $schema: "../gateway/node_modules/wrangler/config-schema.json",
    name: input.workerName,
    account_id: accountId,
    main: "../gateway/production.ts",
    compatibility_date: "2026-09-28",
    compatibility_flags: ["nodejs_compat"],
    workers_dev: false,
    preview_urls: false,
    routes: [{ pattern: input.control.pattern, zone_id: input.control.zoneId }],
    observability: { enabled: true, head_sampling_rate: 1 },
    triggers: { crons: ["*/5 * * * *"] },
    containers: ["ProductionWeb", "ProductionWorker", "ProductionMigrator"].map((class_name) => ({
      class_name,
      image: input.image,
      instance_type: "basic",
      max_instances: 1,
    })),
    durable_objects: {
      bindings: [
        { name: "MS_REALTY", class_name: "ProductionWeb" },
        { name: "MS_REALTY_WORKER", class_name: "ProductionWorker" },
        { name: "MS_REALTY_MIGRATOR", class_name: "ProductionMigrator" },
        { name: "RELEASE_CONTROL", class_name: "ProductionReleaseControl" },
        { name: "EMAIL_RECEIPTS", class_name: "ProductionEmailReceipt" },
      ],
    },
    migrations: [
      {
        tag: "production-v1",
        new_sqlite_classes: [
          "ProductionWeb",
          "ProductionWorker",
          "ProductionMigrator",
          "ProductionReleaseControl",
          "ProductionEmailReceipt",
        ],
      },
    ],
    r2_buckets: [
      { binding: "MEDIA", bucket_name: input.buckets.media },
      { binding: "NEXT_CACHE", bucket_name: input.buckets.cache },
      ...(runtimeVars.MAP_RELEASE_ID
        ? [{ binding: "MAP_ASSETS", bucket_name: input.buckets.mapAssets }]
        : []),
    ],
    ...(emailHash
      ? {
          send_email: [
            {
              name: "EMAIL",
              allowed_destination_addresses: input.email.allowedRecipients,
              allowed_sender_addresses: [input.email.from],
            },
          ],
        }
      : {}),
    vars: {
      STAGING: "false",
      RELEASE_ENVIRONMENT: "production",
      BUILD_SHA: input.sourceCommit,
      IMAGE_DIGEST: acceptance.digest,
      PRODUCTION_WORKER_NAME: input.workerName,
      PRODUCTION_INPUTS_SHA256: inputSha256,
      PRODUCTION_SCHEMA_SHA256: database.schemaSha256,
      PRODUCTION_ACCEPTED_REPORT_SHA256: acceptance.reportSha256,
      PRODUCTION_OWNERSHIP_SHA256: input.artifacts.ownership,
      PRODUCTION_FEATURE_POLICY_SHA256: featureHash,
      PRODUCTION_EMAIL_POLICY_SHA256: emailHash,
      PRODUCTION_CONTROLLER_PUBLIC_KEY: controller,
      PRODUCTION_BUTLER_VARS_JSON: JSON.stringify(butlerVars),
      PRODUCTION_DATABASE_HOST: database.host,
      PRODUCTION_DATABASE_PORT: String(database.port ?? 5432),
      PRODUCTION_DATABASE_NAME: database.name,
      PRODUCTION_WEB_DATABASE_ROLE: database.roles.web,
      PRODUCTION_WORKER_DATABASE_ROLE: database.roles.worker,
      PRODUCTION_MIGRATOR_DATABASE_ROLE: database.roles.migrator,
      DATABASE_TRANSPORT: database.transport,
      ...(database.transport === "cloudflared-access-tcp"
        ? {
            TUNNEL_SERVICE_HOSTNAME: database.host,
            TUNNEL_SERVICE_URL: "127.0.0.1:15432",
            TUNNEL_SERVICE_TOKEN_ID: database.access.serviceClientId,
          }
        : {}),
      ORIGIN_URL: "https://container.invalid",
      PUBLIC_ORIGIN: input.origins.public,
      CLIENT_ORIGIN: input.origins.client,
      STAFF_ORIGIN: input.origins.staff,
      APP_ORIGIN: input.origins.public,
      CANONICAL_ORIGIN: input.origins.public,
      LEGACY_TARGET_HOST: "makler-realty.com",
      LEGACY_ROUTES_SHA256: input.artifacts.routes,
      PUBLIC_MEDIA_SHA256: input.artifacts.media,
      ACCESS_TEAM_DOMAIN: access.teamDomain,
      ACCESS_AUD: access.audience,
      ACCESS_SERVICE_CLIENT_ID: access.serviceClientId,
      EMAIL_FROM: input.email.from,
      EMAIL_ALLOWED_RECIPIENTS: JSON.stringify(input.email.allowedRecipients),
      EMAIL_REPLY_DOMAIN: input.email.replyDomain ?? "",
      R2_ACCOUNT_ID: accountId,
      R2_BUCKET: input.buckets.media,
      MEDIA_PUBLIC_BASE_URL: `${input.origins.public}/media`,
      FILE_STORAGE: "r2",
      ...runtimeVars,
      ...features,
    },
  };
  demand(
    Object.values(config.vars).every(
      (value) => typeof value === "string" && Buffer.byteLength(value) <= 5 * 1024,
    ),
    "bounded Worker binding sizes",
  );
  if (runtime) {
    const names = [
      ...productionSecrets,
      ...(database.transport === "cloudflared-access-tcp"
        ? ["DATABASE_TLS_CA_PEM", "TUNNEL_SERVICE_TOKEN_SECRET"]
        : []),
    ];
    demand(
      names.every(
        (name) =>
          typeof runtime[name] === "string" &&
          runtime[name].trim() &&
          Buffer.byteLength(runtime[name]) <= 5 * 1024,
      ) &&
        [
          "AUTH_SECRET",
          "ORIGIN_VERIFY_SECRET",
          "PRODUCTION_CONTROL_SECRET",
          "EMAIL_RELAY_SECRET",
          "ACCESS_SERVICE_CLIENT_SECRET",
        ].every((name) => runtime[name].length >= 32),
      "explicit production role-scoped secrets available",
    );
    for (const role of ["web", "worker", "migrator"])
      productionRuntimeEnvironment({ ...runtime, ...config.vars }, role);
  }
  return config;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const [bundlePath, output] = process.argv.slice(2);
    demand(
      bundlePath &&
        output &&
        process.argv.length === 4 &&
        dirname(resolve(output)) === resolve("deploy") &&
        output.endsWith(".generated.json"),
      "explicit generated local config path",
    );
    const specification = json(await readFile(bundlePath)),
      base = dirname(resolve(bundlePath));
    const read = async (name) => {
      demand(typeof name === "string", "explicit artifact file");
      return readFile(resolve(base, name));
    };
    const input = await read(specification.input),
      artifacts = {};
    for (const [name, path] of Object.entries(specification.artifacts ?? {}))
      artifacts[name] = await read(path);
    const evidence = {
      report: json(await read(specification.report)),
      expected: json(await read(specification.expected)),
      approvals: {
        owner: json(await read(specification.approvals?.owner)),
        controller: json(await read(specification.approvals?.controller)),
      },
    };
    const config = productionConfig(
      input,
      artifacts,
      evidence,
      {
        owner: process.env.LAUNCH_OWNER_PUBLIC_KEY,
        controller: process.env.LAUNCH_CONTROLLER_PUBLIC_KEY,
      },
      { runtime: process.env },
    );
    // The existing generated logical module keeps its exact staging-qualified bytes and name.
    // This does not edit the staging entry/contract, deploy, attest a digest or create evidence.
    const payload = {
      fixture: false,
      sourceCommit: config.vars.BUILD_SHA,
      routes: artifacts.routes.toString(),
      media: artifacts.media.toString(),
    };
    await writeFile(
      "gateway/staging-artifacts.generated.ts",
      `export const stagingArtifacts: {fixture:boolean;sourceCommit:string;routes:string;media:string} = ${JSON.stringify(payload)};\n`,
    );
    await writeFile(output, `${JSON.stringify(config, null, 2)}\n`);
    console.log(
      "Signed production configuration prepared locally; no provider mutation or readiness claim.",
    );
  } catch {
    console.error(
      "Production configuration blocked; verify private exact-release inputs and genuine policy/approval evidence.",
    );
    process.exitCode = 1;
  }
}
