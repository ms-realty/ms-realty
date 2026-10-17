// Disposable browser-fixture operator only. Creates no consent, listing or outgoing mail.
import { randomUUID } from "node:crypto";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/db/schema";
import { createSession } from "@/server/auth/sessions";
import { createStaff } from "@/server/testing";

const url = process.env.E2E_DATABASE_URL;
if (!url || !/^\/msr_e2e_[a-f0-9]{32}$/.test(new URL(url).pathname))
  throw new Error("Alert rule fixture requires disposable E2E database");
const connection = postgres(url, { max: 1 }),
  db = drizzle(connection, { schema });
try {
  const person = await createStaff(db, {
    email: `synthetic-alert-${randomUUID()}@example.test`,
    grants: [{ capability: "settings.manage" }, { capability: "message.send_external" }],
  });
  await db.insert(schema.passkeys).values(
    [0, 1].map(() => ({
      principalId: person.id,
      credentialId: randomUUID(),
      publicKey: Buffer.from([1]),
      deviceType: "singleDevice",
      backedUp: false,
    })),
  );
  const { token } = await createSession(db, { kind: "staff", id: person.id });
  console.log(JSON.stringify({ token }));
} finally {
  await connection.end();
}
