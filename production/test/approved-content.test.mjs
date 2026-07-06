import test from "node:test";
import assert from "node:assert/strict";
import { approvedContentMatches, assertApprovedCmsContent, readApprovedCmsContent } from "../lib/approved-content.mjs";

test("approved CMS content exposes reviewed foreign-buyer process facts", () => {
  const content = readApprovedCmsContent();

  assert.equal(assertApprovedCmsContent(content), true);
  const matches = approvedContentMatches(content, "Can a non-EU buyer own land through an OOD?");
  assert.equal(matches[0].id, "foreign-buyers-bg-land-ownership");
  assert.match(matches[0].facts.join(" "), /Non-EU buyers cannot own Bulgarian land directly/);
});
