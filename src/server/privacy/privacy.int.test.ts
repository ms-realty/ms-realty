import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  caseStageHistory,
  cases,
  consentEvents,
  contactMethods,
  documents,
  documentVersions,
  parties,
  passkeys,
  privacyRequests,
  processPolicies,
  sessions,
  subscriptions,
  suspicionReports,
} from "@/db/schema";
import { createTestDatabase, type TestDatabase } from "@/db/test-utils";
import { createSession } from "../auth/sessions";
import { createContent, decideContent, readContentWorkbench } from "../content/commands";
import { createCase, createClient, createStaff } from "../testing";
import {
  changeSubscription,
  consentTerms,
  editSearchSubscription,
  eligibleSubscriptionRecipient,
  getPreferences,
  optIn,
  saveContactPreferences,
} from "./preferences";
import {
  clientPrivacyRequests,
  listStaffPrivacyRequests,
  reviewPrivacyRequest,
  submitPrivacyRequest,
} from "./requests";
import { syntheticServiceEmailTerms } from "./testing";

let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => {
  await t?.drop();
});
async function operator() {
  const person = await createStaff(t.db, {
    grants: [
      "privacy.manage",
      "content.edit",
      "listing.review_facts",
      "claim.approve",
      "publication.release",
    ].map((capability) => ({ capability: capability as "privacy.manage" })),
  });
  await t.db.insert(passkeys).values(
    [0, 1].map(() => ({
      principalId: person.id,
      credentialId: randomUUID(),
      publicKey: Buffer.from([1]),
      deviceType: "singleDevice",
      backedUp: false,
    })),
  );
  return { ...person, ...(await createSession(t.db, { kind: "staff", id: person.id })) };
}
async function client(verified = true) {
  const person = await createClient(t.db);
  const [contact] = await t.db
    .insert(contactMethods)
    .values({
      partyId: person.partyId,
      kind: "email",
      value: person.email,
      normalizedValue: person.email,
      verification: verified ? "verified" : "unverified",
      verifiedAt: verified ? new Date() : null,
    })
    .returning();
  if (!contact) throw new Error("Missing fixture contact");
  return { ...person, contact, ...(await createSession(t.db, { kind: "client", id: person.id })) };
}
const requestInput = () => ({
  operationId: randomUUID(),
  kind: "deletion",
  description: "Synthetic test request concerning my own data",
  confirmed: true,
});
function reviewInput(id: string, ownerId: string, expectedVersion: number, to: string) {
  return {
    operationId: randomUUID(),
    id,
    expectedVersion,
    to,
    responsibleId: ownerId,
    policyReference: "Synthetic approved policy reference; test only",
    dueAt: new Date(Date.now() + 86400000).toISOString(),
    identityReviewed: true,
    legalHoldReason: "",
    legalHoldDisposition: "Human reviewed applicable retention",
    holdResolved: false,
    completionEvidence: "Human reviewed completion evidence; test only",
    rejectionReason: "",
    confirmed: true,
  };
}
async function publishedTerms(actor: Awaited<ReturnType<typeof operator>>, slug: string) {
  const created = await createContent(t.db, actor.session, {
    operationId: randomUUID(),
    kind: "help",
    slug,
    title: "Синтетични условия само за тест",
    text: "Изрични синтетични условия за отделна цел. Не реална политика.",
    jurisdiction: "Synthetic test scope",
    reviewScope: "Integration fixture only",
  });
  for (const decision of ["claims", "editorial", "publish"] as const) {
    const { page } = await readContentWorkbench(t.db, actor.session, created.outcome.id);
    await decideContent(t.db, actor.session, {
      operationId: randomUUID(),
      id: page.id,
      expectedVersion: page.version,
      decision,
      note: "Explicit synthetic human approval",
      reviewed: true,
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
    });
  }
  return created.outcome.id;
}

