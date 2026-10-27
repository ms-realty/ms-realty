// B11/O26/O27 · AT45/AT56. Explicit historical service sources, never ownership proof.
import "server-only";
import { and, asc, eq, inArray, or, sql } from "drizzle-orm";
import { z } from "zod";
import { caseParticipants, cases, inquiries } from "@/db/schema";
import type { Actor } from "@/domain/capabilities";
import { publicLocales } from "@/domain/ids";
import { contentReferenceSchema } from "@/domain/inquiry-content";
import { serviceCaseContextSchema } from "@/domain/service-scope";
import { countActivePasskeys, staffPasskeyMinimum } from "../auth/passkeys";
import { can } from "../authz";
import { getEnv } from "../config/env";
import { hashRequest, keyedHash } from "../crypto";
import type { Executor } from "../db";
import { AppError } from "../errors";

const revision = (value: unknown) =>
  keyedHash(
    getEnv().authSecret,
    `service-context-revision:v1:${hashRequest(JSON.parse(JSON.stringify(value ?? null)))}`,
  );
/** Only the declared stored service field enters this opaque fence. No JSON discovery. */
export function serviceContextRevision(value: unknown) {
  const text = JSON.stringify(value ?? null);
  if (Buffer.byteLength(text) > 32_768) throw new AppError("validation_failed");
  return revision(value);
}

// This public edition identity is optional only for retained legacy context. A missing
// observation grants no authority to qualify or progress a service Case.
const retainedServiceSchema = serviceCaseContextSchema.extend({
  binding: serviceCaseContextSchema.shape.binding.extend({
    observedSource: contentReferenceSchema
      .extend({
        kind: z.literal("service"),
        contentHash: z.string().regex(/^[a-f0-9]{64}$/),
        locale: z.enum(publicLocales),
      })
      .optional(),
  }),
});
function disclosure(value: unknown) {
  const parsed = retainedServiceSchema.safeParse(value);
  if (!parsed.success) return null;
  const { request, binding } = parsed.data;
  if (
    request.scopeVersionId !== binding.scopeVersionId ||
    request.topic !== binding.offering.topic ||
    request.regionId !== binding.offering.regionId
  )
    return null;
  return {
    basis: "self_declared_request" as const,
    request: {
      version: request.version,
      topic: request.topic,
      scopeVersionId: request.scopeVersionId,
      regionId: request.regionId,
      location: request.location,
      needs: request.needs,
      ...(request.requestedFrom ? { requestedFrom: request.requestedFrom } : {}),
      ...(request.requestedUntil ? { requestedUntil: request.requestedUntil } : {}),
      ...(request.relationship ? { relationship: request.relationship } : {}),
    },
    source: {
      scopeVersionId: binding.scopeVersionId,
      scopeVersion: binding.scopeVersion,
      sourceUrl: binding.sourceUrl,
      ...(binding.observedSource ? { observedSource: binding.observedSource } : {}),
    },
  };
}
type ServiceDisclosure = NonNullable<ReturnType<typeof disclosure>>;
export interface ServiceDisclosureRow {
  id: string;
  source: "inquiry" | "case";
  reference: string;
  text: string;
  context: ServiceDisclosure | null;
}
const bounded = <T>(rows: T[]): T[] => {
  if (rows.length > 1000) throw new AppError("validation_failed");
  return rows;
};

/** Staff-policy drafts/editions are not subject links. Historical stored contexts are read
 * without consulting today's offering; expiry never erases a person's original request. */
