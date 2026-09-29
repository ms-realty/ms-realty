import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/db/schema";
import { staffFixture } from "../cases/testing";
import { moveKeys, receiveKeys } from "../key-custody/service";
import { custodyFixture } from "../key-custody/testing";
import { createCase, createProperty } from "../testing";

const url = process.env.E2E_DATABASE_URL;
if (!url || !/^\/msr_e2e_[a-f0-9]{32}$/.test(new URL(url).pathname))
  throw new Error("Disposable browser database required");
const connection = postgres(url, { max: 1, onnotice: () => {} }),
  db = drizzle(connection, { schema });
try {
  const manager = await custodyFixture(db),
    broker = await staffFixture(db),
    propertyId = await createProperty(db);
  const [property] = await db
    .select()
    .from(schema.properties)
    .where(eq(schema.properties.id, propertyId));
  const key = await receiveKeys(db, manager.session, {
    operationId: randomUUID(),
    propertyReference: property?.reference,
    keyTag: randomUUID(),
    quantity: 1,
    sourceReference: "Synthetic receipt O1",
    storageLabel: "Synthetic cabinet",
    note: "Synthetic physical receipt O1 confirmed.",
    reviewed: true,
  });
  await moveKeys(db, manager.session, {
    operationId: randomUUID(),
    id: key.outcome.id,
    expectedVersion: 1,
    state: "checked_out",
    holderId: broker.id,
    dueAt: new Date(Date.now() + 3600000).toISOString(),
    note: "Synthetic handover O2 confirmed.",
    reviewed: true,
  });
  const caseId = await createCase(db, broker.id);
  console.log(
    JSON.stringify({
      staffToken: manager.token,
      brokerToken: broker.token,
      brokerId: broker.id,
      keyId: key.outcome.id,
      caseId,
    }),
  );
} finally {
  await connection.end();
}
