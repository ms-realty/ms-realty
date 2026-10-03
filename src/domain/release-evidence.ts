// ReleaseEvidence (architecture §20.1, §21.3): release-bound proof. Evidence for another
// release, environment or policy revision never clears a gate by filename alone.

export const evidenceEnvironments = ["local", "ci", "staging", "production"] as const;
export type EvidenceEnvironment = (typeof evidenceEnvironments)[number];

export const redactionStatuses = ["redacted", "no_personal_data", "unredacted_restricted"] as const;
export type RedactionStatus = (typeof redactionStatuses)[number];

export interface ReleaseEvidenceRecord {
  readonly schemaVersion: number;
  readonly environment: EvidenceEnvironment;
  readonly releaseSha: string;
  /** Image, artifact and gateway digests by name. */
  readonly digests: Readonly<Record<string, string>>;
  readonly policyRevision: string;
  /** ISO 8601 instant of the observation. */
  readonly observedAt: string;
  /** Tool or source identity that produced the observation. */
  readonly source: string;
  readonly reviewer: string | null;
  readonly assertions: readonly { readonly id: string; readonly passed: boolean }[];
  readonly redactionStatus: RedactionStatus;
}

export interface ReleaseUnderEvaluation {
  readonly environment: EvidenceEnvironment;
  readonly releaseSha: string;
  readonly policyRevision: string;
}

/**
 * Whether `evidence` can count towards a gate for `release`: same release, environment and
 * policy revision, observed within `maxAgeMs` of `now`, with every assertion passing.
 * Local and CI evidence never stand in for deployed evidence.
 */
export function evidenceCounts(
  evidence: ReleaseEvidenceRecord,
  release: ReleaseUnderEvaluation,
  now: string,
  maxAgeMs: number,
): boolean {
  return (
    evidence.releaseSha === release.releaseSha &&
    evidence.environment === release.environment &&
    evidence.policyRevision === release.policyRevision &&
    Date.parse(now) - Date.parse(evidence.observedAt) <= maxAgeMs &&
    evidence.assertions.length > 0 &&
    evidence.assertions.every((a) => a.passed)
  );
}
