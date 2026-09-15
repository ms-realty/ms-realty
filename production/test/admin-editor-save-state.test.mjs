import assert from "node:assert/strict";
import test from "node:test";
import { ADMIN_APP_JS } from "../lib/ui/client.mjs";

class Element {
  constructor(attributes = {}) { this.attributes = new Map(Object.entries(attributes)); this.disabled = false; }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  removeAttribute(name) { this.attributes.delete(name); }
  hasAttribute(name) { return this.attributes.has(name); }
}
class Input extends Element {
  constructor(name, value, type = "text") { super(); Object.assign(this, { name, value, defaultValue: value, type, checked: false, defaultChecked: false }); }
}
class Select extends Element {
  constructor() { super(); this.name = "condition"; this.options = ["old", "new"].map((value, index) => ({ value, selected: index === 0, defaultSelected: index === 0 })); }
  get value() { return this.options.find((option) => option.selected)?.value || ""; }
}
class Form extends Element {
  constructor() {
    super({ "data-editor-form": "listing", "data-admin-mutation-form": "listing", action: "/api/admin/listings/edit" });
    this.title = new Input("title", "Original title");
    this.description = new Input("description", "Original description");
    this.checkbox = new Input("confirmedFacts", "title", "checkbox");
    this.select = new Select();
    this.listingId = new Input("listingId", "MS-CRAWL-0106", "hidden");
    this.revision = new Input("draftRevision", "a".repeat(64), "hidden");
    this.elements = [this.title, this.description, this.checkbox, this.select, this.listingId, this.revision];
    this.save = new Element(); this.resetButton = new Element(); this.note = new Element(); this.status = new Element();
    this.savebar = new Element();
    this.savebar.querySelector = (selector) => ({ '[type="submit"]': this.save, "[data-editor-reset]": this.resetButton, "[data-editor-dirty-note]": this.note })[selector];
  }
  querySelector(selector) { return ({ "[data-editor-savebar]": this.savebar, "[data-admin-mutation-status]": this.status, '[name="draftRevision"]': this.revision })[selector] || null; }
  querySelectorAll(selector) { return selector === '[type="submit"]' ? [this.save] : []; }
  reset() { for (const field of this.elements) { if (field instanceof Select) field.options.forEach((option) => { option.selected = option.defaultSelected; }); else { field.value = field.defaultValue; field.checked = field.defaultChecked; } } }
}
class FormDataFixture {
  constructor(form) { this.entries = form.elements.filter((field) => !field.disabled && (!(field instanceof Input) || field.type !== "checkbox" || field.checked)).map((field) => [field.name, field.value]); }
  forEach(callback) { this.entries.forEach(([key, value]) => callback(value, key)); }
}
function section(start, end) { return ADMIN_APP_JS.slice(ADMIN_APP_JS.indexOf(start), ADMIN_APP_JS.indexOf(end, ADMIN_APP_JS.indexOf(start))); }
function harness() {
  const form = new Form(); let submit; let resolve; const requests = [];
  const source = section("  function syncEditorSavebar(", "  function initEditorForms(")
    + section("  function tourPayload(", "  function syncTourProviderInputs(")
    + section("  function adminMutationPayload(", "  function bulkOutcomeText(")
    + section("  function initAdminMutationForms(", "  function initWhatsAppEmbeddedSignup(");
  const api = new Function("document", "fetch", "FormData", "HTMLInputElement", "HTMLSelectElement", "HTMLFormElement", source + '\ninitAdminMutationForms(); return { commitEditorFormState, syncEditorSavebar, editorFormState };')(
    // The conflict panel lives outside the form, so the stub has to answer for
    // it the way a document would: absent here, which is the case the handler
    // must survive on a page that never rendered one.
    { addEventListener(name, listener) { if (name === "submit") submit = listener; }, querySelector: () => null },
    (url, options) => { requests.push(JSON.parse(options.body)); return new Promise((done) => { resolve = done; }); },
    FormDataFixture, Input, Select, Form,
  );
  api.commitEditorFormState(form);
  return { form, requests, api,
    submit() { submit({ target: form, preventDefault() {} }); },
    async respond(status = 201, payload = { kind: "listing_draft_saved", draft_revision: "b".repeat(64), listing_id: "MS-CRAWL-0106", draft_only: true }) {
      resolve({ ok: status >= 200 && status < 300, status, json: async () => payload });
      await new Promise((done) => setImmediate(done));
    },
  };
}

