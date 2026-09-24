// Human-readable (markdown) and machine-readable (JSON) report of an import batch (F32).
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import * as s from "../schema";
import type { Issue } from "./mapping";
import type { FieldDiff, ImportDb } from "./pipeline";
import { findBatch } from "./pipeline";

type Row = typeof s.importRows.$inferSelect;

export interface ImportReport {
  batch: {
    reference: string;
    mode: string;
    state: string;
    source: string;
    sourceSha256: string | null;
    rowCount: number;
    createdAt: string;
    startedAt: string | null;
    finishedAt: string | null;
  };
  classification: Record<string, Record<string, number>>;
  outcomes: Record<string, number>;
  blockedReasons: Record<string, number>;
  reviewReasons: Record<string, number>;
  warnings: Record<string, number>;
  blocked: { rowNumber: number; sourceKey: string; issues: Issue[] }[];
  needsReview: { rowNumber: number; sourceKey: string; issues: Issue[] }[];
  updateProposals: { rowNumber: number; sourceKey: string; fields: FieldDiff[] }[];
  failed: { rowNumber: number; sourceKey: string; errorCode: string | null }[];
  fieldMapping: unknown;
}

function tally(values: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const v of values) out[v] = (out[v] ?? 0) + 1;
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
}

export async function buildReport(db: ImportDb, reference: string): Promise<ImportReport> {
  const batch = await findBatch(db, reference);
  const rows: Row[] = await db
    .select()
    .from(s.importRows)
    .where(eq(s.importRows.batchId, batch.id))
    .orderBy(s.importRows.rowNumber);
  const issuesOf = (r: Row) => r.issues as Issue[];
  const classification: Record<string, Record<string, number>> = {};
  for (const r of rows) {
    const type = r.targetType ?? "unknown";
    classification[type] ??= {};
    const byType = classification[type];
    byType[r.classification] = (byType[r.classification] ?? 0) + 1;
  }
  const withSeverity = (r: Row, severity: Issue["severity"]) =>
    issuesOf(r).filter((i) => i.severity === severity);
  const blockedRows = rows.filter((r) => r.classification === "blocked");
  const reviewRows = rows.filter((r) => r.classification === "needs_review");
  return {
    batch: {
      reference: batch.reference,
      mode: batch.mode,
      state: batch.state,
      source: batch.source,
      sourceSha256: batch.sourceSha256,
      rowCount: batch.rowCount,
      createdAt: batch.createdAt.toISOString(),
      startedAt: batch.startedAt?.toISOString() ?? null,
      finishedAt: batch.finishedAt?.toISOString() ?? null,
    },
    classification,
    outcomes: tally(rows.map((r) => r.outcome)),
    blockedReasons: tally(
      blockedRows.flatMap((r) => withSeverity(r, "blocking").map((i) => i.code)),
    ),
    reviewReasons: tally(reviewRows.flatMap((r) => withSeverity(r, "review").map((i) => i.code))),
    warnings: tally(rows.flatMap((r) => withSeverity(r, "warning").map((i) => i.code))),
    blocked: blockedRows.map((r) => ({
      rowNumber: r.rowNumber,
      sourceKey: r.sourceKey,
      issues: issuesOf(r),
    })),
    needsReview: reviewRows.map((r) => ({
      rowNumber: r.rowNumber,
      sourceKey: r.sourceKey,
      issues: issuesOf(r),
    })),
    updateProposals: rows
      .filter((r) => r.classification === "update_proposal")
      .map((r) => ({
        rowNumber: r.rowNumber,
        sourceKey: r.sourceKey,
        fields: ((r.diff as { fields?: FieldDiff[] }).fields ?? []) as FieldDiff[],
      })),
    failed: rows
      .filter((r) => r.outcome === "failed")
      .map((r) => ({ rowNumber: r.rowNumber, sourceKey: r.sourceKey, errorCode: r.errorCode })),
    fieldMapping: batch.fieldMapping,
  };
}

const classifications = ["create", "update_proposal", "no_change", "needs_review", "blocked"];

function short(value: unknown): string {
  const text = JSON.stringify(value) ?? "null";
  return (text.length > 120 ? `${text.slice(0, 117)}...` : text).replaceAll("|", "\\|");
}

