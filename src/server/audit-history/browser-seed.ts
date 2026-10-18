// Synthetic authenticated browser fixture in a task-owned disposable database only.
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/db/schema";
import { recordAudit } from "../audit";
import { staffFixture } from "../cases/testing";
import { historyListingFixture } from "./testing";

const url = process.env.E2E_DATABASE_URL;
if (!url || !/^\/msr_e2e_[a-f0-9]{32}$/u.test(new URL(url).pathname))
  throw new Error("Disposable browser database required");
const connection = postgres(url, { max: 1, onnotice: () => {} });
const db = drizzle(connection, { schema });
try {
  const reader = await staffFixture(db),
    denied = await staffFixture(db);
  const f = await historyListingFixture(db),
    hidden = await historyListingFixture(db);
  await db.insert(schema.grants).values({
    principalId: reader.id,
    capability: "audit.read",
    recordType: "listing",
    recordId: f.listing.id,
    reason: "Synthetic listing history browser authority",
  });
  await db
    .update(schema.principals)
    .set({ displayName: "Synthetic current history editor" })
    .where(eq(schema.principals.id, reader.id));
  const eventId = await recordAudit(db, {
    actor: reader.actor,
    action: "listing.draft.saved",
    recordType: "listing",
    recordId: f.listing.id,
    payload: {
      newVersion: 3,
      reason: "Synthetic recorded source correction",
      token: "PRIVATE_HISTORY_TOKEN",
      contact: "PRIVATE_HISTORY_CONTACT",
    },
  });
  const hiddenEventId = await recordAudit(db, {
    actor: reader.actor,
    action: "listing.draft.saved",
    recordType: "listing",
    recordId: hidden.listing.id,
    payload: { newVersion: 2, reason: "PRIVATE_OTHER_LISTING" },
  });
  console.log(
    JSON.stringify({
      token: reader.token,
      deniedToken: denied.token,
      readerId: reader.id,
      reference: f.listing.reference,
      hiddenReference: hidden.listing.reference,
      eventId,
      hiddenEventId,
    }),
  );
} finally {
  await connection.end();
}
