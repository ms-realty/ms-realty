// Isolated synthetic fixtures only; this is not an agency retention policy or launch evidence.
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { contactMethods, parties, passkeys, privacyRequests, subscriptions } from "@/db/schema";
import { emptyOperatingPolicy } from "@/domain/operating-policy";
import {
  type ErasureCategory,
  type ErasureInventory,
  type ErasureSourceDecision,
  erasureCategories,
} from "@/domain/privacy-erasure";
import { createSession } from "../auth/sessions";
import type { Executor } from "../db";
import {
  approveOperatingPolicy,
  readOperatingPolicy,
  saveOperatingPolicy,
} from "../operating-policy/service";
import { createClient, createStaff } from "../testing";

export function syntheticErasureDecisions(
  inventory: ErasureInventory,
  erase: ErasureCategory[] = [],
): ErasureSourceDecision[] {
  return erasureCategories.map((category) => ({
    category,
    disposition:
      category === "optional_processing"
        ? "restrict_processing"
        : category === "client_access"
          ? "revoke_client_access"
          : erase.includes(category)
            ? "erase_optional_copy"
            : "hold_unknown",
    classification:
      category === "client_access"
        ? "account_credentials"
        : category === "optional_processing" || erase.includes(category)
          ? "optional_only"
          : "unknown",
    sourceKeys: inventory.sources.filter((row) => row.category === category).map((row) => row.key),
    evidenceReference: "Synthetic per-source human review, disposable test only",
  }));
}

export async function syntheticErasureFixture(db: Executor, access = true) {
  const staff = await createStaff(db, {
    grants: [
      { capability: "privacy.manage" },
      { capability: "settings.manage" },
      ...(access ? [{ capability: "access.grant" as const }] : []),
    ],
  });
  await db.insert(passkeys).values(
    [0, 1].map(() => ({
      principalId: staff.id,
      credentialId: randomUUID(),
      publicKey: Buffer.from([1]),
      deviceType: "singleDevice",
      backedUp: false,
    })),
  );
  const staffSession = await createSession(db, { kind: "staff", id: staff.id });
  const client = await createClient(db),
    other = await createClient(db);
  const clientSession = await createSession(db, { kind: "client", id: client.id });
  const otherSession = await createSession(db, { kind: "client", id: other.id });
  await db
    .update(parties)
    .set({
      contactPreferences: { channel: "email", contactWindow: "Synthetic window" },
      matchingAliases: ["Synthetic optional alias"],
      givenName: "Synthetic retained name",
    })
    .where(eq(parties.id, client.partyId));
  const [contact] = await db
    .insert(contactMethods)
    .values({
      partyId: client.partyId,
      kind: "email",
      value: client.email,
      normalizedValue: client.email,
      verification: "verified",
      verifiedAt: new Date(),
    })
    .returning();
  if (!contact) throw new Error("Missing synthetic contact");
  const [stream] = await db
    .insert(subscriptions)
    .values({
      partyId: client.partyId,
      contactMethodId: contact.id,
      purpose: "search_alerts",
      state: "active",
      verifiedAt: new Date(),
      criteria: { q: "Synthetic criteria" },
      criteriaSummary: "Synthetic criteria",
      frequency: "daily",
      timezone: "Europe/Sofia",
      policyVersion: "synthetic-only:bg",
      unsubscribeTokenHash: randomUUID(),
    })
    .returning();
  const [request] = await db
    .insert(privacyRequests)
    .values({
      reference: `ER-${randomUUID()}`,
      kind: "deletion",
      state: "in_progress",
      partyId: client.partyId,
      responsibleId: staff.id,
      verifiedAt: new Date(),
      dueAt: new Date(Date.now() + 86400000),
      scope: {
        policyReference: "Synthetic policy only",
        description: "Own synthetic optional copies",
      },
    })
    .returning();
  if (!request || !stream) throw new Error("Missing synthetic privacy request");
  return {
    staff,
    staffSession,
    client,
    clientSession,
    other,
    otherSession,
    contact,
    stream,
    request,
  };
}
export async function syntheticErasurePolicy(
  db: Executor,
  fixture: Awaited<ReturnType<typeof syntheticErasureFixture>>,
) {
  const model = await readOperatingPolicy(db, fixture.staffSession.session);
  await saveOperatingPolicy(db, fixture.staffSession.session, {
    operationId: randomUUID(),
    expectedVersion: model.draft.version,
    document: {
      ...emptyOperatingPolicy,
      responsibilities: { service: null, privacy: fixture.staff.id, alerts: fixture.staff.id },
      contactPurposes: {
        service: null,
        savedSearch: "Synthetic reviewed optional-search purpose",
        marketing: "Synthetic reviewed optional-marketing purpose",
      },
      retentionReference: "Synthetic reference; per-source review still required",
      processReference: `Synthetic edition ${randomUUID()}`,
    },
  });
  const { draft } = await readOperatingPolicy(db, fixture.staffSession.session);
  return approveOperatingPolicy(db, fixture.staffSession.session, {
    operationId: randomUUID(),
    expectedVersion: draft.version,
    expectedHash: draft.contentHash ?? "",
    reviewed: true,
    note: "Synthetic policy edition for disposable tests; not real approval",
  });
}
