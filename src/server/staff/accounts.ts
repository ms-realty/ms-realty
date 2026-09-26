// Staff bootstrap (spec §03, §23.3 "staff list with capabilities", AD5): a staff account with
// role-preset grants. Idempotent by email: a second run adds only roles not yet granted and
// never changes or revokes anything. The AI service and client roles are not staff presets.
import "server-only";
import { and, eq, isNull, sql } from "drizzle-orm";
import { capabilityGrants, persons, staffAccounts } from "@/db/schema";
import type { Actor, Role } from "@/domain/capabilities";
import { recordActivity } from "../activity";
import { recordAudit } from "../audit";
import type { Executor } from "../db";
import { AppError } from "../errors";

export const staffRoles = [
  "assigned_broker",
  "coordinator",
  "content_editor",
  "translation_reviewer",
  "publishing_approver",
  "manager",
] as const satisfies readonly Role[];
export type StaffRole = (typeof staffRoles)[number];

export function isStaffRole(value: string): value is StaffRole {
  return (staffRoles as readonly string[]).includes(value);
}

export interface CreateStaffInput {
  readonly email: string;
  readonly displayName: string;
  readonly roles: readonly StaffRole[];
  /** Who ran the bootstrap: a staff member with access.grant, or the operator's CLI. */
  readonly actor: Actor;
  readonly reason?: string;
}

export interface StaffAccountResult {
  readonly staffAccountId: string;
  readonly email: string;
  readonly created: boolean;
  /** Every role the account holds now, and the ones this call added. */
  readonly roles: readonly StaffRole[];
  readonly addedRoles: readonly StaffRole[];
}

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function createStaffAccount(
  db: Executor,
  input: CreateStaffInput,
): Promise<StaffAccountResult> {
  const email = input.email.trim();
  const displayName = input.displayName.trim();
  const fieldErrors: Record<string, string[]> = {};
  if (!emailPattern.test(email)) fieldErrors.email = ["invalid_email"];
  if (!displayName) fieldErrors.displayName = ["required"];
  if (input.roles.length === 0 || !input.roles.every(isStaffRole)) fieldErrors.roles = ["invalid"];
  if (Object.keys(fieldErrors).length) throw new AppError("validation_failed", { fieldErrors });
  if (input.actor.kind === "ai_service" || input.actor.kind === "visitor") {
    throw new AppError("forbidden");
  }

  return db.transaction(async (tx) => {
    // Serializes concurrent bootstraps of one address.
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`staff:${email.toLowerCase()}`}, 0))`,
    );
    const [existing] = await tx
      .select({ id: staffAccounts.id })
      .from(staffAccounts)
      .where(sql`lower(${staffAccounts.email}) = ${email.toLowerCase()}`);
    let staffAccountId = existing?.id;
    if (!staffAccountId) {
      const [person] = await tx
        .insert(persons)
        .values({ displayName })
        .returning({ id: persons.id });
      if (!person) throw new Error("Person insert returned no row.");
      const [account] = await tx
        .insert(staffAccounts)
        .values({ personId: person.id, email, displayName })
        .returning({ id: staffAccounts.id });
      if (!account) throw new Error("Staff account insert returned no row.");
      staffAccountId = account.id;
    }

    const held = await tx
      .select({ role: capabilityGrants.role })
      .from(capabilityGrants)
      .where(
        and(
          eq(capabilityGrants.staffAccountId, staffAccountId),
          isNull(capabilityGrants.revokedAt),
          isNull(capabilityGrants.recordId),
        ),
      );
    const heldRoles = new Set(held.flatMap((g) => (g.role && isStaffRole(g.role) ? [g.role] : [])));
    const addedRoles = [...new Set(input.roles)].filter((role) => !heldRoles.has(role));
    const reason = input.reason ?? "Staff bootstrap";
    for (const role of addedRoles) {
      await tx.insert(capabilityGrants).values({
        staffAccountId,
        role,
        reason,
        grantedByStaffId: input.actor.kind === "staff" ? input.actor.id : null,
      });
    }

    if (!existing || addedRoles.length > 0) {
      await recordActivity(tx, {
        recordType: "staff_account",
        recordId: staffAccountId,
        messageKey: existing ? "activity.staff.roles_granted" : "activity.staff.created",
        params: { roles: addedRoles },
        summary: `${existing ? "Roles granted" : "Staff account created"}: ${addedRoles.join(", ")}.`,
        actor: input.actor,
      });
      await recordAudit(tx, {
        action: existing ? "staff.grant_roles" : "staff.create",
        actor: input.actor,
        recordType: "staff_account",
        recordId: staffAccountId,
        payload: { roles: addedRoles, reason },
      });
    }
    return {
      staffAccountId,
      email,
      created: !existing,
      roles: [...new Set([...heldRoles, ...addedRoles])],
      addedRoles,
    };
  });
}

/** The active staff account for an email address, as an actor; null otherwise. */
export async function findActiveStaff(
  db: Executor,
  email: string,
): Promise<{ id: string; displayName: string; actor: Actor } | null> {
  const [row] = await db
    .select({ id: staffAccounts.id, displayName: staffAccounts.displayName })
    .from(staffAccounts)
    .where(
      and(
        sql`lower(${staffAccounts.email}) = ${email.trim().toLowerCase()}`,
        eq(staffAccounts.status, "active"),
      ),
    );
  return row ? { ...row, actor: { kind: "staff", id: row.id } } : null;
}
