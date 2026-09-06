import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHttpApp, dispatchHttp } from "../lib/http.mjs";

// The two queues at the foot of the lead inbox are fixed-layout tables in a
// 557px column. A pill that refuses to wrap is 172px of ink in a 100px cell,
// and it was being painted across the Due at column beside it.

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const CSS = fs.readFileSync(path.join(ROOT, "public/vendor/ms-realty-admin.css"), "utf8");
const TABLES = ["data-viewing-follow-up-table", "data-seller-pipeline-table"];

test("a pill inside a fixed queue column wraps instead of painting over the next one", () => {
  for (const table of TABLES) {
    const rule = CSS.match(new RegExp(`table\\[${table}\\] \\.crm-pill[^{]*\\{([^}]*)\\}`));
    assert.ok(rule, `${table} states how a pill behaves in a fixed column`);
    assert.match(rule[1], /white-space:normal/);
    assert.match(rule[1], /overflow-wrap:break-word/);
  }
});

test("the data columns clip, and the column that opens a form does not", () => {
  const clip = CSS.match(/table\[data-viewing-follow-up-table\] td,[^{]*\{overflow:hidden\}/);
  assert.ok(clip, "the data cells clip, so nothing can reach a neighbour");

  // Clipping a control is not an improvement on overlapping one: the action
  // cell is the one whose content is meant to grow when the form opens.
  for (const [table, column] of [
    ["data-viewing-follow-up-table", "data-viewing-column"],
    ["data-seller-pipeline-table", "data-seller-pipeline-column"],
  ]) {
    assert.match(CSS, new RegExp(`table\\[${table}\\] td\\[${column}="action"\\][^{]*\\{[^}]*overflow:visible`));
  }
});

test("the five columns still add up, and the one holding a form is the widest", () => {
  for (const table of TABLES) {
    const widths = [1, 2, 3, 4, 5].map((n) => {
      const rule = CSS.match(new RegExp(`table\\[${table}\\] th:nth-child\\(${n}\\)[^{]*\\{width:(\\d+)%\\}`));
      assert.ok(rule, `${table} column ${n} declares a width`);
      return Number(rule[1]);
    });
    assert.equal(widths.reduce((sum, value) => sum + value, 0), 100, `${table} column widths total 100%`);
    // The action column carries a form whose widest button is 136px; at 24% of
    // a 557px container it had 134px, which is where the clipping came from.
    assert.equal(Math.max(...widths), widths[4], `${table} gives the most room to the column that opens a form`);
    assert.ok(widths[4] >= 30, `${table} action column is at least 30%, got ${widths[4]}%`);
  }
});

test("the queues still render both tables with their five columns", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ms-realty-queue-tables-"));
  const copy = (name) => {
    const target = path.join(dir, name);
    fs.copyFileSync(path.join(ROOT, "production/data", name), target);
    return target;
  };
  const app = createHttpApp({
    reviewedAt: "2026-07-19T12:00:00.000Z",
    leadLedgerPath: copy("lead-ledger.jsonl"),
    eventLedgerPath: copy("events.jsonl"),
    leadContactVaultPath: path.join(dir, "lead-contacts.jsonl"),
    leadContactKey: "test-only-queue-table-key-32-chars-x",
  });
  const res = await dispatchHttp(app, { url: "/admin/leads?locale=en", headers: { authorization: "Bearer local-admin-smoke" } });
  assert.equal(res.status, 200);
  for (const table of TABLES) assert.match(res.body, new RegExp(`<table[^>]*${table}`));
  // The stage cell is the one that overflowed: it holds a pill, in a column
  // the stylesheet above now lets wrap.
  assert.match(res.body, /data-seller-pipeline-column="stage"[^>]*><span class="crm-pill"/);
});
