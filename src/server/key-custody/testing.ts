import { randomUUID } from "node:crypto";
import { passkeys } from "@/db/schema";
import { createSession } from "../auth/sessions";
import type { Executor } from "../db";
import { createStaff } from "../testing";
export async function custodyFixture(db: Executor) {
  const manager = await createStaff(db, {
    roles: ["manager"],
    email: `custody-${randomUUID()}@example.test`,
  });
  await db.insert(passkeys).values(
    [0, 1].map(() => ({
      principalId: manager.id,
      credentialId: randomUUID(),
      publicKey: Buffer.from([1]),
      deviceType: "singleDevice",
      backedUp: false,
    })),
  );
  return { ...manager, ...(await createSession(db, { kind: "staff", id: manager.id })) };
}
