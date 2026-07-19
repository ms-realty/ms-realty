import test from "node:test";
import assert from "node:assert/strict";
import { appAdminConfigFromEnv, renderAppAdminResponse } from "../lib/app-admin-adapter.mjs";
import { createHttpApp, dispatchHttp } from "../lib/http.mjs";

async function withReportOperator(fn) {
  const previous = {
    NODE_ENV: process.env.NODE_ENV,
    MS_REALTY_ADMIN_TOKEN: process.env.MS_REALTY_ADMIN_TOKEN,
    MS_REALTY_ADMIN_ACTOR: process.env.MS_REALTY_ADMIN_ACTOR,
    MS_REALTY_ADMIN_CREDENTIALS_JSON: process.env.MS_REALTY_ADMIN_CREDENTIALS_JSON,
  };
  try {
    process.env.NODE_ENV = "production";
    delete process.env.MS_REALTY_ADMIN_TOKEN;
    delete process.env.MS_REALTY_ADMIN_ACTOR;
    process.env.MS_REALTY_ADMIN_CREDENTIALS_JSON = JSON.stringify([
      { id: "agency_manager", token: "agency-manager-report-token-0123456789" },
    ]);
    return await fn({ authorization: "Bearer agency-manager-report-token-0123456789" });
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test("Next admin exposes localized ledger-backed operations reports and CSV export", async () => {
  await withReportOperator(async (auth) => {
    const config = appAdminConfigFromEnv({
      MS_REALTY_REVIEWED_AT: "2026-07-19T12:00:00.000Z",
    });
    const page = await renderAppAdminResponse(
      new Request("https://example.test/admin/reports?locale=ru", { headers: auth }),
      { config },
    );
    const html = await page.text();
    assert.equal(page.status, 200);
    assert.match(html, /data-kind="admin-operations-reports"/);
    assert.match(html, /data-privacy-safe="true"/);
    assert.match(html, /Операционные отчеты/);
    assert.match(html, /data-report-section="source-quality"/);
    assert.match(html, /data-report-section="task-health"/);
    assert.match(html, /href="\/api\/admin\/reports\/export"/);

    const json = await renderAppAdminResponse(
      new Request("https://example.test/api/admin/reports?locale=en", { headers: auth }),
      { config },
    );
    const body = await json.json();
    assert.equal(json.status, 200);
    assert.equal(body.kind, "admin_operations_reports");
    assert.equal(body.report.kind, "operations_report");
    assert.equal(body.report.privacy.raw_contacts_included, false);
    assert.equal(Array.isArray(body.report.source_quality), true);
    assert.equal(Array.isArray(body.report.task_health.rows), true);

    const exported = await renderAppAdminResponse(
      new Request("https://example.test/api/admin/reports/export", { headers: auth }),
      { config },
    );
    assert.equal(exported.status, 200);
    assert.match(exported.headers.get("content-type"), /text\/csv/);
    assert.match(exported.headers.get("content-disposition"), /ms-realty-source-quality\.csv/);
    assert.match(await exported.text(), /^source,leads,replies_sent,response_rate_pct,/);
  });
});

test("HTTP adapter exposes the same operations report contract", async () => {
  await withReportOperator(async (auth) => {
    const app = createHttpApp({ redirects: [], reviewedAt: "2026-07-19T12:00:00.000Z" });
    const response = await dispatchHttp(app, {
      method: "GET",
      url: "/api/admin/reports?locale=bg",
      headers: auth,
    });
    assert.equal(response.status, 200);
    assert.equal(response.body.kind, "admin_operations_reports");
    assert.equal(response.body.report.privacy.raw_messages_included, false);

    const html = await dispatchHttp(app, {
      method: "GET",
      url: "/admin/reports?locale=bg",
      headers: auth,
    });
    assert.equal(html.status, 200);
    assert.match(html.body, /Оперативни отчети/);
    assert.match(html.body, /data-report-section="listing-inventory"/);
  });
});

