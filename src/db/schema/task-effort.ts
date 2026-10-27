// O22/F25: attributable manual observations, never inferred task duration.
import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  check,
  index,
  integer,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { createdAt, id } from "./columns";
import { principals } from "./identity";
import { operations } from "./records";
import { tasks } from "./work";

export const taskEffortEntries = pgTable(
  "task_effort_entries",
  {
    id: id(),
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id),
    actorId: uuid("actor_id")
      .notNull()
      .references(() => principals.id),
    operationId: uuid("operation_id")
      .notNull()
      .references(() => operations.id),
    action: text("action").notNull(),
    category: text("category"),
    minutes: integer("minutes"),
    reason: text("reason").notNull(),
    voidsId: uuid("voids_id").references((): AnyPgColumn => taskEffortEntries.id),
    createdAt: createdAt(),
  },
  (t) => [
    check(
      "task_effort_shape",
      sql`(${t.action} = 'record' and ${t.category} is not null and ${t.category} in ('correction','reentry') and ${t.minutes} is not null and ${t.minutes} between 1 and 480 and ${t.voidsId} is null) or (${t.action} = 'void' and ${t.category} is null and ${t.minutes} is null and ${t.voidsId} is not null)`,
    ),
    uniqueIndex("task_effort_void_once").on(t.voidsId),
    uniqueIndex("task_effort_operation_once").on(t.operationId),
    index("task_effort_task_idx").on(t.taskId, t.createdAt),
  ],
);
