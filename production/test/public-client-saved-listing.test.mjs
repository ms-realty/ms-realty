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

function bootClient({ failStorage = false, includeMain = false, mainKind = null } = {}) {
  const handlers = {};
  const stored = new Map();
  const toasts = [];
  const fetchCalls = [];
  const button = element({
    "data-client-save-listing": "MS-00815",
    "data-save-label": "Save",
    "data-saved-label": "Saved",
  });
  button.label = element();
  const main = element({ id: "main", ...(mainKind ? { "data-kind": mainKind } : {}) });
  const script = { getAttribute: (name) => (name === "data-request-failed" ? "Could not save" : "") };
  const document = {
    currentScript: script,
    documentElement: { lang: "en", classList: { toggle() {} } },
    head: { appendChild() {} },
    body: { appendChild: (node) => toasts.push(node) },
    querySelector(selector) {
      if (selector === "main[data-kind]") return mainKind ? main : null;
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
    location: { href: "https://example.test/en/search?q=Sandanski&type=apartment&min_price=100000&visitor_id=ignored", origin: "https://example.test", pathname: "/en/search", search: "?q=Sandanski&type=apartment&min_price=100000&visitor_id=ignored" },
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
    (url, options) => {
      fetchCalls.push({ url, options });
      return Promise.resolve();
    },
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
    fetchCalls,
  };
}

test("saved-listing UI changes only after local storage read-back succeeds", () => {
  const persisted = bootClient();
  assert.equal(persisted.click(), true);
  assert.equal(persisted.stored.get("ms-realty:saved-listings"), '["MS-00815"]');
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

test("public client records privacy-safe page, search, and CTA events without a visitor identifier", () => {
  const client = bootClient({ mainKind: "search" });
  assert.equal(client.fetchCalls.length, 2);
  const initial = client.fetchCalls.map((call) => JSON.parse(call.options.body));
  assert.deepEqual(initial.map((event) => event.type), ["page_view", "search"]);
  assert.equal(initial[1].query, "Sandanski");
  assert.deepEqual(initial[1].filters, { property_type: "apartment", price_min: "100000" });
  assert.equal(JSON.stringify(initial).includes("visitor"), false);

  const action = element({ "data-card-action": "detail", "data-listing-reference": "MS-00815" });
  action.closest = (selector) => selector.includes("[data-card-action]") ? action : null;
  client.click(action);
  const click = JSON.parse(client.fetchCalls[2].options.body);
  assert.equal(click.type, "cta_click");
  assert.equal(click.action, "detail");
  assert.equal(click.listingReference, "MS-00815");

  const utility = element({ "data-card-action": "save", "data-listing-reference": "MS-00815" });
  utility.closest = (selector) => selector.includes("[data-card-action]") ? utility : null;
  client.click(utility);
  assert.equal(client.fetchCalls.length, 3);
});
