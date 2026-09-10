import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHttpApp, dispatchHttp } from "../lib/http.mjs";
import { ADMIN_PAGE_SURFACES } from "../lib/owner-operator-catalog.mjs";
import { ADMIN_ROLES, canAdminAccess } from "../lib/admin-auth.mjs";
import { renderAdminActivityPayload } from "../lib/admin-payloads.mjs";
import { loadLocaleRegistry } from "../lib/locales.mjs";
import { renderReactAdminBody } from "../lib/react-admin-site.mjs";

// The rail is the same on every screen: eight primary destinations at one
// depth, then one "Advanced" disclosure holding the owner's setup and operating
// screens. Pipeline and Requests are not in the rail; the Leads screen links to
// them. This renders each admin surface and checks the rail rather than
// trusting that one screen's markup stands for the rest.

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const AUTH = { authorization: "Bearer local-admin-smoke" };
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "ms-realty-nav-reach-"));
const copy = (name) => {
  const target = path.join(dataDir, name);
  fs.copyFileSync(path.join(ROOT, "production/data", name), target);
  return target;
};

function app() {
  return createHttpApp({
    reviewedAt: "2026-07-19T12:00:00.000Z",
    leadLedgerPath: copy("lead-ledger.jsonl"),
    eventLedgerPath: copy("events.jsonl"),
    leadContactVaultPath: path.join(dataDir, "lead-contacts.jsonl"),
    leadContactKey: "test-only-admin-nav-reach-key-32-chars",
  });
}

// These two stand up Payload on Postgres, which this suite does not run. They
// are named rather than caught, so a surface that starts failing for some other
// reason still shows up as a failure.
const NEEDS_PAYLOAD_RUNTIME = new Set(["/admin", "/admin/team"]);

const railOf = (body) => {
  const from = body.indexOf('class="crm-sb__nav"');
  const to = body.indexOf('class="crm-sb__me"');
  return from === -1 || to === -1 ? "" : body.slice(from, to);
};
const routesIn = (rail) => [...rail.matchAll(/data-admin-nav-route="([^"]+)"/g)].map((m) => m[1]);
const primaryIn = (rail) => [...rail.matchAll(/data-admin-nav-route="([^"]+)" data-admin-nav-primary="true"/g)].map((m) => m[1]);

const PRIMARY_RAIL = ["today", "lead_inbox", "viewings", "contacts", "listing_manager", "realty_cases", "approved_content", "settings"];
const LINKED_FROM_LEADS = ["lead_pipeline", "requests"];

test("every role can navigate to its permitted work in all workspace languages on desktop and mobile", () => {
  const registry = loadLocaleRegistry();
  for (const role of ADMIN_ROLES) {
    const principal = { id: `${role}_operator`, roles: [role], source: "credential_registry" };
    const expected = ADMIN_PAGE_SURFACES.filter((surface) =>
      canAdminAccess(principal, surface.capability) &&
      !LINKED_FROM_LEADS.includes(surface.id) &&
      (surface.id !== "approved_content" || canAdminAccess(principal, "content:write")),
    ).map((surface) => surface.id).sort();
    for (const locale of ["bg", "ru", "en"]) {
      const body = renderReactAdminBody(renderAdminActivityPayload(registry, locale, [], principal));
      for (const navClass of ["crm-sb__nav", "adm-mobile-nav__links"]) {
        const nav = body.match(new RegExp(`<nav class="${navClass}"[\\s\\S]*?</nav>`))?.[0];
        assert.ok(nav, `${role}/${locale}: ${navClass} exists`);
        assert.deepEqual(routesIn(nav).sort(), expected, `${role}/${locale}: ${navClass} includes all permitted routes and no others`);
        assert.equal((nav.match(/aria-current="page"/g) || []).length, 1, `${role}/${locale}: current Activity link stays reachable`);
        assert.match(nav, /<details[^>]*data-admin-nav-group="advanced"[^>]* open/, `${role}/${locale}: current group opens`);
      }
    }
  }
});

