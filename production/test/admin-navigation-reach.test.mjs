import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHttpApp, dispatchHttp } from "../lib/http.mjs";
import { ADMIN_PAGE_SURFACES } from "../lib/owner-operator-catalog.mjs";

// An operator should never have to go back to a hub to reach a destination.
// The rail carries every route the signed-in role may see, on every screen, at
// one depth -- so this renders each admin surface and checks the rail rather
// than trusting that one screen's markup stands for the rest.

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

test("every admin surface renders the whole rail, at one depth", async () => {
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
    assert.equal((rail.match(/<details/g) || []).length, 0, `${surface.path} hides nothing behind a disclosure`);
    reached.push(surface.path);
  }

  assert.ok(reached.length >= 15, `at least fifteen surfaces were checked, got ${reached.length}`);
  assert.ok(reference.length >= 19, `the rail carries every destination, got ${reference.length}`);
  // The ten that used to sit behind "More in ..." are among them.
  for (const id of ["lead_pipeline", "viewings", "contacts", "requests", "reports",
                    "consents", "documents", "realty_cases", "team", "activity"]) {
    assert.ok(reference.includes(id), `${id} is a first-level destination`);
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
