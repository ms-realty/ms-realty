import { expect, it } from "vitest";
import { buildLegacyManifest, sha256, sourceIdentity } from "./manifest";
import { exportStagingRoutes } from "./staging-routes";

const source = "https://makler-realty.ru/%D0%B0/?q=%2f";
const id = sourceIdentity(source).id;
const text = "Exact publicly published source +359879696870";
const manifest = buildLegacyManifest(
  [
    {
      source_url: source,
      url_type: "page",
      listing_reference: null,
      decision: "approved_410",
      status: 410,
      target: { path: null },
    },
  ],
  [
    {
      url: source,
      final_url: source,
      status: 200,
      captured_at_utc: "2026-07-29T00:00:00Z",
      content_scope: "class:post_content_default",
      extracted_body_text: text,
      text_sha256: sha256(text),
      response_sha256: "a".repeat(64),
    },
  ],
);
const page = {
  id,
  canonicalPath: `/ru/legacy/${id}`,
  locale: "ru",
  title: "Exact source title",
  bodyText: text,
  sourceHash: sha256(text),
  contentScope: "class:post_content_default",
};
it("a source-reviewed partial RU staging route is a single-hop exact-content candidate, not production or independent served proof", () => {
  const exported = exportStagingRoutes(manifest, [page]);
  expect(JSON.parse(exported.json)).toEqual([
    {
      host: "makler-realty.ru",
      path: "/а/",
      query: "?q=%2f",
      status: 301,
      targetHost: "makler-realty.com",
      targetPath: `/ru/legacy/${id}?q=%2f`,
    },
  ]);
  expect(exported.manifest).toMatchObject({
    status: "ready_partial",
    scope: "staging_only",
    productionAllowed: false,
    uniqueSources: 1,
    routeArtifactSha256: sha256(exported.json),
    launchGate: {
      status: "blocked",
      independentServedParity: "pending",
      ownerControllerSignoff: "pending",
    },
  });
  expect(exported.manifest.reviews[0]).toMatchObject({
    humanApproval: false,
    servedTargetStatus: null,
  });
});

it("routes a measured empty archive only with an exact live response binding and keeps staging-only authority", () => {
  const url = "https://makler-realty.ru/category-type/studio/",
    emptyId = sourceIdentity(url).id,
    responseHash = "b".repeat(64);
  const emptyCapture = {
    url,
    final_url: url,
    status: 200,
    captured_at_utc: new Date(0).toISOString(),
    content_scope: "column:empty_archive",
    content_state: "verified_empty_archive" as const,
    extracted_body_text: "",
    text_sha256: sha256(""),
    response_sha256: responseHash,
    response_artifact: `data/legacy/migration/live-source-html/${responseHash}.html.gz`,
    provenance: "live" as const,
  };
  const emptyManifest = buildLegacyManifest(
    [
      {
        source_url: url,
        url_type: "archive",
        listing_reference: null,
        decision: "approved_410",
        status: 410,
        target: { path: null },
      },
    ],
    [emptyCapture],
  );
  const emptyPage = {
    ...page,
    id: emptyId,
    canonicalPath: `/ru/legacy/${emptyId}`,
    bodyText: "",
    sourceHash: sha256(""),
    contentScope: "column:empty_archive",
    contentState: "verified_empty_archive" as const,
    sourceResponseHash: responseHash,
    provenance: { kind: "live" as const, artifact: emptyCapture.response_artifact },
  };
  const output = exportStagingRoutes(emptyManifest, [emptyPage]);
  expect(JSON.parse(output.json)).toHaveLength(1);
  expect(output.manifest.productionAllowed).toBe(false);
  expect(() =>
    exportStagingRoutes(emptyManifest, [{ ...emptyPage, contentState: undefined }]),
  ).toThrow(/No source-backed/);
});
it("a missing or changed source/render projection cannot enter the staging artifact", () => {
  expect(() => exportStagingRoutes(manifest, [{ ...page, bodyText: "Changed facts" }])).toThrow(
    /No source-backed/,
  );
  expect(() => exportStagingRoutes(manifest, [])).toThrow(/No source-backed/);
});
