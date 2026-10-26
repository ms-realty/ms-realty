// Disposable synthetic actors only. These sessions establish browser behavior, not real policy acceptance.
import { randomUUID } from "node:crypto";
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
  const actors = [];
  for (const allowed of [true, true, false]) {
    const actor = await createStaff(db, {
      grants: allowed
        ? [
            {
              capability: "settings.manage",
              recordType: "operating_policy",
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
    actors.push({ id: actor.id, token: issued.token });
  }
  console.log(JSON.stringify({ operator: actors[0], other: actors[1], denied: actors[2] }));
} finally {
  await connection.end();
}
