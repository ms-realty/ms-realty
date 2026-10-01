import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { readStagingInputs, sha256, validateStaging } from "./staging-config.mjs";

const demand = (ok, label) => {
  if (!ok) throw new Error(`Staging provider prerequisite failed: ${label}`);
};
const hosts = [
  "staging.makler-realty.com",
  "my.staging.makler-realty.com",
  "app.staging.makler-realty.com",
];
const oneKey = (value, key) => value && Object.keys(value).length === 1 && key in value;

/** Reject broad selectors, bypasses and unreviewed group members. Unknown API shapes fail closed. */
export function validateAccess(input, app, policies, group, otherApps) {
  const configured = input.access;
  const domains = [
    ...new Set([app.domain, ...(app.self_hosted_domains ?? [])].filter(Boolean)),
  ].sort();
  demand(
    app.type === "self_hosted" &&
      app.aud === configured.audience &&
      JSON.stringify(domains) === JSON.stringify([...hosts].sort()),
    "Access protects all three exact hosts",
  );
  const members = group.include?.map((rule) => (oneKey(rule, "email") ? rule.email.email : null));
  demand(
    Array.isArray(members) &&
      members.length > 0 &&
      members.every((email) => configured.controllerEmails.includes(email)) &&
      configured.controllerEmails.every((email) => members.includes(email)),
    "controller group has only reviewed identities",
  );
  demand(
    (group.require ?? []).length === 0 && (group.exclude ?? []).length === 0,
    "explicit controller group shape",
  );
  demand(Array.isArray(policies) && policies.length > 0, "Access policies present");
  let owner = false,
    controller = false,
    service = false;
  for (const policy of policies) {
    demand(
      ["allow", "deny", "non_identity"].includes(policy.decision),
      "no Access bypass or unknown decision",
    );
    if (policy.decision === "deny") continue;
    demand(Array.isArray(policy.include) && policy.include.length > 0, "bounded include rules");
    for (const rule of policy.include) {
      if (
        policy.decision === "allow" &&
        oneKey(rule, "email") &&
        rule.email?.email === configured.ownerEmail
      )
        owner = true;
      else if (
        policy.decision === "allow" &&
        oneKey(rule, "group") &&
        rule.group?.id === configured.controllerGroupId
      )
        controller = true;
      else if (
        policy.decision === "non_identity" &&
        oneKey(rule, "service_token") &&
        rule.service_token?.token_id === configured.serviceTokenId
      )
        service = true;
      else demand(false, "only owner, controller group and named service token may enter staging");
    }
  }
  demand(owner && controller && service, "owner/controller/checker policies");
  for (const other of otherApps) {
    if (other.id === configured.applicationId) continue;
    const candidates = [
      other.domain,
      ...(other.self_hosted_domains ?? []),
      ...(other.destinations ?? []).map((x) => x.uri),
    ].filter(Boolean);
    demand(
      !candidates.some((domain) =>
        hosts.some(
          (host) =>
            domain === host || domain.startsWith(`${host}/`) || domain.startsWith(`*.${host}`),
        ),
      ),
      "no more-specific Access application override",
    );
  }
}

/** Read-only Cloudflare inventory; this function never creates DNS, routes, policies or buckets. */
export async function providerPreflight(input, api) {
  const account = `/accounts/${input.accountId}`,
    zone = `/zones/${input.zoneId}`,
    access = `${account}/access`;
  const [zoneData, app, policies, group, otherApps, routes, bucketResults, dns] = await Promise.all(
    [
      api(zone),
      api(`${access}/apps/${input.access.applicationId}`),
      api(`${access}/apps/${input.access.applicationId}/policies`, true),
      api(`${access}/groups/${input.access.controllerGroupId}`),
      api(`${access}/apps`, true),
      api(`${zone}/workers/routes`, true),
      Promise.all(
        [input.buckets.stagingMedia, input.buckets.stagingCache].map(async (name) => ({
          bucket: await api(`${account}/r2/buckets/${name}`),
          managed: await api(`${account}/r2/buckets/${name}/domains/managed`),
          custom: await api(`${account}/r2/buckets/${name}/domains/custom`, true),
        })),
      ),
      Promise.all(
        hosts.map((host) => api(`${zone}/dns_records?name=${encodeURIComponent(host)}`, true)),
      ),
    ],
  );
  demand(
    zoneData.status === "active" &&
      zoneData.name === "makler-realty.com" &&
      zoneData.account?.id === input.accountId,
    "active correct staging zone/account",
  );
  validateAccess(input, app, policies, group, otherApps);
  for (const [i, records] of dns.entries())
    demand(
      records.some(
        (x) => x.name === hosts[i] && x.proxied === true && ["A", "AAAA", "CNAME"].includes(x.type),
      ),
      "existing proxied staging DNS",
    );
  for (const route of routes) {
    if (hosts.some((host) => route.pattern === `${host}/*`))
      demand(route.script === input.workerName, "staging route not owned by another Worker");
    if (route.script === input.workerName)
      demand(
        hosts.some((host) => route.pattern === `${host}/*`),
        "staging Worker has no production route",
      );
  }
  for (const bucket of bucketResults)
    demand(
      bucket.managed.enabled === false && bucket.custom.every((x) => x.enabled === false),
      "staging buckets have no public bypass domain",
    );
  return {
    schemaVersion: 1,
    scope: "staging-provider-prerequisites",
    status: "PASS",
    checkedAt: new Date().toISOString(),
    accountId: input.accountId,
    workerName: input.workerName,
    sourceCommit: input.sourceCommit,
    inputsSha256: sha256(JSON.stringify(input)),
    protectedHosts: hosts,
    noProductionMutation: true,
  };
}

export function cloudflareReader(token, transport = fetch) {
  demand(typeof token === "string" && token.length > 0, "staging read-only API token");
  return async (path, list = false) => {
    const result = [];
    for (let page = 1; page <= 100; page++) {
      const url = new URL(`https://api.cloudflare.com/client/v4${path}`);
      if (list) {
        url.searchParams.set("page", String(page));
        url.searchParams.set("per_page", "100");
      }
      const response = await transport(url, {
        method: "GET",
        headers: { authorization: `Bearer ${token}` },
        redirect: "error",
        signal: AbortSignal.timeout(15000),
      });
      demand(response.ok, "read-only API authorization/resource availability");
      const data = await response.json();
      demand(data.success === true, "successful provider response");
      if (!list) return data.result;
      // R2 custom-domain lists are returned under result.domains, Access under result[].
      const rows = Array.isArray(data.result) ? data.result : data.result?.domains;
      demand(Array.isArray(rows), "known provider list shape");
      result.push(...rows);
      if (!data.result_info?.total_pages || page >= data.result_info.total_pages) return result;
    }
    throw new Error("Provider pagination limit exceeded");
  };
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const { input, artifacts } = await readStagingInputs(process.argv[2]);
    validateStaging(input, artifacts, undefined, { imageRequired: false });
    const report = await providerPreflight(
      input,
      cloudflareReader(process.env.STAGING_CLOUDFLARE_READ_TOKEN),
    );
    if (process.argv[3]) await writeFile(process.argv[3], `${JSON.stringify(report, null, 2)}\n`);
    console.log(
      "Live staging prerequisites verified; no deployment or launch checker PASS is implied.",
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Provider preflight unavailable");
    process.exitCode = 1;
  }
}
