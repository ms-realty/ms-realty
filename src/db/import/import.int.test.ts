// F32 legacy import against a real Postgres: A71 (dry run changes nothing live) and A72
// (per-item outcomes, stable batch identity, resumable without duplicates).
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as s from "../schema";
import { createTestDatabase, type TestDatabase } from "../test-utils";
import { applyBatch, findBatch, stageBatch } from "./pipeline";
import { writeReport } from "./report";
import { type LegacySources, loadLegacySources } from "./sources";

const importTables = new Set(["import_batches", "import_rows"]);
let sources: LegacySources;

beforeAll(async () => {
  sources = await loadLegacySources();
});

/** Row count of every table outside the import tables. */
async function liveCounts(t: TestDatabase): Promise<Record<string, number>> {
  const tables = await t.sql<{ name: string }[]>`
    select table_name as name from information_schema.tables
    where table_schema = 'public' and table_type = 'BASE TABLE' order by table_name`;
  const counts: Record<string, number> = {};
  for (const { name } of tables) {
    if (importTables.has(name) || name.startsWith("__")) continue;
    const [row] = await t.sql.unsafe<{ n: number }[]>(`select count(*)::int as n from "${name}"`);
    counts[name] = row?.n ?? -1;
  }
  return counts;
}

async function count(t: TestDatabase, table: string, where = "true"): Promise<number> {
  const [row] = await t.sql.unsafe<{ n: number }[]>(
    `select count(*)::int as n from "${table}" where ${where}`,
  );
  return row?.n ?? -1;
}

async function classifications(t: TestDatabase, reference: string) {
  const batch = await findBatch(t.db, reference);
  const rows = await t.db
    .select({
      sourceKey: s.importRows.sourceKey,
      classification: s.importRows.classification,
      outcome: s.importRows.outcome,
      errorCode: s.importRows.errorCode,
      diff: s.importRows.diff,
    })
    .from(s.importRows)
    .where(eq(s.importRows.batchId, batch.id));
  const tally: Record<string, number> = {};
  for (const r of rows) tally[r.classification] = (tally[r.classification] ?? 0) + 1;
  return { batch, rows, tally };
}

