// Disposable synthetic actors. Actual scoped allocation uses the production grant command.
import { randomUUID } from "node:crypto";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/db/schema";
import { grantStaffCapability } from "../auth/grants";
import { createSession } from "../auth/sessions";
import { createStaff } from "../testing";
import { governanceResource } from "./service";

const url = process.env.E2E_DATABASE_URL;
if (!url || !/^\/msr_e2e_[a-f0-9]{32}$/.test(new URL(url).pathname))
  throw new Error("Disposable browser database required");
const connection = postgres(url, { max: 1, onnotice: () => {} }),
  db = drizzle(connection, { schema });
async function person(manager = false) {
  const actor = await createStaff(db, { roles: manager ? ["manager"] : [], grants: [] });
  await db.insert(schema.passkeys).values({
    principalId: actor.id,
    credentialId: randomUUID(),
    publicKey: Buffer.from([1]),
    deviceType: "singleDevice",
    backedUp: false,
  });
  return { ...actor, ...(await createSession(db, { kind: "staff", id: actor.id })) };
}
try {
  const manager = await person(true),
    actors = [];
  for (const count of [3, 2, 0]) {
    const actor = await person();
    for (const capability of ["settings.manage", "privacy.manage", "claim.approve"].slice(0, count))
      await grantStaffCapability(db, manager.session, {
        operationId: randomUUID(),
        principalId: actor.id,
        capability,
        reason: "Synthetic bounded browser review allocation, not real policy acceptance",
        scope: {
          recordType: "settings",
          recordId: governanceResource.id,
          locales: null,
          expiresAt: null,
        },
      });
    const issued = await createSession(db, { kind: "staff", id: actor.id });
    actors.push({ id: actor.id, token: issued.token });
  }
  console.log(JSON.stringify({ operator: actors[0], other: actors[1], denied: actors[2] }));
} finally {
  await connection.end();
}
