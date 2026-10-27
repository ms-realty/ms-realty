// B10/O26/O27 · AT45/AT56: property preparation, never inferred customer ownership.
import "server-only";
import { and, asc, eq, inArray, or, type SQL, sql } from "drizzle-orm";
import {
  appointmentParticipants,
  appointments,
  appointmentVersions,
  caseParticipants,
  listings,
} from "@/db/schema";
import type { Actor } from "@/domain/capabilities";
import { propertyHostCan } from "../appointments/property-work";
import { countActivePasskeys, staffPasskeyMinimum } from "../auth/passkeys";
import { can } from "../authz";
import { getEnv } from "../config/env";
import { hashRequest, keyedHash } from "../crypto";
import type { Executor } from "../db";
import { AppError } from "../errors";

const commitment = (value: SQL) =>
  sql<string>`encode(sha256(convert_to(${value}::text, 'UTF8')), 'hex')`;
const opaque = (value: unknown) =>
  keyedHash(
    getEnv().authSecret,
    `photography-source-revision:v1:${hashRequest(JSON.parse(JSON.stringify(value)))}`,
  );
const bounded = <T>(rows: T[], max: number) => {
  if (rows.length > max) throw new AppError("validation_failed");
  return rows;
};

/** Only an opaque revision leaves this reader; no logistics, policy or snapshot is exposed. */
export async function appointmentSourceRevision(
  db: Executor,
  actor: Actor,
  id: string,
  lock = false,
  max = 1000,
) {
  const query = db
    .select({
      id: appointments.id,
      version: appointments.version,
      purpose: appointments.purpose,
      caseId: appointments.caseId,
      propertyId: appointments.propertyId,
      listingId: appointments.listingId,
      scope: commitment(sql`to_jsonb(${appointments.photographyScope})`),
    })
    .from(appointments)
    .where(eq(appointments.id, id));
  const [row] = await (lock ? query.for("share") : query);
  if (
    !row ||
    actor.kind !== "staff" ||
    (await countActivePasskeys(db, actor.id)) < staffPasskeyMinimum
  )
    return null;
  if (row.purpose === "photography") {
    const [listing] =
      row.listingId && row.propertyId
        ? await db
            .select({ id: listings.id })
            .from(listings)
            .where(and(eq(listings.id, row.listingId), eq(listings.propertyId, row.propertyId)))
        : [];
    if (!listing || !(await propertyHostCan(db, actor.id, row))) return null;
  } else if (
    !row.caseId ||
    !(await can(db, actor, "case.read", {
      type: "case",
      id: row.caseId,
      audience: "case_participants",
    })) ||
    !(await can(db, actor, "appointment.manage", {
      type: "appointment",
      id,
      caseId: row.caseId,
      audience: "case_participants",
    }))
  )
    return null;
  const versionsQuery = db
    .select({
      id: appointmentVersions.id,
      version: appointmentVersions.versionNumber,
      actorKind: appointmentVersions.actorKind,
      actorId: appointmentVersions.actorId,
      createdAt: appointmentVersions.createdAt,
      purpose: sql<string | null>`${appointmentVersions.snapshot}->>'purpose'`,
      scopePresent: sql<boolean>`coalesce(char_length(${appointmentVersions.snapshot}->>'photographyScope') between 10 and 2000, false)`,
      digest: commitment(sql`${appointmentVersions.snapshot}`),
    })
    .from(appointmentVersions)
    .where(eq(appointmentVersions.appointmentId, id))
    .orderBy(asc(appointmentVersions.id))
    .limit(max + 1);
  const versions = bounded(await (lock ? versionsQuery.for("share") : versionsQuery), max);
  // A photo visit's original purpose/scope must remain explicit. An unknown or mixed
  // historical purpose cannot be relabelled as a viewing to clear disclosure review.
  if (
    row.purpose === "photography" &&
    versions.some((version) => version.purpose !== "photography" || !version.scopePresent)
  )
    return null;
  if (
    row.purpose !== "photography" &&
    versions.some((version) => version.purpose === "photography")
  )
    return null;
  return { id: row.id, version: row.version, digest: opaque({ row, versions }) };
}

export async function collectPhotographySources(
  db: Executor,
  actor: Actor,
  partyIds: string[],
  caseIds: string[],
  lock = false,
  max = 1000,
) {
  const relevant = or(
    caseIds.length ? inArray(appointments.caseId, caseIds) : undefined,
    inArray(
      appointments.id,
      db
        .select({ id: appointmentParticipants.appointmentId })
        .from(appointmentParticipants)
        .where(inArray(appointmentParticipants.partyId, partyIds)),
    ),
  );
  const history = db
    .select({ id: appointmentVersions.appointmentId })
    .from(appointmentVersions)
    .where(
      or(
        sql`${appointmentVersions.snapshot}->>'purpose' = 'photography'`,
        sql`${appointmentVersions.snapshot}->>'photographyScope' is not null`,
      ),
    );
  const rows = bounded(
    await db
      .select({ id: appointments.id })
      .from(appointments)
      .where(
        and(
          relevant,
          or(eq(appointments.purpose, "photography"), inArray(appointments.id, history)),
        ),
      )
      .orderBy(asc(appointments.id))
      .limit(max + 1),
    max,
  );
  const sources = [];
  let blocked = false;
  for (const row of rows) {
    const source = await appointmentSourceRevision(db, actor, row.id, lock, max);
    if (!source) blocked = true;
    else sources.push(source);
  }
  const visible = blocked ? [] : sources;
  return { blocked, sources: visible, revision: opaque({ blocked, sources: visible }) };
}

export async function collectPartyPhotographySources(db: Executor, actor: Actor, partyId: string) {
  const links = bounded(
    await db
      .select({ id: caseParticipants.caseId })
      .from(caseParticipants)
      .where(eq(caseParticipants.partyId, partyId))
      .orderBy(asc(caseParticipants.id))
      .limit(1001),
    1000,
  );
  return collectPhotographySources(
    db,
    actor,
    [partyId],
    links.map((row) => row.id),
  );
}
