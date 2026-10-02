// Synthetic, local-only fixtures shared by the restore drill and integration tests.
import { randomUUID } from "node:crypto";
import { emailSignInTokens, invitations, webauthnChallenges } from "@/db/schema";
import { caseFixture } from "../cases/testing";
import type { Database } from "../db";
import { enqueueMessage } from "../jobs/outbox";

export async function recoveryFixture(db: Database) {
  const fixture = await caseFixture(db);
  const expiresAt = new Date(Date.now() + 3600000);
  await db.insert(emailSignInTokens).values({
    tokenHash: randomUUID(),
    purpose: "sign_in",
    principalKind: "client",
    principalId: fixture.client.id,
    email: "restore-client@example.test",
    expiresAt,
  });
  await db.insert(invitations).values({
    tokenHash: randomUUID(),
    kind: "staff_recovery",
    principalId: fixture.staff.id,
    email: "restore-staff@example.test",
    invitedById: fixture.staff.id,
    expiresAt,
  });
  await db.insert(webauthnChallenges).values({
    challenge: randomUUID(),
    purpose: "authentication",
    expiresAt,
  });
  const queued = await enqueueMessage(db, {
    idempotencyKey: `restore-${randomUUID()}`,
    channel: "email",
    recipient: "restore-client@example.test",
    template: "auth.email_link",
    secretParams: { token: randomUUID() },
  });
  return { ...fixture, queued };
}
