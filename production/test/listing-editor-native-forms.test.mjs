// The listing editor has to work with scripting off. Its forms are real forms,
// so their native POST cannot be answered with a JSON body: that renders as raw
// data in the browser, and a refused save would leave the broker staring at a
// message with no way back to what they typed.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { appAdminConfigFromEnv, renderAppAdminResponse } from "../lib/app-admin-adapter.mjs";
import { createHttpApp, dispatchHttp } from "../lib/http.mjs";
import { listingEditorReturnPath } from "../lib/admin-payloads.mjs";
import { payloadAdminPrincipal } from "../lib/payload-admin-auth.mjs";
import { loadCmsSeed } from "../lib/runtime.mjs";
import { createPayloadDraftRuntime } from "./payload-draft-runtime.fixture.mjs";

const SESSION = "payload.native.session";
const EDITOR = { id: 3, collection: "admins", email: "owner@example.com", role: "admin", workspace_ids: [] };
const ORIGIN = "https://ms-realty.example";
// What a browser sends for a top-level form submission.
const BROWSER_ACCEPT = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8";

function payloadAdminAuth() {
  return {
    async resolve(token) {
      return token === SESSION ? { user: EDITOR, principal: payloadAdminPrincipal(EDITOR) } : null;
    },
  };
}

function scratch(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "msr-native-forms-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return path.join(directory, "media-reviews.jsonl");
}

function runtimes(t) {
  return [
    [
      "standalone",
      () => {
        const store = createPayloadDraftRuntime(loadCmsSeed());
        const app = createHttpApp({
          reviewedAt: "2026-09-16T09:00:00.000Z",
          payloadListingRuntime: store.payload,
          payloadAdminAuth: payloadAdminAuth(),
          mediaReviewLedgerPath: scratch(t),
        });
        return async (method, url, body, accept = BROWSER_ACCEPT) => {
          const response = await dispatchHttp(app, {
            method,
            url,
            body,
            headers: {
              cookie: `ms_admin=${SESSION}`,
              host: "ms-realty.example",
              accept,
              ...(body ? { "content-type": "application/x-www-form-urlencoded", "sec-fetch-site": "same-origin" } : {}),
            },
          });
          return {
            status: response.status,
            location: response.headers?.location || "",
            text: typeof response.body === "string" ? response.body : JSON.stringify(response.body),
          };
        };
      },
    ],
    [
      "next-adapter",
      () => {
        const store = createPayloadDraftRuntime(loadCmsSeed());
        const config = {
          ...appAdminConfigFromEnv({ NODE_ENV: "test", MS_REALTY_PUBLIC_ORIGIN: ORIGIN }),
          reviewedAt: "2026-09-16T09:00:00.000Z",
          payloadListingRuntime: store.payload,
          payloadAdminAuth: payloadAdminAuth(),
          mediaReviewLedgerPath: scratch(t),
        };
        return async (method, url, body, accept = BROWSER_ACCEPT) => {
          const response = await renderAppAdminResponse(
            new Request(`${ORIGIN}${url}`, {
              method,
              body,
              headers: {
                cookie: `ms_admin=${SESSION}`,
                accept,
                ...(body ? { "content-type": "application/x-www-form-urlencoded", "sec-fetch-site": "same-origin" } : {}),
              },
            }),
            { config },
          );
          return { status: response.status, location: response.headers.get("location") || "", text: await response.text() };
        };
      },
    ],
  ];
}

const form = (fields) => new URLSearchParams(fields).toString();
const revisionOf = (html) => (html.match(/name="draftRevision"[^>]*value="([^"]*)"/) || ["", ""])[1];
const pathOf = (location) => location.split("#")[0];

test("a script-free save lands back in the editor with the saved value and says so", async (t) => {
  for (const [runtime, open] of runtimes(t)) {
    const send = open();
    const page = await send("GET", "/admin/listings/edit?listingId=MS-00815&locale=bg&tab=seo");
    assert.equal(page.status, 200, runtime);
    // The form works without scripting: its submit is live and it says where
    // it wants to come back to.
    assert.doesNotMatch(page.text.match(/<form id="listing-facts"[\s\S]*?<\/form>/)[0], /<button type="submit"[^>]*disabled/, runtime);
    assert.match(page.text, /name="returnTab" value="seo"/, runtime);
    assert.match(page.text, /name="returnLocale" value="bg"/, runtime);

    const saved = await send(
      "POST",
      "/api/admin/listings/edit",
      form({ listingId: "MS-00815", draftRevision: revisionOf(page.text), title: "Запазено без скриптове", returnTab: "seo", returnLocale: "bg" }),
    );
    assert.equal(saved.status, 303, `${runtime}: ${saved.text.slice(0, 120)}`);
    assert.equal(pathOf(saved.location), "/admin/listings/edit?listingId=MS-00815&tab=seo&locale=bg&editor=saved", runtime);
    const landed = await send("GET", pathOf(saved.location));
    assert.equal(landed.status, 200, runtime);
    assert.ok(landed.text.includes("Запазено без скриптове"), `${runtime}: the saved draft is what the editor shows`);
    assert.match(landed.text, /data-admin-mutation-status="true" data-state="success"/, runtime);
    assert.match(landed.text, /data-editor-savebar="true" data-dirty="false" data-save-state="saved"/, runtime);
  }
});

