import assert from "node:assert/strict";
import test from "node:test";
import { PUBLIC_APP_JS } from "../lib/ui/client.mjs";

function element(attributes = {}) {
  const values = new Map(Object.entries(attributes));
  return { children: [], listeners: {}, style: {}, value: "", disabled: false, textContent: "",
    setAttribute(name, value) { values.set(name, String(value)); }, getAttribute(name) { return values.get(name) ?? null; },
    removeAttribute(name) { values.delete(name); }, addEventListener(name, listener) { this.listeners[name] = listener; },
    replaceChildren() { this.children = []; }, appendChild(node) { this.children.push(node); } };
}
function harness() {
  const copy = ["Title", "Note", "Question", "Find", "Checking", "Related wording", "No answer", "Unavailable", "Reviewer", "Reviewed", "Version", "Rate limited"];
  const form = element({ "data-question-copy": JSON.stringify(copy) });
  form.action = "/api/listings/question";
  form.elements = { question: element(), listingId: { value: "MS-CRAWL-0001" }, locale: { value: "en" } };
  form.elements.question.value = "balcony";
  const button = element(); const status = element(); const result = element();
  form.querySelector = (selector) => ({ '[type="submit"]': button, "[data-question-status]": status, "[data-question-result]": result })[selector];
  form.reportValidity = () => true;
  const requests = [];
  const start = PUBLIC_APP_JS.indexOf("  function initListingSourceQuestions() {");
  const end = PUBLIC_APP_JS.indexOf("  initListingSourceQuestions();", start);
  new Function("document", "fetch", "AbortController", PUBLIC_APP_JS.slice(start, end) + "\ninitListingSourceQuestions();")(
    { querySelectorAll: () => [form], createElement: element },
    (url, options) => new Promise((resolve) => requests.push({ url, options, resolve })), AbortController,
  );
  return { form, button, status, result, requests,
    submit() { form.listeners.submit({ preventDefault() {} }); },
    type(text) { form.elements.question.value = text; form.elements.question.listeners.input(); },
    async respond(index, body, status = 200) { requests[index].resolve({ ok: status === 200, status, json: async () => body }); await new Promise((done) => setImmediate(done)); },
  };
}
const response = (question = "balcony") => ({ kind: "listing_source_passages", listing_id: "MS-CRAWL-0001", locale: "en", question,
  status: "related_source", source_hash: "a".repeat(64), reviewer: "Fixture reviewer", reviewed_at: "2026-09-01T00:00:00Z",
  canonical_url: "/en/properties/MS-CRAWL-0001", passages: [{ quote: "There is a balcony.", source_hash: "a".repeat(64) }] });

test("source lookup renders literal wording and review evidence without replacing the question", async () => {
  const ui = harness(); ui.submit(); ui.submit();
  assert.equal(ui.requests.length, 1);
  assert.equal(ui.button.disabled, true);
  await ui.respond(0, response());
  assert.equal(ui.result.children[0].textContent, "There is a balcony.");
  assert.equal(ui.result.children[0].lang, "en");
  assert.equal(ui.status.textContent, "Related wording");
  assert.equal(ui.form.elements.question.value, "balcony");
  assert.equal(ui.button.disabled, false);
});

test("typing clears old results and a late response cannot overwrite a newer question", async () => {
  const ui = harness(); ui.submit(); ui.type("garden");
  assert.equal(ui.requests[0].options.signal.aborted, true);
  ui.submit(); await ui.respond(0, response());
  assert.equal(ui.result.children.length, 0);
  assert.equal(ui.status.textContent, "Checking");
  await ui.respond(1, { ...response("garden"), status: "no_answer", passages: [] });
  assert.equal(ui.status.textContent, "No answer");
  assert.equal(ui.form.elements.question.value, "garden");
});

test("rate limits and mismatched receipts retain the question and expose no stale quote", async () => {
  for (const [body, status, expected] of [[{}, 429, "Rate limited"], [{ ...response(), listing_id: "MS-CRAWL-0002" }, 200, "Unavailable"]]) {
    const ui = harness(); ui.submit(); await ui.respond(0, body, status);
    assert.equal(ui.status.textContent, expected);
    assert.equal(ui.result.children.length, 0);
    assert.equal(ui.form.elements.question.value, "balcony");
    assert.equal(ui.button.disabled, false);
  }
});
