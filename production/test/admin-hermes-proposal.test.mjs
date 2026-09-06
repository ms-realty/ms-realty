import assert from "node:assert/strict";
import test from "node:test";
import { ADMIN_APP_JS } from "../lib/ui/client.mjs";

function element(attributes = {}) {
  const values = new Map(Object.entries(attributes));
  return {
    children: [], listeners: {}, value: "", disabled: false, readOnly: false,
    setAttribute(name, value) { values.set(name, String(value)); },
    getAttribute(name) { return values.get(name) ?? null; },
    removeAttribute(name) { values.delete(name); },
    appendChild(node) { this.children.push(node); node.parent = this; },
    remove() { this.parent.children = this.parent.children.filter((node) => node !== this); },
    querySelector() { return this.children.find((node) => node.getAttribute("data-hermes-proposal")); },
    addEventListener(name, listener) { this.listeners[name] = listener; },
    dispatchEvent(event) { this.events = [...(this.events || []), event.type]; },
    focus() { this.focused = true; },
    closest() { return null; },
  };
}

function harness() {
  const target = element();
  target.value = "Operator's original text";
  const host = element();
  const bar = element();
  const button = element({ "data-hermes-assist-target": "field", "data-hermes-assist-bar": "bar" });
  button.innerHTML = "Draft";
  button.closest = () => host;
  let click;
  let respond;
  const document = {
    addEventListener(type, listener) { if (type === "click") click = listener; },
    getElementById(id) { return { field: target, bar }[id]; },
    createElement: () => element(),
  };
  const start = ADMIN_APP_JS.indexOf("  function initHermesAssist() {");
  const end = ADMIN_APP_JS.indexOf("  function initReplyForms() {", start);
  assert.ok(start >= 0 && end > start);
  new Function("document", "fetch", "Event", ADMIN_APP_JS.slice(start, end) + "\ninitHermesAssist();")(
    document, () => new Promise((resolve) => { respond = resolve; }), Event,
  );
  return {
    target, host, bar, button,
    request() { click({ target: { closest: () => button }, preventDefault() {} }); },
    async resolve(draft = { text: "Proposed text", human_approval_required: true, can_publish: false }) {
      respond({ ok: true, json: async () => draft });
      await new Promise((resolve) => setImmediate(resolve));
    },
    proposal() { return host.querySelector(); },
  };
}

test("Hermes preserves typing during generation and requires a reviewed comparison before replacing it", async () => {
  const ui = harness();
  ui.request();
  ui.target.value = "Typed while Hermes was working";
  await ui.resolve();
  assert.equal(ui.target.value, "Typed while Hermes was working");
  const proposal = ui.proposal();
  assert.equal(proposal.children[0].children[0].value, ui.target.value);
  assert.equal(proposal.children[1].children[0].value, "Proposed text");
  assert.equal(proposal.children[1].children[0].readOnly, true);
  const apply = proposal.children[2].children[0];
  ui.target.value = "Further edits after the comparison appeared";
  apply.listeners.click();
  assert.equal(ui.target.value, "Further edits after the comparison appeared");
  assert.equal(proposal.children[0].children[0].value, ui.target.value);
  assert.match(ui.bar.textContent, /changed/);
  apply.listeners.click();
  assert.equal(ui.target.value, "Proposed text");
  assert.deepEqual(ui.target.events, ["input"]);
  assert.equal(ui.target.getAttribute("data-hermes-drafted"), "true");
  assert.equal(ui.proposal(), undefined);
});

test("discarding a proposal preserves the field; another request replaces only the old proposal", async () => {
  const ui = harness();
  ui.request();
  await ui.resolve();
  ui.proposal().children[2].children[1].listeners.click();
  assert.equal(ui.target.value, "Operator's original text");
  assert.equal(ui.proposal(), undefined);
  assert.equal(ui.bar.hidden, true);
  ui.request();
  await ui.resolve();
  ui.request();
  assert.equal(ui.proposal(), undefined);
  await ui.resolve({ text: "Second proposal", broker_approval_required: true });
  assert.equal(ui.host.children.length, 1);
  assert.equal(ui.proposal().children[1].children[0].value, "Second proposal");
  assert.equal(ui.target.value, "Operator's original text");
});

test("unsafe responses and read-only fields cannot change operator text", async () => {
  for (const draft of [
    { text: "Unsafe", human_approval_required: true, can_publish: true },
    { text: "Unsafe", broker_approval_required: true, can_send_without_approval: true },
    { text: "Unreviewed" },
    { text: {}, human_approval_required: true },
  ]) {
    const ui = harness();
    ui.request();
    await ui.resolve(draft);
    assert.equal(ui.target.value, "Operator's original text");
    assert.equal(ui.proposal(), undefined);
    assert.equal(ui.bar.getAttribute("data-hermes-drafted-state"), "error");
    assert.equal(ui.button.disabled, false);
  }
  const ui = harness();
  ui.request();
  await ui.resolve();
  ui.target.readOnly = true;
  ui.proposal().children[2].children[0].listeners.click();
  assert.equal(ui.target.value, "Operator's original text");
});