export async function collectServiceSources(db: Executor, actor: Actor, partyId: string) {
  const own = bounded(
    await db
      .select({
        id: inquiries.id,
        reference: inquiries.reference,
        caseId: inquiries.caseId,
        locale: inquiries.preferredLocale,
        service: sql<unknown>`${inquiries.context}->'service'`,
      })
      .from(inquiries)
      .where(
        and(
          eq(inquiries.partyId, partyId),
          or(eq(inquiries.purpose, "service_consultation"), sql`${inquiries.context} ? 'service'`),
        ),
      )
      .orderBy(asc(inquiries.id))
      .limit(1001),
  );
  const records = bounded(
    await db
      .select({
        id: cases.id,
        reference: cases.reference,
        kind: cases.kind,
        topic: cases.serviceTopic,
        service: cases.serviceContext,
      })
      .from(cases)
      .where(
        and(
          or(eq(cases.kind, "service_intake"), sql`${cases.serviceContext} is not null`),
          or(
            inArray(
              cases.id,
              db
                .select({ id: caseParticipants.caseId })
                .from(caseParticipants)
                .where(eq(caseParticipants.partyId, partyId)),
            ),
            own.some((row) => row.caseId)
              ? inArray(
                  cases.id,
                  own.flatMap((row) => (row.caseId ? [row.caseId] : [])),
                )
              : undefined,
          ),
        ),
      )
      .orderBy(asc(cases.id))
      .limit(1001),
  );
  const ids = records.map((row) => row.id);
  const participants = ids.length
    ? bounded(
        await db
          .select({
            id: caseParticipants.id,
            caseId: caseParticipants.caseId,
            partyId: caseParticipants.partyId,
            version: caseParticipants.version,
            validFrom: caseParticipants.validFrom,
            expiresAt: caseParticipants.expiresAt,
            revokedAt: caseParticipants.revokedAt,
          })
          .from(caseParticipants)
          .where(inArray(caseParticipants.caseId, ids))
          .orderBy(asc(caseParticipants.id))
          .limit(1001),
      )
    : [];
  const origins = ids.length
    ? bounded(
        await db
          .select({
            id: inquiries.id,
            caseId: inquiries.caseId,
            partyId: inquiries.partyId,
            service: sql<unknown>`${inquiries.context}->'service'`,
          })
          .from(inquiries)
          .where(inArray(inquiries.caseId, ids))
          .orderBy(asc(inquiries.id))
          .limit(1001),
      )
    : [];
  const rows: ServiceDisclosureRow[] = [];
  const readableActor =
    actor.kind === "staff" && (await countActivePasskeys(db, actor.id)) >= staffPasskeyMinimum;
  for (const row of [...own, ...records, ...origins]) serviceContextRevision(row.service);
  let ownBlocked = false,
    jointBlocked = false;
  for (const row of own) {
    const context = disclosure(row.service);
    if (
      !readableActor ||
      !context ||
      !(await can(db, actor, "inquiry.read", {
        type: "inquiry",
        id: row.id,
        caseId: row.caseId ?? undefined,
        locale: row.locale ?? undefined,
        audience: "internal",
      }))
    ) {
      ownBlocked = true;
      continue;
    }
    rows.push({
      id: row.id,
      source: "inquiry",
      reference: row.reference,
      text: context.request.needs,
      context,
    });
  }
  for (const row of records) {
    const context = disclosure(row.service),
      links = participants.filter((link) => link.caseId === row.id),
      sources = origins.filter((origin) => origin.caseId === row.id),
      original = own.filter((origin) => origin.caseId === row.id);
    const resource = { type: "case", id: row.id, caseId: row.id, audience: "internal" as const };
    if (
      !readableActor ||
      !context ||
      row.kind !== "service_intake" ||
      row.topic !== context.request.topic ||
      !links.length ||
      links.some((link) => link.partyId !== partyId) ||
      !original.length ||
      sources.some((origin) => origin.partyId !== partyId) ||
      original.some(
        (origin) => serviceContextRevision(origin.service) !== serviceContextRevision(row.service),
      ) ||
      original.some(
        (origin) => !rows.some((item) => item.source === "inquiry" && item.id === origin.id),
      ) ||
      !(await can(db, actor, "case.read", resource)) ||
      !(await can(db, actor, "case.read_internal", resource))
    ) {
      jointBlocked = true;
      continue;
    }
    rows.push({
      id: row.id,
      source: "case",
      reference: row.reference,
      text: context.request.needs,
      context,
    });
  }
  return {
    rows,
    ownBlocked,
    jointBlocked,
    revision: revision({ own, records, participants, origins }),
  };
}
