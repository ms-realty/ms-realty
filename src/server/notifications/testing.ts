// Synthetic Deal with a requested viewing, a published current listing, an approved service-hours
// policy and (optionally) a verified service-email choice for the client. Tests and the browser
// seed only.
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import type { PublicLocale } from "@/config/tenant";
import { contactMethods, listings, parties, servicePolicies, subscriptions } from "@/db/schema";
import { requestAppointment } from "../appointments/service";
import { addInterest, respondToInterest } from "../cases/commands";
import { caseFixture, reviewedCandidateFixture } from "../cases/testing";
import type { Executor } from "../db";
import { consentPolicyKey } from "../privacy/preferences";
import { syntheticServiceEmailTerms } from "../privacy/testing";
import { createListingFixture, publishForTest } from "../publication/testing";

export async function serviceEmailChoice(db: Executor, partyId: string, address?: string) {
  const terms = await syntheticServiceEmailTerms(db);
  const value = address ?? `notice-${randomUUID()}@example.test`;
  const [contact] = await db
    .insert(contactMethods)
    .values({
      partyId,
      kind: "email",
      value,
      normalizedValue: value.toLowerCase(),
      verification: "verified",
      verifiedAt: new Date(),
    })
    .returning();
  if (!contact) throw new Error("No contact fixture");
  const [subscription] = await db
    .insert(subscriptions)
    .values({
      partyId,
      contactMethodId: contact.id,
      purpose: "service_updates",
      state: "active",
      verifiedAt: new Date(),
      timezone: "Europe/Sofia",
      policyVersion: consentPolicyKey(terms),
      unsubscribeTokenHash: randomUUID(),
    })
    .returning();
  if (!subscription) throw new Error("No subscription fixture");
  return { contact, subscription, address: value };
}

export async function servicePolicyFixture(db: Executor, staffId: string) {
  await db.insert(servicePolicies).values({
    effectiveFrom: new Date(Date.now() - 1000),
    timezone: "Europe/Sofia",
    serviceHours: Object.fromEntries(
      ["mon", "tue", "wed", "thu", "fri", "sat", "sun"].map((day) => [day, ["09:00", "18:00"]]),
    ),
    coverage: {},
    responsePolicy: {},
    approvedById: staffId,
  });
}

export async function viewingFixture(
  db: Executor,
  options: { locale?: PublicLocale; subscribed?: boolean } = {},
) {
  const f = await caseFixture(db);
  const listing = await createListingFixture(db, { reviewerId: f.staff.id });
  await publishForTest(db, f.staff.actor, listing);
  await db
    .update(listings)
    .set({ freshnessState: "current_under_policy", reviewDueAt: new Date(Date.now() + 86400000) })
    .where(eq(listings.id, listing.listingId));
  const matchReview = await reviewedCandidateFixture(db, f, listing.reference);
  const interest = await addInterest(db, f.staff.session, {
    id: f.record.id,
    operationId: randomUUID(),
    expectedVersion: 1,
    reference: listing.reference,
    explanation: "Synthetic reviewed option, pending client feedback",
    matchReview,
  });
  await respondToInterest(db, f.client.session, {
    id: interest.outcome.interestId,
    operationId: randomUUID(),
    expectedVersion: 1,
    state: "shortlisted",
    reason: "Would like to consider this option",
  });
  const request = await requestAppointment(db, f.client.session, {
    id: f.record.id,
    operationId: randomUUID(),
    expectedVersion: 2,
    interestId: interest.outcome.interestId,
    preferredWindow: "A weekday morning",
  });
  await servicePolicyFixture(db, f.staff.id);
  if (options.locale)
    await db
      .update(parties)
      .set({ preferredLocale: options.locale })
      .where(eq(parties.id, f.client.partyId));
  const email =
    options.subscribed === false ? null : await serviceEmailChoice(db, f.client.partyId);
  return {
    ...f,
    listing,
    interestId: interest.outcome.interestId,
    request: request.outcome,
    email,
  };
}

/** A future Sofia slot, next year, as the arrangement form submits it. */
export function viewingSlot(day = 15, hour = 10) {
  const year = new Date().getUTCFullYear() + 1;
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    startsAt: `${year}-01-${pad(day)}T${pad(hour)}:00+02:00`,
    endsAt: `${year}-01-${pad(day)}T${pad(hour + 1)}:00+02:00`,
  };
}
