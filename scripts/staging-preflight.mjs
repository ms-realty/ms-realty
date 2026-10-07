import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { readStagingInputs, sha256, validateStaging } from "./staging-config.mjs";

const demand = (ok, label) => {
  if (!ok) throw new Error(`Staging provider prerequisite failed: ${label}`);
};
const hosts = [
  "staging.makler-realty.com",
  "staging-my.makler-realty.com",
  "staging-app.makler-realty.com",
];
const oneKey = (value, key) => value && Object.keys(value).length === 1 && key in value;

/** Current Access responses use public destinations; deprecated domains cannot supply coverage. */
function publicDestinations(app, exact = false) {
  if (app.destinations != null) {
    demand(Array.isArray(app.destinations), "known Access destinations");
    if (app.destinations.length > 0) {
      const destinations = app.destinations.filter((destination) => {
        demand(destination && typeof destination === "object", "known Access destination");
        if (
          destination.type !== "public" &&
          !(destination.type == null && typeof destination.uri === "string")
        ) {
          demand(!exact, "only public destinations on the reviewed staging application");
          demand(destination.uri == null, "no unrecognized public Access URI");
          return false;
        }
        demand(
          typeof destination.uri === "string" && destination.uri.length > 0,
          "public Access URI",
        );
        return true;
      });
      if (exact)
        demand(
          destinations.every(
            (destination) =>
              destination.overrides == null ||
              (Array.isArray(destination.overrides) && destination.overrides.length === 0),
          ),
          "no public Access destination overrides",
        );
      return destinations;
    }
  }
  return app.domain ? [{ type: "public", uri: app.domain }] : [];
}

function applicationDomains(app) {
  return [...new Set(publicDestinations(app, true).map((destination) => destination.uri))];
}

function validateAccessOverlap(apps, applicationId, protectedHosts) {
  demand(Array.isArray(apps), "known Access application inventory");
  for (const other of apps) {
    if (other.id === applicationId) continue;
    for (const { uri } of publicDestinations(other)) {
      const match = uri.match(/^(?:https?:\/\/)?([a-z0-9*.-]+)(?:\/.*)?$/i);
      demand(match, "known Access hostname selector");
      const matcher = new RegExp(`^${match[1].replaceAll(".", "\\.").replaceAll("*", ".*")}$`, "i");
      demand(
        !protectedHosts.some((host) => matcher.test(host)),
        "no overlapping or more-specific Access application override",
      );
    }
  }
}

/** Even a more-specific foreign route or a no-script bypass can divert protected traffic. */
export function validateRoutes(input, routes) {
  demand(Array.isArray(routes), "known Worker route inventory");
  for (const route of routes) {
    const match =
      typeof route.pattern === "string" &&
      route.pattern.match(/^(?:https?:\/\/)?([a-z0-9*.-]+)(?:\/.*)?$/i);
    demand(match, "known Worker route pattern");
    const hostPattern = new RegExp(
      `^${match[1].replaceAll(".", "\\.").replaceAll("*", ".*")}$`,
      "i",
    );
    if (hosts.some((host) => hostPattern.test(host)))
      demand(
        route.script === input.workerName && hosts.some((host) => route.pattern === `${host}/*`),
        "no competing or bypass route on any staging host",
      );
    if (input.database?.transport === "cloudflared-access-tcp")
      demand(
        !hostPattern.test(input.database.stagingHost),
        "database TCP hostname has no Worker route",
      );
    if (route.script === input.workerName)
      demand(
        hosts.some((host) => route.pattern === `${host}/*`),
        "staging Worker has no production route",
      );
  }
}

