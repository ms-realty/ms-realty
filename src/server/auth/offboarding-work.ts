import "server-only";
import { and, asc, eq, ne, notInArray } from "drizzle-orm";
import { z } from "zod";
import { cases, inquiries, keySets, tasks } from "@/db/schema";
import { can, resolveGrants } from "../authz";
import { caseVisibility } from "../cases/shared";
import type { Executor } from "../db";
import { parseInput, visibleWhere } from "../work/shared";
import { offboardingOperator } from "./grants";
import type { Session } from "./sessions";

/** Access administration alone never grants access to the details of retained work. */
export async function readOffboardingWork(
  db: Executor,
  session: Session,
  targetId: string,
  page = 1,
) {
  const live = await offboardingOperator(db, session);
  const id = parseInput(z.uuid(), targetId);
  page = parseInput(z.number().int().min(1).max(10000), page);
  const grants = await resolveGrants(db, live.actor);
  const offset = (page - 1) * 25;
  const [ownedCases, ownedTasks, ownedInquiries, heldKeys] = await Promise.all([
    db
      .select({ id: cases.id, reference: cases.reference, title: cases.title })
      .from(cases)
      .where(
        and(eq(cases.ownerId, id), ne(cases.disposition, "closed"), await caseVisibility(db, live)),
      )
      .orderBy(asc(cases.id))
      .limit(26)
      .offset(offset),
    db
      .select({ id: tasks.id, title: tasks.title })
      .from(tasks)
      .where(
        and(
          eq(tasks.ownerId, id),
          notInArray(tasks.state, ["done", "cancelled"]),
          visibleWhere(grants, "task.manage", "task"),
        ),
      )
      .orderBy(asc(tasks.id))
      .limit(26)
      .offset(offset),
    db
      .select({ id: inquiries.id, reference: inquiries.reference })
      .from(inquiries)
      .where(
        and(
          eq(inquiries.ownerId, id),
          notInArray(inquiries.state, ["linked_to_case", "resolved_without_case"]),
          visibleWhere(grants, "inquiry.read", "inquiry"),
        ),
      )
      .orderBy(asc(inquiries.id))
      .limit(26)
      .offset(offset),
    (await can(db, live.actor, "key.manage"))
      ? db
          .select({ id: keySets.id, reference: keySets.reference })
          .from(keySets)
          .where(and(eq(keySets.holderId, id), eq(keySets.state, "checked_out")))
          .orderBy(asc(keySets.id))
          .limit(26)
          .offset(offset)
      : [],
  ]);
  return {
    cases: ownedCases.slice(0, 25),
    tasks: ownedTasks.slice(0, 25),
    inquiries: ownedInquiries.slice(0, 25),
    keys: heldKeys.slice(0, 25),
    page,
    hasMore: [ownedCases, ownedTasks, ownedInquiries, heldKeys].some((rows) => rows.length > 25),
  };
}
