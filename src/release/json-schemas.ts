// JSON Schema (draft 2020-12) views of the release contracts, written to release/schemas by
// scripts/release-schemas.mjs so evidence producers outside this codebase can validate.
import { z } from "zod";
import { bundleBindingSchema, bundleIndexSchema } from "./bundle";
import {
  admittedReleaseTrustSchema,
  evidenceArtifactSchema,
  gatePolicySchema,
  readinessReportSchema,
  releaseManifestSchema,
} from "./schemas";

const schemas = {
  "evidence-bundle-index.schema.json": { schema: bundleIndexSchema, title: "EvidenceBundleIndex" },
  "evidence-bundle-binding.schema.json": {
    schema: bundleBindingSchema,
    title: "EvidenceBundleBinding",
  },
  "admitted-release-trust.schema.json": {
    schema: admittedReleaseTrustSchema,
    title: "AdmittedReleaseTrust",
  },
  "release-manifest.schema.json": { schema: releaseManifestSchema, title: "ReleaseManifest" },
  "evidence-artifact.schema.json": { schema: evidenceArtifactSchema, title: "EvidenceArtifact" },
  "gate-policy.schema.json": { schema: gatePolicySchema, title: "GatePolicy" },
  "readiness-report.schema.json": { schema: readinessReportSchema, title: "ReadinessReport" },
} as const;

/** File name → JSON Schema. Cross-field rules (policy references) are enforced in code only. */
export function releaseJsonSchemas(): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(schemas).map(([file, { schema, title }]) => [
      file,
      { ...z.toJSONSchema(schema, { io: "input" }), $id: file, title },
    ]),
  );
}
