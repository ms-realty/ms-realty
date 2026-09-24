// Business timeline (spec §07.7): human-readable entries written in the same transaction as the
// change they describe. The audience decides who may ever see an entry.
import "server-only";
import { activityEvents } from "@/db/schema";
import type { Actor } from "@/domain/capabilities";
import type { Audience } from "@/domain/parties";
import type { Executor } from "./db";

/** internal: staff only · participants: named case participants · public: approved public copy. */
export type ActivityAudience = "internal" | "participants" | "public";

const audienceColumn: Record<ActivityAudience, Audience> = {
  internal: "internal",
  participants: "case_participants",
  public: "public",
};

export interface ActivityEntry {
  readonly recordType: string;
  readonly recordId: string;
  readonly reference?: string;
  /** Catalog key for localized rendering, e.g. `activity.inquiry.assigned`. */
  readonly messageKey: string;
  readonly params?: Record<string, unknown>;
  /** Plain-language summary for staff; no technical payload. */
  readonly summary: string;
  readonly audience?: ActivityAudience;
  readonly actor: Actor;
  readonly operationId?: string;
  readonly at?: Date;
}

export async function recordActivity(db: Executor, entry: ActivityEntry): Promise<string> {
  const [row] = await db
    .insert(activityEvents)
    .values({
      recordType: entry.recordType,
      recordId: entry.recordId,
      reference: entry.reference,
      messageKey: entry.messageKey,
      params: entry.params ?? {},
      summary: entry.summary,
      audience: audienceColumn[entry.audience ?? "internal"],
      actorKind: entry.actor.kind,
      actorId: entry.actor.id,
      operationId: entry.operationId,
      ...(entry.at ? { occurredAt: entry.at } : {}),
    })
    .returning({ id: activityEvents.id });
  if (!row) throw new Error("Activity insert returned no row.");
  return row.id;
}
