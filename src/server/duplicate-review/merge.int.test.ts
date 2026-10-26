import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  activityEvents,
  auditEvents,
  caseParticipants,
  cases,
  consentEvents,
  contactMethods,
  documents,
  externalActions,
  grants,
  inquiries,
  listings,
  mergeRecords,
  operations,
  outboxEvents,
  parties,
  passkeys,
  principals,
  privacyExports,
  privacyProcessingRestrictions,
  privacyPropagationEvents,
  privacyRequests,
  privacySafetyDecisions,
  properties,
  propertyFactRevisions,
  propertyFacts,
  sessions,
  subscriptions,
} from "@/db/schema";
import { createTestDatabase, type TestDatabase } from "@/db/test-utils";
import { createSession } from "@/server/auth/sessions";
import { can, resolveGrants } from "@/server/authz";
import { staffFixture } from "@/server/cases/testing";
import { hashRequest } from "@/server/crypto";
import {
  appendPrivacySafetyDecision,
  recordPrivacyPropagation,
} from "@/server/privacy/safety-ledger";
import { createStaff } from "@/server/testing";
import { readContact } from "@/server/work/queries";
import { issueFormOperation } from "@/ui/form/server";
import { type DuplicatePair, listDuplicateSources, readCanonicalDuplicate } from "./impact";
import {
  duplicateOperationScope,
  duplicateOperationStatus,
  mergeDuplicate,
  previewDuplicateMerge,
  previewDuplicateReversal,
  readDuplicateReceipt,
  reverseDuplicate,
} from "./merge";
import { reviewContactFixture } from "./testing";

let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => {
  await t?.drop();
});
async function operator() {
  const staff = await staffFixture(t.db);
  await t.db.insert(grants).values(
    ["import.run", "access.grant", "audit.read", "privacy.manage"].map((capability) => ({
      principalId: staff.id,
      capability: capability as "import.run" | "access.grant" | "audit.read" | "privacy.manage",
      reason: "Synthetic identity reviewer",
    })),
  );
  return staff;
}
async function fixture() {
  const staff = await operator(),
    left = await reviewContactFixture(t.db, "Synthetic identity A"),
    right = await reviewContactFixture(t.db, "Synthetic identity A source B");
  const pair: DuplicatePair = { subject: "party", left: left.party.id, right: right.party.id };
  return { staff, left, right, pair };
}
async function inputFor(f: { staff: Awaited<ReturnType<typeof operator>>; pair: DuplicatePair }) {
  const preview = await previewDuplicateMerge(t.db, f.staff.session, f.pair);
  return {
    ...f.pair,
    leftVersion: preview.left.version,
    rightVersion: preview.right.version,
    impactDigest: preview.digest,
    survivor: f.pair.left,
    aliasMap: [{ aliasId: f.pair.right, canonicalId: f.pair.left }],
    operationId: issueFormOperation(duplicateOperationScope(f.staff.id, "merge", f.pair)),
    reason: "Human reviewed the independent source records and confirmed this identity grouping",
    reviewed: true,
  };
}
async function reverseInput(f: Awaited<ReturnType<typeof fixture>>, mergeId: string) {
  const preview = await previewDuplicateReversal(t.db, f.staff.session, mergeId);
  return {
    mergeId,
    leftVersion: preview.impact.left.version,
    rightVersion: preview.impact.right.version,
    impactDigest: preview.impact.digest,
    operationId: issueFormOperation(
      duplicateOperationScope(f.staff.id, "reverse", f.pair, mergeId),
    ),
    reason: "Human reviewed the preserved source relationships and requests separate identities",
    reviewed: true,
  };
}
async function scopedStaff(readIds: string[], mergeIds: string[] = []) {
  const staff = await createStaff(t.db, {
    grants: [
      ...readIds.map((recordId) => ({
        capability: "inquiry.read" as const,
        recordType: "inquiry",
        recordId,
      })),
      ...mergeIds.map((recordId) => ({
        capability: "import.run" as const,
        recordType: "party",
        recordId,
      })),
    ],
  });
  await t.db.insert(passkeys).values(
    [0, 1].map(() => ({
      principalId: staff.id,
      credentialId: randomUUID(),
      publicKey: Buffer.from([1]),
      deviceType: "singleDevice",
      backedUp: false,
    })),
  );
  return { ...staff, ...(await createSession(t.db, { kind: "staff", id: staff.id })) };
}

