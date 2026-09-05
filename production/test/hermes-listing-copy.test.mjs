import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHttpApp, dispatchHttp } from "../lib/http.mjs";
import { readAuditLog } from "../lib/audit-log.mjs";
import { ADMIN_APP_JS } from "../lib/ui/client.mjs";

// Hermes could draft a translation and a reply. It could not draft the listing's
// own words, which is the value a broker rewrites most often. The affordance is
// the same on every field it appears on; the boundary is that nothing it writes
// reaches the public site without a person accepting it.

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const AUTH = { authorization: "Bearer local-admin-smoke", "content-type": "application/json" };
const LISTING = "MS-CRAWL-0001";

function harness({ provider } = {}) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "ms-realty-listing-copy-"));
  const copy = (name) => {
    const target = path.join(dataDir, name);
    fs.copyFileSync(path.join(ROOT, "production/data", name), target);
    return target;
  };
  const auditLogPath = path.join(dataDir, "audit.jsonl");
  return {
    auditLogPath,
    app: createHttpApp({
      leadLedgerPath: copy("lead-ledger.jsonl"),
      eventLedgerPath: copy("events.jsonl"),
      auditLogPath,
      leadContactVaultPath: path.join(dataDir, "lead-contacts.jsonl"),
      leadContactKey: "test-only-listing-copy-key-32-chars-x",
      hermesListingCopyProvider: provider,
    }),
  };
}

const draft = (app, body) =>
  dispatchHttp(app, { method: "POST", url: "/api/admin/listings/copy/draft", headers: AUTH, body: JSON.stringify(body) });

const body = (res) => (typeof res.body === "string" ? JSON.parse(res.body) : res.body);

test("a description is drafted from the listing's own approved facts", async () => {
  let seen = null;
  const { app, auditLogPath } = harness({
    provider: async (prompt) => {
      seen = prompt;
      return { text: `Имот в ${prompt.propertyFacts.location}, референция ${prompt.propertyFacts.reference}. Свържете се с брокер за оглед.`, citations: [{ source: "listing_facts" }] };
    },
  });

  const res = await draft(app, { listingId: LISTING, field: "description", locale: "bg" });
  assert.equal(res.status, 201);
  const payload = body(res);

  assert.equal(payload.status, "hermes_drafted");
  assert.equal(payload.listing_id, LISTING);
  // The whole point of the boundary: what comes back is a draft, and says so.
  assert.equal(payload.can_publish, false);
  assert.equal(payload.human_approval_required, true);
  assert.equal(payload.public_indexable, false);

  // The prompt was built from the catalogue, not from free text the caller sent.
  assert.equal(seen.role, "listing_copy_draft");
  assert.equal(seen.capabilities.can_publish, false);
  assert.equal(seen.capabilities.can_change_price, false);
  assert.equal(seen.listingReference, LISTING);
  assert.ok(Object.keys(seen.propertyFacts).length);

  // The reviewer is told which facts it leaned on and which of those nobody has
  // confirmed, because that is the part they have to check.
  assert.ok(payload.facts_used.includes("reference"));
  assert.ok(Array.isArray(payload.unverified_facts_used));

  const audit = readAuditLog(auditLogPath).filter((row) => row.action === "hermes_model_call");
  assert.equal(audit.length, 1);
  assert.equal(audit[0].metadata.can_publish, false);
  assert.equal(audit[0].metadata.field, "description");
});

test("a draft that states a figure the catalogue never approved is refused", async () => {
  const { app, auditLogPath } = harness({
    provider: async () => ({ text: "Имот в Сандански, построен през 1998 година, с изглед към планината и голяма тераса.", citations: [{ source: "listing_facts" }] }),
  });

  const res = await draft(app, { listingId: LISTING, field: "description", locale: "bg" });
  assert.equal(res.status, 400);
  assert.match(body(res).message, /unapproved figure: 1998/);

  // A refusal is recorded too, so a provider inventing facts is visible.
  const audit = readAuditLog(auditLogPath).filter((row) => row.action === "hermes_model_call");
  assert.equal(audit.length, 1);
  assert.equal(audit[0].status, "rejected");
});

test("the endpoint refuses a field that is not listing copy", async () => {
  const { app } = harness({ provider: async () => ({ text: "unused" }) });
  for (const field of ["publish", "price_eur", ""]) {
    const res = await draft(app, { listingId: LISTING, field });
    assert.equal(res.status, 400, field);
    assert.match(body(res).message, /field must be one of/);
  }
});

