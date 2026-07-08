import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import { spawnSync } from "node:child_process";
import config from "../../payload.config.js";
import {
  assertPayloadRuntimeReport,
  buildPayloadRuntimeReport,
  payloadRuntimeImportSummary,
} from "../lib/payload-runtime.mjs";
import { payloadRuntimeBootstrapChecklist } from "../lib/payload-runtime-bootstrap.mjs";
import { payloadRuntimeState } from "../lib/launch-readiness.mjs";

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
  assert.ok(report.next_actions.some((action) => action.includes("payload:bootstrap")));
});

test("Payload runtime example report is not launch evidence", () => {
  const example = JSON.parse(fs.readFileSync("production/data/payload-runtime-report.json.example", "utf8"));

  assert.equal(example.example, true);
  assert.throws(() => assertPayloadRuntimeReport(example), /example reports cannot be used as launch evidence/);
  assert.throws(() => payloadRuntimeImportSummary(example), /example reports cannot be used as launch evidence/);
});

test("Payload runtime import summary exposes blocked operator feedback", async () => {
  const report = await buildPayloadRuntimeReport({
    env: {},
    generatedAt: "2026-07-06T00:00:00Z",
  });
  const summary = payloadRuntimeImportSummary(report);

  assert.equal(summary.ready, false);
  assert.equal(summary.status, "blocked");
  assert.deepEqual(summary.missingEnv, ["PAYLOAD_SECRET", "DATABASE_URL"]);
  assert.deepEqual(summary.placeholderEnv, []);
  assert.deepEqual(summary.weakEnv, []);
  assert.ok(summary.blockedChecks.includes("payload_secret"));
  assert.ok(summary.blockedChecks.includes("database_url"));
  assert.ok(summary.blockedChecks.includes("database_tcp"));
  assert.ok(summary.nextActions.some((action) => action.includes("payload:bootstrap")));
});

test("Payload runtime preflight CLI explains missing report remediation", () => {
  const missingPath = `${fs.mkdtempSync(`${os.tmpdir()}/ms-realty-payload-runtime-cli-`)}/payload-runtime-report.json`;
  const missingState = payloadRuntimeState(missingPath);
  const result = spawnSync(process.execPath, ["production/scripts/validate-payload-runtime-report.mjs"], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: { ...process.env, MS_REALTY_PAYLOAD_RUNTIME_REPORT_PATH: missingPath },
  });

  assert.equal(missingState.status, "missing_report");
  assert.ok(missingState.next_actions.some((action) => action.includes("payload:bootstrap")));
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /PAYLOAD RUNTIME PREFLIGHT FAILED: missing_report/);
  assert.match(result.stderr, /Next: run `npm run payload:bootstrap`/);

  fs.writeFileSync(missingPath, "{}\n");
  const invalidState = payloadRuntimeState(missingPath);
  assert.equal(invalidState.status, "invalid_report");
  assert.ok(invalidState.next_actions.some((action) => action.includes("payload:runtime")));
});

test("Payload runtime generator explains blocked remediation", () => {
  const reportPath = `${fs.mkdtempSync(`${os.tmpdir()}/ms-realty-payload-runtime-build-`)}/payload-runtime-report.json`;
  const result = spawnSync(process.execPath, ["production/scripts/build-payload-runtime-report.mjs"], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: {
      ...process.env,
      DATABASE_URL: "",
      MS_REALTY_PAYLOAD_RUNTIME_REPORT_PATH: reportPath,
      PAYLOAD_SECRET: "",
    },
  });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /Wrote Payload runtime report/);
  assert.match(result.stdout, /Payload runtime blocked: payload_secret, database_url, database_network_scope, database_tcp/);
  assert.match(result.stdout, /Missing env: PAYLOAD_SECRET, DATABASE_URL/);
  assert.match(result.stdout, /Next: run `npm run payload:bootstrap`/);
  assert.ok(fs.existsSync(reportPath));
});

