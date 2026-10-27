// AT45 / UX23 / AT64: a controlled synthetic-only reapplication, never a reopening tool.
import "server-only";
import { createPublicKey, verify } from "node:crypto";
import { asc, eq, gt, sql } from "drizzle-orm";
import { z } from "zod";
import { privacySafetyDecisions } from "@/db/schema";
import { canonicalJson } from "@/domain/approval";
import {
  emptySafetyDigest,
  type SafetyTailEntry,
  syntheticPrivacyCheckpoint,
  syntheticPrivacyTail,
} from "@/domain/privacy-erasure";
import type { Executor } from "../db";
import { lockErasureSources } from "../privacy/erasure-inventory";
import {
  applyPrivacySafetyEffect,
  lockPrivacySafetyLedger,
  privacySafetyHead,
  recordPrivacyPropagation,
  safetyEntryDigest,
} from "../privacy/safety-ledger";
import { quarantineRestoredDatabase } from "./quarantine";

async function assertSyntheticDestination(db: Executor) {
  const [name] = await db.execute<{ name: string }>(sql`select current_database() as name`);
  if (!/^test_[a-f0-9]{32}$/.test(name?.name ?? ""))
    throw new Error("Privacy-tail rehearsal only accepts an owned disposable test database.");
}

/** Read source entries for a synthetic harness. This local database cannot attest that
 * newer history is absent outside itself; the separately signed test manifest must bind
 * the complete contiguous tail. No production archive/watermark service is implemented. */
export async function syntheticPrivacySafetyEntries(db: Executor, after: number) {
  await assertSyntheticDestination(db);
  const rows = await db
    .select()
    .from(privacySafetyDecisions)
    .where(gt(privacySafetyDecisions.sequence, z.number().int().min(0).parse(after)))
    .orderBy(asc(privacySafetyDecisions.sequence));
  return rows.map((row) => ({ ...row, recordedAt: row.recordedAt.toISOString() }));
}

const restoreBinding = z
  .object({ restoreId: z.uuid(), snapshotDigest: z.string().regex(/^[a-f0-9]{64}$/) })
  .strict();

/** `trustedPublicKey` comes from the isolated operator/test trust input, never the tail file.
 * Signature + chain + complete signed bounds establish only this synthetic privacy tail.
 * Global quarantine remains: other safety histories, custody, objects, provider outcomes and
 * actual independent archival completeness still require external operator proof. */
