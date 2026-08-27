import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  assertR2MediaCoverageReport,
  buildR2MediaCoverageReport,
  expectedRuntimeR2Media,
  parseR2Listing,
  r2MediaCoverageState,
  R2_MEDIA_COVERAGE_MAX_AGE_MS,
} from "../lib/r2-media-coverage.mjs";

const RELEASE_SHA = "a".repeat(40);
const GENERATED_AT = "2026-08-27T00:00:00.000Z";

function fixtureDirectory() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "ms-realty-r2-media-coverage-"));
}

function writeListing(value) {
  const directory = fixtureDirectory();
  const listingPath = path.join(directory, "objects.json");
  fs.writeFileSync(listingPath, `${JSON.stringify(value)}\n`);
  return listingPath;
}

function expectedKeys() {
  return [...expectedRuntimeR2Media().keys].sort();
}

test("R2 media coverage passes only for complete runtime-normalized coverage", () => {
  const report = buildR2MediaCoverageReport({
    listingPath: writeListing(expectedKeys()),
    releaseSha: RELEASE_SHA,
    generatedAt: GENERATED_AT,
  });

  assert.equal(report.status, "pass");
  assert.equal(report.pass, true);
  assert.deepEqual(
    {
      expected: report.expected_count,
      listed: report.listed_count,
      present: report.present_count,
      missing: report.missing_count,
      unexpected: report.unexpected_count,
    },
    { expected: 1725, listed: 1725, present: 1725, missing: 0, unexpected: 0 },
  );
  assert.equal(assertR2MediaCoverageReport(report, { expectedReleaseSha: RELEASE_SHA }), true);
  const state = r2MediaCoverageState(writeListing(report), {
    now: Date.parse(GENERATED_AT),
    expectedReleaseSha: RELEASE_SHA,
  });
  assert.equal(state.status, "pass");
});
test("R2 media coverage exposes missing and unexpected public keys without passing", () => {
  const keys = expectedKeys();
  const missingKey = keys[0];
  const report = buildR2MediaCoverageReport({
    listingPath: writeListing([...keys.slice(1), "makler-realty.com/wp-content/uploads/wv.png"]),
    releaseSha: RELEASE_SHA,
    generatedAt: GENERATED_AT,
  });

  assert.equal(report.status, "blocked");
  assert.equal(report.pass, false);
  assert.equal(report.expected_count, 1725);
  assert.equal(report.listed_count, 1725);
  assert.equal(report.present_count, 1724);
  assert.equal(report.missing_count, 1);
  assert.equal(report.unexpected_count, 1);
  assert.deepEqual(report.missing_keys, [missingKey]);
  assert.deepEqual(report.unexpected_keys, ["makler-realty.com/wp-content/uploads/wv.png"]);
  assert.equal(report.missing_context.length, 1);
  assert.equal(report.missing_context[0].key, missingKey);
  assert.equal(assertR2MediaCoverageReport(report, { expectedReleaseSha: RELEASE_SHA }), true);
});

test("R2 media coverage rejects a report from the wrong workers.dev release SHA", () => {
  const report = buildR2MediaCoverageReport({
    listingPath: writeListing(expectedKeys()),
    releaseSha: RELEASE_SHA,
    generatedAt: GENERATED_AT,
  });

  assert.throws(
    () => assertR2MediaCoverageReport(report, { expectedReleaseSha: "b".repeat(40) }),
    /does not match the expected workers\.dev release/,
  );
  const listingPath = writeListing(report);
  const state = r2MediaCoverageState(listingPath, { expectedReleaseSha: "b".repeat(40), now: Date.parse(GENERATED_AT) });
  assert.equal(state.status, "invalid_report");
});

test("R2 media coverage marks a valid but stale report expired", () => {
  const report = buildR2MediaCoverageReport({
    listingPath: writeListing(expectedKeys()),
    releaseSha: RELEASE_SHA,
    generatedAt: GENERATED_AT,
  });
  const reportPath = writeListing(report);
  const state = r2MediaCoverageState(reportPath, {
    now: Date.parse(GENERATED_AT) + R2_MEDIA_COVERAGE_MAX_AGE_MS + 1,
    expectedReleaseSha: RELEASE_SHA,
  });
  assert.equal(state.status, "expired_report");
  assert.equal(state.freshness.status, "stale");
});

test("R2 media coverage fails closed on malformed and duplicate listing input", () => {
  const key = expectedKeys()[0];
  const awsResponse = parseR2Listing({ Contents: [{ Key: key, Size: 123 }], IsTruncated: false, KeyCount: 1 });
  assert.equal(awsResponse.keys.has(key), true);
  assert.throws(() => parseR2Listing([key, key]), /duplicate key/);
  assert.throws(() => parseR2Listing([{ Key: key, key }]), /exactly one key field/);
  assert.throws(() => parseR2Listing(["not-a-public-r2-key"]), /host\/path key form/);
  assert.throws(() => parseR2Listing({ Contents: [{ Key: key }, { Key: key }] }), /duplicate key/);
});
