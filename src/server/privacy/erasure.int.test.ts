// AT45/F30/UX23: meaningful synthetic authority, scope, propagation and retained evidence.
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  caseParticipants,
  consentEvents,
  contactMethods,
  documents,
  documentVersions,
  emailSignInTokens,
  grants,
  parties,
  principals,
  privacyExports,
  privacyProcessingRestrictions,
  privacyRequests,
  privacySafetyDecisions,
  processPolicies,
  sessions,
  subscriptions,
  suspicionReports,
} from "@/db/schema";
import { createTestDatabase, type TestDatabase } from "@/db/test-utils";
import type { ErasureCategory } from "@/domain/privacy-erasure";
import { createSession, readSession } from "../auth/sessions";
import { hashRequest } from "../crypto";
import { runOperation } from "../operations";
import { createCase, createStaff } from "../testing";
import {
  applyPrivacyErasure,
  completePrivacyErasure,
  privacyErasureOperationStatus,
  readPrivacyErasureWorkbench,
} from "./erasure";
import {
  syntheticErasureDecisions,
  syntheticErasureFixture,
  syntheticErasurePolicy,
} from "./erasure-testing";
import { changeSubscription } from "./preferences";
import { reviewPrivacyRequest } from "./requests";

let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => {
  await t?.drop();
});
type Fixture = Awaited<ReturnType<typeof syntheticErasureFixture>>;
async function command(f: Fixture, erase: ErasureCategory[] = []) {
  const data = await readPrivacyErasureWorkbench(t.db, f.staffSession.session, f.request.id);
  return {
    operationId: randomUUID(),
    requestId: f.request.id,
    expectedVersion: data.request.version,
    inventoryDigest: data.inventoryDigest,
    purposes: ["search_alerts", "marketing"] as const,
    decisions: syntheticErasureDecisions(data.inventory, erase),
    confirmed: true,
  };
}
const apply = (f: Fixture, input: unknown) =>
  applyPrivacyErasure(t.db, f.staffSession.session, input);