export function validateDatabaseAccess(input, app, policies, otherApps) {
  const expected = input.database.access;
  const host = input.database.stagingHost;
  const domains = applicationDomains(app);
  demand(
    app.id === expected.applicationId &&
      app.type === "self_hosted" &&
      app.aud === expected.audience &&
      domains.length === 1 &&
      domains[0] === host,
    "database Access protects its exact isolated hostname",
  );
  demand(Array.isArray(policies) && policies.length > 0, "database Access policies present");
  let service = false;
  for (const policy of policies) {
    if (policy.decision === "deny") continue;
    demand(
      policy.decision === "non_identity" &&
        Array.isArray(policy.include) &&
        policy.include.length === 1 &&
        oneKey(policy.include[0], "service_token") &&
        policy.include[0].service_token?.token_id === expected.serviceTokenId,
      "database Access allows only its reviewed service token",
    );
    service = true;
  }
  demand(service, "database Service Auth policy present");
  validateAccessOverlap(otherApps, expected.applicationId, [host]);
}

/** Reject broad selectors, bypasses and unreviewed group members. Unknown API shapes fail closed. */
export function validateAccess(input, app, policies, group, otherApps) {
  const configured = input.access;
  const domains = applicationDomains(app).sort();
  demand(
    app.id === configured.applicationId &&
      app.type === "self_hosted" &&
      app.aud === configured.audience &&
      JSON.stringify(domains) === JSON.stringify([...hosts].sort()),
    "Access protects all three exact hosts",
  );
  const controllerGroupRequired = configured.controllerGroupId != null;
  if (controllerGroupRequired) {
    const members = group?.include?.map((rule) =>
      oneKey(rule, "email") ? rule.email.email : null,
    );
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
  } else
    demand(
      group == null && configured.controllerEmails.length === 0,
      "controller automation uses only the named checker service token",
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
        controllerGroupRequired &&
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
  demand(
    owner && (!controllerGroupRequired || controller) && service,
    "owner/controller/checker policies",
  );
  validateAccessOverlap(otherApps, configured.applicationId, hosts);
}

/** Read-only Cloudflare inventory; this function never creates DNS, routes, policies or buckets. */
export async function providerPreflight(input, api) {
  const account = `/accounts/${input.accountId}`,
    zone = `/zones/${input.zoneId}`,
    access = `${account}/access`;
  const [zoneData, app, policies, group, otherApps, routes, bucketResults, dns, databaseAccess] =
    await Promise.all([
      api(zone),
      api(`${access}/apps/${input.access.applicationId}`),
      api(`${access}/apps/${input.access.applicationId}/policies`, true),
      input.access.controllerGroupId == null
        ? null
        : api(`${access}/groups/${input.access.controllerGroupId}`),
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
      input.database.transport === "cloudflared-access-tcp"
        ? Promise.all([
            api(`${access}/apps/${input.database.access.applicationId}`),
            api(`${access}/apps/${input.database.access.applicationId}/policies`, true),
            api(`${zone}/dns_records?name=${encodeURIComponent(input.database.stagingHost)}`, true),
          ])
        : null,
    ]);
  demand(
    zoneData.status === "active" &&
      zoneData.name === "makler-realty.com" &&
      zoneData.account?.id === input.accountId,
    "active correct staging zone/account",
  );
  validateAccess(input, app, policies, group, otherApps);
  if (databaseAccess) {
    validateDatabaseAccess(input, databaseAccess[0], databaseAccess[1], otherApps);
    demand(
      databaseAccess[2].some(
        (x) =>
          x.name === input.database.stagingHost &&
          x.proxied === true &&
          ["A", "AAAA", "CNAME"].includes(x.type),
      ),
      "existing proxied database Tunnel DNS",
    );
  }
  for (const [i, records] of dns.entries())
    demand(
      records.some(
        (x) => x.name === hosts[i] && x.proxied === true && ["A", "AAAA", "CNAME"].includes(x.type),
      ),
      "existing proxied staging DNS",
    );
  validateRoutes(input, routes);
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
    databaseTransport: input.database.transport,
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
    validateStaging(input, artifacts, undefined, {
      imageRequired: false,
      connectivityProbe: process.argv.includes("--connectivity-probe"),
    });
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
