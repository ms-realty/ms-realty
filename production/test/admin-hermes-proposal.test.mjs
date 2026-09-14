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

function listingDraft(overrides = {}) {
  return {
    text: "Proposed text", human_approval_required: true, can_publish: false,
    listing_id: "MS-00922", field: "description", locale: "bg",
    source_snapshot: { listing_id: "MS-00922", draft_revision: "a".repeat(64), source_locale: "bg" },
    ...overrides,
  };
}

function harness({ listing = false } = {}) {
  const target = element();
  target.value = "Operator's original text";
  target.defaultValue = target.value;
  target.name = "description";
  const host = element();
  const bar = element();
  const button = element({ "data-hermes-assist-target": "field", "data-hermes-assist-bar": "bar" });
  const form = element();
  const price = { name: "price_eur", value: "860", defaultValue: "860" };
  const listingId = { name: "listingId", value: "MS-00922", defaultValue: "MS-00922" };
  const revision = { name: "draftRevision", value: "a".repeat(64), defaultValue: "a".repeat(64) };
  form.elements = [target, price, listingId, revision];
  form.setAttribute("data-editor-initial-state", JSON.stringify([
    ["description", "Operator's original text"], ["price_eur", "860"], ["listingId", "MS-00922"],
  ]));
  form.querySelector = (selector) => ({ '[name="draftRevision"]': revision, '[name="listingId"]': listingId })[selector] || null;
  if (listing) {
    target.form = form;
    button.setAttribute("data-hermes-assist-endpoint", "/api/admin/listings/copy/draft");
    button.setAttribute("data-hermes-assist-listing", listingId.value);
    button.setAttribute("data-hermes-assist-field", "description");
    button.setAttribute("data-hermes-assist-locale", "bg");
    button.setAttribute("data-hermes-assist-source-locale", "bg");
    button.setAttribute("data-hermes-assist-require-revision", "true");
  }
  button.innerHTML = "Draft";
  button.closest = () => host;
  let click;
  let respond;
  const requests = [];
  const document = {
    addEventListener(type, listener) { if (type === "click") click = listener; },
    getElementById(id) { return { field: target, bar }[id]; },
    createElement: () => element(),
  };
  const start = ADMIN_APP_JS.indexOf("  function initHermesAssist() {");
  const end = ADMIN_APP_JS.indexOf("  function initReplyForms() {", start);
  const stateStart = ADMIN_APP_JS.indexOf("  function editorFormState(");
  const stateEnd = ADMIN_APP_JS.indexOf("  function snapshotEditorFormState(", stateStart);
  assert.ok(start >= 0 && end > start);
  class FormDataFixture {
    constructor(form) { this.fields = form.elements.filter((field) => field.name && !field.disabled); }
    forEach(callback) { this.fields.forEach((field) => callback(field.value, field.name)); }
  }
  new Function("document", "fetch", "Event", "FormData", ADMIN_APP_JS.slice(stateStart, stateEnd) + ADMIN_APP_JS.slice(start, end) + "\ninitHermesAssist();")(
    document, (url, options) => {
      requests.push(JSON.parse(options.body));
      return new Promise((resolve) => { respond = resolve; });
    }, Event, FormDataFixture,
  );
  return {
    target, host, bar, button, form, price, listingId, revision, requests,
    request() { click({ target: { closest: () => button }, preventDefault() {} }); },
    async resolve(draft = listing ? listingDraft() : { text: "Proposed text", human_approval_required: true, can_publish: false }) {
      respond({ ok: true, json: async () => draft });
      await new Promise((resolve) => setImmediate(resolve));
    },
    proposal() { return host.querySelector(); },
  };
}

test("listing fact edits while generation is pending reject the stale proposal and preserve user edits", async () => {
  const ui = harness({ listing: true });
  ui.request();
  ui.price.value = "940";
  await ui.resolve();
  assert.equal(ui.target.value, "Operator's original text");
  assert.equal(ui.price.value, "940");
  assert.equal(Boolean(ui.proposal()), false);
  assert.equal(ui.bar.getAttribute("data-hermes-drafted-state"), "error");
  assert.match(ui.bar.textContent, /changed|new draft/i);
  assert.equal(ui.button.disabled, false, "the operator can explicitly request another draft");
  assert.equal(ui.requests.length, 1, "a stale response never automatically regenerates");
  assert.equal(ui.revision.value, "a".repeat(64));
});

