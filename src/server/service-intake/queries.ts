import "server-only";
import { and, desc, eq, sql } from "drizzle-orm";
import { cases, contentPages, geographyPlaces, inquiries, principals } from "@/db/schema";
import { serviceCaseContextSchema } from "@/domain/service-scope";
import type { Session } from "../auth/sessions";
import { can, resolveGrants } from "../authz";
import { caseGrantVisibility, caseVisibility } from "../cases/shared";
import { readApprovedContent } from "../content/public";
import type { Executor } from "../db";
import { captureOperatingPolicy } from "../operating-policy/service";
import { liveStaff, visibleWhere } from "../work/shared";
import { publicServiceOfferings, readServiceScope, serviceScopeResource } from "./scope";

/** O29: permissions are applied in SQL before counts, order and pagination. */
export async function serviceQueue(db: Executor, session: Session, page = 1) {
  const live = await liveStaff(db, session),
    grants = await resolveGrants(db, live.actor);
  const offset = (Math.max(1, Math.min(10000, Number.isSafeInteger(page) ? page : 1)) - 1) * 30;
  const [requests, records, offerings, mayReview] = await Promise.all([
    db
      .select({
        id: inquiries.id,
        reference: inquiries.reference,
        state: inquiries.state,
        ownerName: principals.displayName,
        createdAt: inquiries.createdAt,
        followUpAt: inquiries.followUpAt,
        context: inquiries.context,
        total: sql<number>`count(*) over()`.mapWith(Number),
      })
      .from(inquiries)
      .leftJoin(principals, eq(principals.id, inquiries.ownerId))
      .where(
        and(
          visibleWhere(grants, "inquiry.read", "inquiry"),
          eq(inquiries.purpose, "service_consultation"),
          sql`${inquiries.caseId} is null`,
        ),
      )
      .orderBy(desc(inquiries.createdAt), desc(inquiries.id))
      .limit(30)
      .offset(offset),
    caseVisibility(db, live).then((visible) =>
      db
        .select({
          id: cases.id,
          reference: cases.reference,
          title: cases.title,
          topic: cases.serviceTopic,
          stage: cases.stage,
          disposition: cases.disposition,
          nextAction: sql<
            string | null
          >`case when ${caseGrantVisibility(grants, "case.read_internal")} then ${cases.nextAction} else null end`,
          dueAt:
            sql<Date | null>`case when ${caseGrantVisibility(grants, "case.read_internal")} then ${cases.nextActionDueAt} else null end`.mapWith(
              cases.nextActionDueAt,
            ),
          ownerName: principals.displayName,
          total: sql<number>`count(*) over()`.mapWith(Number),
        })
        .from(cases)
        .leftJoin(principals, eq(principals.id, cases.ownerId))
        .where(and(visible, eq(cases.kind, "service_intake")))
        .orderBy(desc(cases.updatedAt), desc(cases.id))
        .limit(30)
        .offset(offset),
    ),
    publicServiceOfferings(db),
    can(db, live.actor, "settings.manage", serviceScopeResource),
  ]);
  return {
    requests: requests.map(({ context, ...row }) => {
      const parsed = serviceCaseContextSchema.safeParse(
        (context as { service?: unknown } | null)?.service,
      );
      return { ...row, topic: parsed.success ? parsed.data.request.topic : null };
    }),
    cases: records,
    offerings,
    mayReview,
    requestCount: requests[0]?.total ?? 0,
    caseCount: records[0]?.total ?? 0,
    hasMore: (requests[0]?.total ?? 0) > offset + 30 || (records[0]?.total ?? 0) > offset + 30,
  };
}
export async function serviceScopeChoices(db: Executor, session: Session) {
  await readServiceScope(db, session);
  const [regions, people, pages, policy] = await Promise.all([
    db
      .select({
        id: geographyPlaces.id,
        version: geographyPlaces.version,
        name: geographyPlaces.nameNative,
      })
      .from(geographyPlaces)
      .orderBy(geographyPlaces.nameNative)
      .limit(1000),
    db
      .select({ id: principals.id, name: principals.displayName })
      .from(principals)
      .where(and(eq(principals.kind, "staff"), eq(principals.status, "active")))
      .orderBy(principals.displayName)
      .limit(100),
    db
      .select({ kind: contentPages.kind, slug: contentPages.slug })
      .from(contentPages)
      .where(sql`${contentPages.kind} in ('service', 'help')`)
      .orderBy(contentPages.slug)
      .limit(300),
    captureOperatingPolicy(db),
  ]);
  const sources = [];
  for (const page of pages) {
    const content = await readApprovedContent(db, page.kind, page.slug, "bg");
    if (content)
      sources.push({
        label: `${content.title} · ${content.version.number}`,
        value: JSON.stringify({
          kind: page.kind,
          slug: page.slug,
          versionId: content.version.id,
          contentHash: content.version.contentHash,
        }),
        kind: page.kind,
      });
  }
  return { regions, people, sources, policy };
}
