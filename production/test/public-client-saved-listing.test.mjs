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