test("Payload runtime bootstrap tells operators to import or mount the redacted report", () => {
  assert.match(payloadRuntimeBootstrapChecklist().join(" "), /import or mount the redacted report/);
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
      DATABASE_URL: "postgres://payload:secret@db.ms-realty.bg:5432/ms_realty",
      PAYLOAD_SECRET: "not-written-to-report-32-byte-minimum",
    },
    generatedAt: "2026-07-06T00:00:00Z",
  });

  assert.equal(assertPayloadRuntimeReport(report), true);
  assert.equal(report.ready, true);
  assert.deepEqual(report.summary.missing_env, []);
  assert.equal(report.summary.database.database, "ms_realty");
  assert.equal(report.summary.database.host, "db.ms-realty.bg");
  assert.equal(report.summary.database.network_scope, "public_dns");
  assert.equal(report.summary.database.private_network_allowed, false);
  assert.equal(report.summary.database.credentials_configured, true);
  assert.equal(report.checks.find((check) => check.id === "database_network_scope").status, "pass");
  assert.ok(report.next_actions.some((action) => action.includes("redacted Payload runtime report")));
  assert.ok(report.next_actions.some((action) => action.includes("payload:preflight") && action.includes("launch:preflight")));
  assert.throws(
    () =>
      assertPayloadRuntimeReport({
        ...report,
        next_actions: ["Run npm run launch:preflight with the same PAYLOAD_SECRET and DATABASE_URL."],
      }),
    /payload:preflight before launch:preflight/,
  );
  assert.equal(JSON.stringify(report).includes("not-written-to-report-32-byte-minimum"), false);
  assert.equal(JSON.stringify(report).includes("payload:secret"), false);
});

