// Synthetic browser fixtures only. No actual terms, publication policy or customer consent.
import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/db/schema";
import { formatListingReference } from "@/domain/ids";
import { createSession } from "../auth/sessions";
import { caseFixture } from "../cases/testing";
import { createContent, decideContent, readContentWorkbench } from "../content/commands";
import { readApprovedContent } from "../content/public";
import { createProperty, createStaff } from "../testing";
import { saveCaseReview } from "./reviews";

const url = process.env.E2E_DATABASE_URL;
if (!url || !/^\/msr_e2e_[a-f0-9]{32}$/.test(new URL(url).pathname))
  throw new Error("Disposable agency-obligations browser database required");
const connection = postgres(url, { max: 2, onnotice: () => {} }),
  db = drizzle(connection, { schema });
const future = () => new Date(Date.now() + 86400000).toISOString();
try {
  const staff = await createStaff(db, {
    roles: ["assigned_broker", "content_editor", "publishing_approver"],
    grants: ["compliance.review", "claim.approve", "document.review"].map((capability) => ({
      capability: capability as "claim.approve",
    })),
  });
  await db.insert(schema.passkeys).values({
    principalId: staff.id,
    credentialId: randomUUID(),
    publicKey: Buffer.from([1]),
    deviceType: "singleDevice",
    backedUp: false,
  });
  const issued = await createSession(db, { kind: "staff", id: staff.id });
  const f = await caseFixture(db, { ...staff, ...issued });
  await db.update(schema.cases).set({ stage: "completed" }).where(eq(schema.cases.id, f.record.id));
  await db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended('synthetic-b10-consent-policy', 0))`,
    );
    if (await readApprovedContent(tx, "help", "review-publication-consent", "bg")) return;
    const page = await createContent(tx, issued.session, {
      operationId: randomUUID(),
      kind: "help",
      slug: "review-publication-consent",
      title: "Синтетично съгласие за отзив",
      text: "Синтетични условия само за локален браузърен тест. Не са действителна политика.\n\nТестът свързва съгласието само с точния отзив, публично име и декларация за проверка.",
      jurisdiction: "Synthetic browser fixture",
      reviewScope: "Synthetic policy only, no real legal acceptance",
    });
    for (const decision of ["claims", "editorial", "publish"] as const) {
      const work = await readContentWorkbench(tx, issued.session, page.outcome.id);
      await decideContent(tx, issued.session, {
        id: page.outcome.id,
        operationId: randomUUID(),
        expectedVersion: work.page.version,
        decision,
        note: "Synthetic qualified browser-fixture review only",
        reviewed: true,
        expiresAt: future(),
      });
    }
  });
  const slug = `synthetic-review-${randomUUID()}`;
  const created = await createContent(db, issued.session, {
    operationId: randomUUID(),
    kind: "review",
    slug,
    title: "Отзив",
    text: "Синтетичен отзив от допустим автор по приключен случай.\n\nСинтетична проверка на точния автор, приключения случай и отделното съгласие.",
    jurisdiction: "Synthetic browser fixture",
    reviewScope: "Synthetic completed-Case review only",
  });
  await decideContent(db, issued.session, {
    id: created.outcome.id,
    operationId: randomUUID(),
    expectedVersion: 1,
    decision: "claims",
    note: "Synthetic exact Bulgarian wording review",
    reviewed: true,
    expiresAt: future(),
  });
  const content = await readContentWorkbench(db, issued.session, created.outcome.id);
  const review = await saveCaseReview(db, issued.session, {
    id: randomUUID(),
    operationId: randomUUID(),
    expectedVersion: 0,
    caseId: f.record.id,
    authorPartyId: f.client.partyId,
    contentPageVersionId: content.current.id,
    displayChoice: "anonymous",
    reviewed: true,
  });
  const propertyId = await createProperty(db);
  const [sequence] = await db
    .insert(schema.referenceSequences)
    .values({ kind: "listing", year: 0, lastValue: 1 })
    .onConflictDoUpdate({
      target: [schema.referenceSequences.kind, schema.referenceSequences.year],
      set: { lastValue: sql`${schema.referenceSequences.lastValue} + 1` },
    })
    .returning({ value: schema.referenceSequences.lastValue });
  if (!sequence) throw new Error("Missing synthetic listing reference");
  const [listing] = await db
    .insert(schema.listings)
    .values({ reference: formatListingReference(sequence.value), propertyId, purpose: "sale" })
    .returning();
  if (!listing) throw new Error("Missing synthetic photography listing");
  await db.insert(schema.servicePolicies).values({
    effectiveFrom: new Date(Date.now() - 1000),
    timezone: "Europe/Sofia",
    serviceHours: Object.fromEntries(
      ["mon", "tue", "wed", "thu", "fri", "sat", "sun"].map((day) => [day, ["09:00", "18:00"]]),
    ),
    coverage: {},
    responsePolicy: {},
    approvedById: staff.id,
  });
  console.log(
    JSON.stringify({
      staffToken: issued.token,
      staffId: staff.id,
      clientToken: f.client.token,
      clientId: f.client.id,
      partyId: f.client.partyId,
      caseId: f.record.id,
      reviewId: review.outcome.id,
      contentPageId: created.outcome.id,
      contentVersionId: content.current.id,
      reviewSlug: slug,
      listingId: listing.id,
      listingReference: listing.reference,
    }),
  );
} finally {
  await connection.end();
}
