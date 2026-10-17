import { isPublicLocale } from "@/domain/ids";
import { type LegacyManifest, primaryScopes, sha256, sourceIdentity } from "./manifest";

interface PageProjection {
  id: string;
  canonicalPath: string;
  locale: string;
  title: string;
  bodyText: string;
  sourceHash: string;
  contentScope: string;
}
interface LiveSourceBinding {
  id: string;
  sourceUrl: string;
  sourceBodyHash: string;
  candidate: { path: string; status: number } | null;
}

/** Source-reviewed candidates for protected staging only; HTTP/media/checker/signoff remain pending. */
export function exportStagingRoutes(
  manifest: LegacyManifest,
  pages: readonly PageProjection[],
  liveSources: readonly LiveSourceBinding[] = [],
  discoveredSources: readonly { id: string; url: string }[] = [],
) {
  const bindings = [
    ...manifest.sources.map((source) => ({
      id: source.id,
      sourceUrl: source.sourceRows[0]?.sourceUrl ?? "",
      sourceBodyHash: source.source?.bodyVerified ? source.source.bodyHash : "",
      candidate: source.candidate,
    })),
    ...liveSources,
  ];
  const routes = [];
  const reviews = [];
  const exclusions = [];
  for (const binding of bindings) {
    const page = pages.find((page) => page.id === binding.id);
    if (
      !binding.candidate ||
      !page?.title.trim() ||
      !isPublicLocale(page.locale) ||
      !/^[a-f0-9]{24}$/u.test(page.id) ||
      !primaryScopes.includes(page.contentScope as (typeof primaryScopes)[number]) ||
      binding.candidate.status !== 200 ||
      !page.bodyText.trim() ||
      page.sourceHash !== binding.sourceBodyHash ||
      sha256(page.bodyText) !== page.sourceHash ||
      page.canonicalPath !== binding.candidate.path ||
      page.canonicalPath !== `/${page.locale}/legacy/${page.id}`
    ) {
      exclusions.push({
        id: binding.id,
        sourceUrl: binding.sourceUrl,
        reason: "missing_verified_source_or_render_projection",
      });
      continue;
    }
    const identity = sourceIdentity(binding.sourceUrl);
    if (identity.id !== binding.id)
      throw new Error("Source identity does not match staging target");
    routes.push({
      host: identity.host,
      path: identity.path,
      query: identity.query,
      status: identity.host === "makler-realty.ru" ? (301 as const) : (200 as const),
      targetHost: "makler-realty.com",
      targetPath: `${page.canonicalPath}${identity.query}`,
    });
    reviews.push({
      id: identity.id,
      sourceUrl: binding.sourceUrl,
      targetPath: page.canonicalPath,
      sourceBodyHash: page.sourceHash,
      review: "exact_source_body_preserved_in_render_projection",
      reviewer: "Codex source preparation lane",
      humanApproval: false,
      servedTargetStatus: null,
    });
  }
  if (!routes.length) throw new Error("No source-backed staging candidates");
  for (const discovered of discoveredSources) {
    if (
      !reviews.some((review) => review.id === discovered.id) &&
      !exclusions.some((excluded) => excluded.id === discovered.id)
    )
      exclusions.push({
        id: discovered.id,
        sourceUrl: discovered.url,
        reason: "missing_verified_source_or_render_projection",
      });
  }
  const keys = routes.map((route) => JSON.stringify([route.host, route.path, route.query]));
  if (new Set(keys).size !== keys.length) throw new Error("Duplicate staging source identities");
  for (const route of routes) {
    const target = new URL(route.targetPath, "https://makler-realty.com");
    if (
      routes.some(
        (other) =>
          other.host === target.host &&
          other.path === target.pathname &&
          other.query === target.search &&
          other.status === 301,
      )
    )
      throw new Error("Staging redirect chain");
  }
  routes.sort(
    (a, b) =>
      a.host.localeCompare(b.host) ||
      a.path.localeCompare(b.path) ||
      a.query.localeCompare(b.query),
  );
  const json = JSON.stringify(routes);
  return {
    json,
    manifest: {
      schemaVersion: 1,
      status: "ready_partial",
      scope: "staging_only",
      productionAllowed: false,
      baselineSourceRows: manifest.sourceRows,
      fullBaselineUniqueSources: manifest.uniqueSources,
      sourceRows: reviews.reduce(
        (count, review) =>
          count +
          (manifest.sources.find((source) => source.id === review.id)?.sourceRows.length ?? 1),
        0,
      ),
      uniqueSources: routes.length,
      retained200: routes.filter((route) => route.status === 200).length,
      redirected301: routes.filter((route) => route.status === 301).length,
      routeArtifactSha256: sha256(json),
      blockers: [],
      exclusions,
      reviews,
      completeCurrentDelta: false,
      launchGate: {
        status: "blocked",
        independentServedParity: "pending",
        mediaLoadsAndCounts: "pending",
        listingFieldAndStatusReview: "pending",
        completeCurrentDelta: "pending",
        ownerControllerSignoff: "pending",
      },
    },
  };
}
