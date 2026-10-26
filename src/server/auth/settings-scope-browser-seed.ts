// Synthetic disposable identity setup only; every tested settings allocation uses the real UI.
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/db/schema";
import { createStaff } from "../testing";
import { createSession } from "./sessions";

const url = process.env.E2E_DATABASE_URL;
if (!url || !/^\/msr_e2e_[a-f0-9]{32}$/.test(new URL(url).pathname))
  throw new Error("Disposable E2E database required");
const connection = postgres(url, { max: 1, onnotice: () => {} }),
  db = drizzle(connection, { schema });
try {
  const renew = process.argv[2];
  if (renew) {
    const [person] = await db
      .select({ id: schema.principals.id })
      .from(schema.principals)
      .where(eq(schema.principals.id, renew));
    if (!person) throw new Error("Missing synthetic actor");
    console.log(JSON.stringify(await createSession(db, { kind: "staff", id: person.id })));
  } else {
    const actors = [];
    for (const manager of [true, false]) {
      const actor = await createStaff(db, { roles: manager ? ["manager"] : [], grants: [] });
      await db.insert(schema.passkeys).values({
        principalId: actor.id,
        credentialId: randomUUID(),
        publicKey: Buffer.from([1]),
        deviceType: "singleDevice",
        backedUp: false,
      });
      actors.push({ id: actor.id, ...(await createSession(db, { kind: "staff", id: actor.id })) });
    }
    console.log(JSON.stringify({ manager: actors[0], target: actors[1] }));
  }
} finally {
  await connection.end();
}
