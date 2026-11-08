// R08 D01-D03: no ACK table, no mutation, no caller transaction and no receipt-as-body fallback.
import "server-only";
import { eq } from "drizzle-orm";
import { recoveryJournal, recoveryPayloads, recoverySource } from "@/db/schema";
import { canonicalJson } from "@/domain/approval";
import {
  bytes,
  demand,
  maxMetadataBytes,
  type SourceObservation,
  same,
  sourceObservation,
} from "../../../../gateway/recovery-coordinator-contract";
import type { Database } from "../../db";
import {
  decodeAccessRecoveryRestriction,
  encodeAccessRecoveryRestriction,
} from "../access-restrictions";
import {
  encodeRecoveryRestriction,
  readCommittedRecoveryBatch,
  recoveryRestriction,
} from "../journal";
import {
  emptyRecoveryCursor,
  type RecoveryCursor,
  type RecoverySourceContext,
  requireRecoveryPool,
  requireSourceContext,
} from "../write-fence";

type Batch = Awaited<ReturnType<typeof readCommittedRecoveryBatch>>;
export function validatePayload(
  context: RecoverySourceContext,
  row: Pick<
    typeof recoveryPayloads.$inferSelect,
    "canonicalBody" | "byteLength" | "contextDigest" | "kind" | "subjectDigest" | "digest"
  >,
  effect: Batch["entries"][number]["effects"][number],
  maxBytes: number,
) {
  demand(row.byteLength <= maxBytes, "oversized payload unsupported; no multipart/split");
  const decoded = JSON.parse(row.canonicalBody);
  const encoded =
    Array.isArray(decoded) && decoded[0] === "recovery-access-restriction-v2"
      ? encodeAccessRecoveryRestriction(
          context,
          decodeAccessRecoveryRestriction(context, row.canonicalBody),
        )
      : (() => {
          demand(
            Array.isArray(decoded) &&
              decoded.length === 3 &&
              decoded[0] === "recovery-restriction-v1",
            "payload codec differs",
          );
          return encodeRecoveryRestriction(context, recoveryRestriction.parse(decoded[2]));
        })();
  demand(
    same(encoded, {
      contextDigest: row.contextDigest,
      kind: row.kind,
      subjectDigest: row.subjectDigest,
      digest: row.digest,
      canonicalBody: row.canonicalBody,
      byteLength: row.byteLength,
    }),
    "payload canonical binding conflict",
  );
  demand(
    effect.kind === row.kind &&
      effect.subjectDigest === row.subjectDigest &&
      effect.payloadDigest === row.digest,
    "payload reference conflict",
  );
  demand(
    bytes(row.canonicalBody).sha256 === row.digest &&
      bytes(row.canonicalBody).size === row.byteLength,
    "payload bytes conflict",
  );
  return Buffer.from(row.canonicalBody, "utf8");
}
export async function readReferencedPayloads(
  db: Database,
  context: RecoverySourceContext,
  batch: Batch,
  maxBytes: number,
) {
  requireRecoveryPool(db);
  demand(
    Number.isSafeInteger(maxBytes) && maxBytes > 0 && maxBytes <= 8 * 1024 * 1024,
    "invalid source bound",
  );
  return db.transaction(
    async (tx) => {
      const [source] = await tx
        .select()
        .from(recoverySource)
        .where(eq(recoverySource.key, "source"));
      const { contextDigest, source: verifiedSource } = requireSourceContext(source, context);
      demand(batch.contextDigest === contextDigest, "source batch context differs");
      const bodies = new Map<string, Buffer>();
      const payloads: SourceObservation["payloads"] = [];
      for (const entry of batch.entries) {
        const [committed] = await tx
          .select()
          .from(recoveryJournal)
          .where(eq(recoveryJournal.sequence, entry.sequence));
        demand(
          committed &&
            committed.contextDigest === contextDigest &&
            same(entry, {
              sequence: committed.sequence,
              transactionRef: committed.transactionRef,
              effects: committed.effects,
              previousDigest: committed.previousDigest,
              digest: committed.digest,
            }),
          "payload read requires exact committed entry",
        );
        for (const effect of entry.effects) {
          if (effect.kind === "accepted_operation" || effect.kind === "external_outcome") continue;
          const [meta] = await tx
            .select({ byteLength: recoveryPayloads.byteLength })
            .from(recoveryPayloads)
            .where(eq(recoveryPayloads.digest, effect.payloadDigest));
          demand(meta, "referenced payload missing");
          demand(meta.byteLength <= maxBytes, "oversized payload unsupported; no multipart/split");
          const [row] = await tx
            .select()
            .from(recoveryPayloads)
            .where(eq(recoveryPayloads.digest, effect.payloadDigest));
          demand(row, "referenced payload missing");
          const body = validatePayload(context, row, effect, maxBytes);
          if (!bodies.has(row.digest))
            payloads.push({
              kind: effect.kind,
              subjectDigest: effect.subjectDigest,
              plaintext: bytes(body),
            });
          bodies.set(row.digest, body);
        }
      }
      return {
        bodies,
        payloads,
        unresolvedWriters: [...verifiedSource.unresolvedWriters],
        epochState: verifiedSource.state === "admitted" ? ("open" as const) : ("unknown" as const),
      };
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}
export async function readArchiveSource(
  db: Database,
  context: RecoverySourceContext,
  anchor = emptyRecoveryCursor,
  limits = { maxEntries: 100, maxObjectBytes: 1024 * 1024 },
) {
  demand(
    Number.isSafeInteger(limits.maxObjectBytes) &&
      limits.maxObjectBytes > 0 &&
      limits.maxObjectBytes <= 8 * 1024 * 1024,
    "invalid source bound",
  );
  const batch = await readCommittedRecoveryBatch(
    db,
    context,
    anchor as RecoveryCursor,
    limits.maxEntries,
  );
  const payload = await readReferencedPayloads(db, context, batch, limits.maxObjectBytes);
  const observation = sourceObservation.parse({
    contextDigest: batch.contextDigest,
    from: batch.from,
    through: batch.through,
    committedThrough: batch.committedThrough,
    entries: batch.entries,
    payloads: payload.payloads,
    coverage: "incomplete",
    currentness: "unknown",
    epochState: payload.epochState,
    unresolvedWriters: payload.unresolvedWriters,
    unresolvedObjects: ["point_object_coverage_unqualified"],
    archiveBarrier: null,
  });
  // The source reader retains the committed codec verbatim. Metadata is safe to authenticate separately.
  demand(
    bytes(canonicalJson(observation)).size <= maxMetadataBytes,
    "source observation exceeds bound",
  );
  return { observation, bodies: payload.bodies };
}
