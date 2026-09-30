import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/db/schema";
import { staffFixture } from "../cases/testing";
import { createCase, createProperty } from "../testing";

const url = process.env.E2E_DATABASE_URL;
if (!url || !/^\/msr_e2e_[a-f0-9]{32}$/.test(new URL(url).pathname))
  throw new Error("Disposable browser database required");
const connection = postgres(url, { max: 1, onnotice: () => {} }),
  db = drizzle(connection, { schema });
try {
  const owner = await staffFixture(db),
    receiver = await staffFixture(db);
  const caseId = await createCase(db, owner.id),
    propertyId = await createProperty(db);
  const start = new Date(Date.now() + 86400000),
    end = new Date(start.getTime() + 3600000);
  const [appointment] = await db
    .insert(schema.appointments)
    .values({
      reference: `AP-ACCEPT-${randomUUID()}`,
      icsUid: randomUUID(),
      icsSequence: 2,
      caseId,
      propertyId,
      hostId: owner.id,
      state: "confirmed",
      format: "in_person",
      timezone: "Europe/Sofia",
      confirmedStartsAt: start,
      confirmedEndsAt: end,
      propertyAccess: "confirmed",
      externalBusyCheckedAt: new Date(),
      externalBusyCheckedById: owner.id,
      accessNotes: "Synthetic meeting point",
    })
    .returning();
  if (!appointment) throw new Error("Missing fixture appointment");
  const during = `[${new Date(start.getTime() - 1800000).toISOString()},${new Date(end.getTime() + 1800000).toISOString()})`;
  await db.insert(schema.appointmentResources).values([
    { appointmentId: appointment.id, kind: "broker", resourceId: owner.id, during },
    { appointmentId: appointment.id, kind: "property_access", resourceId: propertyId, during },
  ]);
  await db
    .update(schema.staffMemberships)
    .set({
      absenceFrom: new Date(Date.now() - 1000),
      absenceReviewAt: new Date(Date.now() + 3600000),
    })
    .where(eq(schema.staffMemberships.principalId, owner.id));
  console.log(
    JSON.stringify({
      token: receiver.token,
      receiverId: receiver.id,
      ownerId: owner.id,
      id: appointment.id,
      caseId,
      propertyId,
    }),
  );
} finally {
  await connection.end();
}
