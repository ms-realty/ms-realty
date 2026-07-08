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
  assert.deepEqual(report.summary.weak_env, []);
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
  assert.deepEqual(report.summary.weak_env, []);
  assert.equal(report.summary.database.status, "placeholder");
  assert.equal(report.checks.find((check) => check.id === "database_tcp").status, "placeholder");
});

test("Payload runtime report rejects weak non-placeholder secrets", async () => {
  const report = await buildPayloadRuntimeReport({
    databaseProbe: async ({ host, port, database }) => ({ database, host, port, status: "pass" }),
    env: {
      DATABASE_URL: "postgres://payload:secret@db.internal:5432/ms_realty",
      PAYLOAD_SECRET: "short-secret",
    },
    generatedAt: "2026-07-06T00:00:00Z",
  });

  assert.equal(assertPayloadRuntimeReport(report), true);
  assert.equal(report.ready, false);
  assert.deepEqual(report.summary.weak_env, ["PAYLOAD_SECRET"]);
  assert.equal(report.checks.find((check) => check.id === "payload_secret").status, "weak_secret");
  assert.equal(JSON.stringify(report).includes("short-secret"), false);
});

test("Payload runtime report passes with env and database reachability proof", async () => {
  const report = await buildPayloadRuntimeReport({
    databaseProbe: async ({ host, port, database }) => ({ database, host, port, status: "pass" }),
    env: {
      DATABASE_URL: "postgres://payload:secret@db.internal:5432/ms_realty",
      PAYLOAD_SECRET: "not-written-to-report-32-byte-minimum",
    },
    generatedAt: "2026-07-06T00:00:00Z",
  });

  assert.equal(assertPayloadRuntimeReport(report), true);
  assert.equal(report.ready, true);
  assert.deepEqual(report.summary.missing_env, []);
  assert.equal(report.summary.database.database, "ms_realty");
  assert.equal(report.summary.database.host, "db.internal");
  assert.equal(report.summary.database.credentials_configured, true);
  assert.equal(JSON.stringify(report).includes("not-written-to-report-32-byte-minimum"), false);
  assert.equal(JSON.stringify(report).includes("payload:secret"), false);
});

test("Payload runtime report rejects DATABASE_URL without a database name", async () => {
  const report = await buildPayloadRuntimeReport({
    databaseProbe: async () => {
      throw new Error("DATABASE_URL without database name should not be probed");
    },
    env: {
      DATABASE_URL: "postgres://payload:secret@db.internal:5432",
      PAYLOAD_SECRET: "not-written-to-report-32-byte-minimum",
    },
    generatedAt: "2026-07-06T00:00:00Z",
  });

  assert.equal(assertPayloadRuntimeReport(report), true);
  assert.equal(report.ready, false);
  assert.equal(report.summary.database.status, "fail");
  assert.match(report.summary.database.error, /database name/);
  assert.equal(report.checks.find((check) => check.id === "database_tcp").status, "fail");
});

test("Payload runtime report rejects DATABASE_URL without a database host", async () => {
  const report = await buildPayloadRuntimeReport({
    databaseProbe: async () => {
      throw new Error("DATABASE_URL without host should not be probed");
    },
    env: {
      DATABASE_URL: "postgres:///ms_realty",
      PAYLOAD_SECRET: "not-written-to-report-32-byte-minimum",
    },
    generatedAt: "2026-07-06T00:00:00Z",
  });

  assert.equal(assertPayloadRuntimeReport(report), true);
  assert.equal(report.ready, false);
  assert.equal(report.summary.database.status, "fail");
  assert.match(report.summary.database.error, /database host/);
  assert.equal(report.checks.find((check) => check.id === "database_tcp").status, "fail");
});

test("Payload runtime report rejects DATABASE_URL without database credentials", async () => {
  const report = await buildPayloadRuntimeReport({
    databaseProbe: async () => {
      throw new Error("DATABASE_URL without credentials should not be probed");
    },
    env: {
      DATABASE_URL: "postgres://db.internal/ms_realty",
      PAYLOAD_SECRET: "not-written-to-report-32-byte-minimum",
    },
    generatedAt: "2026-07-06T00:00:00Z",
  });

  assert.equal(assertPayloadRuntimeReport(report), true);
  assert.equal(report.ready, false);
  assert.equal(report.summary.database.status, "fail");
  assert.match(report.summary.database.error, /database credentials/);
  assert.equal(report.checks.find((check) => check.id === "database_tcp").status, "fail");
});

