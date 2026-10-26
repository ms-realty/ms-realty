import "server-only";
import { and, eq } from "drizzle-orm";
import { privacyProcessingRestrictions } from "@/db/schema";
import type { Executor } from "../db";

/** Read at each new opt-in, dispatch and private-access boundary; queued snapshots grant nothing. */
export async function privacyProcessingRestricted(db: Executor, partyId: string, purpose: string) {
  const [row] = await db
    .select({ partyId: privacyProcessingRestrictions.partyId })
    .from(privacyProcessingRestrictions)
    .where(
      and(
        eq(privacyProcessingRestrictions.partyId, partyId),
        eq(privacyProcessingRestrictions.purpose, purpose),
      ),
    );
  return Boolean(row);
}