test("every admin surface renders the same rail: eight primary destinations, then Advanced", async () => {
  const server = app();
  const surfaces = ADMIN_PAGE_SURFACES.filter((s) => !NEEDS_PAYLOAD_RUNTIME.has(s.path));
  let reference = null;
  const reached = [];

  for (const surface of surfaces) {
    // A surface that needs a runtime this test does not stand up (Payload on
    // Postgres, for one) is skipped explicitly rather than counted as passing.
    let res;
    try {
      res = await dispatchHttp(server, { url: `${surface.path}?locale=en`, headers: AUTH });
    } catch {
      continue;
    }
    if (res.status !== 200) continue;
    const rail = railOf(res.body);
    assert.ok(rail, `${surface.path} renders the navigation rail`);

    const routes = routesIn(rail);
    if (reference === null) reference = routes;
    assert.deepEqual(routes, reference, `${surface.path} offers the same destinations, in the same order`);
    assert.deepEqual(primaryIn(rail), PRIMARY_RAIL, `${surface.path} leads with the eight primary destinations`);
    // One disclosure, the owner's Advanced group; nothing a broker works from
    // sits inside it.
    assert.equal((rail.match(/<details/g) || []).length, 1, `${surface.path} carries exactly one disclosure`);
    assert.match(rail, /<details class="crm-sb__group-wrap crm-sb__advanced" data-admin-nav-group="advanced" data-admin-nav-disclosure="true"/);
    reached.push(surface.path);
  }

  assert.ok(reached.length >= 15, `at least fifteen surfaces were checked, got ${reached.length}`);
  // The administrator reaches every catalogued route from the rail, except the
  // two the Leads screen links to.
  const catalogued = ADMIN_PAGE_SURFACES.map((s) => s.id).filter((id) => !LINKED_FROM_LEADS.includes(id));
  assert.deepEqual([...reference].sort(), [...catalogued].sort(), "primary plus Advanced covers the catalogue");

  const leads = await dispatchHttp(server, { url: "/admin/leads?locale=en", headers: AUTH });
  assert.equal(leads.status, 200);
  assert.match(leads.body, /href="\/admin\/pipeline" data-lead-screen-link="pipeline"/);
  assert.match(leads.body, /href="\/admin\/requests" data-lead-screen-link="requests"/);
});

test("the Advanced disclosure opens on the screen that lives inside it and stays closed elsewhere", async () => {
  const server = app();
  const today = await dispatchHttp(server, { url: "/admin/today?locale=en", headers: AUTH });
  assert.doesNotMatch(railOf(today.body), /<details[^>]* open/);
  const hermes = await dispatchHttp(server, { url: "/admin/hermes?locale=en", headers: AUTH });
  assert.match(railOf(hermes.body), /<details class="crm-sb__group-wrap crm-sb__advanced"[^>]* open/);
});

test("the Leads destination stays lit on Pipeline and Requests", async () => {
  const server = app();
  for (const path of ["/admin/pipeline", "/admin/requests"]) {
    const res = await dispatchHttp(server, { url: `${path}?locale=en`, headers: AUTH });
    assert.equal(res.status, 200, path);
    assert.match(railOf(res.body), /class="crm-nav crm-nav--on" href="\/admin\/leads" aria-current="page" data-admin-nav-route="lead_inbox"/, path);
  }
});

test("no destination is labelled with its own id", async () => {
  // A destination the copy dictionary does not know falls through to
  // screenLabel, which returns the id. That is how "locale_rollout" reached
  // the rail in three languages.
  const server = app();
  for (const locale of ["en", "bg", "ru"]) {
    const res = await dispatchHttp(server, { url: `/admin/today?locale=${locale}`, headers: AUTH });
    assert.equal(res.status, 200);
    const rail = railOf(res.body);
    const labelled = [...rail.matchAll(/data-admin-nav-route="([^"]+)"[\s\S]*?<span>([^<]*)<\/span>/g)];
    assert.ok(labelled.length >= 15, `${locale} rail renders its destinations`);
    for (const [, id, text] of labelled) {
      assert.notEqual(text, id, `${locale}: ${id} shows its id instead of a name`);
      assert.doesNotMatch(text, /^[a-z][a-z0-9_]*$/, `${locale}: ${id} shows "${text}", which reads like an identifier`);
    }
  }
});

test("the rail marks exactly one destination as current on each surface", async () => {
  const server = app();
  for (const surface of ADMIN_PAGE_SURFACES.filter((s) => !NEEDS_PAYLOAD_RUNTIME.has(s.path))) {
    let res;
    try {
      res = await dispatchHttp(server, { url: `${surface.path}?locale=en`, headers: AUTH });
    } catch {
      continue;
    }
    if (res.status !== 200) continue;
    const rail = railOf(res.body);
    const current = (rail.match(/aria-current="page"/g) || []).length;
    assert.equal(current, 1, `${surface.path} marks one current destination, found ${current}`);
  }
});
