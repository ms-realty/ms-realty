// Synthetic reviewed inventory and explicit seller identity. Owner approvals use the real command.
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { inquiries, principals, properties, sellerInstructions, tasks } from "@/db/schema";
import { firstPartyIssuers } from "@/domain/records";
import { createSession } from "../auth/sessions";
import type { Executor } from "../db";
import { approveFactRevision, approveListingRevision } from "../publication/commands";
import { createListingFixture, listingVersion } from "../publication/testing";
import { createCaseFromInquiry } from "./commands";
import { staffFixture } from "./testing";
export async function ownerFixture(db: Executor) {
  const staff = await staffFixture(db),
    listing = await createListingFixture(db, { reviewerId: staff.id });
  const [property] = await db
    .select()
    .from(properties)
    .where(eq(properties.id, listing.propertyId));
  if (!property) throw new Error("Missing synthetic property");
  await approveFactRevision(db, {
    actor: staff.actor,
    operationId: randomUUID(),
    expectedRevision: property.version,
    factRevisionId: listing.factRevisionId,
    scope: "Synthetic source factual review",
  });
  await approveListingRevision(db, {
    actor: staff.actor,
    operationId: randomUUID(),
    expectedRevision: (await listingVersion(db, listing.listingId)).version,
    reference: listing.reference,
    revisionId: listing.revisionId,
  });
  const [instruction] = await db
    .select()
    .from(sellerInstructions)
    .where(eq(sellerInstructions.listingId, listing.listingId));
  if (!instruction) throw new Error("Missing instruction fixture");
  const partyId = (instruction.commercialTerms as { sellerPartyId: string }).sellerPartyId;
  const [principal] = await db
    .insert(principals)
    .values({
      partyId,
      kind: "client",
      issuer: firstPartyIssuers.client,
      subject: randomUUID(),
      email: `${randomUUID()}@example.test`,
      displayName: "Synthetic property owner",
    })
    .returning();
  if (!principal) throw new Error("Missing owner account");
  const client = {
    ...principal,
    ...(await createSession(db, { kind: "client", id: principal.id })),
  };
  const [inquiry] = await db
    .insert(inquiries)
    .values({
      reference: `RQ-OWNER-${randomUUID()}`,
      source: "website",
      state: "assigned",
      purpose: "question",
      submissionKey: randomUUID(),
      payloadDigest: "synthetic-owner-intake",
      partyId,
      ownerId: staff.id,
      preferredLocale: "en",
    })
    .returning();
  if (!inquiry) throw new Error("Missing owner inquiry");
  await db.insert(tasks).values({
    inquiryId: inquiry.id,
    ownerId: staff.id,
    type: "fact_verification",
    title: "Verify seller property preparation",
    dueAt: new Date(Date.now() + 86400000),
  });
  const created = await createCaseFromInquiry(db, staff.session, {
    id: inquiry.id,
    operationId: randomUUID(),
    expectedVersion: 1,
    kind: "seller",
    title: "Synthetic seller case",
    requirements: "Owner requires exact preview before marketing",
    preferences: "No exact street address in public copy",
    nextAction: "Bind reviewed seller instructions",
    dueAt: new Date(Date.now() + 86400000).toISOString(),
  });
  return { staff, client, listing, instruction, record: created.outcome };
}
