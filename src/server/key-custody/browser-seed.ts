import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/db/schema";
import { staffFixture } from "../cases/testing";
import { custodyFixture } from "./testing";

const url = process.env.E2E_DATABASE_URL;
if (!url || !/^\/msr_e2e_[a-f0-9]{32}$/.test(new URL(url).pathname))
  throw new Error("Disposable browser database required");
const connection = postgres(url, { max: 1, onnotice: () => {} }),
  db = drizzle(connection, { schema });
try {
  const manager = await custodyFixture(db),
    broker = await staffFixture(db);
  const [created] = await db
    .insert(schema.properties)
    .values({
      reference: `PR-KEY-${randomUUID()}`,
      propertyType: "apartment",
      country: "BG",
      region: "Blagoevgrad",
      settlement: "Sandanski",
    })
    .returning({ id: schema.properties.id });
  if (!created) throw new Error("No synthetic property");
  const propertyId = created.id;
  await db
    .update(schema.principals)
    .set({ displayName: "Synthetic custody holder" })
    .where(eq(schema.principals.id, broker.id));
  const [property] = await db
    .select()
    .from(schema.properties)
    .where(eq(schema.properties.id, propertyId));
  console.log(
    JSON.stringify({
      staffToken: manager.token,
      staffId: manager.id,
      brokerId: broker.id,
      brokerToken: broker.token,
      propertyReference: property?.reference,
    }),
  );
} finally {
  await connection.end();
}
