import { pgTable, text } from "drizzle-orm/pg-core";
import { instant } from "./columns";

/** A completed queue heartbeat, not evidence of provider delivery or backup completion. */
export const workerProgress = pgTable("worker_progress", {
  key: text("key").primaryKey(),
  buildSha: text("build_sha").notNull(),
  completedAt: instant("completed_at").notNull(),
});
