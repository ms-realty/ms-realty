import { buildSeoEvidence, DEFAULT_SEO_EVIDENCE_OUTPUT, writeSeoEvidence } from "../lib/seo-evidence.mjs";

writeSeoEvidence(buildSeoEvidence(), DEFAULT_SEO_EVIDENCE_OUTPUT);
console.log(`Wrote SEO evidence joins to ${DEFAULT_SEO_EVIDENCE_OUTPUT}`);
