import { sql } from "drizzle-orm";
import { check, jsonb, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { instant } from "./columns";

/** A completed queue heartbeat, not evidence of provider delivery or backup completion. */
export const workerProgress = pgTable("worker_progress", {
  key: text("key").primaryKey(),
  buildSha: text("build_sha").notNull(),
  completedAt: instant("completed_at").notNull(),
});

/** Offline restore quarantine. Absence is an error, never permission to serve a restored DB. */
export const recoveryControl = pgTable(
  "recovery_control",
  {
    key: text("key").primaryKey(),
    state: text("state").notNull(),
    restoreId: uuid("restore_id"),
    snapshotDigest: text("snapshot_digest"),
    quarantinedAt: instant("quarantined_at"),
    invalidated: jsonb("invalidated").$type<Record<string, number>>(),
  },
  (t) => [
    check("recovery_control_singleton", sql`${t.key} = 'runtime'`),
    check("recovery_control_state", sql`${t.state} in ('normal', 'quarantined')`),
    check(
      "recovery_control_quarantine_evidence",
      sql`${t.state} = 'normal' or (${t.restoreId} is not null and ${t.snapshotDigest} is not null and ${t.snapshotDigest} ~ '^[a-f0-9]{64}$' and ${t.quarantinedAt} is not null and ${t.invalidated} is not null)`,
    ),
  ],
);