export async function reapplySyntheticPrivacyTail(
  db: Executor,
  input: {
    restoreId: string;
    snapshotDigest: string;
    manifest: unknown;
    signature: string;
    trustedPublicKey: string;
    checkpoint: unknown;
    checkpointSignature: string;
  },
) {
  await assertSyntheticDestination(db);
  const binding = restoreBinding.parse({
    restoreId: input.restoreId,
    snapshotDigest: input.snapshotDigest,
  });
  // Persist the existing credential/startup/queue fence BEFORE parsing an absent/bad tail.
  await quarantineRestoredDatabase(db, binding);
  const manifest = syntheticPrivacyTail.parse(input.manifest);
  const checkpoint = syntheticPrivacyCheckpoint.parse(input.checkpoint);
  let signatureValid = false;
  try {
    const key = createPublicKey(input.trustedPublicKey);
    if (key.asymmetricKeyType !== "ed25519") throw new Error("Unsupported synthetic trust key.");
    signatureValid =
      /^[A-Za-z0-9+/]+={0,2}$/.test(input.signature) &&
      verify(
        null,
        Buffer.from(canonicalJson(manifest)),
        key,
        Buffer.from(input.signature, "base64"),
      ) &&
      verify(
        null,
        Buffer.from(canonicalJson(checkpoint)),
        key,
        Buffer.from(input.checkpointSignature, "base64"),
      );
  } catch {
    /* Invalid trust/key input cannot reopen the already quarantined destination. */
  }
  if (
    !signatureValid ||
    manifest.restoreId !== binding.restoreId ||
    manifest.snapshotDigest !== binding.snapshotDigest
  )
    throw new Error("Synthetic privacy tail signature or restore binding is invalid.");
  if (
    checkpoint.restoreId !== binding.restoreId ||
    checkpoint.snapshotDigest !== binding.snapshotDigest ||
    checkpoint.throughSequence !== manifest.throughSequence ||
    checkpoint.headDigest !== manifest.headDigest
  )
    throw new Error("Synthetic tail does not reach the separately trusted signed watermark.");
  if (
    manifest.throughSequence < manifest.snapshotSequence ||
    manifest.entries.length !== manifest.throughSequence - manifest.snapshotSequence
  )
    throw new Error("Synthetic privacy tail is incomplete.");
  let sequence = manifest.snapshotSequence,
    digest = manifest.snapshotLedgerDigest;
  if (sequence === 0 && digest !== emptySafetyDigest)
    throw new Error("Invalid empty snapshot ledger.");
  for (const entry of manifest.entries) {
    const { digest: entryDigest, ...fields } = entry;
    if (
      entry.sequence !== ++sequence ||
      entry.previousDigest !== digest ||
      safetyEntryDigest(fields) !== entryDigest ||
      entry.partyId !== entry.effect.partyId ||
      (entry.effect.kind === "privacy_restriction_v1" &&
        entry.requestId !== entry.effect.requestId) ||
      (entry.effect.kind === "subscription_withdrawal_v1" && entry.requestId !== null)
    )
      throw new Error("Synthetic privacy tail chain or scope is invalid.");
    digest = entryDigest;
  }
  if (sequence !== manifest.throughSequence || digest !== manifest.headDigest)
    throw new Error("Synthetic privacy tail watermark does not match its complete chain.");
  return db.transaction(async (tx) => {
    await lockErasureSources(tx);
    await lockPrivacySafetyLedger(tx);
    const head = await privacySafetyHead(tx);
    const [anchor] =
      manifest.snapshotSequence === 0
        ? []
        : await tx
            .select()
            .from(privacySafetyDecisions)
            .where(eq(privacySafetyDecisions.sequence, manifest.snapshotSequence));
    if (
      (anchor?.digest ?? emptySafetyDigest) !== manifest.snapshotLedgerDigest ||
      head.sequence < manifest.snapshotSequence ||
      head.sequence > manifest.throughSequence
    )
      throw new Error("Synthetic tail does not belong to this restored snapshot ledger.");
    let applied = 0;
    for (const entry of manifest.entries) {
      const [existing] = await tx
        .select()
        .from(privacySafetyDecisions)
        .where(eq(privacySafetyDecisions.sequence, entry.sequence));
      if (existing) {
        const normalized: SafetyTailEntry = {
          ...existing,
          recordedAt: existing.recordedAt.toISOString(),
        };
        if (canonicalJson(normalized) !== canonicalJson(entry))
          throw new Error("Conflicting destination safety decision.");
        continue;
      }
      const before = await privacySafetyHead(tx);
      if (before.sequence + 1 !== entry.sequence || before.digest !== entry.previousDigest)
        throw new Error("Destination safety history has a gap.");
      await tx
        .insert(privacySafetyDecisions)
        .values({ ...entry, recordedAt: new Date(entry.recordedAt) });
      const effect = await applyPrivacySafetyEffect(tx, entry.effect, entry.sequence, {
        kind: "system",
        id: "offline-privacy-tail",
      });
      await recordPrivacyPropagation(tx, entry.sequence, "restore_reapplication", "applied", {
        restoreId: binding.restoreId,
        ...effect,
      });
      await recordPrivacyPropagation(tx, entry.sequence, "independent_archive", "held", {
        reason: "synthetic_tail_is_not_independent_production_completeness_proof",
      });
      applied++;
    }
    const final = await privacySafetyHead(tx);
    if (final.sequence !== manifest.throughSequence || final.digest !== manifest.headDigest)
      throw new Error("Destination did not reach the signed synthetic watermark.");
    return {
      applied,
      throughSequence: final.sequence,
      quarantine: "quarantined" as const,
      privacyTail: "synthetic_verified" as const,
      independentArchive: "unverified" as const,
      runtimeReopened: false as const,
      externalActionsReplayed: false as const,
    };
  });
}