test("unsaved listing facts must be saved before generation so Hermes cannot draft from their older saved values", () => {
  const ui = harness({ listing: true });
  ui.price.value = "940";
  ui.request();
  assert.equal(ui.requests.length, 0);
  assert.equal(ui.price.value, "940");
  assert.equal(ui.price.defaultValue, "860");
  assert.equal(ui.target.value, "Operator's original text");
  assert.equal(ui.revision.value, "a".repeat(64));
  assert.match(ui.bar.textContent, /save.*listing/i);
  assert.equal(ui.bar.getAttribute("data-hermes-drafted-state"), "error");
  assert.equal(ui.button.disabled, false);
});

test("edits after a listing proposal arrives require regeneration rather than a second Apply click", async (t) => {
  for (const field of ["price", "target"]) await t.test(field, async () => {
    const ui = harness({ listing: true });
    ui.request();
    await ui.resolve();
    const apply = ui.proposal().children[2].children[0];
    ui[field].value = "New operator value";
    apply.listeners.click();
    assert.equal(ui[field].value, "New operator value");
    assert.notEqual(ui.target.value, "Proposed text");
    assert.equal(apply.disabled, true);
    assert.equal(ui.bar.getAttribute("data-hermes-drafted-state"), "error");
    assert.match(ui.bar.textContent, /new draft/i);
    assert.equal(ui.button.focused, true, "focus moves from the disabled Apply button to regeneration");
    apply.listeners.click();
    assert.notEqual(ui.target.value, "Proposed text");
    assert.equal(ui.target.events, undefined);
    assert.equal(ui.revision.value, "a".repeat(64));
    assert.equal(ui.revision.defaultValue, "a".repeat(64));
  });
});

test("a newer save revision invalidates a pending or displayed listing proposal without resetting save state", async (t) => {
  for (const phase of ["pending", "displayed"]) await t.test(phase, async () => {
    const ui = harness({ listing: true });
    ui.request();
    if (phase === "displayed") await ui.resolve();
    ui.revision.value = ui.revision.defaultValue = "b".repeat(64);
    if (phase === "pending") {
      await ui.resolve();
      assert.equal(Boolean(ui.proposal()), false);
    } else {
      const apply = ui.proposal().children[2].children[0];
      apply.listeners.click();
      assert.equal(apply.disabled, true);
    }
    assert.equal(ui.target.value, "Operator's original text");
    assert.equal(ui.revision.value, "b".repeat(64));
    assert.equal(ui.revision.defaultValue, "b".repeat(64));
    assert.equal(ui.bar.getAttribute("data-hermes-drafted-state"), "error");
    assert.match(ui.bar.textContent, /listing|source/i);
  });
});

test("an observed source locale change invalidates a pending or displayed proposal without resetting save state", async (t) => {
  for (const phase of ["pending", "displayed"]) await t.test(phase, async () => {
    const ui = harness({ listing: true });
    ui.request();
    if (phase === "displayed") await ui.resolve();
    ui.button.setAttribute("data-hermes-assist-source-locale", "fr");
    if (phase === "pending") {
      await ui.resolve();
      assert.equal(Boolean(ui.proposal()), false);
    } else {
      const apply = ui.proposal().children[2].children[0];
      apply.listeners.click();
      assert.equal(apply.disabled, true);
    }
    assert.equal(ui.target.value, "Operator's original text");
    assert.equal(ui.target.events, undefined);
    assert.equal(ui.revision.value, "a".repeat(64));
    assert.equal(ui.revision.defaultValue, "a".repeat(64));
    assert.equal(ui.requests.length, 1);
    assert.equal(ui.bar.getAttribute("data-hermes-drafted-state"), "error");
    assert.match(ui.bar.textContent, /listing|source/i);
  });
});

