import { buildSeoEvidence, DEFAULT_SEO_EVIDENCE_OUTPUT, writeSeoEvidence } from "../lib/seo-evidence.mjs";

const inputDir = process.env.MS_REALTY_SEO_EVIDENCE_INPUT_DIR || undefined;
const outputPath = process.env.MS_REALTY_SEO_EVIDENCE_OUTPUT_PATH || DEFAULT_SEO_EVIDENCE_OUTPUT;

writeSeoEvidence(buildSeoEvidence({ inputDir, generatedAt: "2026-07-05T00:00:00Z" }), outputPath);
console.log(`Wrote SEO evidence joins to ${outputPath}`);
