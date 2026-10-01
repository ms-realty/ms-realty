import assert from "node:assert/strict";
import test from "node:test";
import { inventory, markdown } from "./cloudflare-inventory.mjs";

const accountId = "a".repeat(32);
const privateValue = "SECRET_MUST_NOT_APPEAR";
const response = (result) => Response.json({ success: true, result });
function fetcher(url, options) {
  assert.equal(options.method, undefined); // GET only
  assert.equal(url.origin, "https://api.cloudflare.com");
  assert.equal(options.headers.Authorization, `Bearer ${privateValue}`);
  const path = url.pathname;
  if (path.endsWith(`/accounts/${accountId}`))
    return response({ id: accountId, name: "MS Realty", secret: privateValue });
  if (path.endsWith("/zones"))
    return response([{ id: "zone", name: "makler-realty.com", account: { id: accountId } }]);
  if (path.endsWith("/workers/scripts")) return response([{ id: "ms-realty" }]);
  if (path.endsWith("/settings"))
    return response({
      bindings: [
        { name: "DATABASE_URL", type: "secret_text", text: privateValue },
        { name: "TOKEN", type: "plain_text", text: privateValue },
        { name: "EMAIL", type: "send_email" },
      ],
    });
  if (path.endsWith("/hyperdrive/configs"))
    return response([
      {
        id: "db",
        name: "MS Realty",
        origin: {
          scheme: "postgres",
          host: "example.neon.tech",
          database: "msr",
          user: privateValue,
          password: privateValue,
        },
      },
    ]);
  if (path.endsWith("/containers/applications"))
    return response([
      {
        id: "container",
        name: "ms-realty",
        configuration: {
          image: "registry.cloudflare.com/example/msr@sha256:abc",
          env: { SECRET: privateValue },
        },
        durable_objects: [{ namespace_id: "namespace", secret: privateValue }],
      },
    ]);
  if (path.endsWith("/access/service_tokens"))
    return response([
      {
        id: "controller",
        name: "Controller",
        client_secret: privateValue,
        client_id: privateValue,
      },
    ]);
  return response([]);
}

test("resource allowlists omit secrets and never issue a mutation", async () => {
  const report = await inventory({ accountId, token: privateValue, fetcher });
  assert.equal(JSON.stringify(report).includes(privateValue), false);
  assert.equal(markdown(report).includes(privateValue), false);
  assert.equal(report.production_mutations, false);
  assert.equal(report.database_engine_major, null);
  assert.equal(
    report.sections.find((s) => s.name === "Hyperdrive").resources[0].origin.host,
    "example.neon.tech",
  );
});

test("denied reads are unknown rather than an empty resource inventory", async () => {
  const report = await inventory({
    accountId,
    token: privateValue,
    fetcher: (url, options) =>
      url.pathname.endsWith("/r2/buckets")
        ? Response.json(
            { success: false, errors: [{ code: 10000, message: privateValue }] },
            { status: 403 },
          )
        : fetcher(url, options),
  });
  assert.equal(report.sections.find((s) => s.name === "R2").status, "unverified");
  assert.equal(JSON.stringify(report).includes(privateValue), false);
  assert.match(markdown(report), /Resource existence remains unknown/);
});

test("no fallback account or token is selected", async () => {
  await assert.rejects(inventory({ accountId: "", token: privateValue, fetcher }), /required/);
  await assert.rejects(inventory({ accountId, token: "", fetcher }), /required/);
});