test("save acknowledgement preserves later typing, checkbox and select edits; reset restores submitted values", async () => {
  const ui = harness(); const { form } = ui;
  form.title.value = "Submitted title"; form.checkbox.checked = true;
  ui.submit(); ui.submit();
  assert.equal(ui.requests.length, 1);
  assert.equal(form.resetButton.disabled, true);
  form.title.value = "Typed during request"; form.checkbox.checked = false;
  form.select.options[0].selected = false; form.select.options[1].selected = true;
  ui.api.syncEditorSavebar(form);
  assert.equal(form.save.disabled, true);
  await ui.respond();
  assert.equal(form.title.value, "Typed during request");
  assert.equal(form.title.defaultValue, "Submitted title");
  assert.equal(form.checkbox.checked, false);
  assert.equal(form.checkbox.defaultChecked, true);
  assert.equal(form.select.value, "new");
  assert.equal(form.savebar.getAttribute("data-dirty"), "true");
  assert.match(form.status.textContent, /newer edits are still unsaved/);
  assert.equal(form.save.disabled, false);
  assert.equal(form.revision.value, "b".repeat(64));
  form.reset(); ui.api.syncEditorSavebar(form);
  assert.equal(form.title.value, "Submitted title");
  assert.equal(form.checkbox.checked, true);
  assert.equal(form.select.value, "old");
  assert.equal(form.revision.value, "b".repeat(64));
  assert.equal(form.savebar.getAttribute("data-dirty"), "false");
  assert.equal(form.save.disabled, true);
});

test("cleared fields are sent and a clean successful acknowledgement disables save", async () => {
  const ui = harness(); const { form } = ui;
  form.description.value = "";
  ui.submit();
  assert.equal(ui.requests[0].description, "");
  assert.equal(ui.requests[0].draftRevision, "a".repeat(64));
  await ui.respond();
  assert.equal(form.description.defaultValue, "");
  assert.equal(form.savebar.getAttribute("data-dirty"), "false");
  assert.equal(form.save.disabled, true);
  form.description.value = "Another draft"; form.reset();
  assert.equal(form.description.value, "");
});

// A refusal and an answer we cannot read are different facts, and the operator
// acts on them differently: one is "it did not save", the other is "it may have
// saved, check before retrying". Both keep every edit and stay dirty.
test("conflicts and unknown successful responses never acknowledge unsaved text", async () => {
  const cases = [
    [409, { kind: "listing_draft_conflict", message: "Reload before saving" }, "error"],
    [200, {}, "uncertain"],
  ];
  for (const [status, payload, state] of cases) {
    const ui = harness(); const { form } = ui;
    form.title.value = "Unsaved operator text";
    ui.submit(); await ui.respond(status, payload);
    assert.equal(form.title.value, "Unsaved operator text");
    assert.equal(form.title.defaultValue, "Original title");
    assert.equal(form.revision.value, "a".repeat(64));
    assert.equal(form.savebar.getAttribute("data-dirty"), "true");
    assert.equal(form.status.getAttribute("data-state"), state);
    assert.notEqual(form.status.getAttribute("data-state"), "saved");
  }
});

