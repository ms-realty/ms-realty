import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  auditEvents,
  grants,
  importRows,
  listings,
  operations,
  outboxEvents,
  properties,
  staffImportReviews,
} from "@/db/schema";
import { createTestDatabase, type TestDatabase } from "@/db/test-utils";
import { staffFixture } from "@/server/cases/testing";
import { emptyDraft } from "@/server/inventory/contracts";
import { nextReference } from "@/server/references";
import {
  cancelStaffImport,
  executeStaffImport,
  prepareStaffImport,
  readStaffImport,
  reverseStaffImport,
  sealStaffImport,
} from "./commands";
import type { ImportReceipt, ImportSelection } from "./contracts";
import { emptyMapping } from "./csv";
import { startImportPreview } from "./preview";

let t: TestDatabase;
let sequence = 810000;
const context = {
  country: "BG",
  region: "Synthetic region",
  propertyType: "apartment",
  purpose: "sale",
  areaBasis: "living",
  sourceLanguage: "bg",
};
const mapping = {
  ...emptyMapping(),
  reference: 0,
  title: 1,
  price: 2,
  currency: 3,
  area: 4,
  bedrooms: 5,
  location: 6,
  sourceUrl: 7,
};
const csv = (rows: string[]) =>
  `reference,title,price,currency,area,bedrooms,location,sourceUrl\n${rows.join("\n")}`;
const sourceRow = (reference: string, title = "Synthetic imported draft", price = "123.45") =>
  `${reference},${title},${price},EUR,71.5,0,Synthetic settlement,https://example.test/${reference}`;
