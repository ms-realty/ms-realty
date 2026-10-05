// Synthetic O07 browser fixtures through the existing server test helpers and commands. Never
// accepts a persistent or production database. Each run gets its own place, deal and listings, so
// the matching search sees only this run's properties.
//   O07_SEED=list         one buyer deal with structured requirements and six listings
//   O07_SEED=requirements  deals without requirements, of the wrong kind, and with no matches
//   O07_SEED=revise        a new requirements revision of O07_CASE_ID by its broker (same fields)
import { randomBytes, randomUUID } from "node:crypto";
import { desc, eq, sql as statement } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/db/schema";
import type { Actor } from "@/domain/capabilities";
import { readSession } from "@/server/auth/sessions";
import { addInterest, reviseBrief } from "@/server/cases/commands";
import { readCaseCandidate } from "@/server/cases/matching";
import { caseFixture, staffFixture } from "@/server/cases/testing";
import {
  createListingFixture,
  eur,
  insertPlace,
  type ListingFixtureOptions,
  publishForTest,
} from "@/server/publication/testing";

const url = process.env.E2E_DATABASE_URL;
if (!url || !/^\/msr_e2e_[a-f0-9]{32}$/.test(new URL(url).pathname))
  throw new Error("O07 browser seed requires the generated disposable database.");
const mode = process.env.O07_SEED;
if (mode !== "list" && mode !== "requirements" && mode !== "revise")
  throw new Error("O07_SEED must be list, requirements or revise.");
const connection = postgres(url, { max: 1, onnotice: () => {} });
const db = drizzle(connection, { schema });
const tag = randomBytes(4).toString("hex");

async function caseVersion(caseId: string) {
  const [row] = await db
    .select({ version: schema.cases.version })
    .from(schema.cases)
    .where(eq(schema.cases.id, caseId));
  if (!row) throw new Error("Missing synthetic deal");
  return row.version;
}

/** A buyer deal whose client party carries a synthetic name. */
async function deal(staff: Awaited<ReturnType<typeof staffFixture>>, clientName: string) {
  const f = await caseFixture(db, staff);
  await db
    .update(schema.parties)
    .set({ displayName: clientName })
    .where(eq(schema.parties.id, f.client.partyId));
  return f;
}

/** Same reference hygiene as the S4 browser seed: unique per run, valid MS-\d{5,} form. */
async function listing(reviewerId: string, actor: Actor, options: Partial<ListingFixtureOptions>) {
  const fixture = await db.transaction(async (tx) => {
    await tx.execute(
      statement`select pg_advisory_xact_lock(hashtextextended('discovery-synthetic-fixtures', 0))`,
    );
    const created = await createListingFixture(tx, { reviewerId, ...options });
    const number = String(randomBytes(6).readUIntBE(0, 6)).padStart(6, "0");
    const reference = `MS-${number}`;
    await tx
      .update(schema.listings)
      .set({ reference })
      .where(eq(schema.listings.id, created.listingId));
    await tx
      .update(schema.properties)
      .set({ reference: `PR-2026-${number}` })
      .where(eq(schema.properties.id, created.propertyId));
    await tx
      .update(schema.sellerInstructions)
      .set({ reference: `SI-2026-${number}` })
      .where(eq(schema.sellerInstructions.listingId, created.listingId));
    await tx
      .update(schema.documents)
      .set({ reference: statement`${`DC-2026-${number}-`} || ${schema.documents.id}::text` })
      .where(eq(schema.documents.propertyId, created.propertyId));
    return { ...created, reference };
  });
  await publishForTest(db, actor, fixture);
  return fixture.reference;
}

/** The requirements change while a broker reads a check: the add must conflict, not land. */
async function revise(caseId: string, token: string) {
  const session = await readSession(db, token);
  if (!session) throw new Error("Missing synthetic broker session");
  const [latest] = await db
    .select({ criteria: schema.briefRevisions.criteria })
    .from(schema.briefRevisions)
    .where(eq(schema.briefRevisions.caseId, caseId))
    .orderBy(desc(schema.briefRevisions.revisionNumber))
    .limit(1);
  await reviseBrief(db, session, {
    id: caseId,
    operationId: randomUUID(),
    expectedVersion: await caseVersion(caseId),
    requirements: "Synthetic two-room apartment within the budget, revised",
    preferences: "Quiet street",
    criteria: latest?.criteria as Parameters<typeof reviseBrief>[2]["criteria"],
  });
  console.log(JSON.stringify({ caseId }));
}

