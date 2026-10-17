// Synthetic operator session for O21 browser proof; never creates approved public copy.
import { randomUUID } from "node:crypto";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/db/schema";
import { createSession } from "@/server/auth/sessions";
import { createStaff } from "@/server/testing";

const url = process.env.E2E_DATABASE_URL;
if (!url || !/^\/msr_e2e_[a-f0-9]{32}$/.test(new URL(url).pathname))
  throw new Error("Content fixture requires disposable E2E database");
const sql = postgres(url, { max: 2 }),
  db = drizzle(sql, { schema });
try {
  const actor = await createStaff(db, {
    email: `${randomUUID()}@example.test`,
    grants: [
      { capability: "content.edit" },
      { capability: "listing.review_facts" },
      { capability: "claim.approve" },
      { capability: "publication.release" },
    ],
  });
  await db.insert(schema.passkeys).values(
    [0, 1].map(() => ({
      principalId: actor.id,
      credentialId: randomUUID(),
      publicKey: Buffer.from([1]),
      deviceType: "singleDevice",
      backedUp: false,
    })),
  );
  const { token } = await createSession(db, { kind: "staff", id: actor.id });
  console.log(JSON.stringify({ token }));
} finally {
  await sql.end();
}
