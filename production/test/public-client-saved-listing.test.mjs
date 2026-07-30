import assert from "node:assert/strict";
import test from "node:test";
import { PUBLIC_APP_JS } from "../lib/ui/client.mjs";

function element(attributes = {}) {
  const values = new Map(Object.entries(attributes));
  return {
    className: "",
    hidden: false,
    style: {},
    textContent: "",
    label: null,
    focusCalls: [],
    setAttribute(name, value) {
      values.set(name, String(value));
    },
    getAttribute(name) {
      return values.get(name) || null;
    },
    removeAttribute(name) {
      values.delete(name);
    },
    querySelector(selector) {
      return selector === "span" ? this.label : null;
    },
    appendChild() {},
    focus(...args) {
      this.focusCalls.push(args);
    },
    closest() {
      return null;
    },
  };
}

function bootClient({ failStorage = false, includeMain = false } = {}) {
  const handlers = {};
  const stored = new Map();
  const toasts = [];
  const button = element({
    "data-client-save-listing": "MS-CRAWL-0001",
    "data-save-label": "Save",
    "data-saved-label": "Saved",
  });
  button.label = element();
  const main = element({ id: "main" });
  const script = { getAttribute: (name) => (name === "data-request-failed" ? "Could not save" : "") };
  const document = {
    currentScript: script,
    documentElement: { classList: { toggle() {} } },
    head: { appendChild() {} },
    body: { appendChild: (node) => toasts.push(node) },
    querySelector(selector) {
      return selector === "[data-public-toast]" ? toasts[0] || null : null;
    },
    getElementById(id) {
      return includeMain && id === "main" ? main : null;
    },
    querySelectorAll(selector) {
      return selector === "[data-client-save-listing]" ? [button] : [];
    },
    createElement() {
      return element();
    },
    addEventListener(type, handler) {
      handlers[type] = handler;
    },
  };
  const window = {
    addEventListener() {},
    clearTimeout() {},
    setTimeout() {
      return 1;
    },
    requestAnimationFrame(callback) {
      callback();
    },
    matchMedia() {
      return { matches: false };
    },
    history: { length: 0, back() {} },
    location: { href: "https://example.test/he/search", origin: "https://example.test" },
  };
  const localStorage = {
    getItem(key) {
      return stored.get(key) || null;
    },
    setItem(key, value) {
      if (failStorage) throw new Error("storage disabled");
      stored.set(key, value);
    },
  };
  const execute = new Function(
    "document",
    "window",
    "localStorage",
    "sessionStorage",
    "navigator",
    "location",
    "performance",
    "FormData",
    "HTMLFormElement",
    "fetch",
    PUBLIC_APP_JS,
  );
  execute(
    document,
    window,
    localStorage,
    { getItem() { return null; }, setItem() {} },
    {},
    window.location,
    { getEntriesByType() { return []; } },
    function FormData() {},
    function HTMLFormElement() {},
    () => Promise.resolve(),
  );
  return {
    button,
    main,
    click(target) {
      let prevented = false;
      handlers.click({
        target: target || {
          matches() {
            return false;
          },
          closest(selector) {
            return selector === "[data-client-save-listing]" ? button : null;
          },
        },
        preventDefault() {
          prevented = true;
        },
      });
      return prevented;
    },
    stored,
    toasts,
  };
}

test("saved-listing UI changes only after local storage read-back succeeds", () => {
  const persisted = bootClient();
  assert.equal(persisted.click(), true);
  assert.equal(persisted.stored.get("ms-realty:saved-listings"), '["MS-CRAWL-0001"]');
  assert.equal(persisted.button.getAttribute("aria-pressed"), "true");
  assert.equal(persisted.button.label.textContent, "Saved");

  const blocked = bootClient({ failStorage: true });
  assert.equal(blocked.click(), true);
  assert.equal(blocked.stored.get("ms-realty:saved-listings"), undefined);
  assert.equal(blocked.button.getAttribute("aria-pressed"), "false");
  assert.equal(blocked.button.label.textContent, "Save");
  assert.equal(blocked.toasts[0].textContent, "Could not save");
});

test("skip link preserves hash navigation and moves keyboard focus to main", () => {
  const client = bootClient({ includeMain: true });
  const skipTarget = {
    matches() {
      return false;
    },
    closest(selector) {
      return selector === 'a[href="#main"]' ? {} : null;
    },
  };

  assert.equal(client.click(skipTarget), false);
  assert.deepEqual(client.main.focusCalls, [[{ preventScroll: true }]]);
});

test("mobile filter preview requests the localized JSON search contract", async () => {
  const formHandlers = {};
  const requests = [];
  const submit = element({
    "data-mobile-filter-base-label": "Search",
    "data-mobile-filter-matches-label": "matches",
  });
  submit.label = element();
  const status = element();
  const fetch = (url, options) => {
    requests.push({ url, options });
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ search: { total_matches: 71 } }) });
  };
  const form = {
    getAttribute(name) {
      return name === "action" ? "/he/search" : null;
    },
    addEventListener(type, handler) {
      formHandlers[type] = handler;
    },
  };
  const document = {
    currentScript: { getAttribute() { return ""; } },
    documentElement: { classList: { toggle() {} } },
    head: { appendChild() {} },
    body: { appendChild() {} },
    querySelector(selector) {
      if (selector === "[data-mobile-filter-submit]") return submit;
      if (selector === "[data-mobile-filter-preview-status]") return status;
      return null;
    },
    getElementById(id) {
      return id === "sr-mobile-filter-form" ? form : null;
    },
    querySelectorAll() {
      return [];
    },
    createElement() {
      return element();
    },
    addEventListener() {},
  };
  const window = {
    addEventListener() {},
    fetch,
    clearTimeout() {},
    setTimeout(callback) {
      callback();
      return 1;
    },
    requestAnimationFrame(callback) {
      callback();
    },
    matchMedia() {
      return { matches: false };
    },
    history: { length: 0, back() {} },
    location: { href: "https://example.test/he/search", origin: "https://example.test" },
  };
  const execute = new Function(
    "document",
    "window",
    "localStorage",
    "sessionStorage",
    "navigator",
    "location",
    "performance",
    "FormData",
    "HTMLFormElement",
    "fetch",
    PUBLIC_APP_JS,
  );
  execute(
    document,
    window,
    { getItem() { return null; }, setItem() {} },
    { getItem() { return null; }, setItem() {} },
    {},
    window.location,
    { getEntriesByType() { return []; } },
    function FormData() {
      return { forEach(callback) { callback("Sandanski", "location"); } };
    },
    function HTMLFormElement() {},
    fetch,
  );

  formHandlers.input();
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(new URL(requests[0].url).pathname, "/api/search");
  assert.equal(new URL(requests[0].url).searchParams.get("locale"), "he");
  assert.equal(new URL(requests[0].url).searchParams.get("location"), "Sandanski");
  assert.equal(requests[0].options.headers.accept, "application/json");
  assert.equal(submit.label.textContent, "Search · 71 matches");
  assert.equal(status.textContent, "71 matches");
});
