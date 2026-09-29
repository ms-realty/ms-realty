import "server-only";
import { and, asc, eq, inArray, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { cases, inquiries, keySets, principals, tasks } from "@/db/schema";
import type { Session } from "../auth/sessions";
import { can, resolveGrants } from "../authz";
import { caseVisibility } from "../cases/shared";
import type { Executor } from "../db";
import { ownerNeedsCoverage } from "./coverage-policy";
import { liveStaff, openInquiryStates, openTaskStates, parseInput, visibleWhere } from "./shared";

export const coveragePageSize = 25;

/** Filter each category before pagination. Seeing a queue never confers record authority. */
export async function readCoverage(db: Executor, session: Session, page = 1) {
  const live = await liveStaff(db, session);
  const grants = await resolveGrants(db, live.actor);
  page = parseInput(z.number().int().min(1).max(10000), page);
  const offset = (page - 1) * coveragePageSize;
  const due = sql<Date | null>`case when ${tasks.state} = 'waiting' then ${tasks.followUpAt} else ${tasks.dueAt} end`;
  const [caseRows, taskRows, inquiryRows, keyRows] = await Promise.all([
    db
      .select({
        id: cases.id,
        reference: cases.reference,
        title: cases.title,
        ownerName: principals.displayName,
        dueAt: sql<Date | null>`coalesce(${cases.nextActionDueAt}, ${cases.reviewAt})`.mapWith(
          cases.nextActionDueAt,
        ),
      })
      .from(cases)
      .leftJoin(principals, eq(principals.id, cases.ownerId))
      .where(
        and(
          ne(cases.disposition, "closed"),
          ownerNeedsCoverage(cases.ownerId),
          await caseVisibility(db, live),
        ),
      )
      .orderBy(asc(sql`coalesce(${cases.nextActionDueAt}, ${cases.reviewAt})`), asc(cases.id))
      .limit(coveragePageSize + 1)
      .offset(offset),
    db
      .select({
        id: tasks.id,
        title: tasks.title,
        ownerName: principals.displayName,
        dueAt: due.mapWith(tasks.dueAt),
        promisedToClient: tasks.promisedToClient,
      })
      .from(tasks)
      .leftJoin(principals, eq(principals.id, tasks.ownerId))
      .where(
        and(
          inArray(tasks.state, [...openTaskStates]),
          ownerNeedsCoverage(tasks.ownerId),
          visibleWhere(grants, "task.manage", "task"),
        ),
      )
      .orderBy(asc(due), asc(tasks.id))
      .limit(coveragePageSize + 1)
      .offset(offset),
    db
      .select({
        id: inquiries.id,
        reference: inquiries.reference,
        ownerName: principals.displayName,
        dueAt: inquiries.followUpAt,
      })
      .from(inquiries)
      .leftJoin(principals, eq(principals.id, inquiries.ownerId))
      .where(
        and(
          inArray(inquiries.state, [...openInquiryStates]),
          ownerNeedsCoverage(inquiries.ownerId),
          visibleWhere(grants, "inquiry.read", "inquiry"),
        ),
      )
      .orderBy(asc(inquiries.followUpAt), asc(inquiries.createdAt), asc(inquiries.id))
      .limit(coveragePageSize + 1)
      .offset(offset),
    (await can(db, live.actor, "key.manage"))
      ? db
          .select({
            id: keySets.id,
            reference: keySets.reference,
            ownerName: principals.displayName,
            dueAt: keySets.dueAt,
          })
          .from(keySets)
          .leftJoin(principals, eq(principals.id, keySets.holderId))
          .where(and(eq(keySets.state, "checked_out"), ownerNeedsCoverage(keySets.holderId)))
          .orderBy(asc(keySets.dueAt), asc(keySets.id))
          .limit(coveragePageSize + 1)
          .offset(offset)
      : [],
  ]);
  return {
    cases: caseRows.slice(0, coveragePageSize),
    tasks: taskRows.slice(0, coveragePageSize),
    inquiries: inquiryRows.slice(0, coveragePageSize),
    keys: keyRows.slice(0, coveragePageSize),
    hasMore: [caseRows, taskRows, inquiryRows, keyRows].some(
      (rows) => rows.length > coveragePageSize,
    ),
    page,
  };
}
