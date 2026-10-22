// §17.3: run OFFLINE, on an isolated restored destination, before any web/worker process.
// This is not a live kill switch: it cannot recall work already claimed by running processes.
import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import {
  emailSignInTokens,
  invitations,
  recoveryControl,
  sessions,
  webauthnChallenges,
} from "@/db/schema";
import { recordAudit } from "../audit";
import { type Executor, inTransaction } from "../db";

/** No cached verdict: every new runtime/dispatch must observe persistent restore state. */
export async function assertRecoveryOpen(db: Executor): Promise<void> {
  try {
    const [control] = await db
      .select()
      .from(recoveryControl)
      .where(eq(recoveryControl.key, "runtime"));
    if (control?.state === "normal") return;
  } catch {
    // Missing migrations or an unreadable destination must not silently reopen it.
  }
  throw new Error("Recovery quarantine: runtime is not cleared to serve or dispatch.");
}

const inputSchema = z
  .object({
    restoreId: z.uuid(),
    snapshotDigest: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();

/**
 * Stops access to the entire restored snapshot while the independent safety tail is unknown.
 * Retains grants, publication pointers, custody/Case ownership, messages, operations and jobs
 * for reconciliation. There is deliberately no automatic reopen or old-outbox replay command.
 */
export async function quarantineRestoredDatabase(db: Executor, input: z.input<typeof inputSchema>) {
  const checked = inputSchema.parse(input);
  return inTransaction(db, async (tx) => {
    const [control] = await tx
      .select()
      .from(recoveryControl)
      .where(eq(recoveryControl.key, "runtime"))
      .for("update");
    if (!control)
      throw new Error("Recovery control is missing; migrate the offline destination first.");
    if (control.state === "quarantined") {
      if (
        control.restoreId !== checked.restoreId ||
        control.snapshotDigest !== checked.snapshotDigest
      )
        throw new Error("This destination is already bound to a different restore.");
      return control;
    }
    const now = new Date();
    const revokedSessions = await tx
      .update(sessions)
      .set({ revokedAt: now })
      .where(isNull(sessions.revokedAt))
      .returning({ id: sessions.id });
    const revokedLinks = await tx
      .update(emailSignInTokens)
      .set({ revokedAt: now })
      .where(and(isNull(emailSignInTokens.revokedAt), isNull(emailSignInTokens.consumedAt)))
      .returning({ id: emailSignInTokens.id });
    const revokedInvitations = await tx
      .update(invitations)
      .set({ revokedAt: now })
      .where(
        and(
          isNull(invitations.revokedAt),
          isNull(invitations.acceptedAt),
          isNull(invitations.declinedAt),
        ),
      )
      .returning({ id: invitations.id });
    const endedChallenges = await tx
      .update(webauthnChallenges)
      .set({ consumedAt: now })
      .where(isNull(webauthnChallenges.consumedAt))
      .returning({ id: webauthnChallenges.id });
    const invalidated = {
      sessions: revokedSessions.length,
      emailLinks: revokedLinks.length,
      invitations: revokedInvitations.length,
      challenges: endedChallenges.length,
    };
    const [saved] = await tx
      .update(recoveryControl)
      .set({
        state: "quarantined",
        ...checked,
        quarantinedAt: now,
        invalidated,
      })
      .where(eq(recoveryControl.key, "runtime"))
      .returning();
    if (!saved) throw new Error("Recovery control disappeared.");
    await recordAudit(tx, {
      action: "recovery.quarantined",
      actor: { kind: "system", id: "offline-restore" },
      recordType: "recovery",
      recordId: checked.restoreId,
      payload: { snapshotDigest: checked.snapshotDigest, invalidated, safetyTail: "unverified" },
      at: now,
    });
    return saved;
  });
}
