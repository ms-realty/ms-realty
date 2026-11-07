// Bounded AT02/AT08/AT31 browser fixtures. Only the generated disposable browser database.
import { randomBytes, randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/db/schema";
import { calendarFixture } from "@/server/appointments/calendar-testing";
import { createSession } from "@/server/auth/sessions";
import {
  freezeListingDraft,
  inventoryDetail,
  recordSellerInstruction,
  saveListingDraft,
} from "@/server/inventory/commands";
import { workingDraftFrom } from "@/server/inventory/working-draft";
import { restrictPublication, submitListingRevision } from "@/server/publication/commands";
import { createListingFixture, publishForTest } from "@/server/publication/testing";
import { createClient, createStaff } from "@/server/testing";

const databaseUrl = process.env.E2E_DATABASE_URL;
if (!databaseUrl || !/^\/msr_e2e_[a-f0-9]{32}$/.test(new URL(databaseUrl).pathname))
  throw new Error("Remaining native scenarios require the generated disposable database");
const connection = postgres(databaseUrl, { max: 1, onnotice: () => {} });
const db = drizzle(connection, { schema });
try {
  if (process.argv[2] === "calendar") {
    const f = await calendarFixture(db);
    const client = await createClient(db);
    const issued = await createSession(db, { kind: "client", id: client.id });
    await db.insert(schema.caseParticipants).values({
      caseId: f.caseId,
      partyId: client.partyId,
      role: "buyer",
    });
    await db.insert(schema.appointmentParticipants).values({
      appointmentId: f.replacement.id,
      partyId: client.partyId,
      role: "buyer",
    });
    console.log(
      JSON.stringify({
        staffToken: f.token,
        clientToken: issued.token,
        id: f.replacement.id,
        reference: f.replacement.reference,
      }),
    );
  } else {
    const staff = await createStaff(db, {
      roles: ["content_editor", "publishing_approver"],
      email: `synthetic-native-${randomUUID()}@example.test`,
    });
    if (process.argv[2] === "reprice") {
      const reference = process.argv[3] ?? "";
      const before = await inventoryDetail(db, staff.actor, reference);
      if (!before.revision) throw new Error("Missing original price revision");
      const saved = await saveListingDraft(db, {
        actor: staff.actor,
        operationId: randomUUID(),
        expectedRevision: before.listing.version,
        reference,
        draft: {
          ...workingDraftFrom(before.revision, before.facts),
          price: "123456.78",
          priceState: "known",
          sourceReference: "synthetic-price-change",
          sourceClass: "agency_observed",
          sourceLanguage: "bg",
        },
      });
      const frozen = await freezeListingDraft(db, {
        actor: staff.actor,
        operationId: randomUUID(),
        expectedRevision: saved.outcome.version,
        reference,
      });
      await restrictPublication(db, {
        actor: staff.actor,
        operationId: randomUUID(),
        expectedRevision: before.listing.publicationGeneration,
        reference,
        reason: "Synthetic reviewed price correction",
      });
      const restricted = await inventoryDetail(db, staff.actor, reference);
      const previous = before.instructions[0]?.commercialTerms as {
        sellerPartyId: string;
        agreement: { documentVersionId: string };
      };
      if (!previous?.agreement?.documentVersionId)
        throw new Error("Missing synthetic seller evidence");
      await db.insert(schema.grants).values({
        principalId: staff.id,
        capability: "document.read_restricted",
        reason: "Synthetic price-correction fixture evidence access",
      });
      // Existing synthetic purpose-reviewed evidence is fixture context, never real consent.
      // Bind the replacement instruction to the new terms before publishing them.
      await recordSellerInstruction(db, {
        actor: staff.actor,
        operationId: randomUUID(),
        expectedRevision: restricted.listing.version,
        reference,
        input: {
          partyId: previous.sellerPartyId,
          documentVersionId: previous.agreement.documentVersionId,
          commissionTerms: "Synthetic replacement instruction, not real commercial authority",
          representationScope: "sale",
          agreedAt: new Date(Date.now() - 1000).toISOString(),
          publicationPermission: true,
          mediaUsageGranted: true,
          expiresAt: null,
        },
      });
      const current = await inventoryDetail(db, staff.actor, reference);
      await submitListingRevision(db, {
        actor: staff.actor,
        operationId: randomUUID(),
        expectedRevision: current.listing.version,
        reference,
        revisionId: frozen.outcome.revisionId,
      });
      const manifests = await publishForTest(db, staff.actor, {
        reference,
        listingId: before.listing.id,
        propertyId: before.property.id,
        revisionId: frozen.outcome.revisionId,
        factRevisionId: frozen.outcome.factRevisionId,
        assetIds: before.media.map((item) => item.asset.id),
      });
      console.log(JSON.stringify({ reference, revisionId: frozen.outcome.revisionId, manifests }));
    } else {
      const make = async (label: string) => {
        const title = `Synthetic native ${label} ${randomUUID()}`;
        const fixture = await db.transaction(async (tx) => {
          await tx.execute(
            sql`select pg_advisory_xact_lock(hashtextextended('discovery-synthetic-fixtures', 0))`,
          );
          const item = await createListingFixture(tx, {
            reviewerId: staff.id,
            title,
            description: "Synthetic property only; no real offer.",
            translations: { en: { title, description: "Synthetic property only; no real offer." } },
          });
          const number = randomBytes(6).readUIntBE(0, 6).toString();
          const reference = `MS-${number}`;
          await tx
            .update(schema.listings)
            .set({ reference })
            .where(eq(schema.listings.id, item.listingId));
          await tx
            .update(schema.properties)
            .set({ reference: `PR-2026-${number}` })
            .where(eq(schema.properties.id, item.propertyId));
          await tx
            .update(schema.sellerInstructions)
            .set({ reference: `SI-2026-${number}` })
            .where(eq(schema.sellerInstructions.listingId, item.listingId));
          return { ...item, reference };
        });
        await publishForTest(db, staff.actor, fixture, ["bg", "en"]);
        return { reference: fixture.reference, title };
      };
      console.log(JSON.stringify({ first: await make("first"), second: await make("second") }));
    }
  }
} finally {
  await connection.end();
}
