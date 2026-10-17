// Read-only Cloudflare inventory. Never persist API responses or secret binding values.
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { accountId as msRealtyAccountId } from "./staging-config.mjs";

const api = "https://api.cloudflare.com/client/v4";
const historical = [
  ["Worker", "ms-realty", "Legacy application gateway; do not change its production routes."],
  [
    "Container / Durable Object",
    "MsRealtyContainer / MS_REALTY",
    "Legacy Node runtime; container disk is ephemeral.",
  ],
  ["R2", "ms-realty-media", "Legacy media; staging must use a different bucket."],
  ["Email binding", "EMAIL", "Legacy send_email binding restricted to the verified agency inbox."],
  [
    "Database",
    "Neon PostgreSQL (historical launch checklist)",
    "Provider and server major version require a fresh runtime readback.",
  ],
];
const pick = (item, keys) =>
  Object.fromEntries(keys.filter((k) => item[k] !== undefined).map((k) => [k, item[k]]));

export async function inventory({ accountId, token, fetcher = fetch }) {
  if (!/^[a-f0-9]{32}$/i.test(accountId ?? "") || !token)
    throw new Error("CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN are required");
  if (accountId !== msRealtyAccountId)
    throw new Error("Only the owner-approved MS Realty Cloudflare account is allowed");
  const sections = [];
  async function read(name, path, select) {
    const rows = [];
    let page = 1;
    do {
      const url = new URL(`${api}${path}`);
      url.searchParams.set("page", String(page));
      const response = await fetcher(url, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(20000),
      });
      let body;
      try {
        body = await response.json();
      } catch {
        body = {};
      }
      if (!response.ok || body.success === false) {
        const section = {
          name,
          status: "unverified",
          http_status: response.status,
          error_codes: (body.errors ?? []).map((e) => e.code).filter(Number.isFinite),
          resources: rows,
        };
        sections.push(section);
        return section;
      }
      const result = body.result;
      const items = Array.isArray(result)
        ? result
        : Array.isArray(result?.buckets)
          ? result.buckets
          : [result];
      rows.push(...items.filter(Boolean).map(select));
      if (page >= (body.result_info?.total_pages ?? 1)) break;
      if (++page > 100) throw new Error("Cloudflare inventory pagination exceeded its bound");
    } while (page <= 100);
    const section = { name, status: "verified", resources: rows };
    sections.push(section);
    return section;
  }
  const account = await read("Account", `/accounts/${accountId}`, (x) => pick(x, ["id", "name"]));
  if (account.status === "verified" && account.resources[0]?.id !== accountId)
    throw new Error("Cloudflare returned a different account");
  const zoneSection = await read("Zones", `/zones?account.id=${accountId}&per_page=50`, (x) => ({
    ...pick(x, ["id", "name", "status"]),
    account_id: x.account?.id,
  }));
  const workers = await read("Workers", `/accounts/${accountId}/workers/scripts`, (x) =>
    pick(x, ["id", "created_on", "modified_on"]),
  );
  await read("Containers", `/accounts/${accountId}/containers/applications`, (x) => ({
    ...pick(x, ["id", "name", "scheduling_policy"]),
    image: typeof x.configuration?.image === "string" ? x.configuration.image : undefined,
    instance_type: x.configuration?.instance_type,
    durable_objects: Array.isArray(x.durable_objects)
      ? x.durable_objects.map((d) => pick(d, ["namespace_id", "class_name", "script_name"]))
      : undefined,
  }));
  await read(
    "Durable Object namespaces",
    `/accounts/${accountId}/workers/durable_objects/namespaces`,
    (x) => pick(x, ["id", "name", "script", "class"]),
  );
  await read("Hyperdrive", `/accounts/${accountId}/hyperdrive/configs`, (x) => ({
    ...pick(x, ["id", "name"]),
    origin: pick(x.origin ?? {}, ["scheme", "host", "port", "database"]),
  }));
  await read("D1", `/accounts/${accountId}/d1/database`, (x) =>
    pick(x, ["uuid", "name", "version"]),
  );
  await read("R2", `/accounts/${accountId}/r2/buckets`, (x) =>
    pick(x, ["name", "creation_date", "location", "storage_class"]),
  );
  const apps = await read("Access applications", `/accounts/${accountId}/access/apps`, (x) => ({
    ...pick(x, ["id", "name", "domain", "type", "aud"]),
    destinations: x.destinations?.map((d) => pick(d, ["type", "uri"])),
  }));
  await read("Access service tokens", `/accounts/${accountId}/access/service_tokens`, (x) =>
    pick(x, ["id", "name", "expires_at"]),
  );
  for (const app of apps.resources) {
    await read(
      `Access policies: ${app.name}`,
      `/accounts/${accountId}/access/apps/${app.id}/policies`,
      (x) => ({
        ...pick(x, ["id", "name", "decision"]),
        include: (x.include ?? []).map((v) => ({
          selectors: Object.keys(v),
          everyone: Boolean(v.everyone),
          service_token_id: v.service_token?.token_id,
        })),
        exclude_selector_types: (x.exclude ?? []).flatMap(Object.keys),
        require_selector_types: (x.require ?? []).flatMap(Object.keys),
      }),
    );
  }
  for (const worker of workers.resources.filter((w) => /ms[-_]?realty/i.test(w.id ?? ""))) {
    await read(
      `Bindings: ${worker.id}`,
      `/accounts/${accountId}/workers/scripts/${worker.id}/settings`,
      (x) => ({
        bindings: (x.bindings ?? []).map((b) => ({
          ...pick(b, [
            "name",
            "type",
            "class_name",
            "script_name",
            "namespace_id",
            "bucket_name",
            "id",
          ]),
          destination_count: b.allowed_destination_addresses?.length,
          engine_major:
            b.type === "plain_text" && b.name === "DATABASE_ENGINE_MAJOR" && /^\d+$/.test(b.text)
              ? Number(b.text)
              : undefined,
        })),
      }),
    );
  }
  for (const zone of zoneSection.resources.filter(
    (z) => ["makler-realty.com", "makler-realty.ru"].includes(z.name) && z.account_id === accountId,
  )) {
    await read(`Worker routes: ${zone.name}`, `/zones/${zone.id}/workers/routes`, (x) =>
      pick(x, ["id", "pattern", "script"]),
    );
    await read(`Staging DNS: ${zone.name}`, `/zones/${zone.id}/dns_records?per_page=100`, (x) => ({
      ...pick(x, ["id", "name", "type", "proxied"]),
      purpose: x.name.includes("staging")
        ? "staging record (read only)"
        : "existing record (read only)",
    }));
    await read(`Email routing: ${zone.name}`, `/zones/${zone.id}/email/routing`, (x) =>
      pick(x, ["enabled", "name", "status"]),
    );
  }
  return {
    schema: 1,
    captured_at: new Date().toISOString(),
    source_sha: process.env.GITHUB_SHA ?? null,
    account_id: accountId,
    production_mutations: false,
    sections,
    database_engine_major: null,
    database_engine_status:
      "Requires SELECT current_setting('server_version_num') against the existing authoritative PostgreSQL setup; Hyperdrive is a connector, D1 is not PostgreSQL.",
  };
}