describe("privacy requests remain owned, scoped human work", () => {
  it("receives exactly once, invents no deadline, isolates party history and requires fresh authorized review", async () => {
    const staff = await operator(),
      one = await client(),
      other = await client();
    const input = requestInput();
    const received = await submitPrivacyRequest(t.db, one.session, input);
    expect((await submitPrivacyRequest(t.db, one.session, input)).outcome).toEqual(
      received.outcome,
    );
    const own = await clientPrivacyRequests(t.db, one.session);
    expect(own).toHaveLength(1);
    expect(own[0]).toMatchObject({
      state: "received",
      dueAt: null,
      dueCondition: "awaiting_human_assessment",
    });
    expect(await clientPrivacyRequests(t.db, other.session)).toEqual([]);
    const [record] = await t.db
      .select()
      .from(privacyRequests)
      .where(eq(privacyRequests.id, received.outcome.id));
    if (!record?.responsibleId) throw new Error("Missing request owner");
    await expect(
      reviewPrivacyRequest(t.db, one.session, reviewInput(record.id, staff.id, 1, "verifying")),
    ).rejects.toMatchObject({ code: "not_found" });
    await reviewPrivacyRequest(t.db, staff.session, {
      ...reviewInput(record.id, staff.id, 1, "verifying"),
      dueAt: null,
      policyReference: "",
    });
    await expect(
      reviewPrivacyRequest(t.db, staff.session, {
        ...reviewInput(record.id, staff.id, 2, "in_progress"),
        dueAt: null,
        policyReference: "",
      }),
    ).rejects.toMatchObject({ code: "validation_failed" });
    await reviewPrivacyRequest(
      t.db,
      staff.session,
      reviewInput(record.id, staff.id, 2, "in_progress"),
    );
    await expect(
      reviewPrivacyRequest(t.db, staff.session, reviewInput(record.id, staff.id, 2, "completed")),
    ).rejects.toMatchObject({ code: "version_conflict" });
    await t.db
      .update(sessions)
      .set({ reverifiedAt: new Date(Date.now() - 3600000) })
      .where(eq(sessions.id, one.session.id));
    await expect(submitPrivacyRequest(t.db, one.session, input)).rejects.toMatchObject({
      code: "step_up_required",
    });
  });

  it("cannot release a current server retention hold; completion records evidence without deleting data or revealing restricted details", async () => {
    const staff = await operator(),
      person = await client();
    const request = await submitPrivacyRequest(t.db, person.session, requestInput());
    const id = request.outcome.id;
    await reviewPrivacyRequest(t.db, staff.session, reviewInput(id, staff.id, 1, "verifying"));
    await reviewPrivacyRequest(t.db, staff.session, reviewInput(id, staff.id, 2, "in_progress"));
    const caseId = await createCase(t.db, staff.id);
    const [doc] = await t.db
      .insert(documents)
      .values({
        reference: `DOC-TEST-${randomUUID()}`,
        caseId,
        purpose: "process_policy",
        classification: "contract",
      })
      .returning();
    if (!doc) throw new Error("Missing fixture document");
    const [file] = await t.db
      .insert(documentVersions)
      .values({
        documentId: doc.id,
        versionNumber: 1,
        fileName: "synthetic.pdf",
        contentType: "application/pdf",
        uploadedByKind: "staff",
        uploadedById: staff.id,
      })
      .returning();
    if (!file) throw new Error("Missing fixture version");
    const [policy] = await t.db
      .insert(processPolicies)
      .values({
        title: "Synthetic retention fixture",
        country: "BG",
        transaction: "sale",
        participantCategory: "unknown",
        documentVersionId: file.id,
        documentDigest: "test-only",
        items: [],
        withdrawalDays: 0,
        timezone: "Europe/Sofia",
        expressStartRequired: false,
        retentionDays: 1,
        professionalName: "Synthetic fixture",
        approvedById: staff.id,
        policyHash: "fixture-only",
        validUntil: new Date(Date.now() + 86400000),
      })
      .returning();
    if (!policy) throw new Error("Missing fixture policy");
    const [hold] = await t.db
      .insert(suspicionReports)
      .values({
        caseId,
        partyId: person.partyId,
        policyId: policy.id,
        note: "RESTRICTED TEST NOTE NEVER DISCLOSED",
        recordedById: staff.id,
        retainUntil: new Date(Date.now() + 86400000),
        operationId: request.operationId,
      })
      .returning();
    if (!hold) throw new Error("Missing fixture hold");
    await expect(
      reviewPrivacyRequest(t.db, staff.session, reviewInput(id, staff.id, 3, "completed")),
    ).rejects.toMatchObject({ code: "transition_denied" });
    await reviewPrivacyRequest(t.db, staff.session, {
      ...reviewInput(id, staff.id, 3, "on_legal_hold"),
      legalHoldReason: "Qualified assessment required",
    });
    await expect(
      reviewPrivacyRequest(t.db, staff.session, {
        ...reviewInput(id, staff.id, 4, "in_progress"),
        holdResolved: true,
      }),
    ).rejects.toMatchObject({ code: "transition_denied" });
    expect(JSON.stringify(await listStaffPrivacyRequests(t.db, staff.session))).not.toContain(
      "RESTRICTED TEST NOTE",
    );
    expect(JSON.stringify(await clientPrivacyRequests(t.db, person.session))).not.toContain(
      "Qualified assessment required",
    );
    await t.db
      .update(suspicionReports)
      .set({ retainUntil: new Date(Date.now() - 1000) })
      .where(eq(suspicionReports.id, hold.id));
    await expect(
      reviewPrivacyRequest(t.db, staff.session, reviewInput(id, staff.id, 4, "completed")),
    ).rejects.toMatchObject({ code: "transition_denied" });
    // Merely expiring a record does not finish an ongoing relationship's retention duty.
    await expect(
      reviewPrivacyRequest(t.db, staff.session, {
        ...reviewInput(id, staff.id, 4, "completed"),
        holdResolved: true,
      }),
    ).rejects.toMatchObject({ code: "transition_denied" });
    const [closed] = await t.db
      .update(cases)
      .set({
        disposition: "closed",
        closureOutcome: "Synthetic closed relationship",
        commitmentDispositions: [],
      })
      .where(eq(cases.id, caseId))
      .returning();
    if (!closed) throw new Error("Missing closed fixture Case");
    await t.db.insert(caseStageHistory).values({
      caseId,
      toStage: closed.stage,
      actorKind: "staff",
      actorId: staff.id,
      operationId: randomUUID(),
      occurredAt: new Date(Date.now() - 3 * 86400000),
      evidence: { kind: "disposition", toDisposition: "closed" },
    });
    // A late-recorded restriction still retains its own interval after an old closeout.
    await expect(
      reviewPrivacyRequest(t.db, staff.session, {
        ...reviewInput(id, staff.id, 4, "completed"),
        holdResolved: true,
      }),
    ).rejects.toMatchObject({ code: "transition_denied" });
    // Simulate genuinely aged evidence, rather than merely shortening retainUntil.
    await t.db
      .update(suspicionReports)
      .set({ createdAt: new Date(Date.now() - 3 * 86400000) })
      .where(eq(suspicionReports.id, hold.id));
    await reviewPrivacyRequest(t.db, staff.session, {
      ...reviewInput(id, staff.id, 4, "completed"),
      holdResolved: true,
    });
    expect((await clientPrivacyRequests(t.db, person.session))[0]?.state).toBe("completed");
    expect(await t.db.select().from(parties).where(eq(parties.id, person.partyId))).toHaveLength(1);
    expect(
      await t.db.select().from(contactMethods).where(eq(contactMethods.id, person.contact.id)),
    ).toHaveLength(1);
  });
});

