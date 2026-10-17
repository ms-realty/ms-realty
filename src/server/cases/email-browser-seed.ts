// Synthetic fixture only in the generated, disposable browser database.
import { randomUUID } from "node:crypto";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/db/schema";
import { LocalFileStorage } from "../files/storage";
import { consentPolicyKey } from "../privacy/preferences";
import { syntheticServiceEmailTerms } from "../privacy/testing";
import { emailFileFixture } from "./email-file-testing";
import { caseFixture } from "./testing";

const url = process.env.E2E_DATABASE_URL;
if (!url || !/^\/msr_e2e_[a-f0-9]{32}$/.test(new URL(url).pathname))
  throw new Error("Disposable browser database required");
const connection = postgres(url, { max: 1, onnotice: () => {} }),
  db = drizzle(connection, { schema });
try {
  const terms = await syntheticServiceEmailTerms(db);
  const withFile =
    process.env.E2E_CASE_EMAIL_FILES === "1"
      ? await emailFileFixture(db, new LocalFileStorage(process.env.E2E_FILE_STORAGE_ROOT ?? ""))
      : null;
  const f = withFile ?? (await caseFixture(db)),
    address = `email-${randomUUID()}@example.test`;
  const [contact] = await db
    .insert(schema.contactMethods)
    .values({
      partyId: f.client.partyId,
      kind: "email",
      value: address,
      normalizedValue: address,
      verification: "verified",
      verifiedAt: new Date(),
    })
    .returning();
  if (!contact) throw new Error("No contact");
  let appointmentId: string | undefined;
  if (process.env.E2E_CASE_CALENDAR === "1") {
    const [appointment] = await db
      .insert(schema.appointments)
      .values({
        reference: `AP-${randomUUID()}`,
        state: "confirmed",
        format: "in_person",
        caseId: f.record.id,
        hostId: f.staff.id,
        timezone: "Europe/Sofia",
        propertyAccess: "confirmed",
        externalBusyCheckedAt: new Date(),
        confirmedStartsAt: new Date("2027-01-15T08:00:00Z"),
        confirmedEndsAt: new Date("2027-01-15T09:00:00Z"),
        icsUid: `${randomUUID()}@appointments.example.test`,
        icsSequence: 1,
        accessNotes: "Private keys and private address",
      })
      .returning();
    if (!appointment) throw new Error("No appointment");
    appointmentId = appointment.id;
    await db.insert(schema.appointmentParticipants).values({
      appointmentId,
      partyId: f.client.partyId,
      role: "buyer",
    });
  }
  if (process.env.E2E_CASE_EMAIL_OPT_IN !== "1")
    await db.insert(schema.subscriptions).values({
      partyId: f.client.partyId,
      contactMethodId: contact.id,
      purpose: "service_updates",
      state: "active",
      verifiedAt: new Date(),
      timezone: "Europe/Sofia",
      policyVersion: consentPolicyKey(terms),
      unsubscribeTokenHash: randomUUID(),
    });
  const addresses = [address];
  if (process.env.E2E_CASE_MULTI_RECIPIENTS === "1") {
    const secondAddress = `second-${randomUUID()}@example.test`;
    const [secondContact] = await db
      .insert(schema.contactMethods)
      .values({
        partyId: f.client.partyId,
        kind: "email",
        value: secondAddress,
        normalizedValue: secondAddress,
        verification: "verified",
        verifiedAt: new Date(),
      })
      .returning();
    if (!secondContact) throw new Error("No second contact");
    await db.insert(schema.subscriptions).values({
      partyId: f.client.partyId,
      contactMethodId: secondContact.id,
      purpose: "service_updates",
      state: "active",
      verifiedAt: new Date(),
      timezone: "Europe/Sofia",
      policyVersion: consentPolicyKey(terms),
      unsubscribeTokenHash: randomUUID(),
    });
    addresses.push(secondAddress);
  }
  console.log(
    JSON.stringify({
      caseId: f.record.id,
      staffToken: f.staff.token,
      clientToken: f.client.token,
      address,
      addresses,
      contactId: contact.id,
      appointmentId,
      fileId: withFile?.file.id,
      fileName: withFile?.file.fileName,
      fileHash: withFile?.file.sha256,
    }),
  );
} finally {
  await connection.end();
}