test("Payload runtime report rejects localhost database launch evidence", async () => {
  const report = await buildPayloadRuntimeReport({
    databaseProbe: async () => {
      throw new Error("localhost DATABASE_URL should not be probed");
    },
    env: {
      DATABASE_URL: "postgres://payload:secret@127.0.0.1:5432/ms_realty",
      PAYLOAD_SECRET: "not-written-to-report-32-byte-minimum",
    },
    generatedAt: "2026-07-06T00:00:00Z",
  });

  assert.equal(assertPayloadRuntimeReport(report), true);
  assert.equal(report.ready, false);
  assert.equal(report.summary.database.status, "fail");
  assert.match(report.summary.database.error, /localhost or placeholder/);
  assert.equal(report.checks.find((check) => check.id === "database_tcp").status, "fail");
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

test("Payload runtime report requires the full launch check set", async () => {
  const report = await buildPayloadRuntimeReport({
    env: {},
    generatedAt: "2026-07-06T00:00:00Z",
  });

  assert.throws(
    () => assertPayloadRuntimeReport({ ...report, checks: report.checks.filter((check) => check.id !== "database_tcp") }),
    /missing required check database_tcp/,
  );
  assert.throws(
    () => assertPayloadRuntimeReport({ ...report, checks: [...report.checks, report.checks[0]] }),
    /duplicate check payload_secret/,
  );
  assert.throws(
    () =>
      assertPayloadRuntimeReport({
        ...report,
        checks: report.checks.map((check) => (check.id === "database_tcp" ? { ...check, status: "skipped" } : check)),
      }),
    /known statuses/,
  );
  assert.throws(
    () => assertPayloadRuntimeReport({ ...report, summary: { ...report.summary, missing_env: [] } }),
    /missing env summary/,
  );
  assert.throws(
    () => assertPayloadRuntimeReport({ ...report, summary: { ...report.summary, database: { status: "pass" } } }),
    /database summary/,
  );
  assert.throws(
    () =>
      assertPayloadRuntimeReport({
        ...report,
        checks: report.checks.map((check) => (check.id.startsWith("route:") ? { id: check.id, status: "pass" } : check)),
      }),
    /route file evidence/,
  );
  assert.throws(
    () => assertPayloadRuntimeReport({ ...report, summary: { ...report.summary, route_files: 0 } }),
    /route summary evidence/,
  );
  assert.throws(
    () =>
      assertPayloadRuntimeReport({
        ...report,
        checks: report.checks.map((check) => (check.id === "payload_config_import" ? { id: check.id, status: "pass" } : check)),
      }),
    /Payload config evidence/,
  );
});

test("Payload runtime ready report requires concrete database TCP evidence", async () => {
  const report = await buildPayloadRuntimeReport({
    databaseProbe: async ({ host, port, database }) => ({ database, host, port, status: "pass" }),
    env: {
      DATABASE_URL: "postgres://payload:secret@db.internal:5432/ms_realty",
      PAYLOAD_SECRET: "not-written-to-report-32-byte-minimum",
    },
    generatedAt: "2026-07-06T00:00:00Z",
  });
  const withoutTarget = {
    ...report,
    summary: { ...report.summary, database: { status: "pass" } },
    checks: report.checks.map((check) => (check.id === "database_tcp" ? { id: "database_tcp", status: "pass" } : check)),
  };

  assert.throws(
    () => assertPayloadRuntimeReport(withoutTarget),
    /database TCP target evidence/,
  );
  assert.throws(
    () =>
      assertPayloadRuntimeReport({
        ...report,
        summary: { ...report.summary, database: { ...report.summary.database, database: "" } },
        checks: report.checks.map((check) => (check.id === "database_tcp" ? { ...check, database: "" } : check)),
      }),
    /database TCP target evidence/,
  );
  assert.throws(
    () =>
      assertPayloadRuntimeReport({
        ...report,
        summary: { ...report.summary, database: { ...report.summary.database, credentials_configured: false } },
      }),
    /database TCP target/,
  );
  assert.throws(
    () =>
      assertPayloadRuntimeReport({
        ...report,
        checks: report.checks.map((check) => (check.id === "database_tcp" ? { ...check, host: "other-db.internal" } : check)),
      }),
    /database TCP target must match summary evidence/,
  );
  assert.throws(
    () =>
      assertPayloadRuntimeReport({
        ...report,
        summary: { ...report.summary, database: { ...report.summary.database, port: "5432" } },
        checks: report.checks.map((check) => (check.id === "database_tcp" ? { ...check, port: "5432" } : check)),
      }),
    /database TCP target evidence/,
  );
});

test("Payload runtime ready report requires route and config evidence", async () => {
  const report = await buildPayloadRuntimeReport({
    databaseProbe: async ({ host, port, database }) => ({ database, host, port, status: "pass" }),
    env: {
      DATABASE_URL: "postgres://payload:secret@db.internal:5432/ms_realty",
      PAYLOAD_SECRET: "not-written-to-report-32-byte-minimum",
    },
    generatedAt: "2026-07-06T00:00:00Z",
  });

  assert.throws(
    () =>
      assertPayloadRuntimeReport({
        ...report,
        checks: report.checks.map((check) => (check.id.startsWith("route:") ? { id: check.id, status: "pass" } : check)),
      }),
    /route file evidence/,
  );
  assert.throws(
    () =>
      assertPayloadRuntimeReport({
        ...report,
        summary: { ...report.summary, route_files: 0 },
      }),
    /route summary evidence/,
  );
  assert.throws(
    () =>
      assertPayloadRuntimeReport({
        ...report,
        checks: report.checks.map((check) => (check.id === "payload_config_import" ? { id: check.id, status: "pass" } : check)),
      }),
    /Payload config evidence/,
  );
});
