// Synthetic source-classification fixture only, never an actual service approval.
import { randomUUID } from "node:crypto";
import { serviceCaseContextSchema } from "@/domain/service-scope";

export function syntheticServiceContext(ownerId: string, shortStay = false) {
  const scopeVersionId = randomUUID(),
    regionId = randomUUID();
  const source = {
    kind: "service" as const,
    slug: "synthetic-public-service-source",
    versionId: randomUUID(),
    contentHash: "a".repeat(64),
  };
  const context = serviceCaseContextSchema.parse({
    request: {
      version: 1,
      topic: shortStay ? "short_stay_consultation" : "management_consultation",
      scopeVersionId,
      regionId,
      location: "SYNTHETIC_DECLARED_LOCATION",
      needs: "SYNTHETIC_PERSONAL_SERVICE_NEEDS",
      relationship: "owner",
      ...(shortStay
        ? {
            requestedFrom: new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10),
            requestedUntil: new Date(Date.now() + 4 * 86400000).toISOString().slice(0, 10),
          }
        : {}),
    },
    binding: {
      kind: "bounded_service_binding_v1",
      scopeVersionId,
      scopeVersion: 1,
      scopeHash: "b".repeat(64),
      responsibleId: ownerId,
      sourceUrl: "https://example.test/en/services/synthetic-public-service-source",
      offering: {
        topic: shortStay ? "short_stay_consultation" : "management_consultation",
        regionId,
        state: "offered",
        mode: "referral",
        regionVersion: 1,
        publicSource: source,
        termsSource: source,
        ownerId,
        fallback: { kind: "manual", source: { ...source, slug: "synthetic-internal-fallback" } },
        operatingPolicy: { id: randomUUID(), version: 1, contentHash: "c".repeat(64) },
        // Historical expiry does not remove a person's submitted request.
        reviewExpiresAt: new Date(Date.now() - 86400000).toISOString(),
      },
    },
  });
  return {
    ...context,
    binding: { ...context.binding, observedSource: { ...source, locale: "en" as const } },
  };
}
