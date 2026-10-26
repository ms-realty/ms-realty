// UX23 / AT45 / AT64: separately signed synthetic tail and watermark, never live recovery proof.
import { generateKeyPairSync, randomUUID, sign } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  contactMethods,
  externalActions,
  grants,
  parties,
  passkeys,
  principals,
  privacyRequests,
  privacySafetyDecisions,
  sessions,
  staffMemberships,
  subscriptions,
} from "@/db/schema";
import { createTestDatabase, type TestDatabase } from "@/db/test-utils";
import { canonicalJson } from "@/domain/approval";
import { emptySafetyDigest, type SyntheticPrivacyTail } from "@/domain/privacy-erasure";
import { readSession } from "../auth/sessions";
import { dispatchMessage, enqueueMessage } from "../jobs/outbox";
import { TestMessageProvider } from "../jobs/provider";
import { applyPrivacyErasure, readPrivacyErasureWorkbench } from "../privacy/erasure";
import {
  syntheticErasureDecisions,
  syntheticErasureFixture,
  syntheticErasurePolicy,
} from "../privacy/erasure-testing";
import { changeSubscription } from "../privacy/preferences";
import { privacySafetyHead } from "../privacy/safety-ledger";
import { reapplySyntheticPrivacyTail, syntheticPrivacySafetyEntries } from "./privacy-tail";
import { assertRecoveryOpen } from "./quarantine";

let source: TestDatabase, destination: TestDatabase;
let fixture: Awaited<ReturnType<typeof syntheticErasureFixture>>;
let entries: SyntheticPrivacyTail["entries"];
let otherStreamId: string;
let snapshot: {
  parties: (typeof parties.$inferSelect)[];
  principals: (typeof principals.$inferSelect)[];
  staff: (typeof staffMemberships.$inferSelect)[];
  grants: (typeof grants.$inferSelect)[];
  passkeys: (typeof passkeys.$inferSelect)[];
  sessions: (typeof sessions.$inferSelect)[];
  contacts: (typeof contactMethods.$inferSelect)[];
  subscriptions: (typeof subscriptions.$inferSelect)[];
  requests: (typeof privacyRequests.$inferSelect)[];
};
const keys = generateKeyPairSync("ed25519");
const trustedPublicKey = keys.publicKey.export({ type: "spki", format: "pem" }).toString();
const signature = (value: unknown) =>
  sign(null, Buffer.from(canonicalJson(value)), keys.privateKey).toString("base64");

beforeAll(async () => {
  source = await createTestDatabase();
  fixture = await syntheticErasureFixture(source.db);
  await syntheticErasurePolicy(source.db, fixture);
  const [contact] = await source.db
    .insert(contactMethods)
    .values({
      partyId: fixture.other.partyId,
      kind: "email",
      value: fixture.other.email,
      normalizedValue: fixture.other.email,
      verification: "verified",
      verifiedAt: new Date(),
    })
    .returning();
  if (!contact) throw new Error("No synthetic other contact");
  const [stream] = await source.db
    .insert(subscriptions)
    .values({
      partyId: fixture.other.partyId,
      contactMethodId: contact.id,
      purpose: "marketing",
      state: "active",
      verifiedAt: new Date(),
      timezone: "Europe/Sofia",
      policyVersion: "synthetic:bg",
      unsubscribeTokenHash: randomUUID(),
    })
    .returning();
  if (!stream) throw new Error("No synthetic other subscription");
  otherStreamId = stream.id;
  // An explicit older synthetic application image, not a claimed sealed pg_dump/object archive.
  snapshot = {
    parties: await source.db.select().from(parties),
    principals: await source.db.select().from(principals),
    staff: await source.db.select().from(staffMemberships),
    grants: await source.db.select().from(grants),
    passkeys: await source.db.select().from(passkeys),
    sessions: await source.db.select().from(sessions),
    contacts: await source.db.select().from(contactMethods),
    subscriptions: await source.db.select().from(subscriptions),
    requests: await source.db.select().from(privacyRequests),
  };
  const work = await readPrivacyErasureWorkbench(
    source.db,
    fixture.staffSession.session,
    fixture.request.id,
  );
  await applyPrivacyErasure(source.db, fixture.staffSession.session, {
    operationId: randomUUID(),
    requestId: fixture.request.id,
    expectedVersion: 1,
    inventoryDigest: work.inventoryDigest,
    purposes: ["search_alerts", "marketing"],
    decisions: syntheticErasureDecisions(work.inventory, [
      "matching_aliases",
      "contact_preferences",
    ]),
    confirmed: true,
  });
  await changeSubscription(source.db, fixture.otherSession.session, {
    operationId: randomUUID(),
    id: otherStreamId,
    expectedVersion: 1,
    state: "withdrawn",
  });
  entries = await syntheticPrivacySafetyEntries(source.db, 0);
  expect(entries).toHaveLength(2);
});
beforeEach(async () => {
  destination = await createTestDatabase();
  await destination.db.insert(parties).values(snapshot.parties);
  await destination.db.insert(principals).values(snapshot.principals);
  await destination.db.insert(staffMemberships).values(snapshot.staff);
  await destination.db.insert(grants).values(snapshot.grants);
  await destination.db.insert(passkeys).values(snapshot.passkeys);
  await destination.db.insert(sessions).values(snapshot.sessions);
  await destination.db.insert(contactMethods).values(snapshot.contacts);
  await destination.db.insert(subscriptions).values(snapshot.subscriptions);
  await destination.db.insert(privacyRequests).values(snapshot.requests);
});
afterEach(async () => {
  await destination?.drop();
});
afterAll(async () => {
  await source?.drop();
});

