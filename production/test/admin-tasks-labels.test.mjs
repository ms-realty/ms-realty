import test from "node:test";
import assert from "node:assert/strict";
import { createHttpApp, dispatchHttp } from "../lib/http.mjs";

const auth = { authorization: "Bearer local-admin-smoke" };
const app = () => createHttpApp({ adminToken: "local-admin-smoke" });

// PRODUCT.md: never print raw keys as UI text. The task queue derives rows
// from leads, viewings and requests whose only stable field is a ledger id;
// the heading must still be words, with the id as a caption.
for (const locale of ["en", "bg", "ru"]) {
  test(`the task queue names each task in words, not by its ledger id (${locale})`, async () => {
    const page = await dispatchHttp(app(), { url: `/admin/tasks?locale=${locale}`, headers: auth });
    assert.equal(page.status, 200);
    const headings = [...page.body.matchAll(/<strong>([^<]*)<\/strong>/g)].map((m) => m[1]);
    assert.ok(headings.length > 3, "the local queue fixtures render rows");
    for (const heading of headings) {
      assert.doesNotMatch(heading, /^(lead-draft-|viewing-|contact-|language-request-|saved-search-|property-)/, heading);
      assert.doesNotMatch(heading, /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}/, heading);
    }
    const detailHeadings = [...page.body.matchAll(/<h2>([^<]*)<\/h2>/g)].map((m) => m[1]);
    for (const heading of detailHeadings) assert.doesNotMatch(heading, /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}/, heading);
    // The id is still there for support, as a caption.
    assert.match(page.body, /<code class="crm-mono adm-id-caption">lead-draft-/);
  });
}
