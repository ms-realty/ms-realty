import "server-only";
import routes from "../../../data/legacy/migration/staging-legacy-routes.json";
import review from "../../../data/legacy/migration/staging-route-manifest.json";
import { sha256, sourceIdentity } from "./manifest";
import { getLegacyPage } from "./pages";

/** Source-reviewed URL preparation only; this cannot grant translation approval or indexability. */
export function reviewedSamePathLegacyPages(origin: URL) {
  if (
    review.status !== "ready_partial" ||
    review.scope !== "staging_only" ||
    sha256(JSON.stringify(routes)) !== review.routeArtifactSha256
  )
    return [];
  return routes.flatMap((route) => {
    if (route.status !== 200 || route.host !== "makler-realty.com") return [];
    const target = new URL(route.targetPath, "https://makler-realty.com");
    const match = /^\/([a-z]{2})\/legacy\/([a-f0-9]{24})$/u.exec(target.pathname);
    if (!match) return [];
    const page = getLegacyPage(match[1] ?? "", match[2] ?? "");
    if (!page) return [];
    const sourceUrl = new URL(`${route.path}${route.query}`, "https://makler-realty.com");
    const sourceId = sourceIdentity(sourceUrl.href).id;
    if (
      !review.reviews.some(
        (item) => item.id === sourceId && item.sourceBodyHash === page.sourceHash,
      )
    )
      return [];
    return [
      {
        sourceId,
        locale: page.locale,
        path: `${sourceUrl.pathname}${sourceUrl.search}`,
        url: new URL(`${sourceUrl.pathname}${sourceUrl.search}`, origin).href,
        review: "source_body_projection" as const,
        indexabilityApproved: false as const,
        // No reciprocal sibling/translation approval evidence is available in the capture records.
        alternatives: [] as readonly { locale: string; url: string }[],
      },
    ];
  });
}
