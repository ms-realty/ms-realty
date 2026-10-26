import "server-only";
import { and, eq, inArray, or, sql } from "drizzle-orm";
import { appointments, cases } from "@/db/schema";
import type { Session } from "../auth/sessions";
import { resolveGrants } from "../authz";
import { caseVisibility } from "../cases/shared";
import type { Executor } from "../db";
import { visibleWhere } from "../work/shared";
import { propertyWorkVisibility } from "./property-work";

/** Both readable Case scope and appointment capability apply before pagination. */
export async function staffAppointmentVisibility(db: Executor, session: Session) {
  if (session.actor.kind !== "staff") return sql`false`;
  const grants = await resolveGrants(db, session.actor);
  return or(
    and(
      eq(appointments.purpose, "viewing"),
      inArray(
        appointments.caseId,
        db
          .select({ id: cases.id })
          .from(cases)
          .where(await caseVisibility(db, session)),
      ),
      visibleWhere(grants, "appointment.manage", "appointment"),
    ),
    propertyWorkVisibility(grants),
  );
}