async function retainedPrivacy(f: Awaited<ReturnType<typeof fixture>>, restrictions = true) {
  const [client] = await t.db
    .insert(principals)
    .values({
      kind: "client",
      issuer: "urn:ms-realty:client",
      subject: randomUUID(),
      partyId: f.right.party.id,
      email: `${randomUUID()}@example.test`,
      displayName: "Synthetic original recipient",
    })
    .returning();
  const [request] = await t.db
    .insert(privacyRequests)
    .values({
      reference: `PR-RETAINED-${randomUUID()}`,
      kind: "export",
      state: "completed",
      partyId: f.right.party.id,
      responsibleId: f.staff.id,
      verifiedAt: new Date(),
      completedAt: new Date(),
      completionEvidence: "Synthetic completed source-specific export",
      legalHoldDisposition: "Synthetic retained history only",
    })
    .returning();
  if (!client || !request) throw new Error("Missing synthetic privacy subject");
  const [exported] = await t.db
    .insert(privacyExports)
    .values({
      requestId: request.id,
      requestVersion: request.version,
      partyId: f.right.party.id,
      recipientId: client.id,
      state: "issued",
      encryptedPayload: "SYNTHETIC_PRIVATE_EXPORT_NEVER_PROJECT",
      encryptedReview: "SYNTHETIC_PRIVATE_REVIEW_NEVER_PROJECT",
      sha256: "a".repeat(64),
      reviewSha256: "b".repeat(64),
      byteSize: 1,
      coverageComplete: true,
      preparedById: f.staff.id,
      reviewedById: f.staff.id,
      reviewedAt: new Date(),
      expiresAt: new Date(Date.now() + 3600000),
      issuedOperationId: randomUUID(),
      completedOperationId: randomUUID(),
    })
    .returning();
  const [subscription] = await t.db
    .insert(subscriptions)
    .values({
      partyId: f.right.party.id,
      contactMethodId: f.right.method.id,
      purpose: "marketing",
      state: "withdrawn",
      timezone: "Europe/Sofia",
      policyVersion: "synthetic-retained-consent",
      unsubscribeTokenHash: randomUUID(),
    })
    .returning();
  if (!exported || !subscription) throw new Error("Missing synthetic retained privacy history");
  await t.db.insert(consentEvents).values({
    subscriptionId: subscription.id,
    kind: "withdrawn",
    policyVersion: subscription.policyVersion,
    source: "Synthetic original consent source",
    actorKind: "client",
    actorId: client.id,
  });
  const append = () =>
    appendPrivacySafetyDecision(t.db, {
      operationId: randomUUID(),
      partyId: f.right.party.id,
      requestId: request.id,
      requestHash: hashRequest({ synthetic: randomUUID() }),
      review: { note: "SYNTHETIC_PRIVATE_DECISION_NEVER_PROJECT" },
      effect: {
        kind: "subscription_withdrawal_v1",
        partyId: f.right.party.id,
        subscriptionIds: [subscription.id],
      },
    });
  const decision = await append();
  await recordPrivacyPropagation(t.db, decision.sequence, "application", "applied", {
    note: "SYNTHETIC_PRIVATE_PROPAGATION_NEVER_PROJECT",
  });
  if (restrictions)
    await t.db.insert(privacyProcessingRestrictions).values(
      ["marketing", "search_alerts"].map((purpose) => ({
        partyId: f.right.party.id,
        purpose,
        decisionSequence: decision.sequence,
      })),
    );
  return { client, request, exported, subscription, decision, append };
}

async function privacySourceSnapshot() {
  return {
    principals: await t.db.select().from(principals),
    contacts: await t.db.select().from(contactMethods),
    grants: await t.db.select().from(grants),
    subscriptions: await t.db.select().from(subscriptions),
    consent: await t.db.select().from(consentEvents),
    requests: await t.db.select().from(privacyRequests),
    exports: await t.db.select().from(privacyExports),
    decisions: await t.db.select().from(privacySafetyDecisions),
    restrictions: await t.db.select().from(privacyProcessingRestrictions),
    propagation: await t.db.select().from(privacyPropagationEvents),
  };
}

