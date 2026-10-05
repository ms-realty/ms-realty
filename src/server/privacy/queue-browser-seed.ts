// Synthetic queue-only browser fixture. No real privacy decisions or provider effects.
import { randomUUID } from "node:crypto";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/db/schema";
import { createSession } from "../auth/sessions";
import { createStaff } from "../testing";

const url = process.env.E2E_DATABASE_URL;
if (!url || !/^\/msr_e2e_[a-f0-9]{32}$/.test(new URL(url).pathname))
  throw new Error("Disposable browser database required");
const connection = postgres(url, { max: 1, onnotice: () => {} }),
  db = drizzle(connection, { schema });
try {
  const operator = await createStaff(db, { grants: [{ capability: "privacy.manage" }] });
  await db.insert(schema.passkeys).values(
    [0, 1].map(() => ({
      principalId: operator.id,
      credentialId: randomUUID(),
      publicKey: Buffer.from([1]),
      deviceType: "singleDevice" as const,
      backedUp: false,
    })),
  );
  const { token, session } = await createSession(db, { kind: "staff", id: operator.id });
  const ids = Array.from({ length: 105 }, () => randomUUID()).sort();
  const stamp = new Date(),
    prefix = `PR-QUEUE-${randomUUID().slice(0, 8)}`;
  await db.insert(schema.privacyRequests).values(
    ids.map((id, i) => ({
      id,
      reference: `${prefix}-${i}`,
      kind: "correction" as const,
      responsibleId: operator.id,
      createdAt: stamp,
      updatedAt: stamp,
      scope: { description: `Synthetic unresolved privacy request ${i}` },
    })),
  );
  console.log(
    JSON.stringify({
      token,
      sessionId: session.id,
      ids,
      targetId: ids[0],
      targetReference: `${prefix}-0`,
    }),
  );
} finally {
  await connection.end();
}