test("listing proposals require the requested identity, source locale and exact source revision", async (t) => {
  const cases = [
    ["different listing", { listing_id: "MS-00905" }],
    ["different source listing", { source_snapshot: { listing_id: "MS-00905", draft_revision: "a".repeat(64), source_locale: "bg" } }],
    ["different source revision", { source_snapshot: { listing_id: "MS-00922", draft_revision: "b".repeat(64), source_locale: "bg" } }],
    ["missing source revision", { source_snapshot: { listing_id: "MS-00922", source_locale: "bg" } }],
    ["source locale changed since render", { source_snapshot: { listing_id: "MS-00922", draft_revision: "a".repeat(64), source_locale: "fr" } }],
    ["missing source locale", { source_snapshot: { listing_id: "MS-00922", draft_revision: "a".repeat(64) } }],
    ["missing source snapshot", { source_snapshot: undefined }],
    ["different field", { field: "meta_description" }],
    ["different locale", { locale: "ru" }],
  ];
  for (const [name, overrides] of cases) await t.test(name, async () => {
    const ui = harness({ listing: true });
    ui.request();
    await ui.resolve(listingDraft(overrides));
    assert.equal(Boolean(ui.proposal()), false);
    assert.equal(ui.target.value, "Operator's original text");
    assert.equal(ui.bar.getAttribute("data-hermes-drafted-state"), "error");
    assert.match(ui.bar.textContent, /listing|source/i);
    assert.equal(ui.revision.value, "a".repeat(64));
    assert.equal(ui.button.disabled, false);
  });
});

test("a matching listing proposal changes only the accepted field and preserves ordinary save defaults", async () => {
  const ui = harness({ listing: true });
  ui.target.value = "Operator's revised source text";
  ui.request();
  await ui.resolve();
  assert.equal(ui.requests[0].sourceText, "Operator's revised source text");
  assert.equal(ui.target.value, "Operator's revised source text", "receiving a proposal does not apply it");
  ui.proposal().children[2].children[0].listeners.click();
  assert.equal(ui.target.value, "Proposed text");
  assert.equal(ui.target.defaultValue, "Operator's original text");
  assert.equal(ui.price.value, "860");
  assert.equal(ui.revision.value, "a".repeat(64));
  assert.equal(ui.revision.defaultValue, "a".repeat(64));
  assert.deepEqual(ui.target.events, ["input"]);
  assert.equal(ui.proposal(), undefined);
});

test("the requested output locale can differ from the bound source locale", async () => {
  const ui = harness({ listing: true });
  ui.button.setAttribute("data-hermes-assist-locale", "en");
  ui.request();
  await ui.resolve(listingDraft({ locale: "en" }));
  assert.equal(ui.requests[0].locale, "en");
  ui.proposal().children[2].children[0].listeners.click();
  assert.equal(ui.target.value, "Proposed text");
  assert.equal(ui.revision.value, "a".repeat(64));
});

test("a proposal cannot be applied after the control is reused for another listing", async () => {
  const ui = harness({ listing: true });
  ui.request();
  await ui.resolve();
  ui.button.setAttribute("data-hermes-assist-listing", "MS-00905");
  const apply = ui.proposal().children[2].children[0];
  apply.listeners.click();
  assert.equal(ui.target.value, "Operator's original text");
  assert.equal(apply.disabled, true);
  assert.match(ui.bar.textContent, /current listing/i);
});

test("a fresh request uses the current saved form revision instead of the initially rendered button revision", async () => {
  const ui = harness({ listing: true });
  ui.button.setAttribute("data-hermes-assist-revision", "a".repeat(64));
  ui.revision.value = ui.revision.defaultValue = "b".repeat(64);
  ui.request();
  await ui.resolve(listingDraft({ source_snapshot: { listing_id: "MS-00922", draft_revision: "b".repeat(64), source_locale: "bg" } }));
  ui.proposal().children[2].children[0].listeners.click();
  assert.equal(ui.target.value, "Proposed text");
  assert.equal(ui.revision.value, "b".repeat(64));
  assert.equal(ui.revision.defaultValue, "b".repeat(64));
});

test("media review proposals use the rendered source revision when their form has no editor revision field", async () => {
  const ui = harness({ listing: true });
  ui.form.querySelector = (selector) => selector === '[name="listingId"]' ? ui.listingId : null;
  ui.form.elements = ui.form.elements.filter((field) => field.name !== "draftRevision");
  ui.button.setAttribute("data-hermes-assist-revision", "a".repeat(64));
  ui.request();
  await ui.resolve();
  ui.proposal().children[2].children[0].listeners.click();
  assert.equal(ui.target.value, "Proposed text");
  assert.equal(ui.form.querySelector('[name="draftRevision"]'), null, "Hermes never creates a save revision");
});

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