describe("O27/F32/AT56/UX22 human identity merge and safe split", () => {
  it("retains completed exports, consent and composite-key restrictions under one opaque pair boundary through merge and split", async () => {
    const f = await fixture(),
      history = await retainedPrivacy(f),
      before = await privacySourceSnapshot(),
      preview = await previewDuplicateMerge(t.db, f.staff.session, f.pair);
    expect(preview.held).toEqual([]);
    const boundaries = preview.references.filter((row) => row.table === "privacy_history");
    expect(boundaries).toHaveLength(1);
    expect(boundaries[0]).toMatchObject({
      sources: [f.pair.left, f.pair.right].sort(),
      audience: {},
    });
    expect((await previewDuplicateMerge(t.db, f.staff.session, f.pair)).digest).toBe(
      preview.digest,
    );
    for (const hidden of [
      history.exported.id,
      history.decision.id,
      history.decision.digest,
      "SYNTHETIC_PRIVATE_EXPORT_NEVER_PROJECT",
      "SYNTHETIC_PRIVATE_REVIEW_NEVER_PROJECT",
      "SYNTHETIC_PRIVATE_DECISION_NEVER_PROJECT",
      "SYNTHETIC_PRIVATE_PROPAGATION_NEVER_PROJECT",
    ])
      expect(JSON.stringify(preview)).not.toContain(hidden);
    const done = await mergeDuplicate(t.db, f.staff.session, await inputFor(f));
    expect(await privacySourceSnapshot()).toEqual(before);
    await reverseDuplicate(t.db, f.staff.session, await reverseInput(f, done.outcome.mergeId));
    expect(await privacySourceSnapshot()).toEqual(before);
    expect(done.outcome.permissionChanges).toEqual([]);
  });

  it("holds restricted client identities and hides all new privacy source identities from an unauthorized reviewer", async () => {
    const f = await fixture(),
      history = await retainedPrivacy(f),
      reviewer = await scopedStaff(
        [f.left.inquiry.id, f.right.inquiry.id],
        [f.left.party.id, f.right.party.id],
      );
    await t.db.insert(privacyProcessingRestrictions).values({
      partyId: f.right.party.id,
      purpose: "client_access",
      decisionSequence: history.decision.sequence,
    });
    const hidden = await previewDuplicateMerge(t.db, reviewer.session, f.pair);
    expect(hidden.held).toContain("restricted");
    expect(hidden.held).not.toContain("privacy_restriction");
    expect(hidden.references.some((row) => row.table.startsWith("privacy_"))).toBe(false);
    for (const privateValue of [history.exported.id, history.request.id, history.decision.id])
      expect(JSON.stringify(hidden)).not.toContain(privateValue);
    await expect(mergeDuplicate(t.db, reviewer.session, await inputFor(f))).rejects.toMatchObject({
      code: "not_found",
    });
    const authorized = await previewDuplicateMerge(t.db, f.staff.session, f.pair);
    expect(authorized.held).toEqual(["privacy_restriction"]);
    await expect(mergeDuplicate(t.db, f.staff.session, await inputFor(f))).rejects.toMatchObject({
      code: "transition_denied",
    });
  });

  it.each(["decision", "restriction", "propagation", "export"] as const)(
    "fences a new %s in stale merge review and subsequent automatic split",
    async (change) => {
      const f = await fixture(),
        history = await retainedPrivacy(f, false),
        input = await inputFor(f);
      const mutate = async (afterMerge: boolean) => {
        if (change === "decision") await history.append();
        if (change === "restriction")
          await t.db.insert(privacyProcessingRestrictions).values({
            partyId: f.right.party.id,
            purpose: afterMerge ? "search_alerts" : "marketing",
            decisionSequence: history.decision.sequence,
          });
        if (change === "propagation")
          await recordPrivacyPropagation(t.db, history.decision.sequence, "provider_data", "held", {
            synthetic: randomUUID(),
          });
        if (change === "export")
          await t.db
            .update(privacyExports)
            .set({ version: sql`${privacyExports.version} + 1`, updatedAt: new Date() })
            .where(eq(privacyExports.id, history.exported.id));
      };
      await mutate(false);
      await expect(mergeDuplicate(t.db, f.staff.session, input)).rejects.toMatchObject({
        code: "version_conflict",
      });
      const done = await mergeDuplicate(t.db, f.staff.session, await inputFor(f));
      await mutate(true);
      expect(
        (await previewDuplicateReversal(t.db, f.staff.session, done.outcome.mergeId)).impact.held,
      ).toContain("changed_after_merge");
      await expect(
        reverseDuplicate(t.db, f.staff.session, await reverseInput(f, done.outcome.mergeId)),
      ).rejects.toMatchObject({ code: "transition_denied" });
    },
  );

  it("rechecks live privacy authority and fresh verification before disclosing or replaying retained history", async () => {
    const f = await fixture();
    await retainedPrivacy(f);
    await t.db
      .update(sessions)
      .set({ reverifiedAt: null })
      .where(eq(sessions.id, f.staff.session.id));
    const stale = await previewDuplicateMerge(t.db, f.staff.session, f.pair);
    expect(stale.held).toContain("restricted");
    expect(stale.references.some((row) => row.table.startsWith("privacy_"))).toBe(false);
    await t.db
      .update(sessions)
      .set({ reverifiedAt: new Date() })
      .where(eq(sessions.id, f.staff.session.id));
    const input = await inputFor(f),
      done = await mergeDuplicate(t.db, f.staff.session, input);
    await t.db
      .update(grants)
      .set({ revokedAt: new Date() })
      .where(and(eq(grants.principalId, f.staff.id), eq(grants.capability, "privacy.manage")));
    await expect(mergeDuplicate(t.db, f.staff.session, input)).rejects.toMatchObject({
      code: "not_found",
    });
    await expect(
      readDuplicateReceipt(t.db, f.staff.session, done.operationId),
    ).rejects.toMatchObject({
      code: "not_found",
    });
    await expect(
      previewDuplicateReversal(t.db, f.staff.session, done.outcome.mergeId),
    ).rejects.toMatchObject({ code: "not_found" });
  });

  it("holds an oversized declared privacy history without exposing a partial row inventory", async () => {
    const f = await fixture(),
      history = await retainedPrivacy(f);
    const added = await t.db
      .insert(privacyPropagationEvents)
      .values(
        Array.from({ length: 500 }, () => ({
          decisionSequence: history.decision.sequence,
          boundary: "provider_data",
          state: "held",
          evidence: { synthetic: "SYNTHETIC_BOUNDED_EVIDENCE_NEVER_PROJECT" },
        })),
      )
      .returning({ id: privacyPropagationEvents.id });
    const preview = await previewDuplicateMerge(t.db, f.staff.session, f.pair);
    expect(preview.held).toEqual(["too_many"]);
    expect(preview.references.some((row) => row.table === "privacy_history")).toBe(false);
    expect(JSON.stringify(preview)).not.toContain(added[0]?.id);
    expect(JSON.stringify(preview)).not.toContain("SYNTHETIC_BOUNDED_EVIDENCE_NEVER_PROJECT");
    await expect(mergeDuplicate(t.db, f.staff.session, await inputFor(f))).rejects.toMatchObject({
      code: "transition_denied",
    });
  });

  it("paginates source selection after applying current independent read and merge scopes", async () => {
    const f = await fixture(),
      staff = await scopedStaff(
        [f.left.inquiry.id, f.right.inquiry.id],
        [f.left.party.id, f.right.party.id],
      );
    const selected = await listDuplicateSources(t.db, staff.session, "party");
    expect(selected.rows.map((row) => row.id).sort()).toEqual(
      [f.left.party.id, f.right.party.id].sort(),
    );
    expect(selected.nextCursor).toBeNull();
    await t.db
      .update(grants)
      .set({ revokedAt: new Date() })
      .where(and(eq(grants.principalId, staff.id), eq(grants.recordId, f.right.inquiry.id)));
    expect(
      (await listDuplicateSources(t.db, staff.session, "party")).rows.map((row) => row.id),
    ).toEqual([f.left.party.id]);
    const propertyRows = await t.db
      .insert(properties)
      .values(
        Array.from({ length: 52 }, () => ({
          reference: `PROP-PAGE-${randomUUID()}`,
          propertyType: "apartment" as const,
          country: "BG",
          region: "Synthetic region",
          settlement: "Sandanski",
        })),
      )
      .returning();
    await t.db.insert(grants).values([
      {
        principalId: staff.id,
        capability: "import.run",
        recordType: "property",
        reason: "Synthetic property-only review scope",
      },
      {
        principalId: staff.id,
        capability: "listing.read",
        recordType: "property",
        reason: "Synthetic property-only read scope",
      },
    ]);
    const found = new Set<string>();
    let cursor: string | undefined;
    for (let page = 0; page < 10; page++) {
      const current = await listDuplicateSources(t.db, staff.session, "property", cursor);
      expect(current.rows.length).toBeLessThanOrEqual(50);
      for (const row of current.rows) {
        expect(found.has(row.id)).toBe(false);
        found.add(row.id);
      }
      if (!current.nextCursor) break;
      cursor = current.nextCursor;
    }
    expect(propertyRows.every((row) => found.has(row.id))).toBe(true);
    await expect(
      listDuplicateSources(t.db, staff.session, "party", "forged-cursor"),
    ).rejects.toMatchObject({ code: "not_found" });
  });
  it("merges once, retains aliases and source/provider/receipt references, then reverses once with history", async () => {
    const f = await fixture();
    await t.db
      .update(parties)
      .set({ matchingAliases: ["Synthetic private source spelling"] })
      .where(eq(parties.id, f.right.party.id));
    await t.db.insert(externalActions).values({
      kind: "email_send",
      effectKey: randomUUID(),
      subjectType: "party",
      subjectId: f.right.party.id,
      payload: {},
      payloadDigest: "synthetic",
      state: "queued",
      provider: "synthetic",
      providerReference: "source-owned-reference",
    });
    const sourceContacts = await t.db.select().from(contactMethods),
      sourceInquiries = await t.db.select().from(inquiries),
      sourceProviders = await t.db.select().from(externalActions),
      sourceGrants = await t.db.select().from(grants);
    const input = await inputFor(f);
    const done = await mergeDuplicate(t.db, f.staff.session, input);
    expect(done.outcome.aliasMap).toEqual(input.aliasMap);
    expect(await mergeDuplicate(t.db, f.staff.session, input)).toEqual({ ...done, replayed: true });
    expect(
      await t.db.select().from(mergeRecords).where(eq(mergeRecords.id, done.outcome.mergeId)),
    ).toHaveLength(1);
    const [alias] = await t.db.select().from(parties).where(eq(parties.id, f.right.party.id));
    expect(alias).toMatchObject({
      mergedIntoPartyId: f.left.party.id,
      matchingAliases: ["Synthetic private source spelling"],
    });
    expect(
      (await readCanonicalDuplicate(t.db, f.staff.session, "party", f.right.party.id)).canonical.id,
    ).toBe(f.left.party.id);
    expect(
      (await readCanonicalDuplicate(t.db, f.staff.session, "party", f.left.party.id)).aliases.map(
        (a) => a.id,
      ),
    ).toEqual([f.right.party.id]);
    expect((await readDuplicateReceipt(t.db, f.staff.session, done.operationId)).receipt).toEqual(
      done.outcome,
    );
    for (const table of [activityEvents, auditEvents, outboxEvents])
      expect(
        await t.db.select().from(table).where(eq(table.operationId, done.operationId)),
      ).toHaveLength(2);
    const reversedInput = await reverseInput(f, done.outcome.mergeId);
    const reversed = await reverseDuplicate(t.db, f.staff.session, reversedInput);
    expect(await reverseDuplicate(t.db, f.staff.session, reversedInput)).toEqual({
      ...reversed,
      replayed: true,
    });
    expect(
      (await readCanonicalDuplicate(t.db, f.staff.session, "party", f.right.party.id)).canonical.id,
    ).toBe(f.right.party.id);
    const [history] = await t.db
      .select()
      .from(mergeRecords)
      .where(eq(mergeRecords.id, done.outcome.mergeId));
    expect(history?.reversedById).toBe(f.staff.id);
    expect(await t.db.select().from(contactMethods)).toEqual(sourceContacts);
    expect(await t.db.select().from(inquiries)).toEqual(sourceInquiries);
    expect(await t.db.select().from(externalActions)).toEqual(sourceProviders);
    expect(await t.db.select().from(grants)).toEqual(sourceGrants);
    await expect(
      mergeDuplicate(t.db, f.staff.session, {
        ...input,
        reason: "Changed identity rationale with the same key",
      }),
    ).rejects.toMatchObject({ code: "idempotency_key_reused" });
  });

  it("never collapses authentication, case/document audiences or source-only contact visibility", async () => {
    const f = await fixture();
    const clients = [];
    for (const source of [f.left, f.right]) {
      const [principal] = await t.db
        .insert(principals)
        .values({
          kind: "client",
          issuer: "urn:ms-realty:client",
          subject: randomUUID(),
          partyId: source.party.id,
          email: `${randomUUID()}@example.test`,
          displayName: "Synthetic client",
        })
        .returning();
      const [record] = await t.db
        .insert(cases)
        .values({
          reference: `CASE-${randomUUID()}`,
          kind: "buyer",
          stage: "needs_agreed",
          title: "Synthetic private case",
          ownerId: f.staff.id,
          nextAction: "Review the preserved source evidence",
        })
        .returning();
      if (!principal || !record) throw new Error("Missing isolated audience fixture");
      await t.db
        .insert(caseParticipants)
        .values({ caseId: record.id, partyId: source.party.id, role: "buyer" });
      await t.db.insert(documents).values({
        reference: `DOC-${randomUUID()}`,
        caseId: record.id,
        purpose: "Synthetic private source",
        classification: "other",
        audience: "case_participants",
      });
      clients.push({ principal, record, actor: { kind: "client" as const, id: principal.id } });
    }
    await t.db
      .update(parties)
      .set({ matchingAliases: ["Synthetic source B private name"] })
      .where(eq(parties.id, f.right.party.id));
    const onlyLeft = await scopedStaff([f.left.inquiry.id]),
      onlyRight = await scopedStaff([f.right.inquiry.id]);
    const before = await readContact(t.db, onlyLeft.session, f.left.party.id),
      beforePrincipals = await t.db.select().from(principals),
      beforeAudiences = await t.db.select().from(caseParticipants),
      beforeDocs = await t.db.select().from(documents),
      beforeGrants = await Promise.all(clients.map((client) => resolveGrants(t.db, client.actor)));
    const done = await mergeDuplicate(t.db, f.staff.session, await inputFor(f));
    const after = await readContact(t.db, onlyLeft.session, f.left.party.id);
    expect(after.methods).toEqual(before.methods);
    expect(after.inquiries).toEqual(before.inquiries);
    expect(after.party.matchingAliases).toEqual(before.party.matchingAliases);
    const visible = await readCanonicalDuplicate(t.db, onlyLeft.session, "party", f.left.party.id);
    expect(visible.aliases).toEqual([]);
    expect(JSON.stringify(visible)).not.toContain("Synthetic source B private name");
    expect((await readContact(t.db, onlyRight.session, f.right.party.id)).party.id).toBe(
      f.right.party.id,
    );
    await expect(
      readCanonicalDuplicate(t.db, onlyRight.session, "party", f.right.party.id),
    ).rejects.toMatchObject({ code: "not_found" });
    for (let index = 0; index < clients.length; index++) {
      const current = clients[index],
        other = clients[1 - index];
      if (!current || !other) throw new Error("Missing isolated audience pair");
      expect(await resolveGrants(t.db, current.actor)).toEqual(beforeGrants[index]);
      expect(
        await can(t.db, current.actor, "portal.case.read", {
          type: "case",
          id: other.record.id,
        }),
      ).toBe(false);
    }
    expect(await t.db.select().from(principals)).toEqual(beforePrincipals);
    expect(await t.db.select().from(caseParticipants)).toEqual(beforeAudiences);
    expect(await t.db.select().from(documents)).toEqual(beforeDocs);
    expect(done.outcome.permissionChanges).toEqual([]);
  });

  it("requires both independent consequential scopes and every source dependency's current read scope", async () => {
    const f = await fixture();
    const input = await inputFor(f),
      reviewer = await scopedStaff([f.left.inquiry.id, f.right.inquiry.id], [f.left.party.id]);
    await expect(mergeDuplicate(t.db, reviewer.session, input)).rejects.toMatchObject({
      code: "forbidden",
    });
    await t.db.insert(grants).values({
      principalId: reviewer.id,
      capability: "import.run",
      recordType: "party",
      recordId: f.right.party.id,
      reason: "Synthetic second target scope",
    });
    const scoped = { ...f, staff: { ...f.staff, ...reviewer } };
    const scopedInput = await inputFor(scoped);
    const done = await mergeDuplicate(t.db, reviewer.session, scopedInput);
    await t.db
      .update(grants)
      .set({ revokedAt: new Date() })
      .where(and(eq(grants.principalId, reviewer.id), eq(grants.recordId, f.right.party.id)));
    await expect(mergeDuplicate(t.db, reviewer.session, scopedInput)).rejects.toMatchObject({
      code: "forbidden",
    });
    await expect(
      readDuplicateReceipt(t.db, reviewer.session, done.operationId),
    ).rejects.toMatchObject({ code: "forbidden" });
    const g = await fixture(),
      partial = await scopedStaff(
        [g.left.inquiry.id, g.right.inquiry.id],
        [g.left.party.id, g.right.party.id],
      );
    await t.db.insert(inquiries).values({
      partyId: g.right.party.id,
      reference: `RQ-HIDDEN-${randomUUID()}`,
      source: "website",
      purpose: "question",
      coverageQueue: "new_inquiries",
      submissionKey: randomUUID(),
      payloadDigest: "synthetic",
      message: "Synthetic hidden dependency",
    });
    expect((await previewDuplicateMerge(t.db, partial.session, g.pair)).held).toContain(
      "restricted",
    );
    await expect(mergeDuplicate(t.db, partial.session, await inputFor(g))).rejects.toMatchObject({
      code: "not_found",
    });
  });

  it("rejects stale revisions/impact, forged mapping, missing human review, merged chains and conflicting verified contacts", async () => {
    const f = await fixture(),
      input = await inputFor(f);
    for (const raw of [
      { ...input, leftVersion: 99 },
      { ...input, reviewed: false },
      { ...input, survivor: randomUUID() },
      { ...input, aliasMap: [{ aliasId: input.left, canonicalId: input.right }] },
    ])
      await expect(mergeDuplicate(t.db, f.staff.session, raw)).rejects.toBeDefined();
    await t.db
      .update(contactMethods)
      .set({ verification: "verified", verifiedAt: new Date() })
      .where(eq(contactMethods.id, f.left.method.id));
    await expect(
      mergeDuplicate(t.db, f.staff.session, { ...input, operationId: randomUUID() }),
    ).rejects.toMatchObject({ code: "version_conflict" });
    await t.db
      .update(contactMethods)
      .set({ verification: "verified", verifiedAt: new Date() })
      .where(eq(contactMethods.id, f.right.method.id));
    expect((await previewDuplicateMerge(t.db, f.staff.session, f.pair)).held).toContain(
      "verified_contact_conflict",
    );
    await expect(mergeDuplicate(t.db, f.staff.session, await inputFor(f))).rejects.toMatchObject({
      code: "transition_denied",
    });
    expect(
      (await t.db.select().from(parties).where(eq(parties.id, f.right.party.id)))[0]
        ?.mergedIntoPartyId,
    ).toBeNull();
  });

  it("holds a new unrecognized direct FK without reading its protected payload", async () => {
    const f = await fixture();
    await t.db.execute(
      sql`create table synthetic_unknown_party_edge (id uuid primary key, party_id uuid references parties(id), protected_payload text)`,
    );
    try {
      await t.db.execute(
        sql`insert into synthetic_unknown_party_edge values (${randomUUID()}::uuid, ${f.right.party.id}::uuid, 'SYNTHETIC_SECRET_NOT_FOR_IMPACT')`,
      );
      const preview = await previewDuplicateMerge(t.db, f.staff.session, f.pair);
      expect(preview.held).toContain("unsupported");
      expect(JSON.stringify(preview)).not.toContain("SYNTHETIC_SECRET_NOT_FOR_IMPACT");
      expect(preview.references.some((r) => r.table === "synthetic_unknown_party_edge")).toBe(
        false,
      );
      await expect(mergeDuplicate(t.db, f.staff.session, await inputFor(f))).rejects.toMatchObject({
        code: "transition_denied",
      });
    } finally {
      await t.db.execute(sql`drop table synthetic_unknown_party_edge`);
    }
  });

  it("does not inherit a document grant from a Case and rechecks the document's fresh-auth boundary", async () => {
    const f = await fixture(),
      reviewer = await scopedStaff(
        [f.left.inquiry.id, f.right.inquiry.id],
        [f.left.party.id, f.right.party.id],
      );
    const [record] = await t.db
      .insert(cases)
      .values({
        reference: `CASE-${randomUUID()}`,
        kind: "buyer",
        stage: "needs_agreed",
        title: "Synthetic protected document case",
        ownerId: f.staff.id,
        nextAction: "Review the source audience",
      })
      .returning();
    if (!record) throw new Error("Missing protected document case");
    await t.db
      .insert(caseParticipants)
      .values({ caseId: record.id, partyId: f.left.party.id, role: "buyer" });
    const [document] = await t.db
      .insert(documents)
      .values({
        reference: `DOC-${randomUUID()}`,
        caseId: record.id,
        purpose: "Synthetic explicit document audience",
        classification: "other",
        audience: "internal",
      })
      .returning();
    if (!document) throw new Error("Missing protected document");
    await t.db.insert(grants).values([
      { principalId: reviewer.id, capability: "access.grant", reason: "Synthetic audience review" },
      {
        principalId: reviewer.id,
        capability: "case.read",
        recordType: "case",
        recordId: record.id,
        reason: "Synthetic case metadata",
      },
      {
        principalId: reviewer.id,
        capability: "document.read_restricted",
        recordType: "case",
        recordId: record.id,
        reason: "Synthetic invalid inherited document scope",
      },
    ]);
    const held = await previewDuplicateMerge(t.db, reviewer.session, f.pair);
    expect(held.held).toContain("restricted");
    expect(JSON.stringify(held.references)).not.toContain(document.id);
    await t.db.insert(grants).values({
      principalId: reviewer.id,
      capability: "document.read_restricted",
      recordType: "document",
      recordId: document.id,
      reason: "Synthetic exact document scope",
    });
    const allowed = await previewDuplicateMerge(t.db, reviewer.session, f.pair);
    expect(allowed.held).toEqual([]);
    expect(allowed.references.some((row) => row.id === document.id)).toBe(true);
    const scoped = { ...f, staff: { ...f.staff, ...reviewer } };
    const done = await mergeDuplicate(t.db, reviewer.session, await inputFor(scoped));
    await t.db
      .update(sessions)
      .set({ reverifiedAt: new Date(Date.now() - 6 * 60_000) })
      .where(eq(sessions.id, reviewer.session.id));
    await expect(
      readDuplicateReceipt(t.db, reviewer.session, done.operationId),
    ).rejects.toMatchObject({ code: "not_found" });
    await expect(
      previewDuplicateReversal(t.db, reviewer.session, done.outcome.mergeId),
    ).rejects.toMatchObject({ code: "not_found" });
  });

  it("holds an existing alias child without exposing its identity or making a merge chain", async () => {
    const f = await fixture();
    const [hidden] = await t.db
      .insert(parties)
      .values({
        kind: "person",
        displayName: "Synthetic hidden alias child",
        mergedIntoPartyId: f.left.party.id,
      })
      .returning();
    const preview = await previewDuplicateMerge(t.db, f.staff.session, f.pair);
    expect(preview.held).toContain("existing_merge");
    expect(JSON.stringify(preview)).not.toContain(hidden?.displayName);
    await expect(mergeDuplicate(t.db, f.staff.session, await inputFor(f))).rejects.toMatchObject({
      code: "transition_denied",
    });
  });

  it("merges property identity without changing facts, listings, provenance, approval or publication", async () => {
    const staff = await operator();
    const rows = await t.db
      .insert(properties)
      .values(
        [0, 1].map(() => ({
          reference: `PROP-${randomUUID()}`,
          propertyType: "apartment" as const,
          country: "BG",
          region: "Synthetic region",
          settlement: "Sandanski",
        })),
      )
      .returning();
    const [left, right] = rows;
    if (!left || !right) throw new Error("Missing property source pair");
    const pair: DuplicatePair = { subject: "property", left: left.id, right: right.id };
    const [listing] = await t.db
      .insert(listings)
      .values({ reference: `LIST-${randomUUID()}`, propertyId: pair.right, purpose: "sale" })
      .returning();
    const [revision] = await t.db
      .insert(propertyFactRevisions)
      .values({
        propertyId: pair.right,
        revisionNumber: 1,
        contentDigest: "synthetic-facts",
        materialChange: "none",
        createdByKind: "staff",
        createdById: staff.id,
      })
      .returning();
    if (!revision) throw new Error("Missing source fact revision");
    await t.db.insert(propertyFacts).values({
      factRevisionId: revision.id,
      fieldKey: "bedrooms",
      state: "known",
      value: 2,
      sourceClass: "source_supplied",
      sourceReference: "https://example.test/source/property-B",
    });
    const beforeFacts = await t.db.select().from(propertyFacts),
      beforeListings = await t.db.select().from(listings),
      beforeRevisions = await t.db.select().from(propertyFactRevisions);
    const done = await mergeDuplicate(t.db, staff.session, await inputFor({ staff, pair }));
    expect(
      (await readCanonicalDuplicate(t.db, staff.session, "property", pair.right)).canonical.id,
    ).toBe(pair.left);
    expect(await t.db.select().from(propertyFacts)).toEqual(beforeFacts);
    expect(await t.db.select().from(listings)).toEqual(beforeListings);
    expect(await t.db.select().from(propertyFactRevisions)).toEqual(beforeRevisions);
    expect(listing?.propertyId).toBe(pair.right);
    expect(done.outcome.survivor).toBe(pair.left);
  });

  it("holds automatic reversal after a source, reference or audience changes, preserving the original merge", async () => {
    for (const change of ["source", "dependency", "audience"]) {
      const f = await fixture(),
        done = await mergeDuplicate(t.db, f.staff.session, await inputFor(f));
      if (change === "source")
        await t.db
          .update(parties)
          .set({ displayName: "Synthetic subsequent identity edit" })
          .where(eq(parties.id, f.left.party.id));
      if (change === "dependency")
        await t.db
          .update(contactMethods)
          .set({ normalizedValue: `${randomUUID()}@example.test` })
          .where(eq(contactMethods.id, f.right.method.id));
      if (change === "audience")
        await t.db.insert(grants).values({
          principalId: f.staff.id,
          capability: "inquiry.read",
          recordType: "party",
          recordId: f.right.party.id,
          reason: "Synthetic subsequent audience review",
        });
      const preview = await previewDuplicateReversal(t.db, f.staff.session, done.outcome.mergeId);
      expect(preview.impact.held).toContain("changed_after_merge");
      await expect(
        reverseDuplicate(t.db, f.staff.session, await reverseInput(f, done.outcome.mergeId)),
      ).rejects.toMatchObject({ code: "transition_denied" });
      expect(
        (await t.db.select().from(mergeRecords).where(eq(mergeRecords.id, done.outcome.mergeId)))[0]
          ?.reversedAt,
      ).toBeNull();
    }
  });

  it("locks both sources in sorted order, prevents cycles, and conflicts on a concurrent dependency edit", async () => {
    const f = await fixture(),
      input = await inputFor(f);
    let release = () => {},
      acquired = () => {};
    const held = new Promise<void>((resolve) => {
        release = resolve;
      }),
      ready = new Promise<void>((resolve) => {
        acquired = resolve;
      });
    const editing = t.db.transaction(async (tx) => {
      await tx
        .update(contactMethods)
        .set({
          normalizedValue: `${randomUUID()}@example.test`,
          version: sql`${contactMethods.version} + 1`,
        })
        .where(eq(contactMethods.id, f.right.method.id));
      acquired();
      await held;
    });
    await ready;
    const attempting = mergeDuplicate(t.db, f.staff.session, input).then(
      (result) => ({ result }),
      (error: unknown) => ({ error }),
    );
    let waiting = false;
    try {
      for (let count = 0; count < 100; count++) {
        const [row] = await t.sql<
          { present: boolean }[]
        >`select exists(select 1 from pg_stat_activity
          where datname = current_database() and wait_event_type = 'Lock' and query like '%contact_methods%for share%') as present`;
        if (row?.present) {
          waiting = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
    } finally {
      release();
      await editing;
    }
    expect(waiting).toBe(true);
    expect(await attempting).toMatchObject({ error: { code: "version_conflict" } });
    expect(
      (await t.db.select().from(parties).where(eq(parties.id, f.right.party.id)))[0]
        ?.mergedIntoPartyId,
    ).toBeNull();
    expect(
      await t.db.select().from(operations).where(eq(operations.idempotencyKey, input.operationId)),
    ).toEqual([]);
    const fresh = await inputFor(f),
      oppositePair: DuplicatePair = { ...f.pair, left: f.pair.right, right: f.pair.left };
    const opposite = await inputFor({ staff: f.staff, pair: oppositePair });
    const outcomes = await Promise.allSettled([
      mergeDuplicate(t.db, f.staff.session, fresh),
      mergeDuplicate(t.db, f.staff.session, opposite),
    ]);
    expect(outcomes.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rows = await t.db
      .select()
      .from(parties)
      .where(sql`${parties.id} in (${f.pair.left}::uuid,${f.pair.right}::uuid)`);
    expect(rows.filter((row) => row.mergedIntoPartyId)).toHaveLength(1);
  });

  it("checks current dependency-read grants again on replay/reversal and treats a same-key in-flight command as pending", async () => {
    const f = await fixture(),
      staff = await scopedStaff(
        [f.left.inquiry.id, f.right.inquiry.id],
        [f.left.party.id, f.right.party.id],
      );
    const scoped = { ...f, staff: { ...f.staff, ...staff } },
      input = await inputFor(scoped);
    let release = () => {},
      acquired = () => {};
    const held = new Promise<void>((resolve) => {
        release = resolve;
      }),
      ready = new Promise<void>((resolve) => {
        acquired = resolve;
      });
    const lockKey = JSON.stringify(["staff", staff.id, "duplicate.merge", input.operationId]);
    const pending = t.db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${lockKey},0))`);
      acquired();
      await held;
    });
    await ready;
    try {
      await expect(mergeDuplicate(t.db, staff.session, input)).rejects.toMatchObject({
        code: "operation_pending",
      });
    } finally {
      release();
      await pending;
    }
    const done = await mergeDuplicate(t.db, staff.session, input);
    await t.db
      .update(grants)
      .set({ revokedAt: new Date() })
      .where(and(eq(grants.principalId, staff.id), eq(grants.recordId, f.right.inquiry.id)));
    await expect(mergeDuplicate(t.db, staff.session, input)).rejects.toMatchObject({
      code: "not_found",
    });
    await expect(
      previewDuplicateReversal(t.db, staff.session, done.outcome.mergeId),
    ).rejects.toMatchObject({ code: "not_found" });
    await expect(readDuplicateReceipt(t.db, staff.session, done.operationId)).rejects.toMatchObject(
      { code: "not_found" },
    );
    await expect(
      duplicateOperationStatus(t.db, staff.session, f.pair, "merge", input.operationId),
    ).rejects.toMatchObject({ code: "not_found" });
  });

  it("reconciles the original operation identity, keeps an in-flight/unknown result unknown, and rejects cross-actor recovery", async () => {
    const f = await fixture(),
      input = await inputFor(f);
    let release = () => {},
      acquired = () => {};
    const held = new Promise<void>((resolve) => {
        release = resolve;
      }),
      ready = new Promise<void>((resolve) => {
        acquired = resolve;
      });
    const lockKey = JSON.stringify(["staff", f.staff.id, "duplicate.merge", input.operationId]);
    const pending = t.db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${lockKey},0))`);
      acquired();
      await held;
    });
    await ready;
    try {
      expect(
        await duplicateOperationStatus(t.db, f.staff.session, f.pair, "merge", input.operationId),
      ).toEqual({ state: "unknown" });
    } finally {
      release();
      await pending;
    }
    expect(
      await duplicateOperationStatus(t.db, f.staff.session, f.pair, "merge", input.operationId),
    ).toEqual({ state: "absent" });
    const done = await mergeDuplicate(t.db, f.staff.session, input);
    expect(
      await duplicateOperationStatus(t.db, f.staff.session, f.pair, "merge", input.operationId),
    ).toEqual({ state: "succeeded", id: done.operationId });
    const other = await operator();
    await expect(readDuplicateReceipt(t.db, other.session, done.operationId)).rejects.toMatchObject(
      { code: "not_found" },
    );
    await expect(
      duplicateOperationStatus(t.db, other.session, f.pair, "merge", input.operationId),
    ).rejects.toMatchObject({ code: "not_found" });
    const key = issueFormOperation(duplicateOperationScope(f.staff.id, "merge", f.pair));
    await t.db.insert(operations).values({
      actorKind: "staff",
      actorId: f.staff.id,
      operationType: "duplicate.merge",
      idempotencyKey: key,
      requestHash: "synthetic-unknown",
      status: "outcome_unknown",
      resultType: "party",
      resultId: f.left.party.id,
    });
    expect(await duplicateOperationStatus(t.db, f.staff.session, f.pair, "merge", key)).toEqual({
      state: "unknown",
    });
    await t.db
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(eq(sessions.id, f.staff.session.id));
    await expect(
      readDuplicateReceipt(t.db, f.staff.session, done.operationId),
    ).rejects.toMatchObject({ code: "unauthenticated" });
  });
});
