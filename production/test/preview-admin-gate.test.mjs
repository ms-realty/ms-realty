import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { previewAdminGate } from "../../workers/preview-admin-gate.mjs";

const KEY = "a-long-preview-admin-key-0123456789";
const HOST = "https://ms-realty.ms-realty-bg.workers.dev";

// The gate is handed the refusal the Worker already uses for anything private,
// so a stranger cannot tell the admin apart from a path that does not exist.
const refuse = () => new Response("Not found", { status: 404, headers: { "cache-control": "no-store" } });

function request(headers = {}) {
  return new Request(`${HOST}/admin`, { headers });
}

test("with no key configured the preview admin stays hidden exactly as before", async () => {
  const refusal = await previewAdminGate(request(), {}, new URL(`${HOST}/admin`), refuse);
  assert.equal(refusal?.status, 404);
  // A default key would be a backdoor shipped to every deployment, so the
  // source must not carry one.
  const source = fs.readFileSync(new URL("../../workers/preview-admin-gate.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(source, /MS_REALTY_PREVIEW_ADMIN_KEY[^\n]*\|\|\s*"[^"]+"/);
});

test("a wrong key is refused with the same answer a stranger gets", async () => {
  const refusal = await previewAdminGate(request(), { MS_REALTY_PREVIEW_ADMIN_KEY: KEY }, new URL(`${HOST}/admin?admin_key=wrong`), refuse);
  assert.equal(refusal?.status, 404);
  assert.equal(refusal.headers.get("set-cookie"), null);
});

test("the right key sets a cookie and redirects to the clean URL", async () => {
  const response = await previewAdminGate(
    request(),
    { MS_REALTY_PREVIEW_ADMIN_KEY: KEY },
    new URL(`${HOST}/admin?admin_key=${KEY}`),
    refuse,
  );
  assert.equal(response?.status, 303);
  // The key must not survive in the address bar, where it would leak through
  // history, a screenshot or a referrer.
  assert.equal(response.headers.get("location"), "/admin");
  const cookie = response.headers.get("set-cookie");
  assert.match(cookie, /^ms_preview_admin=/);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /Secure/);
  assert.match(cookie, /SameSite=Lax/);
  assert.equal(response.headers.get("cache-control"), "no-store");
});

test("a carried cookie lets the request through to the admin's own sign-in", async () => {
  const passed = await previewAdminGate(
    request({ cookie: `ms_preview_admin=${encodeURIComponent(KEY)}` }),
    { MS_REALTY_PREVIEW_ADMIN_KEY: KEY },
    new URL(`${HOST}/admin`),
    refuse,
  );
  // null means "no refusal": the gate steps aside and the workbench's own
  // authentication decides, which is the only thing that actually protects it.
  assert.equal(passed, null);

  const wrongCookie = await previewAdminGate(
    request({ cookie: "ms_preview_admin=not-the-key" }),
    { MS_REALTY_PREVIEW_ADMIN_KEY: KEY },
    new URL(`${HOST}/admin`),
    refuse,
  );
  assert.equal(wrongCookie?.status, 404);
});