describe("purpose-specific optional consent", () => {
  it("service preferences never imply optional consent and missing separate approved terms deny opt-in", async () => {
    const person = await client();
    await saveContactPreferences(t.db, person.session, {
      operationId: randomUUID(),
      expectedVersion: 1,
      locale: "bg",
      timezone: "Europe/Sofia",
      channel: "email",
      contactWindow: "Weekdays",
    });
    const preferences = await getPreferences(t.db, person.session, "bg");
    expect(preferences.party.version).toBe(2);
    expect(preferences.subscriptions).toEqual([]);
    expect(preferences.terms).toEqual({
      search_alerts: null,
      marketing: null,
      service_updates: null,
    });
    await expect(
      optIn(t.db, person.session, {
        operationId: randomUUID(),
        purpose: "search_alerts",
        contactMethodId: person.contact.id,
        locale: "bg",
        termsVersionId: randomUUID(),
        confirmed: true,
        timezone: "Europe/Sofia",
        search: { purpose: "sale" },
      }),
    ).rejects.toMatchObject({ code: "approval_stale" });
    expect(await t.db.select().from(consentEvents)).toEqual([]);
  });

  it("binds explicit consent to the exact published purpose version; pause, withdrawal and policy removal stop queued eligibility", async () => {
    const staff = await operator(),
      person = await client(),
      unverified = await client(false),
      other = await client();
    await publishedTerms(staff, "privacy");
    expect(await consentTerms(t.db, "search_alerts", "bg")).toBeNull();
    const pageId = await publishedTerms(staff, "search-alert-consent");
    const terms = await consentTerms(t.db, "search_alerts", "bg");
    if (!terms) throw new Error("Missing explicit approved test terms");
    const input = {
      operationId: randomUUID(),
      purpose: "search_alerts",
      contactMethodId: person.contact.id,
      locale: "bg",
      termsVersionId: terms.version.id,
      confirmed: true,
      timezone: "Europe/Sofia",
      search: {
        purpose: "sale",
        q: "Sandanski",
        propertyTypes: ["apartment"],
        price: { currency: "EUR", max: 20000000 },
      },
    };
    await expect(optIn(t.db, person.session, { ...input, confirmed: false })).rejects.toMatchObject(
      { code: "validation_failed" },
    );
    await expect(
      optIn(t.db, person.session, { ...input, operationId: randomUUID(), locale: "en" }),
    ).rejects.toMatchObject({ code: "approval_stale" });
    await expect(
      optIn(t.db, unverified.session, {
        ...input,
        operationId: randomUUID(),
        contactMethodId: unverified.contact.id,
      }),
    ).rejects.toMatchObject({ code: "validation_failed" });
    await expect(
      optIn(t.db, other.session, { ...input, operationId: randomUUID() }),
    ).rejects.toMatchObject({ code: "validation_failed" });
    const choice = await optIn(t.db, person.session, input);
    expect((await optIn(t.db, person.session, input)).outcome).toEqual(choice.outcome);
    expect(
      (await eligibleSubscriptionRecipient(t.db, choice.outcome.id, "search_alerts"))?.recipient,
    ).toBe(person.email);
    expect(await eligibleSubscriptionRecipient(t.db, choice.outcome.id, "marketing")).toBeNull();
    expect((await getPreferences(t.db, person.session, "bg")).subscriptions).toHaveLength(1);
    const transition = {
      operationId: randomUUID(),
      id: choice.outcome.id,
      expectedVersion: 1,
      state: "paused",
    };
    await expect(changeSubscription(t.db, other.session, transition)).rejects.toMatchObject({
      code: "not_found",
    });
    await changeSubscription(t.db, person.session, transition);
    expect(
      await eligibleSubscriptionRecipient(t.db, choice.outcome.id, "search_alerts"),
    ).toBeNull();
    await expect(
      changeSubscription(t.db, person.session, {
        ...transition,
        operationId: randomUUID(),
        state: "active",
      }),
    ).rejects.toMatchObject({ code: "version_conflict" });
    const edit = {
      operationId: randomUUID(),
      id: choice.outcome.id,
      expectedVersion: 2,
      locale: "bg",
      termsVersionId: terms.version.id,
      confirmed: true,
      timezone: "Europe/Sofia",
      frequency: "weekly",
      q: "Petrich",
      purpose: "sale",
      maxPrice: 15000000,
    };
    await expect(editSearchSubscription(t.db, other.session, edit)).rejects.toMatchObject({
      code: "not_found",
    });
    expect((await editSearchSubscription(t.db, person.session, edit)).outcome.state).toBe("paused");
    const [edited] = await t.db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.id, choice.outcome.id));
    expect(edited).toMatchObject({
      state: "paused",
      frequency: "weekly",
      criteria: {
        q: "Petrich",
        criteria: { propertyTypes: ["apartment"], price: { max: 15000000 } },
      },
    });
    expect(
      await eligibleSubscriptionRecipient(t.db, choice.outcome.id, "search_alerts"),
    ).toBeNull();
    await changeSubscription(t.db, person.session, {
      ...transition,
      operationId: randomUUID(),
      expectedVersion: 3,
      state: "active",
    });
    const { page } = await readContentWorkbench(t.db, staff.session, pageId);
    await decideContent(t.db, staff.session, {
      operationId: randomUUID(),
      id: pageId,
      expectedVersion: page.version,
      decision: "withdraw",
      reviewed: true,
      note: "Synthetic policy withdrawal",
    });
    expect(
      await eligibleSubscriptionRecipient(t.db, choice.outcome.id, "search_alerts"),
    ).toBeNull();
    await changeSubscription(t.db, person.session, {
      ...transition,
      operationId: randomUUID(),
      expectedVersion: 4,
      state: "paused",
    });
    await expect(
      changeSubscription(t.db, person.session, {
        ...transition,
        operationId: randomUUID(),
        expectedVersion: 5,
        state: "active",
      }),
    ).rejects.toMatchObject({ code: "approval_stale" });
    await changeSubscription(t.db, person.session, {
      ...transition,
      operationId: randomUUID(),
      expectedVersion: 5,
      state: "withdrawn",
    });
    expect(
      await eligibleSubscriptionRecipient(t.db, choice.outcome.id, "search_alerts"),
    ).toBeNull();
    const events = await t.db
      .select()
      .from(consentEvents)
      .where(eq(consentEvents.subscriptionId, choice.outcome.id));
    expect(events.map((event) => event.kind)).toEqual([
      "opted_in",
      "channel_verified",
      "paused",
      "criteria_changed",
      "resumed",
      "paused",
      "withdrawn",
    ]);
    expect(events.every((event) => event.policyVersion.startsWith(terms.version.id))).toBe(true);
    expect(
      await t.db.select().from(subscriptions).where(eq(subscriptions.purpose, "marketing")),
    ).toEqual([]);
  });
});

