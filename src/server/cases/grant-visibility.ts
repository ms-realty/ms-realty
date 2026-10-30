import "server-only";
import { eq, or, type SQL, sql } from "drizzle-orm";
import { cases } from "@/db/schema/work";
import type { Capability, CapabilityGrant } from "@/domain/capabilities";

/** The Case has no locale or property scope. Share this rule across read projections. */
export function caseGrantVisibility(
  grants: readonly CapabilityGrant[],
  capability: Capability,
): SQL {
  const clauses = grants
    .filter((g) => g.capability === capability)
    .flatMap(({ scope }) => {
      if (scope?.locales || (scope?.recordType && scope.recordType !== "case")) return [];
      return [scope?.recordId ? eq(cases.id, scope.recordId) : sql`true`];
    });
  return or(...clauses) ?? sql`false`;
}