describe("legacy import pipeline (F32)", () => {
  let t: TestDatabase;

  beforeAll(async () => {
    t = await createTestDatabase();
  }, 60_000);

  afterAll(async () => {
    await t?.drop();
  });

  it("A71: a dry run classifies every row and makes no live change", async () => {
    const before = await liveCounts(t);
    const out = await mkdtemp(join(tmpdir(), "import-report-"));
    const { reference } = await stageBatch(t.db, sources, { mode: "dry_run" });
    const report = await writeReport(t.db, reference, out);

    expect(await liveCounts(t)).toEqual(before);
    const { batch, tally } = await classifications(t, reference);
    expect(batch).toMatchObject({ mode: "dry_run", state: "validated", rowCount: 2400 });
    expect(tally).toEqual({ create: 2334, needs_review: 53, blocked: 13 });
    expect(report.report.blockedReasons).toEqual({ no_listing: 13 });
    expect(report.report.reviewReasons).toEqual({ shared_between_properties: 53 });
    const markdown = await readFile(report.markdown, "utf8");
    expect(markdown).toContain("## Classification");
    expect(markdown).toContain("No property, listing, fact, media");
  }, 120_000);

  it("applies the created rows with the expected record counts", async () => {
    const { reference } = await stageBatch(t.db, sources, { mode: "apply" });
    const result = await applyBatch(t.db, sources, reference);

    expect(result).toMatchObject({ state: "completed", failed: [] });
    expect(result.outcomes).toEqual({ pending: 66, applied: 2334, skipped: 0, failed: 0 });
    // 127 physical properties: the 38 archived duplicates join their survivor's property.
    expect(await count(t, "properties")).toBe(127);
    expect(await count(t, "listings")).toBe(165);
    expect(await count(t, "listing_versions")).toBe(165);
    const [shared] = await t.sql<{ n: number }[]>`
      select count(*)::int as n from (
        select property_id from listings group by property_id having count(*) > 1) shared`;
    expect(shared?.n).toBeGreaterThan(0);
    expect(await count(t, "legacy_url_decisions")).toBe(454);
    const [spellings] = await t.sql<{ n: number }[]>`
      select sum(jsonb_array_length(evidence->'legacySpellings'))::int as n from legacy_url_decisions`;
    expect(spellings?.n).toBe(457);
    expect(await count(t, "legacy_url_decisions", "listing_id is not null")).toBe(165);
    expect(await count(t, "geography_places")).toBe(48);
    expect(await count(t, "geography_places", "level = 'settlement'")).toBe(28);
    expect(await count(t, "content_pages")).toBe(8);
    expect(await count(t, "media_assets")).toBe(1659);

    // Nothing the import creates is published, approved for language, indexable or cleared.
    expect(await count(t, "listings", "distribution_state <> 'never_published'")).toBe(0);
    expect(await count(t, "listings", "commercial_state = 'availability_unconfirmed'")).toBe(30);
    expect(await count(t, "listings", "commercial_state = 'withdrawn'")).toBe(135);
    expect(await count(t, "translations")).toBe(990);
    expect(await count(t, "translations", "state <> 'draft'")).toBe(0);
    expect(await count(t, "media_assets", "rights <> 'unknown' or storage_area <> 'staging'")).toBe(
      0,
    );
    expect(await count(t, "media_assets", "byte_size is not null or sha256 is not null")).toBe(0);
    expect(await count(t, "facts", "source_class <> 'legacy_import'")).toBe(0);
    expect(await count(t, "facts", "state = 'withheld' and field_key = 'price'")).toBe(31);

    const approvals = await t.db
      .select()
      .from(s.approvals)
      .innerJoin(s.listingVersions, eq(s.listingVersions.id, s.approvals.subjectId))
      .where(eq(s.approvals.kind, "legacy_owner_publication_approval"));
    expect(approvals).toHaveLength(165);
    for (const a of approvals) {
      expect(a.approvals.subjectHash).toBe(a.listing_versions.contentHash);
      expect(a.approvals.scope).toMatchObject({ evidenceReference: "MSR-LISTING-PUBLICATION-1" });
    }
    expect(await count(t, "approvals", "kind = 'legacy_content_approval'")).toBe(8);
  }, 180_000);

  it("re-running the same import yields no_change", async () => {
    const before = await liveCounts(t);
    const { reference } = await stageBatch(t.db, sources, { mode: "apply" });
    const result = await applyBatch(t.db, sources, reference);
    const { tally } = await classifications(t, reference);

    expect(tally).toEqual({ no_change: 2334, needs_review: 53, blocked: 13 });
    expect(result.outcomes.applied).toBe(0);
    const after = await liveCounts(t);
    expect(after).toEqual(before);
  }, 120_000);

  it("proposes, never overwrites, a change to a human-verified value", async () => {
    const [person] = await t.db
      .insert(s.persons)
      .values({ displayName: "Test Reviewer" })
      .returning();
    const [staff] = await t.db
      .insert(s.staffAccounts)
      .values({
        personId: person?.id as string,
        email: "reviewer@example.test",
        displayName: "Test Reviewer",
      })
      .returning();
    const listing = (
      await t.db.select().from(s.listings).where(eq(s.listings.reference, "MS-00815"))
    )[0];
    const factWhere = and(
      eq(s.facts.propertyId, listing?.propertyId as string),
      eq(s.facts.fieldKey, "area.usable"),
    );
    const verified = { value: 1400, unit: "m2", basis: "usable" };
    await t.db
      .update(s.facts)
      .set({ value: verified, reviewedByStaffId: staff?.id, reviewedAt: new Date() })
      .where(factWhere);

    const { reference } = await stageBatch(t.db, sources, { mode: "apply" });
    const { rows, tally } = await classifications(t, reference);
    expect(tally.update_proposal).toBe(1);
    const row = rows.find((r) => r.sourceKey === "listing:MS-00815");
    expect(row?.classification).toBe("update_proposal");
    expect((row?.diff as { fields?: unknown[] } | undefined)?.fields).toEqual([
      expect.objectContaining({
        field: "fact.area.usable",
        humanVerified: true,
        current: expect.objectContaining({ value: verified }),
        incoming: expect.objectContaining({ value: { value: 1394, unit: "m2", basis: "usable" } }),
      }),
    ]);

    // Even when selected explicitly, the proposal is not written.
    const result = await applyBatch(t.db, sources, reference, { rows: ["listing:MS-00815"] });
    expect(result.outcomes.skipped).toBe(1);
    const after = await classifications(t, reference);
    expect(after.rows.find((r) => r.sourceKey === "listing:MS-00815")).toMatchObject({
      outcome: "skipped",
      errorCode: "update_proposal",
    });
    const [fact] = await t.db.select().from(s.facts).where(factWhere);
    expect(fact?.value).toEqual(verified);
  }, 120_000);
});