it("service email is an explicit verified purpose choice, independent of optional messages", async () => {
  const terms = await syntheticServiceEmailTerms(t.db),
    person = await client(),
    other = await client();
  const input = {
    operationId: randomUUID(),
    purpose: "service_updates",
    contactMethodId: person.contact.id,
    locale: "bg",
    termsVersionId: terms.version.id,
    confirmed: true,
    timezone: "Europe/Sofia",
  };
  await expect(optIn(t.db, other.session, input)).rejects.toMatchObject({
    code: "validation_failed",
  });
  await expect(optIn(t.db, person.session, { ...input, confirmed: false })).rejects.toMatchObject({
    code: "validation_failed",
  });
  const saved = await optIn(t.db, person.session, input);
  expect((await optIn(t.db, person.session, input)).outcome).toEqual(saved.outcome);
  const choices = (await getPreferences(t.db, person.session, "bg")).subscriptions;
  expect(choices).toHaveLength(1);
  expect(choices[0]?.purpose).toBe("service_updates");
  expect(await eligibleSubscriptionRecipient(t.db, saved.outcome.id, "marketing")).toBeNull();
  expect(
    await eligibleSubscriptionRecipient(t.db, saved.outcome.id, "service_updates"),
  ).not.toBeNull();
  expect(
    await t.db
      .select()
      .from(consentEvents)
      .where(eq(consentEvents.subscriptionId, saved.outcome.id)),
  ).toHaveLength(2);
  await changeSubscription(t.db, person.session, {
    operationId: randomUUID(),
    id: saved.outcome.id,
    expectedVersion: 1,
    state: "paused",
  });
  expect(await eligibleSubscriptionRecipient(t.db, saved.outcome.id, "service_updates")).toBeNull();
  await changeSubscription(t.db, person.session, {
    operationId: randomUUID(),
    id: saved.outcome.id,
    expectedVersion: 2,
    state: "active",
  });
  expect(
    await eligibleSubscriptionRecipient(t.db, saved.outcome.id, "service_updates"),
  ).not.toBeNull();
  await changeSubscription(t.db, person.session, {
    operationId: randomUUID(),
    id: saved.outcome.id,
    expectedVersion: 3,
    state: "withdrawn",
  });
  expect(await eligibleSubscriptionRecipient(t.db, saved.outcome.id, "service_updates")).toBeNull();
});