describe("AT45 erasure and restriction propagation", () => {
  it("holds unknown policy even when a human calls an optional copy eligible; a restriction still stops work", async () => {
    const f = await syntheticErasureFixture(t.db);
    await expect(apply(f, await command(f, ["matching_aliases"]))).rejects.toMatchObject({
      code: "transition_denied",
    });
    const result = await apply(f, await command(f));
    expect(result.outcome).toMatchObject({
      fulfilment: "partial",
      localEffect: "applied",
      independentArchive: "unverified",
    });
    expect(
      (await t.db.select().from(subscriptions).where(eq(subscriptions.id, f.stream.id)))[0]?.state,
    ).toBe("withdrawn");
    expect(await readSession(t.db, f.clientSession.token)).toBeNull();
    expect(await readSession(t.db, f.otherSession.token)).not.toBeNull();
    expect(
      (await t.db.select().from(parties).where(eq(parties.id, f.client.partyId)))[0]
        ?.matchingAliases,
    ).toEqual(["Synthetic optional alias"]);
  });

  it("removes only explicitly reviewed own optional copies and never core identity, other parties or history", async () => {
    const f = await syntheticErasureFixture(t.db);
    await syntheticErasurePolicy(t.db, f);
    await t.db.insert(emailSignInTokens).values({
      tokenHash: randomUUID(),
      purpose: "sign_in",
      principalKind: "client",
      principalId: f.client.id,
      email: f.client.email,
      expiresAt: new Date(Date.now() + 3600000),
    });
    const input = await command(f, [
      "contact_preferences",
      "matching_aliases",
      "optional_contacts",
      "client_profile_copies",
      "optional_search_criteria",
    ]);
    const result = await apply(f, input);
    const [party] = await t.db.select().from(parties).where(eq(parties.id, f.client.partyId));
    expect(party).toMatchObject({
      contactPreferences: {},
      matchingAliases: [],
      givenName: "Synthetic retained name",
      displayName: "Test Client",
    });
    const [contact] = await t.db
      .select()
      .from(contactMethods)
      .where(eq(contactMethods.id, f.contact.id));
    expect(contact).toMatchObject({
      normalizedValue: `erased:${f.contact.id}`,
      verification: "unverified",
      verifiedAt: null,
    });
    const [account] = await t.db.select().from(principals).where(eq(principals.id, f.client.id));
    expect(account).toMatchObject({
      email: `${f.client.id}@erased.invalid`,
      displayName: "[restricted client]",
      status: "suspended",
    });
    const [stream] = await t.db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.id, f.stream.id));
    expect(stream).toMatchObject({ state: "withdrawn", criteria: {}, criteriaSummary: null });
    expect(
      (await t.db.select().from(principals).where(eq(principals.id, f.other.id)))[0]?.email,
    ).toBe(f.other.email);
    expect(
      await t.db.select().from(consentEvents).where(eq(consentEvents.subscriptionId, f.stream.id)),
    ).toHaveLength(1);
    expect(
      await t.db
        .select()
        .from(privacySafetyDecisions)
        .where(eq(privacySafetyDecisions.sequence, result.outcome.sequence)),
    ).toHaveLength(1);
    await expect(
      t.db
        .update(privacySafetyDecisions)
        .set({ digest: "c".repeat(64) })
        .where(eq(privacySafetyDecisions.sequence, result.outcome.sequence)),
    ).rejects.toMatchObject({ cause: { code: "23001" } });
    await expect(
      t.db
        .delete(privacyProcessingRestrictions)
        .where(eq(privacyProcessingRestrictions.partyId, f.client.partyId)),
    ).rejects.toMatchObject({ cause: { code: "23001" } });
  });

  it.each(["source", "policy", "scope", "version"] as const)(
    "rejects changed %s with the same source and authority boundaries",
    async (changed) => {
      const f = await syntheticErasureFixture(t.db);
      const input = await command(f);
      if (changed === "source")
        await t.db
          .update(parties)
          .set({ contactPreferences: { channel: "phone" } })
          .where(eq(parties.id, f.client.partyId));
      if (changed === "policy") await syntheticErasurePolicy(t.db, f);
      if (changed === "scope")
        input.decisions[0]?.sourceKeys.push(`principal:${f.other.id}:access`);
      if (changed === "version") input.expectedVersion = 50;
      await expect(apply(f, input)).rejects.toMatchObject({ code: "version_conflict" });
    },
  );

  it("requires explicit access authority, fresh authentication and a live human session on apply, replay and status", async () => {
    const f = await syntheticErasureFixture(t.db, false);
    const input = await command(f);
    await expect(apply(f, input)).rejects.toMatchObject({ code: "forbidden" });
    await expect(applyPrivacyErasure(t.db, f.clientSession.session, input)).rejects.toBeDefined();
    await t.db.insert(grants).values({
      principalId: f.staff.id,
      capability: "access.grant",
      reason: "Synthetic explicit authority",
    });
    const authorized = await command(f);
    await apply(f, authorized);
    await t.db
      .update(grants)
      .set({ revokedAt: new Date() })
      .where(and(eq(grants.principalId, f.staff.id), eq(grants.capability, "access.grant")));
    await expect(apply(f, authorized)).rejects.toMatchObject({ code: "forbidden" });
    await expect(
      privacyErasureOperationStatus(t.db, f.staffSession.session, {
        requestId: f.request.id,
        operationId: authorized.operationId,
        type: "apply",
        expectedVersion: 1,
      }),
    ).rejects.toMatchObject({ code: "forbidden" });
    const stale = await syntheticErasureFixture(t.db);
    const freshInput = await command(stale);
    await t.db
      .update(sessions)
      .set({ reverifiedAt: new Date(Date.now() - 3600000) })
      .where(eq(sessions.id, stale.staffSession.session.id));
    await expect(apply(stale, freshInput)).rejects.toMatchObject({ code: "step_up_required" });
    await t.db
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(eq(sessions.id, stale.staffSession.session.id));
    await expect(apply(stale, freshInput)).rejects.toMatchObject({ code: "unauthenticated" });
  });

  it("reconciles an uncommitted exact key and commits one effect; changed payload conflicts", async () => {
    const f = await syntheticErasureFixture(t.db),
      input = await command(f);
    let release = () => {},
      acquired = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const ready = new Promise<void>((resolve) => {
      acquired = resolve;
    });
    const committing = t.db.transaction(async (tx) => {
      const result = await applyPrivacyErasure(tx, f.staffSession.session, input);
      acquired();
      await held;
      return result;
    });
    await ready;
    try {
      expect(
        await privacyErasureOperationStatus(t.db, f.staffSession.session, {
          requestId: f.request.id,
          operationId: input.operationId,
          type: "apply",
          expectedVersion: 1,
        }),
      ).toBe("pending");
    } finally {
      release();
    }
    const result = await committing;
    expect((await apply(f, input)).replayed).toBe(true);
    await expect(apply(f, { ...input, purposes: ["marketing"] })).rejects.toMatchObject({
      code: "idempotency_key_reused",
    });
    expect(
      await t.db
        .select()
        .from(privacySafetyDecisions)
        .where(eq(privacySafetyDecisions.operationId, result.operationId)),
    ).toHaveLength(1);
    expect(
      await t.db.select().from(consentEvents).where(eq(consentEvents.subscriptionId, f.stream.id)),
    ).toHaveLength(1);
    expect(
      await privacyErasureOperationStatus(t.db, f.staffSession.session, {
        requestId: f.request.id,
        operationId: input.operationId,
        type: "apply",
        expectedVersion: 2,
      }),
    ).toBe("unknown");
  });

  it("refuses an active source row-lock without a partial effect, then retries the same absent key safely", async () => {
    const f = await syntheticErasureFixture(t.db),
      input = await command(f);
    let release = () => {},
      acquired = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const ready = new Promise<void>((resolve) => {
      acquired = resolve;
    });
    const reading = t.db.transaction(async (tx) => {
      await tx.select().from(parties).where(eq(parties.id, f.client.partyId)).for("share");
      acquired();
      await held;
    });
    await ready;
    try {
      await expect(apply(f, input)).rejects.toMatchObject({
        code: "unavailable",
        outcome: "not_applied",
      });
      expect(
        await privacyErasureOperationStatus(t.db, f.staffSession.session, {
          requestId: f.request.id,
          operationId: input.operationId,
          type: "apply",
          expectedVersion: 1,
        }),
      ).toBe("absent");
      expect(
        (await t.db.select().from(subscriptions).where(eq(subscriptions.id, f.stream.id)))[0]
          ?.state,
      ).toBe("active");
    } finally {
      release();
      await reading;
    }
    expect((await apply(f, input)).outcome.localEffect).toBe("applied");
  });

  it("preserves linked staff identities, joint records and physical files while revoking only own client/export exposure", async () => {
    const f = await syntheticErasureFixture(t.db),
      linked = await createStaff(t.db);
    await t.db
      .update(principals)
      .set({ partyId: f.client.partyId })
      .where(eq(principals.id, linked.id));
    const staffSession = await createSession(t.db, { kind: "staff", id: linked.id });
    const caseId = await createCase(t.db, f.staff.id);
    await t.db.insert(caseParticipants).values([
      { caseId, partyId: f.client.partyId, role: "buyer" },
      { caseId, partyId: f.other.partyId, role: "buyer" },
    ]);
    const [document] = await t.db
      .insert(documents)
      .values({
        reference: `DOC-${randomUUID()}`,
        caseId,
        purpose: "process_policy",
        classification: "contract",
      })
      .returning();
    if (!document) throw new Error("No fixture document");
    const [version] = await t.db
      .insert(documentVersions)
      .values({
        documentId: document.id,
        versionNumber: 1,
        fileName: "synthetic.pdf",
        contentType: "application/pdf",
        uploadedByKind: "staff",
        uploadedById: f.staff.id,
      })
      .returning();
    if (!version) throw new Error("No fixture file");
    const [policy] = await t.db
      .insert(processPolicies)
      .values({
        title: "Synthetic retention only",
        country: "BG",
        transaction: "sale",
        participantCategory: "unknown",
        documentVersionId: version.id,
        documentDigest: "synthetic",
        items: [],
        withdrawalDays: 0,
        timezone: "Europe/Sofia",
        expressStartRequired: false,
        retentionDays: 1,
        professionalName: "Synthetic fixture",
        approvedById: f.staff.id,
        policyHash: "synthetic",
        validUntil: new Date(Date.now() + 86400000),
      })
      .returning();
    if (!policy) throw new Error("No fixture retention policy");
    const recorded = await runOperation(
      t.db,
      {
        actor: f.staff.actor,
        type: "synthetic.retention.fixture",
        idempotencyKey: randomUUID(),
        requestHash: hashRequest({ caseId }),
      },
      async () => ({ caseId }),
    );
    await t.db.insert(suspicionReports).values({
      caseId,
      partyId: f.client.partyId,
      policyId: policy.id,
      note: "RESTRICTED SYNTHETIC NOTE",
      recordedById: f.staff.id,
      retainUntil: new Date(Date.now() + 86400000),
      operationId: recorded.operationId,
    });
    const [exportCopy] = await t.db
      .insert(privacyExports)
      .values({
        requestId: f.request.id,
        requestVersion: 1,
        partyId: f.client.partyId,
        recipientId: f.client.id,
        preparedById: f.staff.id,
        encryptedPayload: "synthetic",
        sha256: "b".repeat(64),
        byteSize: 1,
      })
      .returning();
    const before = await t.db
      .select()
      .from(caseParticipants)
      .where(eq(caseParticipants.caseId, caseId));
    const view = await readPrivacyErasureWorkbench(t.db, f.staffSession.session, f.request.id);
    expect(view.inventory.retentionHold).toBe(true);
    expect(JSON.stringify(view)).not.toContain("RESTRICTED SYNTHETIC NOTE");
    expect(JSON.stringify(view)).not.toContain(f.other.email);
    expect(JSON.stringify(view)).not.toContain(linked.email);
    await expect(apply(f, await command(f, ["matching_aliases"]))).rejects.toMatchObject({
      code: "transition_denied",
    });
    const result = await apply(f, await command(f));
    expect(
      await t.db.select().from(caseParticipants).where(eq(caseParticipants.caseId, caseId)),
    ).toEqual(before);
    expect(
      await t.db.select().from(documentVersions).where(eq(documentVersions.id, version.id)),
    ).toHaveLength(1);
    expect(await readSession(t.db, staffSession.token)).not.toBeNull();
    expect(await readSession(t.db, f.otherSession.token)).not.toBeNull();
    expect(
      (
        await t.db
          .select()
          .from(privacyExports)
          .where(eq(privacyExports.id, exportCopy?.id ?? randomUUID()))
      )[0]?.state,
    ).toBe("revoked");
    const completed = await completePrivacyErasure(t.db, f.staffSession.session, {
      operationId: randomUUID(),
      requestId: f.request.id,
      expectedVersion: 2,
      sequence: result.outcome.sequence,
      digest: result.outcome.digest,
      confirmed: true,
    });
    expect(completed.outcome).toMatchObject({ completed: false, fulfilment: "partial" });
    expect(completed.outcome.unresolved).toContain("independent_archive");
    expect(
      (await t.db.select().from(privacyRequests).where(eq(privacyRequests.id, f.request.id)))[0]
        ?.state,
    ).toBe("in_progress");
    await expect(
      reviewPrivacyRequest(t.db, f.staffSession.session, {
        operationId: randomUUID(),
        id: f.request.id,
        expectedVersion: 2,
        to: "completed",
        responsibleId: f.staff.id,
        policyReference: "Synthetic policy",
        dueAt: new Date(Date.now() + 86400000).toISOString(),
        identityReviewed: true,
        legalHoldReason: "",
        legalHoldDisposition: "Synthetic checkbox cannot waive a hold",
        holdResolved: true,
        completionEvidence: "Synthetic text is not propagation proof",
        rejectionReason: "",
        confirmed: true,
      }),
    ).rejects.toMatchObject({ code: "transition_denied" });
  });

  it("records an ordinary own-purpose withdrawal in the safety ledger without revoking unrelated client access", async () => {
    const f = await syntheticErasureFixture(t.db);
    const result = await changeSubscription(t.db, f.clientSession.session, {
      operationId: randomUUID(),
      id: f.stream.id,
      expectedVersion: f.stream.version,
      state: "withdrawn",
    });
    const [decision] = await t.db
      .select()
      .from(privacySafetyDecisions)
      .where(eq(privacySafetyDecisions.operationId, result.operationId));
    expect(decision?.effect).toMatchObject({
      kind: "subscription_withdrawal_v1",
      subscriptionIds: [f.stream.id],
    });
    expect(await readSession(t.db, f.clientSession.token)).not.toBeNull();
    expect(
      await t.db
        .select()
        .from(privacyProcessingRestrictions)
        .where(eq(privacyProcessingRestrictions.partyId, f.client.partyId)),
    ).toEqual([]);
  });
});