export function markdown(report) {
  const lines = [
    "# MS Realty Cloudflare inventory",
    "",
    `Captured: ${report.captured_at}. Account: ${report.account_id}. Read-only; no DNS or production route mutations.`,
    "",
    "Historical source: `legacy-app-final:wrangler.jsonc` and preserved launch checklist. This is not a live resource claim:",
    "",
    "| Resource | Name | Purpose |",
    "| --- | --- | --- |",
    ...historical.map((r) => `| ${r.join(" | ")} |`),
    "",
    "## Current account readback",
    "",
  ];
  for (const section of report.sections) {
    lines.push(
      `### ${section.name}`,
      "",
      `Status: ${section.status}${section.http_status ? ` (HTTP ${section.http_status}; codes ${section.error_codes.join(", ")})` : ""}.`,
      "",
    );
    for (const item of section.resources) lines.push(`- ${JSON.stringify(item)}`);
    if (!section.resources.length)
      lines.push(
        section.status === "verified"
          ? "No resources returned."
          : "Resource existence remains unknown.",
      );
    lines.push("");
  }
  lines.push(
    "## Database engine",
    "",
    report.database_engine_status,
    "",
    "Do not pin Postgres 18 from local fixtures. The staging database must be distinct and its server major must equal the verified existing provider major. Promotion is blocked until this readback is recorded.",
    "",
    "## Staging boundary",
    "",
    "Use a separate Worker/Container namespace and bucket. Require existing staging DNS and owner/controller Cloudflare Access protection before route attachment. The deployment workflow cannot change DNS or production routes. DigitalOcean App Platform is superseded.",
    "",
  );
  return lines.join("\n");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const jsonPath = args[args.indexOf("--json") + 1];
  const mdPath = args[args.indexOf("--markdown") + 1];
  if (!args.includes("--json") || !args.includes("--markdown"))
    throw new Error("Pass --json PATH --markdown PATH");
  const report = await inventory({
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
    token: process.env.CLOUDFLARE_API_TOKEN,
  });
  for (const [path, value] of [
    [jsonPath, `${JSON.stringify(report, null, 2)}\n`],
    [mdPath, markdown(report)],
  ]) {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, value);
  }
  console.log(
    JSON.stringify({
      captured_at: report.captured_at,
      verified_sections: report.sections.filter((s) => s.status === "verified").length,
      unverified_sections: report.sections
        .filter((s) => s.status !== "verified")
        .map((s) => s.name),
    }),
  );
}