function proof() {
  const restoreId = randomUUID(),
    snapshotDigest = "d".repeat(64),
    last = entries.at(-1);
  if (!last) throw new Error("No synthetic safety tail");
  const manifest: SyntheticPrivacyTail = {
    kind: "synthetic_privacy_safety_tail_v1",
    scope: "privacy_decisions_only",
    restoreId,
    snapshotDigest,
    snapshotSequence: 0,
    snapshotLedgerDigest: emptySafetyDigest,
    throughSequence: last.sequence,
    headDigest: last.digest,
    entries: structuredClone(entries),
  };
  const checkpoint = {
    kind: "synthetic_privacy_checkpoint_v1",
    restoreId,
    snapshotDigest,
    throughSequence: last.sequence,
    headDigest: last.digest,
  };
  return {
    restoreId,
    snapshotDigest,
    manifest,
    signature: signature(manifest),
    trustedPublicKey,
    checkpoint,
    checkpointSignature: signature(checkpoint),
  };
}
const replay = (input: ReturnType<typeof proof>) =>
  reapplySyntheticPrivacyTail(destination.db, input);

describe("UX23 verified synthetic privacy-tail reapplication", () => {
  it("applies newer erasure/restriction and consent withdrawals exactly once and leaves access/jobs globally closed", async () => {
    const queued = await enqueueMessage(destination.db, {
      idempotencyKey: randomUUID(),
      channel: "email",
      recipient: "synthetic@example.test",
      template: "auth.email_link",
      secretParams: { token: "synthetic-only" },
    });
    const oldActions = await destination.db.select().from(externalActions);
    const input = proof();
    expect(await replay(input)).toMatchObject({
      applied: 2,
      quarantine: "quarantined",
      runtimeReopened: false,
      externalActionsReplayed: false,
      independentArchive: "unverified",
    });
    expect(await replay(input)).toMatchObject({
      applied: 0,
      throughSequence: 2,
      runtimeReopened: false,
    });
    expect(await privacySafetyHead(destination.db)).toEqual({
      sequence: 2,
      digest: entries.at(-1)?.digest,
    });
    const [party] = await destination.db
      .select()
      .from(parties)
      .where(eq(parties.id, fixture.client.partyId));
    expect(party).toMatchObject({
      matchingAliases: [],
      contactPreferences: {},
      givenName: "Synthetic retained name",
    });
    for (const id of [fixture.stream.id, otherStreamId])
      expect(
        (await destination.db.select().from(subscriptions).where(eq(subscriptions.id, id)))[0]
          ?.state,
      ).toBe("withdrawn");
    expect(await readSession(destination.db, fixture.clientSession.token)).toBeNull();
    expect(await readSession(destination.db, fixture.otherSession.token)).toBeNull();
    expect(await readSession(destination.db, fixture.staffSession.token)).toBeNull();
    await expect(assertRecoveryOpen(destination.db)).rejects.toThrow("Recovery quarantine");
    const provider = new TestMessageProvider();
    await expect(dispatchMessage(destination.db, provider, queued.id)).rejects.toThrow(
      "Recovery quarantine",
    );
    expect(provider.sent).toEqual([]);
    expect(await destination.db.select().from(externalActions)).toEqual(oldActions);
  });

  it.each([
    "missing",
    "tampered",
    "incomplete",
    "wrong_trust",
    "wrong_restore",
    "gap",
    "old_signed_tail",
  ])(
    "%s tail cannot bypass persistent quarantine or invalidate the separately trusted watermark",
    async (mode) => {
      const input = proof();
      const first = input.manifest.entries[0];
      if (!first) throw new Error("Missing synthetic first decision");
      if (mode === "missing") input.manifest = null as unknown as SyntheticPrivacyTail;
      if (mode === "tampered") first.effect.partyId = fixture.other.partyId;
      if (mode === "incomplete") {
        input.manifest.entries.pop();
        input.signature = signature(input.manifest);
      }
      if (mode === "wrong_trust")
        input.trustedPublicKey = generateKeyPairSync("ed25519")
          .publicKey.export({ type: "spki", format: "pem" })
          .toString();
      if (mode === "wrong_restore") {
        input.manifest.restoreId = randomUUID();
        input.signature = signature(input.manifest);
      }
      if (mode === "gap") {
        first.sequence = 2;
        input.signature = signature(input.manifest);
      }
      if (mode === "old_signed_tail") {
        input.manifest.entries.pop();
        input.manifest.throughSequence = 1;
        input.manifest.headDigest = first.digest;
        input.signature = signature(input.manifest);
      }
      await expect(replay(input)).rejects.toBeDefined();
      await expect(assertRecoveryOpen(destination.db)).rejects.toThrow("Recovery quarantine");
      expect(await readSession(destination.db, fixture.clientSession.token)).toBeNull();
      expect(await destination.db.select().from(privacySafetyDecisions)).toEqual([]);
      expect(
        (
          await destination.db
            .select()
            .from(subscriptions)
            .where(eq(subscriptions.id, fixture.stream.id))
        )[0]?.state,
      ).toBe("active");
    },
  );

  it("refuses a conflicting destination chain and does not reinterpret a local snapshot ledger as outside completeness", async () => {
    const input = proof();
    const first = entries[0];
    if (!first) throw new Error("Missing synthetic first decision");
    await destination.db
      .insert(privacySafetyDecisions)
      .values({ ...first, digest: "f".repeat(64), recordedAt: new Date(first.recordedAt) });
    await expect(replay(input)).rejects.toThrow("Conflicting destination safety decision");
    await expect(assertRecoveryOpen(destination.db)).rejects.toThrow("Recovery quarantine");
    expect((await privacySafetyHead(destination.db)).sequence).toBe(1);
  });
});