const reference = () => `MS-${sequence++}`;
beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => {
  await t?.drop();
});
async function reviewer() {
  const staff = await staffFixture(t.db);
  await t.db.insert(grants).values({
    principalId: staff.id,
    capability: "import.run",
    reason: "Synthetic O28 reviewed import authority",
  });
  return staff;
}
type Staff = Awaited<ReturnType<typeof reviewer>>;
async function prepared(staff: Staff, rows: string[]) {
  const preview = await startImportPreview(
    t.db,
    staff.session,
    new File([csv(rows)], "synthetic.csv"),
    ",",
  );
  return prepareStaffImport(t.db, staff.session, {
    token: preview.token,
    mapping,
    context,
    operationKey: randomUUID(),
  });
}
const command = (receipt: ImportReceipt) => ({
  id: receipt.id,
  expectedVersion: receipt.version,
  operationKey: receipt.operationKey,
});
async function sealed(
  staff: Staff,
  receipt: ImportReceipt,
  selection: ImportSelection[] = receipt.rows
    .filter((row) => !row.issues.length)
    .map((row) => ({
      number: row.number,
      choices: Object.fromEntries(
        row.fields.filter((field) => field.decision).map((field) => [field.field, "source"]),
      ),
    })),
) {
  return sealStaffImport(t.db, staff.session, {
    ...command(receipt),
    digest: receipt.digest,
    planDigest: receipt.planDigest,
    selection,
  });
}
async function businessSnapshot() {
  return t.db.execute(
    sql`select 'listings' as source,count(*)::int as n from listings union all select 'properties',count(*)::int from properties union all select 'property_facts',count(*)::int from property_facts union all select 'listing_revisions',count(*)::int from listing_revisions union all select 'approvals',count(*)::int from approvals union all select 'publication_manifests',count(*)::int from publication_manifests`,
  );
}
async function existing(staff: Staff) {
  const [property] = await t.db
    .insert(properties)
    .values({
      reference: await nextReference(t.db, "property"),
      propertyType: "apartment",
      country: "BG",
      region: "Synthetic region",
      settlement: "Synthetic settlement",
    })
    .returning();
  if (!property) throw new Error("Fixture property failed");
  const ref = reference();
  const draft = {
    ...emptyDraft,
    title: "Existing reviewed title",
    priceState: "known" as const,
    price: "100",
    sourceReference: `https://example.test/${ref}`,
    sourceClass: "owner_confirmed" as const,
  };
  const [listing] = await t.db
    .insert(listings)
    .values({
      reference: ref,
      propertyId: property.id,
      purpose: "sale",
      draft,
      responsibleBrokerId: staff.id,
    })
    .returning();
  if (!listing) throw new Error("Fixture listing failed");
  return { property, listing, draft };
}
describe("F32/O28 AT55 reviewed staff import", () => {
  it("dry run writes only import metadata, then applies the exact selected subset once with atomic receipts/audit/outbox", async () => {
    const staff = await reviewer(),
      refs = [reference(), reference(), reference()];
    const before = await businessSnapshot();
    const review = await prepared(
      staff,
      refs.map((ref) => sourceRow(ref)),
    );
    expect(await businessSnapshot()).toEqual(before);
    expect(review.rows.map((row) => row.classification)).toEqual(["create", "create", "create"]);
    const ready = await sealed(staff, review, [
      { number: 2, choices: {} },
      { number: 4, choices: {} },
    ]);
    expect(await businessSnapshot()).toEqual(before);
    const result = await executeStaffImport(t.db, staff.session, command(ready));
    expect(result.state).toBe("completed");
    expect(result.rows.map((row) => row.outcome)).toEqual(["applied", "pending", "applied"]);
    expect(
      await t.db
        .select()
        .from(listings)
        .where(eq(listings.reference, refs[1] as string)),
    ).toEqual([]);
    const readback = await readStaffImport(t.db, staff.session, ready.id);
    expect(await executeStaffImport(t.db, staff.session, command(ready))).toEqual(readback);
    const applied = await t.db
      .select()
      .from(importRows)
      .where(
        eq(
          importRows.batchId,
          (
            await t.db.select().from(staffImportReviews).where(eq(staffImportReviews.id, ready.id))
          )[0]?.batchId as string,
        ),
      );
    for (const row of applied.filter((row) => row.outcome === "applied")) {
      const [op] = await t.db
        .select()
        .from(operations)
        .where(
          and(
            eq(operations.operationType, "staff_import.row"),
            eq(operations.idempotencyKey, `${ready.operationKey}:${row.rowNumber}`),
          ),
        );
      expect(op?.status).toBe("succeeded");
      expect(
        await t.db
          .select()
          .from(auditEvents)
          .where(eq(auditEvents.operationId, op?.id as string)),
      ).toHaveLength(1);
      expect(
        await t.db
          .select()
          .from(outboxEvents)
          .where(eq(outboxEvents.operationId, op?.id as string)),
      ).toHaveLength(1);
      const [listing] = await t.db
        .select()
        .from(listings)
        .where(eq(listings.id, row.targetId as string));
      expect(listing).toMatchObject({
        commercialState: "confirmation_required",
        editorialState: "draft",
        approvedRevisionId: null,
        latestRevisionNumber: 0,
        draft: { bedroomsState: "known", bedrooms: "0", sourceClass: "source_supplied" },
      });
    }
  });
  it("requires explicit protected-field decisions; keep-current preserves facts and reversal restores the exact prior draft", async () => {
    const staff = await reviewer(),
      old = await existing(staff);
    const review = await prepared(staff, [
      sourceRow(old.listing.reference, "Incoming title", "200"),
    ]);
    const row = review.rows[0];
    expect(row?.fields.find((field) => field.field === "price")).toMatchObject({
      current: "known: 100 EUR",
      incoming: "200",
      proposed: "known: 200 EUR",
      decision: true,
    });
    const choices = Object.fromEntries(
      row?.fields
        .filter((field) => field.decision)
        .map((field) => [field.field, field.field === "price" ? "keep" : "source"]) ?? [],
    );
    const ready = await sealed(staff, review, [{ number: 2, choices }]);
    const result = await executeStaffImport(t.db, staff.session, command(ready));
    const [changed] = await t.db.select().from(listings).where(eq(listings.id, old.listing.id));
    expect(changed?.draft).toMatchObject({
      price: "100",
      priceState: "known",
      title: "Incoming title",
      sourceClass: "source_supplied",
    });
    expect(changed?.approvedRevisionId).toBeNull();
    const reversed = await reverseStaffImport(t.db, staff.session, command(result));
    expect(reversed.rows[0]?.reversal).toBe("reversed");
    expect(
      (await t.db.select().from(listings).where(eq(listings.id, old.listing.id)))[0]?.draft,
    ).toEqual(old.draft);
    expect(await reverseStaffImport(t.db, staff.session, command(result))).toEqual(reversed);
  });
  it("rejects missing choices, a changed source digest, changed operation payload and stale target revisions", async () => {
    const staff = await reviewer(),
      old = await existing(staff);
    const missing = await prepared(staff, [sourceRow(old.listing.reference)]);
    await expect(sealed(staff, missing, [{ number: 2, choices: {} }])).rejects.toMatchObject({
      code: "validation_failed",
    });
    const review = await prepared(staff, [sourceRow(reference())]);
    await expect(
      sealStaffImport(t.db, staff.session, {
        ...command(review),
        digest: "a".repeat(64),
        planDigest: review.planDigest,
        selection: [{ number: 2, choices: {} }],
      }),
    ).rejects.toMatchObject({ code: "version_conflict" });
    const stale = await sealed(staff, await prepared(staff, [sourceRow(old.listing.reference)]));
    await t.db
      .update(listings)
      .set({
        version: old.listing.version + 1,
        draft: { ...old.draft, title: "Concurrent broker edit" },
      })
      .where(eq(listings.id, old.listing.id));
    const result = await executeStaffImport(t.db, staff.session, command(stale));
    expect(result.rows[0]).toMatchObject({ outcome: "failed", errorCode: "version_conflict" });
    expect(
      (await t.db.select().from(listings).where(eq(listings.id, old.listing.id)))[0]?.draft,
    ).toMatchObject({ title: "Concurrent broker edit" });
    await expect(
      sealStaffImport(t.db, staff.session, {
        ...command(stale),
        digest: stale.digest,
        planDigest: stale.planDigest,
        selection: [{ number: 2, choices: {} }],
      }),
    ).rejects.toMatchObject({ code: "idempotency_key_reused" });
  });
  it("rechecks import and target edit grants independently; revoked authority cannot execute", async () => {
    const staff = await reviewer(),
      ready = await sealed(staff, await prepared(staff, [sourceRow(reference())]));
    await t.db
      .update(grants)
      .set({ revokedAt: new Date() })
      .where(and(eq(grants.principalId, staff.id), eq(grants.capability, "import.run")));
    await expect(executeStaffImport(t.db, staff.session, command(ready))).rejects.toMatchObject({
      code: "forbidden",
    });
    const targetStaff = await reviewer(),
      old = await existing(targetStaff);
    const targetReady = await sealed(
      targetStaff,
      await prepared(targetStaff, [sourceRow(old.listing.reference)]),
    );
    await t.db
      .update(grants)
      .set({ revokedAt: new Date() })
      .where(and(eq(grants.principalId, targetStaff.id), sql`${grants.role} is not null`));
    await t.db.insert(grants).values({
      principalId: targetStaff.id,
      capability: "listing.read",
      reason: "Synthetic read grant remains; editing was revoked",
    });
    await expect(
      executeStaffImport(t.db, targetStaff.session, command(targetReady)),
    ).rejects.toMatchObject({ code: "forbidden" });
    expect(
      (await t.db.select().from(listings).where(eq(listings.id, old.listing.id)))[0]?.draft,
    ).toEqual(old.draft);
    await expect(readStaffImport(t.db, (await reviewer()).session, ready.id)).rejects.toMatchObject(
      { code: "not_found" },
    );
  });
  it("rolls back a failed row completely, reconciles the committed subset after response loss, resumes and cancels only future rows", async () => {
    const staff = await reviewer(),
      refs = [reference(), reference(), reference()];
    const ready = await sealed(
      staff,
      await prepared(
        staff,
        refs.map((ref) => sourceRow(ref)),
      ),
    );
    // An unexpected failure after all row writes tests the complete transaction boundary.
    await executeStaffImport(t.db, staff.session, command(ready), {
      beforeCommit: async (number) => {
        if (number === 3) throw new Error("Synthetic interrupted row");
      },
    });
    const reconciled = await readStaffImport(t.db, staff.session, ready.id);
    expect(reconciled.rows.map((row) => row.outcome)).toEqual(["applied", "pending", "pending"]);
    expect(reconciled.rows[1]?.errorCode).toBe("unavailable");
    expect(
      await t.db
        .select()
        .from(listings)
        .where(eq(listings.reference, refs[1] as string)),
    ).toEqual([]);
    expect(
      await t.db
        .select()
        .from(operations)
        .where(eq(operations.idempotencyKey, `${ready.operationKey}:3`)),
    ).toEqual([]);
    const resumed = await executeStaffImport(t.db, staff.session, command(ready), { limit: 1 });
    expect(resumed.rows.map((row) => row.outcome)).toEqual(["applied", "applied", "pending"]);
    const cancelled = await cancelStaffImport(t.db, staff.session, command(resumed));
    expect(cancelled.state).toBe("cancelled");
    await executeStaffImport(t.db, staff.session, command(cancelled));
    expect(
      await t.db
        .select()
        .from(listings)
        .where(eq(listings.reference, refs[2] as string)),
    ).toEqual([]);
    expect(
      (await reverseStaffImport(t.db, staff.session, command(cancelled))).rows.map(
        (row) => row.reversal,
      ),
    ).toEqual(["reversed", "reversed", null]);
    const [retained] = await t.db
      .select()
      .from(listings)
      .where(eq(listings.reference, refs[0] as string));
    expect(retained).toMatchObject({ commercialState: "withdrawn", draft: {} });
  });
  it("blocks reversal after later changes or dependent records and retains sealed evidence", async () => {
    const staff = await reviewer(),
      ref = reference();
    const ready = await sealed(staff, await prepared(staff, [sourceRow(ref)]));
    const result = await executeStaffImport(t.db, staff.session, command(ready));
    const [listing] = await t.db.select().from(listings).where(eq(listings.reference, ref));
    await t.db
      .update(listings)
      .set({ version: 2 })
      .where(eq(listings.id, listing?.id as string));
    const reversed = await reverseStaffImport(t.db, staff.session, command(result));
    expect(reversed.rows[0]).toMatchObject({ reversal: "blocked", reversalCode: "target_changed" });
    const dep = await sealed(staff, await prepared(staff, [sourceRow(reference())]));
    const imported = await executeStaffImport(t.db, staff.session, command(dep));
    const [review] = await t.db
      .select()
      .from(staffImportReviews)
      .where(eq(staffImportReviews.id, dep.id));
    const [importedRow] = await t.db
      .select()
      .from(importRows)
      .where(eq(importRows.batchId, review?.batchId as string));
    // A synthetic future FK proves the guard covers relationships introduced by other slices.
    await t.sql`create table synthetic_import_dependency(id uuid primary key default gen_random_uuid(),listing_id uuid references listings(id))`;
    await t.sql`insert into synthetic_import_dependency(listing_id) values (${importedRow?.targetId as string})`;
    expect(
      (await reverseStaffImport(t.db, staff.session, command(imported))).rows[0],
    ).toMatchObject({ reversal: "blocked", reversalCode: "dependent_records" });
    await expect(
      t.db
        .update(staffImportReviews)
        .set({ sourceText: "changed" })
        .where(eq(staffImportReviews.id, dep.id)),
    ).rejects.toThrow();
    await expect(
      t.db.delete(importRows).where(eq(importRows.batchId, review?.batchId as string)),
    ).rejects.toThrow();
  });
  it("retains original protected text and blocks unsupported currency, location updates and invalid historical drafts", async () => {
    const staff = await reviewer(),
      old = await existing(staff);
    const price = await prepared(staff, [sourceRow(reference()).replace(",EUR,", ",BGN,")]);
    expect(price.rows[0]?.issues).toContain("price_eur_positive");
    const location = await prepared(staff, [
      sourceRow(old.listing.reference).replace("Synthetic settlement", "Different settlement"),
    ]);
    expect(location.rows[0]?.issues).toContain("location_manual");
    await t.db.update(listings).set({ draft: {} }).where(eq(listings.id, old.listing.id));
    const historical = await prepared(staff, [sourceRow(old.listing.reference)]);
    expect(historical.rows[0]?.issues).toContain("draft_manual");
    expect(price.rows[0]?.values.currency).toBe("BGN");
  });
  it("allows correction before acceptance, records keep-current as unchanged and serializes concurrent resumes", async () => {
    const staff = await reviewer(),
      old = await existing(staff);
    const review = await prepared(staff, [sourceRow(old.listing.reference)]);
    await expect(sealed(staff, review, [{ number: 2, choices: {} }])).rejects.toMatchObject({
      code: "validation_failed",
    });
    const choices = Object.fromEntries(
      review.rows[0]?.fields
        .filter((field) => field.decision)
        .map((field) => [field.field, "keep"]) ?? [],
    );
    const ready = await sealed(staff, review, [{ number: 2, choices }]);
    expect((await executeStaffImport(t.db, staff.session, command(ready))).rows[0]?.outcome).toBe(
      "skipped",
    );
    expect(
      (await t.db.select().from(listings).where(eq(listings.id, old.listing.id)))[0],
    ).toMatchObject({ version: 1, draft: old.draft });
    const refs = [reference(), reference()];
    const concurrent = await sealed(
      staff,
      await prepared(
        staff,
        refs.map((ref) => sourceRow(ref)),
      ),
    );
    await Promise.all([
      executeStaffImport(t.db, staff.session, command(concurrent)),
      executeStaffImport(t.db, staff.session, command(concurrent)),
    ]);
    const result = await readStaffImport(t.db, staff.session, concurrent.id);
    expect(result.rows.map((row) => row.outcome)).toEqual(["applied", "applied"]);
    for (const row of result.rows) {
      expect(
        await t.db
          .select()
          .from(operations)
          .where(eq(operations.idempotencyKey, `${concurrent.operationKey}:${row.number}`)),
      ).toHaveLength(1);
      expect(
        await t.db
          .select()
          .from(auditEvents)
          .where(eq(auditEvents.operationId, row.receiptId as string)),
      ).toHaveLength(1);
    }
  });
});
