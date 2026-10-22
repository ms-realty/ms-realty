import { createHash } from "node:crypto";

export const legacyHosts = ["makler-realty.com", "makler-realty.ru"] as const;
export const primaryScopes = [
  "class:post_content",
  "class:post_content_default",
  "column:archive_main",
  "column:articles_main",
  "column:tag_articles",
  "column:empty_archive",
  "column:sitemap_main",
] as const;
export const sha256 = (value: string | Uint8Array) =>
  createHash("sha256").update(value).digest("hex");

export interface LegacyDecision {
  source_url: string;
  url_type: string;
  listing_reference: string | null;
  decision: string;
  status: number;
  target: { path: string | null };
}
export interface Capture {
  url: string;
  status: number | null;
  error?: string;
  final_url: string;
  captured_at_utc: string;
  content_scope: string;
  extracted_body_text: string;
  text_sha256: string;
  response_sha256: string;
  title?: string;
  description?: string;
  locale?: string;
  images?: { url: string; alt: string }[];
  sold?: boolean | null;
  provenance?: "live" | "archived";
  response_artifact?: string;
  h1?: string | null;
  content_state?: "text" | "verified_empty_archive";
  transport?: string;
  publicDnsPathObserved?: boolean;
  originObservation?: {
    originIp: string;
    hostAndSniPreserved: true;
    publicDnsPathObserved: false;
    requestMethod: "GET";
    hops: {
      url: string;
      status: number;
      responseSha256: string;
      remoteIp: string;
      sslVerifyResult: number;
      observedAtUnix: number;
    }[];
  };
}

/** Percent-case and the bare-host slash vary spelling, not source identity. Queries stay exact. */
export function sourceIdentity(raw: string) {
  const url = new URL(raw);
  if (
    !legacyHosts.includes(url.hostname as (typeof legacyHosts)[number]) ||
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.port ||
    url.hash
  )
    throw new Error(`Unsupported legacy source: ${raw}`);
  const path = decodeURIComponent(url.pathname);
  const identity = { host: url.hostname, path, query: url.search };
  return { ...identity, id: sha256(JSON.stringify(identity)).slice(0, 24) };
}

export function sourceLocale(raw: string, recorded?: string): string | null {
  const supported = ["bg", "en", "ru", "de", "nl", "el", "he"];
  if (recorded)
    return supported.includes(recorded.split(/[-_]/)[0] ?? "")
      ? (recorded.split(/[-_]/)[0] ?? null)
      : null;
  const identity = sourceIdentity(raw);
  const prefix = identity.path.split("/")[1];
  return prefix && supported.includes(prefix)
    ? prefix
    : identity.host.endsWith(".ru")
      ? "ru"
      : "bg";
}

/** Only these measured RU taxonomy routes have a source with a deliberately empty results column. */
export function measuredEmptyArchiveUrl(raw: string): boolean {
  try {
    const source = sourceIdentity(raw);
    return (
      source.host === "makler-realty.ru" &&
      source.query === "" &&
      /^\/(?:category-type|location|resort)\/[^/]+\/$/u.test(source.path)
    );
  } catch {
    return false;
  }
}

type SourceBodyEvidence = Pick<
  Capture,
  | "url"
  | "content_scope"
  | "extracted_body_text"
  | "text_sha256"
  | "response_sha256"
  | "response_artifact"
  | "provenance"
  | "content_state"
>;

export function verifiedSourceBody(capture: SourceBodyEvidence): boolean {
  if (
    !primaryScopes.includes(capture.content_scope as (typeof primaryScopes)[number]) ||
    sha256(capture.extracted_body_text) !== capture.text_sha256
  )
    return false;
  if (capture.content_scope !== "column:empty_archive") return !!capture.extracted_body_text.trim();
  return (
    capture.extracted_body_text === "" &&
    capture.content_state === "verified_empty_archive" &&
    capture.provenance === "live" &&
    measuredEmptyArchiveUrl(capture.url) &&
    /^[a-f0-9]{64}$/u.test(capture.response_sha256) &&
    capture.response_artifact ===
      `data/legacy/migration/live-source-html/${capture.response_sha256}.html.gz`
  );
}

export function verifiedPrimaryCapture(capture: Capture | undefined): capture is Capture {
  return !!capture && capture.status === 200 && verifiedSourceBody(capture);
}

