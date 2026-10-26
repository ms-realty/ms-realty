// Synthetic local fixtures only. These records never assert actual C06 business acceptance.
import { randomUUID } from "node:crypto";
import { geographyPlaces, passkeys } from "@/db/schema";
import { emptyOperatingPolicy, operatingPolicyId } from "@/domain/operating-policy";
import { type ServiceScope, serviceScopeId } from "@/domain/service-scope";
import { createSession } from "../auth/sessions";
import { createContent, decideContent, readContentWorkbench } from "../content/commands";
import { readApprovedContent } from "../content/public";
import type { Executor } from "../db";
import {
  approveOperatingPolicy,
  captureOperatingPolicy,
  readOperatingPolicy,
  saveOperatingPolicy,
} from "../operating-policy/service";
import { createStaff } from "../testing";
import { approveServiceScope, readServiceScope, saveServiceScope } from "./scope";

export async function syntheticServiceFixture(db: Executor) {
  const actor = await createStaff(db, {
    roles: ["assigned_broker"],
    grants: [
      { capability: "settings.manage", recordType: "settings", recordId: serviceScopeId },
      { capability: "settings.manage", recordType: "settings", recordId: operatingPolicyId },
      ...(
        ["content.edit", "listing.review_facts", "claim.approve", "publication.release"] as const
      ).map((capability) => ({ capability })),
    ],
  });
  await db.insert(passkeys).values({
    principalId: actor.id,
    credentialId: randomUUID(),
    publicKey: Buffer.from([1]),
    deviceType: "singleDevice",
    backedUp: false,
  });
  const { session } = await createSession(db, { kind: "staff", id: actor.id });
  const [region] = await db
    .insert(geographyPlaces)
    .values({
      countryCode: "BG",
      level: "settlement",
      slug: `synthetic-${randomUUID()}`,
      nameNative: "Синтетичен тестов район",
      nameLatin: "Synthetic test region",
    })
    .returning();
  if (!region) throw new Error("Synthetic region insert failed");
  const slug = `synthetic-service-${randomUUID()}`;
  const created = await createContent(db, session, {
    operationId: randomUUID(),
    kind: "service",
    slug,
    title: "Синтетична консултация — само тест",
    text: "Синтетичен обхват и условия за тест. Само човешка консултация. Не е действителна услуга или обещание за работа.",
    jurisdiction: "Synthetic only",
    reviewScope:
      "Synthetic test-only consultation terms and manual contact; no actual business acceptance",
  });
  for (const decision of ["claims", "editorial", "publish"] as const) {
    const { page } = await readContentWorkbench(db, session, created.outcome.id);
    await decideContent(db, session, {
      id: page.id,
      operationId: randomUUID(),
      expectedVersion: page.version,
      decision,
      reviewed: true,
      note: "Synthetic exact edition approval only",
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
    });
  }
  const content = await readApprovedContent(db, "service", slug, "bg");
  if (!content) throw new Error("Synthetic content not approved");
  await saveOperatingPolicy(db, session, {
    operationId: randomUUID(),
    expectedVersion: (await readOperatingPolicy(db, session)).draft.version,
    document: {
      ...emptyOperatingPolicy,
      coverage: "Synthetic source-bound scope registry only",
      responsibilities: { service: actor.id, privacy: null, alerts: null },
    },
  });
  const policyDraft = (await readOperatingPolicy(db, session)).draft;
  await approveOperatingPolicy(db, session, {
    operationId: randomUUID(),
    expectedVersion: policyDraft.version,
    expectedHash: policyDraft.contentHash ?? "",
    reviewed: true,
    note: "Synthetic operating policy, not actual business approval",
  });
  const policy = await captureOperatingPolicy(db);
  if (policy.kind !== "approved_operating_policy_v1") throw new Error("Synthetic policy missing");
  const source = {
    kind: "service" as const,
    slug,
    versionId: content.version.id,
    contentHash: content.version.contentHash,
  };
  const document: ServiceScope = {
    kind: "bounded_service_scope_v1",
    decisions: [
      {
        topic: "management_consultation",
        regionId: region.id,
        state: "offered",
        mode: "referral",
        regionVersion: region.version,
        publicSource: source,
        termsSource: source,
        ownerId: actor.id,
        fallback: { kind: "staff", principalId: actor.id },
        operatingPolicy: {
          id: policy.policyId,
          version: policy.policyVersion,
          contentHash: policy.contentHash,
        },
        reviewExpiresAt: new Date(Date.now() + 86400000).toISOString(),
      },
      { topic: "short_stay_consultation", regionId: region.id, state: "unknown" },
    ],
  };
  const approved = await publishSyntheticScope(db, session, document);
  return {
    actor,
    session,
    region,
    source,
    document,
    approved,
    content,
    contentId: created.outcome.id,
    request: {
      version: 1 as const,
      topic: "management_consultation" as const,
      scopeVersionId: approved.outcome.id,
      regionId: region.id,
      location: "Synthetic declared place",
      needs: "Synthetic consultation request; clarify a possible manual referral",
      relationship: "unknown" as const,
    },
  };
}
export async function publishSyntheticScope(
  db: Executor,
  session: Parameters<typeof readServiceScope>[1],
  document: ServiceScope,
) {
  const draft = (await readServiceScope(db, session)).draft;
  const saved = await saveServiceScope(db, session, {
    operationId: randomUUID(),
    expectedVersion: draft.version,
    document,
  });
  return approveServiceScope(db, session, {
    operationId: randomUUID(),
    expectedVersion: saved.outcome.version,
    expectedHash: saved.outcome.contentHash,
    reviewed: true,
    note: "Synthetic human coverage decision only; actual C06 remains unknown",
  });
}