describe("legacy import recovery (A72)", () => {
  let t: TestDatabase;

  beforeAll(async () => {
    t = await createTestDatabase();
  }, 60_000);

  afterAll(async () => {
    await t?.drop();
  });

  it("reports per-item failures and resumes the same batch without duplicates", async () => {
    const { reference } = await stageBatch(t.db, sources, { mode: "apply" });
    const broken = new Set(["listing:MS-00815", "listing:MS-00191"]);
    const first = await applyBatch(t.db, sources, reference, {
      beforeRow: ({ sourceKey }) => {
        if (broken.has(sourceKey)) throw new Error("injected failure");
      },
    });

    expect(first.state).toBe("partially_completed");
    const failedKeys = first.failed.map((f) => f.sourceKey);
    expect(failedKeys).toEqual(expect.arrayContaining([...broken]));
    // Rows that depend on a failed listing fail too, and say why: MS-CRAWL-0114 is an archived
    // duplicate merged into MS-00191, so it and the rows that depend on it fail as well.
    const dependents = first.failed.filter((f) => !broken.has(f.sourceKey));
    expect(dependents.length).toBeGreaterThan(0);
    for (const d of dependents)
      expect(d.errorCode).toMatch(
        /^dependency_missing: listing:(MS-00815|MS-00191|MS-CRAWL-0114)$/,
      );
    for (const key of broken) {
      expect(first.failed.find((f) => f.sourceKey === key)?.errorCode).toBe(
        "apply_error: injected failure",
      );
    }
    expect(await count(t, "listings")).toBe(162);
    expect(await count(t, "listings", "reference in ('MS-00815', 'MS-00191')")).toBe(0);
    expect(await count(t, "properties")).toBe(125);

    const resumed = await applyBatch(t.db, sources, reference);
    expect(resumed).toMatchObject({ reference, state: "completed", failed: [] });
    expect(resumed.outcomes).toEqual({ pending: 66, applied: 2334, skipped: 0, failed: 0 });
    expect(await count(t, "listings")).toBe(165);
    expect(await count(t, "properties")).toBe(127);
    expect(await count(t, "media_assets")).toBe(1659);
    expect(await count(t, "legacy_url_decisions")).toBe(454);
    // Exactly one audit entry per applied row: nothing was written twice.
    const [audit] = await t.db
      .select({
        n: sql<number>`count(*)::int`,
        distinct: sql<number>`count(distinct record_id)::int`,
      })
      .from(s.auditLog)
      .where(eq(s.auditLog.action, "import.row_applied"));
    expect(audit).toEqual({ n: 2334, distinct: 2334 });

    // A third run over the finished batch changes nothing.
    const again = await applyBatch(t.db, sources, reference);
    expect(again.outcomes).toEqual(resumed.outcomes);
    expect(await count(t, "listings")).toBe(165);
  }, 240_000);
});