test("a refused script-free save keeps what was typed and never advances the version", async (t) => {
  for (const [runtime, open] of runtimes(t)) {
    const send = open();
    const page = await send("GET", "/admin/listings/edit?listingId=MS-00815&locale=en");
    const opened = revisionOf(page.text);
    assert.match(opened, /^[a-f0-9]{64}$/, runtime);
    // Somebody else saves first from the same starting point.
    const first = await send("POST", "/api/admin/listings/edit", form({ listingId: "MS-00815", draftRevision: opened, title: "Somebody else", returnTab: "facts", returnLocale: "en" }));
    assert.equal(first.status, 303, runtime);

    const refused = await send("POST", "/api/admin/listings/edit", form({ listingId: "MS-00815", draftRevision: opened, title: "My unsaved words", returnTab: "facts", returnLocale: "en" }));
    assert.equal(refused.status, 409, runtime);
    // A page, not a JSON body.
    assert.match(refused.text, /<form id="listing-facts"/, runtime);
    assert.doesNotMatch(refused.text.trimStart(), /^\{/, runtime);
    // The typed value is on the page, and the version is the one it was typed
    // against: resubmitting conflicts again rather than overwriting the other
    // save.
    assert.ok(refused.text.includes("My unsaved words"), runtime);
    assert.equal(revisionOf(refused.text), opened, runtime);
    // The operator is told which field moved, and the form stays dirty until a
    // save succeeds.
    assert.match(refused.text, /data-editor-conflict="true"(?![^>]*\shidden)/, runtime);
    assert.match(refused.text, /adm-editor-conflict__fields[^>]*>[\s\S]*?<strong>title<\/strong>/, runtime);
    assert.match(refused.text, /data-editor-unsaved-submission="true"/, runtime);
    assert.match(refused.text, /data-editor-discard-href="\/admin\/listings\/edit\?listingId=MS-00815&amp;tab=facts"/, runtime);
    assert.match(refused.text, /data-save-state="conflict"/, runtime);

    const again = await send("POST", "/api/admin/listings/edit", form({ listingId: "MS-00815", draftRevision: revisionOf(refused.text), title: "My unsaved words", returnTab: "facts", returnLocale: "en" }));
    assert.equal(again.status, 409, `${runtime}: the carried-back page cannot overwrite the other save`);
    const reopened = await send("GET", "/admin/listings/edit?listingId=MS-00815&locale=en");
    assert.ok(reopened.text.includes("Somebody else"), runtime);
    assert.equal(reopened.text.includes("My unsaved words"), false, runtime);
  }
});

test("a carried-back submission cannot smuggle a publication decision", async (t) => {
  for (const [runtime, open] of runtimes(t)) {
    const send = open();
    const refused = await send(
      "POST",
      "/api/admin/listings/edit",
      form({ listingId: "MS-00815", draftRevision: "0".repeat(64), title: "Anything", publish_approved: "true", returnTab: "facts", returnLocale: "en" }),
    );
    assert.equal(refused.status >= 400, true, runtime);
    assert.doesNotMatch(refused.text, /name="publish_approved"[^>]*value="true"/, runtime);
  }
});

test("enhanced saves still get JSON", async (t) => {
  for (const [runtime, open] of runtimes(t)) {
    const send = open();
    const page = await send("GET", "/admin/listings/edit?listingId=MS-00815&locale=en");
    const response = await send(
      "POST",
      "/api/admin/listings/edit",
      form({ listingId: "MS-00815", draftRevision: revisionOf(page.text), title: "Enhanced" }),
      "application/json",
    );
    assert.equal(response.status, 201, runtime);
    assert.equal(JSON.parse(response.text).kind, "listing_draft_saved", runtime);
  }
});

test("a script-free media review comes back to the media section with its outcome", async (t) => {
  for (const [runtime, open] of runtimes(t)) {
    const send = open();
    const media = await send("GET", "/admin/listings/edit?listingId=MS-00815&locale=en&tab=media");
    // Without scripting the review forms are the visible, working editors.
    assert.doesNotMatch(media.text, /data-media-editors="true"[^>]*hidden/, runtime);
    const assetId = media.text.match(/data-media-asset="([^"]+)"/)[1];
    const reviewed = await send(
      "POST",
      "/api/admin/media/reviews",
      form({ listingId: "MS-00815", assetId, decision: "keep_private", kind: "photo", alt: "Stone terrace", reviewNote: "Checked", reviewConfirmed: "on", returnLocale: "en" }),
    );
    assert.equal(reviewed.status, 303, runtime);
    assert.equal(pathOf(reviewed.location), "/admin/listings/edit?listingId=MS-00815&tab=media&locale=en&editor=media_reviewed", runtime);
    const landed = await send("GET", pathOf(reviewed.location));
    assert.match(landed.text, /data-media-review-outcome="media_reviewed"[^>]*data-state="success"/, runtime);

    const refused = await send(
      "POST",
      "/api/admin/media/reviews",
      form({ listingId: "MS-00815", assetId: "media-00000000000000000000", decision: "keep_private", kind: "photo", reviewNote: "x", reviewConfirmed: "on" }),
    );
    assert.equal(refused.status, 303, runtime);
    const failed = await send("GET", pathOf(refused.location));
    assert.match(failed.text, /data-media-review-outcome="media_review_failed"[^>]*data-state="error"/, runtime);
  }
});

// Every part of the return address is rebuilt from known values.
test("the return address cannot be steered off the editor", () => {
  assert.equal(
    listingEditorReturnPath("MS-00815", { tab: "https://evil.example/", locale: "javascript:alert(1)", outcome: "pwned" }),
    "/admin/listings/edit?listingId=MS-00815&tab=facts",
  );
  assert.equal(
    listingEditorReturnPath("MS-00815\r\nLocation: https://evil.example", { tab: "seo", locale: "bg" }),
    "/admin/listings/edit?listingId=MS-00815%0D%0ALocation%3A+https%3A%2F%2Fevil.example&tab=seo&locale=bg",
  );
});
