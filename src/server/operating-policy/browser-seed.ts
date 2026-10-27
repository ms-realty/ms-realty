// Disposable synthetic actors only. These sessions establish browser behavior, not real policy acceptance.
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/db/schema";
import { operatingPolicyId } from "@/domain/operating-policy";
import { createSession } from "../auth/sessions";
import { createStaff } from "../testing";

const url = process.env.E2E_DATABASE_URL;
if (!url || !/^\/msr_e2e_[a-f0-9]{32}$/u.test(new URL(url).pathname))
  throw new Error("Disposable browser database required");
const connection = postgres(url, { max: 1, onnotice: () => {} }),
  db = drizzle(connection, { schema });
try {
  const directory = process.argv.includes("--owner-directory");
  if (directory) {
    const existing = await db
      .select({ id: schema.principals.id })
      .from(schema.principals)
      .where(eq(schema.principals.displayName, "A synthetic O24 directory fixture"))
      .limit(101);
    for (let i = existing.length; i < 101; i++) {
      const row = await createStaff(db);
      await db
        .update(schema.principals)
        .set({ displayName: "A synthetic O24 directory fixture" })
        .where(eq(schema.principals.id, row.id));
    }
  }
  const actors = [];
  for (const allowed of [true, true, false]) {
    const actor = await createStaff(db, {
      grants: allowed
        ? [
            {
              capability: "settings.manage",
              recordType: "settings",
              recordId: operatingPolicyId,
            },
          ]
        : [{ capability: "listing.read" }],
    });
    await db.insert(schema.passkeys).values({
      principalId: actor.id,
      credentialId: randomUUID(),
      publicKey: Buffer.from([1]),
      deviceType: "singleDevice",
      backedUp: false,
    });
    const issued = await createSession(db, { kind: "staff", id: actor.id });
    const displayName = directory ? `Z synthetic O24 owner ${actor.id}` : "Test Staff";
    if (directory)
      await db
        .update(schema.principals)
        .set({ displayName })
        .where(eq(schema.principals.id, actor.id));
    actors.push({ id: actor.id, token: issued.token, displayName });
  }
  console.log(JSON.stringify({ operator: actors[0], other: actors[1], denied: actors[2] }));
} finally {
  await connection.end();
}
