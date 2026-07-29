import test from "node:test";
import assert from "node:assert/strict";
import {
  approvedContentDocumentsForPath,
  approvedContentGuideGroups,
  approvedContentMatches,
  assertApprovedCmsContent,
  guideSourceHash,
  isPublishableGuide,
  readApprovedCmsContent,
} from "../lib/approved-content.mjs";

test("approved CMS content exposes reviewed foreign-buyer process facts", () => {
  const content = readApprovedCmsContent();

  assert.equal(assertApprovedCmsContent(content), true);
  const matches = approvedContentMatches(content, "Can a non-EU buyer own land through an OOD?");
  assert.equal(matches[0].id, "foreign-buyers-bg-land-ownership");
  assert.match(matches[0].facts.join(" "), /Non-EU buyers cannot own Bulgarian land directly/);
  assert.equal(approvedContentDocumentsForPath(content, "/en/guides/foreign-buyers/").length, 2);
  assert.equal(approvedContentGuideGroups(content).find((group) => group.path === "/en/guides/foreign-buyers").documents.length, 2);
});

test("new factual guides require current source evidence, a matching hash, and human approval", () => {
  const content = readApprovedCmsContent();
  const guide = approvedContentDocumentsForPath(content, "/bg/guides/proverka-na-imot-sandanski")[0];

  assert.equal(isPublishableGuide(guide), true);
  assert.equal(guide.source_hash, guideSourceHash(guide));
  assert.equal(guide.sources.every((source) => source.url.startsWith("https://")), true);
  assert.equal(isPublishableGuide({ ...guide, source_hash: "stale" }), false);
  const unapprovedTranslation = {
    ...guide,
    locale: "en",
    path: "/en/guides/proverka-na-imot-sandanski",
    human_translation_approved: false,
  };
  unapprovedTranslation.source_hash = guideSourceHash(unapprovedTranslation);
  assert.equal(
    isPublishableGuide(unapprovedTranslation),
    false,
  );
});