try {
  if (mode === "revise") {
    await revise(process.env.O07_CASE_ID ?? "", process.env.O07_STAFF_TOKEN ?? "");
    process.exit(0);
  }
  const staff = await staffFixture(db);
  const brokerName = `Matching broker ${tag}`;
  await db
    .update(schema.principals)
    .set({ displayName: brokerName })
    .where(eq(schema.principals.id, staff.id));
  const district = await insertPlace(db, {
    level: "district",
    parentId: null,
    nameNative: `Синтетична област ${tag}`,
    nameLatin: `Synthetic district ${tag}`,
  });
  const municipality = await insertPlace(db, {
    level: "municipality",
    parentId: district,
    nameNative: `Синтетична община ${tag}`,
    nameLatin: `Synthetic municipality ${tag}`,
  });
  const placeName = `Синтетично ${tag}`;
  const settlement = await insertPlace(db, {
    level: "settlement",
    parentId: municipality,
    nameNative: placeName,
    nameLatin: `Synthetic ${tag}`,
  });
  const criteria = {
    purpose: "sale" as const,
    propertyTypes: ["apartment" as const],
    placeIds: [settlement],
    price: { currency: "EUR" as const, max: 13_000_000 },
  };
  const clientName = `Синтетичен клиент ${tag}`;

  if (mode === "requirements") {
    const missing = await deal(staff, clientName);
    const kind = await deal(staff, clientName);
    // The command refuses a requirements kind that differs from the deal's; the stored row is
    // edited directly, as the server's own matching test helper does.
    const [kindBrief] = await db
      .select({ id: schema.briefRevisions.id })
      .from(schema.briefRevisions)
      .where(eq(schema.briefRevisions.caseId, kind.record.id))
      .orderBy(desc(schema.briefRevisions.revisionNumber))
      .limit(1);
    if (!kindBrief) throw new Error("Missing synthetic requirements");
    await db
      .update(schema.briefRevisions)
      .set({ criteria: { ...criteria, purpose: "long_term_rent" } })
      .where(eq(schema.briefRevisions.id, kindBrief.id));
    const empty = await deal(staff, clientName);
    const nowhere = await insertPlace(db, {
      level: "settlement",
      parentId: municipality,
      nameNative: `Празно ${tag}`,
      nameLatin: `Empty ${tag}`,
    });
    await reviseBrief(db, staff.session, {
      id: empty.record.id,
      operationId: randomUUID(),
      expectedVersion: await caseVersion(empty.record.id),
      requirements: "Synthetic requirements with no published match",
      preferences: "",
      criteria: { ...criteria, placeIds: [nowhere] },
    });
    console.log(
      JSON.stringify({
        staffToken: staff.token,
        clientName,
        placeName,
        missingCaseId: missing.record.id,
        kindCaseId: kind.record.id,
        emptyCaseId: empty.record.id,
      }),
    );
  } else {
    const f = await deal(staff, clientName);
    await reviseBrief(db, staff.session, {
      id: f.record.id,
      operationId: randomUUID(),
      expectedVersion: await caseVersion(f.record.id),
      requirements: "Synthetic two-room apartment within the budget",
      preferences: "Quiet street",
      criteria,
    });
    const add = (options: Partial<ListingFixtureOptions>) =>
      listing(staff.id, staff.actor, { placeId: settlement, ...options });
    const refs = {
      match: await add({ price: { state: "known", value: eur(105_000) } }),
      // An offer whose availability nobody has confirmed: presented as confirmation_required.
      needs: await add({
        price: { state: "known", value: eur(115_000) },
        commercialState: "confirmation_required",
      }),
      negotiating: await add({
        price: { state: "known", value: eur(110_000) },
        commercialState: "negotiating",
      }),
      reserved: await add({
        price: { state: "known", value: eur(112_000) },
        commercialState: "reserved_with_recorded_basis",
      }),
      onList: await add({ price: { state: "known", value: eur(99_000) } }),
      noMatch: await add({ price: { state: "known", value: eur(135_000) } }),
    };
    const [brief] = await db
      .select({ revision: schema.briefRevisions.revisionNumber })
      .from(schema.briefRevisions)
      .where(eq(schema.briefRevisions.caseId, f.record.id))
      .orderBy(desc(schema.briefRevisions.revisionNumber))
      .limit(1);
    if (!brief) throw new Error("Missing structured requirements");
    const reviewed = await readCaseCandidate(db, staff.session, {
      id: f.record.id,
      reference: refs.onList,
      locale: "bg",
      briefRevision: brief.revision,
    });
    const saved = await addInterest(db, staff.session, {
      id: f.record.id,
      operationId: randomUUID(),
      expectedVersion: await caseVersion(f.record.id),
      reference: refs.onList,
      explanation: "Synthetic saved property for the matching workbench.",
      matchReview: {
        briefRevision: reviewed.briefRevision,
        manifestId: reviewed.candidate.manifestId,
        availability: reviewed.candidate.availability.presented,
        violated: [...reviewed.violated],
        unconfirmed: [...reviewed.unconfirmed],
        reviewed: true,
      },
    });
    console.log(
      JSON.stringify({
        staffToken: staff.token,
        brokerName,
        clientName,
        placeName,
        caseId: f.record.id,
        briefRevision: brief.revision,
        refs,
        onListInterestId: saved.outcome.interestId,
      }),
    );
  }
} finally {
  await connection.end();
}