export function renderMarkdown(r: ImportReport): string {
  const lines: string[] = [];
  const b = r.batch;
  lines.push(`# Legacy import ${b.reference} (${b.mode === "dry_run" ? "dry run" : "apply"})`, "");
  lines.push(
    `State **${b.state}** · ${b.rowCount} rows · source ${b.source} · sha256 \`${b.sourceSha256}\``,
    "",
  );
  if (b.mode === "dry_run") {
    lines.push(
      "A dry run writes only the import tables. No property, listing, fact, media, approval,",
      "translation, URL decision, place or content record was created or changed.",
      "",
    );
  }
  lines.push("## Classification", "");
  lines.push(`| Type | ${classifications.join(" | ")} | total |`);
  lines.push(`|---|${classifications.map(() => "---:").join("|")}|---:|`);
  const totals: Record<string, number> = {};
  for (const [type, counts] of Object.entries(r.classification)) {
    const values = classifications.map((c) => counts[c] ?? 0);
    for (const c of classifications) totals[c] = (totals[c] ?? 0) + (counts[c] ?? 0);
    lines.push(`| ${type} | ${values.join(" | ")} | ${values.reduce((a, v) => a + v, 0)} |`);
  }
  const grand = classifications.map((c) => totals[c] ?? 0);
  lines.push(`| **all** | ${grand.join(" | ")} | ${grand.reduce((a, v) => a + v, 0)} |`, "");

  lines.push("## Outcomes", "");
  lines.push(
    Object.entries(r.outcomes)
      .map(([k, v]) => `${k}: ${v}`)
      .join(" · "),
    "",
  );
  if (r.failed.length) {
    lines.push(`### Failed rows (resume with \`--apply --batch ${b.reference}\`)`, "");
    for (const f of r.failed) lines.push(`- #${f.rowNumber} \`${f.sourceKey}\`: ${f.errorCode}`);
    lines.push("");
  }

  lines.push("## Blocked", "");
  if (!r.blocked.length) lines.push("None.", "");
  else {
    for (const [code, n] of Object.entries(r.blockedReasons)) lines.push(`- \`${code}\`: ${n}`);
    lines.push("");
    for (const row of r.blocked) {
      const why = row.issues.filter((i) => i.severity === "blocking").map((i) => i.message);
      lines.push(`- #${row.rowNumber} \`${row.sourceKey}\` — ${why.join("; ")}`);
    }
    lines.push("");
  }

  lines.push("## Needs review", "");
  if (!r.needsReview.length) lines.push("None.", "");
  else {
    for (const [code, n] of Object.entries(r.reviewReasons)) lines.push(`- \`${code}\`: ${n}`);
    lines.push("");
    for (const row of r.needsReview) {
      const why = row.issues.filter((i) => i.severity === "review").map((i) => i.message);
      lines.push(`- #${row.rowNumber} \`${row.sourceKey}\` — ${why.join("; ")}`);
    }
    lines.push("");
  }

  lines.push("## Update proposals (never applied without a reviewer)", "");
  if (!r.updateProposals.length) lines.push("None.", "");
  for (const p of r.updateProposals) {
    lines.push(`### #${p.rowNumber} \`${p.sourceKey}\``, "");
    lines.push("| Field | Current | Incoming | Human-verified |", "|---|---|---|---|");
    for (const f of p.fields) {
      lines.push(
        `| ${f.field} | ${short(f.current)} | ${short(f.incoming)} | ${f.humanVerified ? "**yes**" : "no"} |`,
      );
    }
    lines.push("");
  }

  lines.push("## Warnings carried with created records", "");
  if (!Object.keys(r.warnings).length) lines.push("None.");
  for (const [code, n] of Object.entries(r.warnings)) lines.push(`- \`${code}\`: ${n}`);
  lines.push("");

  lines.push("## What the import never does", "");
  lines.push(
    "- Publishes nothing: every listing and content page stays `never_published`.",
    "- Approves no translation: legacy translations are drafts; none is indexable.",
    "- Clears no media: rights `unknown`, review `pending`, storage `staging` (A54).",
    "- Overwrites no existing record: differences are update proposals for a reviewer.",
    "",
  );
  lines.push("## Field mapping", "");
  for (const [k, v] of Object.entries(r.fieldMapping as Record<string, unknown>)) {
    if (k !== "files") lines.push(`- **${k}**: ${String(v)}`);
  }
  lines.push("");
  return lines.join("\n");
}

export async function writeReport(
  db: ImportDb,
  reference: string,
  dir: string,
): Promise<{ markdown: string; json: string; report: ImportReport }> {
  const report = await buildReport(db, reference);
  await mkdir(dir, { recursive: true });
  const markdown = join(dir, `${reference}.md`);
  const json = join(dir, `${reference}.json`);
  await writeFile(markdown, renderMarkdown(report));
  await writeFile(json, `${JSON.stringify(report, null, 2)}\n`);
  return { markdown, json, report };
}
