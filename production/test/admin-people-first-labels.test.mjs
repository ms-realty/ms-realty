import test from "node:test";
import assert from "node:assert/strict";
import { createHttpApp, dispatchHttp } from "../lib/http.mjs";

// PRODUCT.md: trust is visible, and raw keys are never UI text. On the four
// screens a broker works from, every heading and every emphasised label names
// a person, a property or an action. Ledger ids stay in <code> captions.
const auth = { authorization: "Bearer local-admin-smoke" };
const app = () => createHttpApp({ adminToken: "local-admin-smoke" });
const ID_PREFIX = /^(lead-draft-|viewing-|seller-pipeline-|contact-lead-)/;
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

function visibleLabels(html) {
  const labels = [];
  for (const match of html.matchAll(/<(h[1-4]|strong)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/g)) {
    labels.push(match[2].replace(/<[^>]+>/g, "").trim());
  }
  return labels;
}

for (const [route, hook] of [
  ["/admin/today", 'data-react-admin-ui="today"'],
  ["/admin/leads", 'data-react-admin-ui="lead-inbox"'],
  ["/admin/pipeline", 'data-react-admin-ui="lead-pipeline"'],
  ["/admin/tasks", 'data-react-admin-ui="tasks"'],
]) {
  test(`${route} labels people and properties, never ledger ids`, async () => {
    const page = await dispatchHttp(app(), { url: `${route}?locale=en`, headers: auth });
    assert.equal(page.status, 200);
    assert.ok(page.body.includes(hook), `${route} renders its screen`);
    const labels = visibleLabels(page.body);
    assert.ok(labels.length > 0, `${route} has visible headings`);
    for (const text of labels) {
      assert.doesNotMatch(text, ID_PREFIX, `${route}: "${text}"`);
      assert.doesNotMatch(text, UUID, `${route}: "${text}"`);
    }
  });
}

test("the lead inbox carries no KPI strip, no secondary queues and no environment variable names", async () => {
  const page = await dispatchHttp(app(), { url: "/admin/leads?locale=en", headers: auth });
  assert.doesNotMatch(page.body, /class="adm-summary-strip"/);
  assert.doesNotMatch(page.body, /data-lead-secondary-queues="true"/);
  assert.doesNotMatch(page.body, /data-viewing-follow-up-queue="true"|data-seller-pipeline-queue="true"/);
  assert.doesNotMatch(page.body, /HERMES_[A-Z_]+/);
  assert.doesNotMatch(page.body, /<progress /);
  assert.match(page.body, /data-lead-missing-fields="/);
  assert.match(page.body, /data-lead-channel="true"/);
});

test("the pipeline carries no KPI strip, one overflow menu per card, and the seller valuation queue", async () => {
  const page = await dispatchHttp(app(), { url: "/admin/pipeline?locale=en", headers: auth });
  assert.doesNotMatch(page.body, /class="adm-kpis"/);
  const cards = page.body.match(/data-pipeline-card="true"/g) || [];
  const menus = page.body.match(/data-pipeline-overflow="true"/g) || [];
  assert.ok(cards.length > 0, "the local fixtures render pipeline cards");
  assert.equal(menus.length, cards.length);
  assert.match(page.body, /data-seller-pipeline-queue="true"/);
  // Each card's title is a person (or the enquiry type) and a reference.
  for (const title of page.body.matchAll(/<h3>([^<]*)<\/h3>/g)) assert.doesNotMatch(title[1], /^lead-/, title[1]);
});

test("Today keeps the work queue and opens Hermes with the selected task context", async () => {
  const page = await dispatchHttp(app(), { url: "/admin/today?locale=en", headers: auth });
  assert.match(page.body, /data-next-actions="true"/);
  assert.match(page.body, /data-today-briefing="true"/);
  assert.doesNotMatch(page.body, /data-hermes-entry="today"/);
  // Assistance opens with a specific task; unrelated reports stay out of the task flow.
  const main = page.body.slice(page.body.indexOf('data-today-workspace="true"'), page.body.indexOf("</main>"));
  assert.ok(main.length > 0, "the Today workspace renders inside main");
  assert.doesNotMatch(main, /href="\/admin\/reports(?:\?[^"]*)?"/);
  assert.match(main, /href="\/admin\/hermes\?prompt=[^"]+" data-today-hermes-context=/);
});
