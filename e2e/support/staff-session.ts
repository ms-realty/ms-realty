// Explicit disposable browser fixtures. These are not real passkey or owner-acceptance proof.
import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { BrowserContext } from "@playwright/test";
import { eq } from "drizzle-orm";
import { passkeys, principals, sessions } from "../../src/db/schema";
import type { Role } from "../../src/domain/capabilities";
import type { Executor } from "../../src/server/db";
import { createStaff } from "../../src/server/testing";
import { origins } from "../hosts";

export async function enrolledStaff(
  db: Executor,
  context: BrowserContext,
  options: { roles?: Role[]; name?: string } = {},
) {
  const staff = await createStaff(db, { roles: options.roles ?? ["assigned_broker"] });
  const name = options.name ?? "Test Broker";
  await db.update(principals).set({ displayName: name }).where(eq(principals.id, staff.id));
  await db.insert(passkeys).values({
    principalId: staff.id,
    credentialId: randomUUID(),
    publicKey: Buffer.from([1]),
    deviceType: "singleDevice",
    backedUp: false,
  });
  const token = randomBytes(32).toString("base64url");
  const [session] = await db
    .insert(sessions)
    .values({
      principalKind: "staff",
      principalId: staff.id,
      tokenHash: createHash("sha256").update(token).digest("hex"),
      expiresAt: new Date(Date.now() + 3600000),
      lastSeenAt: new Date(),
      reverifiedAt: new Date(),
    })
    .returning();
  await context.addCookies([
    {
      name: "msr_staff_session",
      value: token,
      url: origins.staff,
      httpOnly: true,
      secure: false,
      sameSite: "Lax",
    },
  ]);
  return { ...staff, name, session };
}
