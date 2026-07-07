import test from "node:test";
import assert from "node:assert/strict";
import config from "../../payload.config.js";
import {
  assertPayloadRuntimeReport,
  buildPayloadRuntimeReport,
} from "../lib/payload-runtime.mjs";

test("Payload config exposes generated CMS collections behind an admin runtime", async () => {
  const resolved = await config;
  const slugs = resolved.collections.map((collection) => collection.slug);

  assert.equal(resolved.admin.user, "admins");
  assert.equal(resolved.routes.admin, "/payload-admin");
  assert.ok(slugs.includes("admins"));
  assert.ok(slugs.includes("locales"));
  assert.ok(slugs.includes("listings"));
  assert.ok(slugs.includes("listing_translations"));
  assert.ok(slugs.includes("media_assets"));
  assert.ok(slugs.includes("listing_tours"));
  assert.ok(
    resolved.collections
      .find((collection) => collection.slug === "listing_translations")
      .fields.some((field) => field.name === "locale" && field.relationTo === "locales"),
  );
});

test("Payload runtime report blocks missing launch env without leaking defaults", async () => {
  const report = await buildPayloadRuntimeReport({
    env: {},
    generatedAt: "2026-07-06T00:00:00Z",
  });

  assert.equal(assertPayloadRuntimeReport(report), true);
  assert.equal(report.ready, false);
  assert.deepEqual(report.summary.missing_env, ["PAYLOAD_SECRET", "DATABASE_URL"]);
  assert.equal(report.summary.database.status, "missing_env");
  assert.equal(report.checks.find((check) => check.id === "payload_config_import").status, "pass");
});

test("Payload runtime report rejects copied placeholder env values", async () => {
  const report = await buildPayloadRuntimeReport({
    databaseProbe: async () => {
      throw new Error("placeholder DATABASE_URL should not be probed");
    },
    env: {
      DATABASE_URL: "postgres://ms_realty_payload:replace-with-postgres-password@127.0.0.1:5432/ms_realty_payload",
      PAYLOAD_SECRET: "replace-with-output-of-openssl-rand-base64-32",
    },
    generatedAt: "2026-07-06T00:00:00Z",
  });

  assert.equal(assertPayloadRuntimeReport(report), true);
  assert.equal(report.ready, false);
  assert.deepEqual(report.summary.missing_env, []);
  assert.deepEqual(report.summary.placeholder_env, ["PAYLOAD_SECRET", "DATABASE_URL"]);
  assert.equal(report.summary.database.status, "placeholder");
  assert.equal(report.checks.find((check) => check.id === "database_tcp").status, "placeholder");
});

test("Payload runtime report passes with env and database reachability proof", async () => {
  const report = await buildPayloadRuntimeReport({
    databaseProbe: async ({ host, port, database }) => ({ database, host, port, status: "pass" }),
    env: {
      DATABASE_URL: "postgres://payload:secret@db.internal:5432/ms_realty",
      PAYLOAD_SECRET: "not-written-to-report",
    },
    generatedAt: "2026-07-06T00:00:00Z",
  });

  assert.equal(assertPayloadRuntimeReport(report), true);
  assert.equal(report.ready, true);
  assert.deepEqual(report.summary.missing_env, []);
  assert.equal(report.summary.database.host, "db.internal");
  assert.equal(JSON.stringify(report).includes("not-written-to-report"), false);
  assert.equal(JSON.stringify(report).includes("payload:secret"), false);
});

test("Payload runtime report rejects missing generated timestamp", async () => {
  const report = await buildPayloadRuntimeReport({
    env: {},
    generatedAt: "2026-07-06T00:00:00Z",
  });

  assert.throws(
    () => assertPayloadRuntimeReport({ ...report, generated_at: "" }),
    /valid generated_at/,
  );
});