export function buildLegacyManifest(
  decisions: readonly LegacyDecision[],
  captures: readonly Capture[],
) {
  const groups = new Map<
    string,
    {
      identity: ReturnType<typeof sourceIdentity>;
      rows: { row: number; decision: LegacyDecision }[];
    }
  >();
  decisions.forEach((decision, row) => {
    const identity = sourceIdentity(decision.source_url);
    const group = groups.get(identity.id) ?? { identity, rows: [] };
    group.rows.push({ row: row + 1, decision });
    groups.set(identity.id, group);
  });
  const bySource = new Map<string, Capture[]>();
  for (const capture of captures) {
    const id = sourceIdentity(capture.url).id;
    bySource.set(id, [...(bySource.get(id) ?? []), capture]);
  }
  const sources = [...groups.values()]
    .map(({ identity, rows }) => {
      const available = [...(bySource.get(identity.id) ?? [])].sort((a, b) =>
        b.captured_at_utc.localeCompare(a.captured_at_utc),
      );
      const capture =
        available.find(verifiedPrimaryCapture) ??
        available.find((capture) => !!capture.response_sha256) ??
        available[0];
      const bodyVerified = verifiedPrimaryCapture(capture);
      const locale = sourceLocale(rows[0]?.decision.source_url ?? "", capture?.locale);
      return {
        ...identity,
        sourceRows: rows.map(({ row, decision }) => ({
          row,
          sourceUrl: decision.source_url,
          type: decision.url_type,
          listingReference: decision.listing_reference,
        })),
        historicalOutcomes: rows.map(({ decision }) => ({
          decision: decision.decision,
          status: decision.status,
          target: decision.target.path,
          operative: false,
        })),
        source: capture
          ? {
              url: capture.url,
              finalUrl: capture.final_url,
              status: capture.status,
              capturedAt: capture.captured_at_utc,
              contentScope: capture.content_scope,
              bodyHash: capture.text_sha256,
              responseHash: capture.response_sha256,
              bodyVerified,
              provenance: capture.provenance ?? "archived",
              contentState: capture.content_state ?? "text",
              transport: capture.transport ?? null,
              publicDnsPathObserved: capture.publicDnsPathObserved ?? null,
            }
          : null,
        latestLiveObservation: available.find((capture) => capture.provenance === "live")
          ? {
              status: available.find((capture) => capture.provenance === "live")?.status,
              error: available.find((capture) => capture.provenance === "live")?.error ?? null,
              capturedAt: available.find((capture) => capture.provenance === "live")
                ?.captured_at_utc,
              transport:
                available.find((capture) => capture.provenance === "live")?.transport ?? null,
              publicDnsPathObserved:
                available.find((capture) => capture.provenance === "live")?.publicDnsPathObserved ??
                null,
            }
          : null,
        candidate:
          bodyVerified && locale
            ? { path: `/${locale}/legacy/${identity.id}`, locale, status: 200 }
            : null,
        equivalenceReview: "pending" as const,
        blockers: [
          ...(!capture
            ? ["missing_source_capture"]
            : !bodyVerified
              ? ["missing_verified_main_content"]
              : []),
          ...(!locale ? ["source_locale_unresolved"] : []),
          "target_equivalence_review_missing",
          ...(rows.some(({ decision }) => decision.listing_reference)
            ? ["listing_status_and_photo_parity_unverified"]
            : []),
        ],
      };
    })
    .sort(
      (a, b) =>
        a.host.localeCompare(b.host) ||
        a.path.localeCompare(b.path) ||
        a.query.localeCompare(b.query),
    );
  return {
    schemaVersion: 1,
    authority: {
      directive: "2026-10-01 owner zero-loss launch gate",
      historicalTerminalDecisionsOperative: false,
      revoked410Rows: decisions.filter((decision) => decision.decision === "approved_410").length,
      permittedOutcomes: ["equivalent_same_path_200", "one_hop_301_to_equivalent_200"],
      individuallyApprovedRemovals: [],
      builderMayApproveEquivalenceOrSignoff: false,
    },
    status: "blocked" as const,
    sourceRows: decisions.length,
    exactSourceUrls: new Set(decisions.map((decision) => decision.source_url)).size,
    uniqueSources: sources.length,
    duplicateSpellingRows: decisions.length - sources.length,
    capturedSources: sources.filter((source) => source.source?.responseHash).length,
    verifiedMainContentSources: sources.filter((source) => source.source?.bodyVerified).length,
    missingCaptureSources: sources.filter((source) => !source.source?.responseHash).length,
    unresolvedMainContentSources: sources.filter(
      (source) => source.source?.responseHash && !source.source.bodyVerified,
    ).length,
    reviewedEquivalentSources: 0,
    routeArtifactSha256: null,
    blockers: ["fresh_live_delta_not_reconciled", "all_source_equivalence_reviews_pending"],
    launchGate: {
      status: "blocked",
      independentServedParity: "pending",
      mediaLoadsAndCounts: "pending",
      ownerControllerSignoff: "pending",
    },
    sources,
  };
}
export type LegacyManifest = ReturnType<typeof buildLegacyManifest>;

/** Never turn partial coverage, historical approval or a builder's candidate into a deployable map. */
export function exportReviewedRoutes(manifest: LegacyManifest): never {
  throw new Error(
    `Legacy launch map blocked: ${manifest.uniqueSources} source identities; ${manifest.reviewedEquivalentSources} reviewed equivalents. Supply actual current-source and independent target equivalence evidence before export.`,
  );
}
