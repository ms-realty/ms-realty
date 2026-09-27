// Human references from the yearly counters in reference_sequences (src/domain/ids.ts), taken
// inside the caller's transaction so a rolled-back record does not consume a number.
import "server-only";
import { sql } from "drizzle-orm";
import { referenceSequences } from "@/db/schema";
import { formatReference, type HumanReference, type ReferenceKind } from "@/domain/ids";
import type { Executor } from "./db";

export async function nextReference(
  db: Executor,
  kind: Exclude<ReferenceKind, "listing">,
  now: Date = new Date(),
): Promise<HumanReference> {
  const year = now.getUTCFullYear();
  const [row] = await db
    .insert(referenceSequences)
    .values({ kind, year, lastValue: 1 })
    .onConflictDoUpdate({
      target: [referenceSequences.kind, referenceSequences.year],
      set: { lastValue: sql`${referenceSequences.lastValue} + 1` },
    })
    .returning({ lastValue: referenceSequences.lastValue });
  if (!row) throw new Error("Reference sequence returned no row.");
  return formatReference(kind, year, row.lastValue);
}
