import { expect, it } from "vitest";
import {
  buildLegacyManifest,
  type Capture,
  exportReviewedRoutes,
  sha256,
  sourceIdentity,
  verifiedPrimaryCapture,
} from "./manifest";

const decision = (url: string) => ({
  source_url: url,
  url_type: "page",
  listing_reference: null,
  decision: "approved_410",
  status: 410,
  target: { path: null },
});
const capture: Capture = {
  url: "https://makler-realty.com/%D0%B0/",
  final_url: "https://makler-realty.com/%D0%B0/",
  status: 200,
  captured_at_utc: "2026-07-29T00:00:00Z",
  content_scope: "class:post_content_default",
  extracted_body_text: "Actual source text",
  text_sha256: sha256("Actual source text"),
  response_sha256: "a".repeat(64),
};
it("zero-loss folds equivalent URL spellings and retains every source row without turning historical 410s into removals", () => {
  const manifest = buildLegacyManifest(
    [decision("https://makler-realty.com/%d0%b0/"), decision(capture.url)],
    [capture],
  );
  expect(manifest).toMatchObject({
    sourceRows: 2,
    uniqueSources: 1,
    duplicateSpellingRows: 1,
    verifiedMainContentSources: 1,
    reviewedEquivalentSources: 0,
    status: "blocked",
    routeArtifactSha256: null,
  });
  expect(manifest.authority).toMatchObject({ revoked410Rows: 2, individuallyApprovedRemovals: [] });
  expect(manifest.sources[0]?.historicalOutcomes.every((row) => !row.operative)).toBe(true);
  expect(() => exportReviewedRoutes(manifest)).toThrow(/blocked/);
});
it("missing captures, chrome-only fallback and changed source text remain explicit blockers", () => {
  const manifest = buildLegacyManifest(
    [decision(capture.url), decision("https://makler-realty.ru/missing/")],
    [{ ...capture, content_scope: "document_text_fallback" }],
  );
  expect(manifest.sources.find((source) => source.host.endsWith(".ru"))?.blockers).toContain(
    "missing_source_capture",
  );
  expect(manifest.sources.find((source) => source.host.endsWith(".com"))?.candidate).toBeNull();
  expect(verifiedPrimaryCapture({ ...capture, extracted_body_text: "Changed text" })).toBe(false);
});
it("request queries retain byte spelling and a foreign/credentialled source never enters the map", () => {
  expect(sourceIdentity("https://makler-realty.com/a?q=%2f").query).toBe("?q=%2f");
  expect(sourceIdentity("https://makler-realty.com/a?q=%2f").id).not.toBe(
    sourceIdentity("https://makler-realty.com/a?q=%2F").id,
  );
  expect(() => sourceIdentity("https://private.example.test/a")).toThrow();
  expect(() => sourceIdentity("https://user:secret@makler-realty.com/a")).toThrow();
});