test("the same control appears on every field it can draft", async () => {
  const { app } = harness({ provider: async () => ({ text: "unused" }) });
  const page = await dispatchHttp(app, { url: `/admin/listings/edit?listingId=${LISTING}&locale=en`, headers: { authorization: AUTH.authorization } });
  assert.equal(page.status, 200);

  const buttons = [...page.body.matchAll(/<button[^>]*data-hermes-assist="true"[^>]*>/g)].map((match) => match[0]);
  const fields = buttons.map((button) => button.match(/data-hermes-assist-field="([^"]+)"/)[1]);

  // Not a count: the editor draws one control per assisted value, and the
  // number of media assets on a listing is not this contract's business. What
  // is: the three listing-copy values are all offered, and nothing is offered
  // that the endpoint would refuse.
  for (const field of ["description", "seo_title", "meta_description"]) {
    assert.ok(fields.includes(field), `${field} offers a draft`);
  }
  assert.deepEqual(
    [...new Set(fields)].sort(),
    ["alt_text", "description", "meta_description", "seo_title"],
    "every control names a field the copy endpoint accepts",
  );

  // Identical affordance: one endpoint, one listing, one locale, the same
  // status strings. What differs is the field and the box it fills.
  for (const button of buttons) {
    assert.match(button, /data-hermes-assist-endpoint="\/api\/admin\/listings\/copy\/draft"/);
    assert.match(button, new RegExp(`data-hermes-assist-listing="${LISTING}"`));
    assert.match(button, /data-hermes-assist-pending="/);
    assert.match(button, /data-hermes-assist-unavailable="/);
    assert.match(button, /type="button"/);
  }

  // Each assisted field labels its own input, and the draft button sits beside
  // the label rather than inside it — a button inside a label would activate
  // the field it is meant to fill.
  for (const field of ["description", "seo_title", "seo_description"]) {
    assert.match(page.body, new RegExp(`<label for="editor-${field}"`));
    assert.match(page.body, new RegExp(`id="editor-${field}"`));
    assert.match(page.body, new RegExp(`data-hermes-assist-for="${field}"`));
  }
  assert.doesNotMatch(page.body, /<label[^>]*>(?:(?!<\/label>)[\s\S])*data-hermes-assist="true"/);

  // Every assisted field carries a bar that names the source and the boundary,
  // hidden until a draft actually arrives.
  // One bar per control, so no assisted value can fill a box without saying
  // where the words came from.
  assert.equal(
    (page.body.match(/data-hermes-drafted-bar="/g) || []).length,
    (page.body.match(/data-hermes-assist="true"/g) || []).length,
  );
  assert.match(page.body, /Nothing is published until you approve it/);
});

test("the browser refuses a draft response that claims it may publish", () => {
  assert.match(ADMIN_APP_JS, /data-hermes-assist/);
  assert.match(ADMIN_APP_JS, /draft\.can_publish === true \|\| draft\.can_send_without_approval === true/);
  // And a field that carries a machine-written value is marked, so the styling
  // rule can sit beside the bare-field rule rather than lose to it.
  assert.match(ADMIN_APP_JS, /setAttribute\("data-hermes-drafted", "true"\)/);
  const css = fs.readFileSync(path.join(ROOT, "public/vendor/ms-realty-admin.css"), "utf8");
  assert.match(css, /textarea\[data-hermes-drafted="true"\]/);
});

// The point of item 3 is that the affordance does not vary. These check the
// two values outside the listing editor that now carry the same control.
test("the media alt text a publication is blocked on carries the same control", async () => {
  const { app } = harness({ provider: async () => ({ text: "unused" }) });
  const page = await dispatchHttp(app, { url: `/admin/listings/edit?listingId=${LISTING}&locale=en`, headers: { authorization: AUTH.authorization } });
  assert.equal(page.status, 200);

  const alt = [...page.body.matchAll(/<button[^>]*data-hermes-assist="true"[^>]*data-hermes-assist-field="alt_text"[^>]*>/g)];
  assert.ok(alt.length >= 1, "every reviewable asset offers a draft for its alt text");
  for (const [button] of alt) {
    assert.match(button, /data-hermes-assist-endpoint="\/api\/admin\/listings\/copy\/draft"/);
    assert.match(button, /data-hermes-assist-pending="/);
  }
  // It fills the box the reviewer is looking at, and that box is labelled.
  assert.match(page.body, /<label for="media-alt-[^"]+">/);
  assert.match(page.body, /<textarea id="media-alt-[^"]+" name="alt"/);
});

test("the lead reply uses the shared control, not a form of its own", async () => {
  const { app } = harness({ provider: async () => ({ text: "unused" }) });
  const page = await dispatchHttp(app, { url: "/admin/leads?locale=en", headers: { authorization: AUTH.authorization } });
  assert.equal(page.status, 200);

  const buttons = [...page.body.matchAll(/<button[^>]*data-hermes-assist="true"[^>]*data-hermes-assist-field="reply"[^>]*>/g)].map((m) => m[0]);
  assert.ok(buttons.length >= 1);
  for (const button of buttons) {
    assert.match(button, /data-hermes-assist-endpoint="\/api\/admin\/replies\/draft"/);
    // A reply needs a different body than listing copy; the button carries it
    // rather than the behaviour growing a second branch.
    assert.match(button, /data-hermes-assist-payload="[^"]*leadId/);
    // The draft lands in a disclosure, so the control opens it: filling a box
    // nobody can see is the same as not filling it.
    assert.match(button, /data-hermes-assist-reveal="reply-approval-/);
  }

  // The bespoke draft form the composer used to carry is gone from this screen.
  assert.doesNotMatch(page.body, /data-hermes-draft-request/);
  assert.match(page.body, /<textarea id="reply-draft-[^"]+" name="hermesDraftText"/);
});

test("the browser refuses a reply draft that says it can be sent without approval", () => {
  // Listing copy says human_approval_required, a reply says
  // broker_approval_required, and neither may claim it can go out.
  assert.match(ADMIN_APP_JS, /draft\.human_approval_required === true \|\| draft\.broker_approval_required === true/);
  assert.match(ADMIN_APP_JS, /draft\.can_publish === true \|\| draft\.can_send_without_approval === true/);
});