test("listing acknowledgements require the submitted identity and an explicit draft-only result", async (t) => {
  const cases = [
    ["another listing", { listing_id: "MS-CRAWL-0165" }],
    ["missing listing identity", { listing_id: undefined }],
    ["missing draft-only result", { draft_only: undefined }],
    ["non-draft result", { draft_only: false }],
    ["string draft-only result", { draft_only: "true" }],
  ];
  for (const [name, override] of cases) {
    await t.test(name, async () => {
      const ui = harness(); const { form } = ui;
      const initialState = form.getAttribute("data-editor-initial-state");
      form.title.value = "Submitted title";
      form.checkbox.checked = true;
      ui.submit();
      assert.equal(ui.requests[0].listingId, "MS-CRAWL-0106");
      form.title.value = "Newer unsaved title";
      form.select.options[0].selected = false; form.select.options[1].selected = true;
      await ui.respond(201, { kind: "listing_draft_saved", draft_revision: "b".repeat(64), listing_id: "MS-CRAWL-0106", draft_only: true, ...override });
      assert.equal(form.title.value, "Newer unsaved title");
      assert.equal(form.title.defaultValue, "Original title");
      assert.equal(form.checkbox.checked, true);
      assert.equal(form.checkbox.defaultChecked, false);
      assert.equal(form.select.value, "new");
      assert.equal(form.select.options[0].defaultSelected, true);
      assert.equal(form.revision.value, "a".repeat(64));
      assert.equal(form.revision.defaultValue, "a".repeat(64));
      assert.equal(form.getAttribute("data-editor-initial-state"), initialState);
      assert.equal(form.savebar.getAttribute("data-dirty"), "true");
      assert.equal(form.status.getAttribute("data-state"), "uncertain");
      assert.match(form.status.textContent, /save could not be confirmed/);
      assert.equal(form.hasAttribute("aria-busy"), false);
      assert.equal(form.save.disabled, false);
      assert.equal(form.resetButton.disabled, false);
    });
  }
});

test("listing acknowledgement identity is bound to the submitted request, not a changed form field", async () => {
  const ui = harness(); const { form } = ui;
  form.title.value = "Unsaved title";
  ui.submit();
  form.listingId.value = "MS-CRAWL-0165";
  await ui.respond(200, { kind: "listing_draft_saved", draft_revision: "b".repeat(64), listing_id: "MS-CRAWL-0165", draft_only: true });
  assert.equal(form.title.defaultValue, "Original title");
  assert.equal(form.revision.value, "a".repeat(64));
  // The answer names a listing this request never submitted, so it proves
  // nothing about this draft: unconfirmed, edits kept, still dirty.
  assert.equal(form.status.getAttribute("data-state"), "uncertain");
  assert.equal(form.savebar.getAttribute("data-dirty"), "true");
});

// A version number is not a good enough reason to lose an afternoon's typing.
// The refusal has to say which fields moved and offer one deliberate way on.
test("a conflict names the fields that moved and advances the version only on purpose", async () => {
  const ui = harness(); const { form } = ui;
  form.title.value = "My unsaved title";
  ui.submit();
  await ui.respond(409, {
    kind: "listing_draft_conflict",
    message: "Reload before saving",
    draft_revision: "c".repeat(64),
    conflicting_fields: [{ field: "title", current_value: "Someone else edited this" }],
  });
  // Every edit is still here and the form is still dirty: nothing was discarded
  // to make room for the refusal.
  assert.equal(form.title.value, "My unsaved title");
  assert.equal(form.savebar.getAttribute("data-dirty"), "true");
  assert.equal(form.status.getAttribute("data-state"), "error");
  // Crucially the version is NOT advanced by the refusal itself. Doing that
  // silently would overwrite a colleague's work on the operator's behalf.
  assert.equal(form.revision.value, "a".repeat(64));
});

test("the client carries the conflict payload rather than reducing it to a sentence", () => {
  // The refusal is the only place the fresh version and the changed fields
  // exist, so it has to survive the throw.
  assert.match(ADMIN_APP_JS, /refusal\.conflict = payload/);
  assert.match(ADMIN_APP_JS, /function showEditorConflict\(form, payload\)/);
  assert.match(ADMIN_APP_JS, /conflicting_fields/);
  // Advancing the version is bound to the button, never to the response.
  assert.match(ADMIN_APP_JS, /accept\.onclick = function \(\) \{[\s\S]*?revision\.value = revision\.defaultValue = fresh;/);
});