test("Payload runtime report blocks private database hosts without explicit launch evidence", async () => {
  const probeCalls = [];
  const blocked = await buildPayloadRuntimeReport({
    databaseProbe: async (target) => {
      probeCalls.push(target);
      return { ...target, status: "pass" };
    },
    env: {
      DATABASE_URL: "postgres://payload:secret@db.internal:5432/ms_realty",
      PAYLOAD_SECRET: "not-written-to-report-32-byte-minimum",
    },
    generatedAt: "2026-07-06T00:00:00Z",
  });

  assert.equal(assertPayloadRuntimeReport(blocked), true);
  assert.equal(blocked.ready, false);
  assert.equal(probeCalls.length, 0);
  assert.equal(blocked.summary.database.network_scope, "private_dns");
  assert.equal(blocked.summary.database.private_network_allowed, false);
  assert.equal(blocked.checks.find((check) => check.id === "database_network_scope").status, "fail");
  assert.match(blocked.checks.find((check) => check.id === "database_tcp").error, /Private database host/);

  const allowed = await buildPayloadRuntimeReport({
    databaseProbe: async ({ host, port, database }) => ({ database, host, port, status: "pass" }),
    env: {
      DATABASE_URL: "postgres://payload:secret@db.internal:5432/ms_realty",
      MS_REALTY_ALLOW_PRIVATE_DATABASE_HOST: "1",
      PAYLOAD_SECRET: "not-written-to-report-32-byte-minimum",
    },
    generatedAt: "2026-07-06T00:00:00Z",
  });

  assert.equal(assertPayloadRuntimeReport(allowed), true);
  assert.equal(allowed.ready, true);
  assert.equal(allowed.summary.database.network_scope, "private_dns");
  assert.equal(allowed.summary.database.private_network_allowed, true);
  assert.equal(allowed.checks.find((check) => check.id === "database_network_scope").status, "pass");
  assert.throws(
    () =>
      assertPayloadRuntimeReport({
        ...allowed,
        summary: { ...allowed.summary, database: { ...allowed.summary.database, private_network_allowed: false } },
        checks: allowed.checks.map((check) =>
          check.id === "database_network_scope" ? { ...check, private_network_allowed: false } : check,
        ),
      }),
    /private-network approval/,
  );
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
  assert.equal(report.checks.find((check) => check.id === "database_url").status, "fail");
  assert.match(report.checks.find((check) => check.id === "database_url").error, /database name/);
  assert.equal(report.checks.find((check) => check.id === "database_tcp").status, "fail");
  assert.match(report.checks.find((check) => check.id === "database_tcp").error, /database name/);
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
  assert.equal(report.checks.find((check) => check.id === "database_url").status, "fail");
  assert.match(report.checks.find((check) => check.id === "database_url").error, /database host/);
  assert.equal(report.checks.find((check) => check.id === "database_tcp").status, "fail");
  assert.match(report.checks.find((check) => check.id === "database_tcp").error, /database host/);
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
  assert.equal(report.checks.find((check) => check.id === "database_url").status, "fail");
  assert.match(report.checks.find((check) => check.id === "database_url").error, /database credentials/);
  assert.equal(report.checks.find((check) => check.id === "database_tcp").status, "fail");
  assert.match(report.checks.find((check) => check.id === "database_tcp").error, /database credentials/);
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
  assert.equal(report.checks.find((check) => check.id === "database_url").status, "fail");
  assert.match(report.checks.find((check) => check.id === "database_url").error, /localhost or placeholder/);
  assert.equal(report.checks.find((check) => check.id === "database_tcp").status, "fail");
  assert.match(report.checks.find((check) => check.id === "database_tcp").error, /localhost or placeholder/);
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
    () => assertPayloadRuntimeReport({ ...report, checks: [...report.checks, { id: "operator_note", status: "pass" }] }),
    /unknown check operator_note/,
  );
  assert.throws(
    () => assertPayloadRuntimeReport({ ...report, DATABASE_URL: "postgres://payload:secret@db.internal:5432/ms_realty" }),
    /must not persist secrets/,
  );
  assert.throws(
    () => assertPayloadRuntimeReport({ ...report, operator_note: "Bearer test-token" }),
    /must not persist secrets/,
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
    () =>
      assertPayloadRuntimeReport({
        ...report,
        checks: report.checks.map((check) => (check.id === "payload_secret" ? { ...check, env: "DATABASE_URL" } : check)),
      }),
    /payload_secret check must reference PAYLOAD_SECRET/,
  );
  assert.throws(
    () =>
      assertPayloadRuntimeReport({
        ...report,
        checks: report.checks.map((check) => (check.id === "database_url" ? { ...check, env: "PAYLOAD_SECRET" } : check)),
      }),
    /database_url check must reference DATABASE_URL/,
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
    () => assertPayloadRuntimeReport({ ...report, next_actions: [] }),
    /next actions/,
  );
  assert.throws(
    () => assertPayloadRuntimeReport({ ...report, next_actions: ["Set PAYLOAD_SECRET and DATABASE_URL."] }),
    /payload:bootstrap/,
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
      DATABASE_URL: "postgres://payload:secret@db.ms-realty.bg:5432/ms_realty",
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
        checks: report.checks.map((check) => (check.id === "database_tcp" ? { ...check, host: "other-db.ms-realty.bg" } : check)),
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
  assert.throws(
    () =>
      assertPayloadRuntimeReport({
        ...report,
        summary: { ...report.summary, database: { ...report.summary.database, host: "127.0.0.1" } },
        checks: report.checks.map((check) => (check.id === "database_tcp" ? { ...check, host: "127.0.0.1" } : check)),
      }),
    /database network scope evidence/,
  );
});

test("Payload runtime ready report requires route and config evidence", async () => {
  const report = await buildPayloadRuntimeReport({
    databaseProbe: async ({ host, port, database }) => ({ database, host, port, status: "pass" }),
    env: {
      DATABASE_URL: "postgres://payload:secret@db.ms-realty.bg:5432/ms_realty",
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
