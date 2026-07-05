import { buildSeoEvidence, DEFAULT_SEO_EVIDENCE_OUTPUT, writeSeoEvidence } from "../lib/seo-evidence.mjs";

writeSeoEvidence(buildSeoEvidence({ generatedAt: "2026-07-05T00:00:00Z" }), DEFAULT_SEO_EVIDENCE_OUTPUT);
console.log(`Wrote SEO evidence joins to ${DEFAULT_SEO_EVIDENCE_OUTPUT}`);
