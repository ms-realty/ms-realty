// O01 browser seed. Each person sees only this run's synthetic records through record-scoped
// grants, so Today is deterministic in the shared browser database: a broker with an ordinary
// day, one with nothing visible, and one with more unassigned requests than Today lists.
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/db/schema";
import { createSession } from "@/server/auth/sessions";
import { createStaff } from "@/server/testing";

const url = process.env.E2E_DATABASE_URL;
if (!url || !/^\/msr_e2e_[a-f0-9]{32}$/.test(new URL(url).pathname))
  throw new Error("The Today seed requires the generated disposable database.");
const connection = postgres(url, { max: 1, onnotice: () => {} }),
  db = drizzle(connection, { schema });
const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000);

async function person(name: string, membership: "active" | "ended" = "active") {
  const staff = await createStaff(db, { membership, email: `o01-${randomUUID()}@example.test` });
  await db
    .update(schema.principals)
    .set({ displayName: name })
    .where(eq(schema.principals.id, staff.id));
  await db.insert(schema.passkeys).values(
    [0, 1].map(() => ({
      principalId: staff.id,
      credentialId: randomUUID(),
      publicKey: Buffer.from([1]),
      deviceType: "singleDevice",
      backedUp: false,
    })),
  );
  return staff;
}
async function inquiry(values: Partial<typeof schema.inquiries.$inferInsert>) {
  const [row] = await db
    .insert(schema.inquiries)
    .values({
      reference: `RQ-O01-${randomUUID()}`,
      source: "website",
      state: "received",
      purpose: "question",
      submissionKey: randomUUID(),
      payloadDigest: "synthetic",
      coverageQueue: "agency",
      message: "Synthetic Today request",
      ...values,
    })
    .returning();
  if (!row) throw new Error("No synthetic inquiry");
  return row;
}
async function grant(
  principalId: string,
  capability: "inquiry.read" | "task.manage" | "ai.draft",
  recordType: "inquiry" | "task",
  recordId: string,
) {
  await db.insert(schema.grants).values({
    principalId,
    capability,
    recordType,
    recordId,
    reason: "Synthetic O01 browser scope",
  });
}

try {
  const broker = await person("Synthetic broker");
  const former = await person("Former synthetic broker", "ended");
  const listing = `MS-SYNTH-${randomUUID().slice(0, 8)}`;
  const oldest = await inquiry({
    purpose: "viewing_request",
    preferredName: "Synthetic visitor",
    context: { listing: { reference: listing, title: "Synthetic listing" } },
    createdAt: ago(180),
  });
  const newest = await inquiry({ createdAt: ago(12) });
  const mine = await inquiry({
    state: "assigned",
    ownerId: broker.id,
    coverageQueue: null,
    followUpAt: new Date(Date.now() + 86_400_000),
    createdAt: ago(600),
  });
  const [due] = await db
    .insert(schema.tasks)
    .values({
      title: `Synthetic promised call-back ${randomUUID().slice(0, 8)}`,
      ownerId: broker.id,
      inquiryId: mine.id,
      promisedToClient: true,
      dueAt: ago(120),
    })
    .returning();
  const [offered] = await db
    .insert(schema.tasks)
    .values({
      title: `Synthetic offered follow-up ${randomUUID().slice(0, 8)}`,
      ownerId: former.id,
      pendingOwnerId: broker.id,
      dueAt: new Date(Date.now() + 2 * 86_400_000),
    })
    .returning();
  if (!due || !offered) throw new Error("No synthetic tasks");
  for (const id of [oldest.id, newest.id, mine.id])
    await grant(broker.id, "inquiry.read", "inquiry", id);
  await grant(broker.id, "ai.draft", "inquiry", oldest.id);
  for (const id of [due.id, offered.id]) await grant(broker.id, "task.manage", "task", id);

  const empty = await person("Synthetic quiet broker");
  const overloaded = await person("Synthetic covering broker");
  for (let index = 0; index < 31; index++) {
    const waiting = await inquiry({ createdAt: ago(240 - index) });
    await grant(overloaded.id, "inquiry.read", "inquiry", waiting.id);
  }

  const token = async (id: string) => (await createSession(db, { kind: "staff", id })).token;
  console.log(
    JSON.stringify({
      token: await token(broker.id),
      emptyToken: await token(empty.id),
      overloadToken: await token(overloaded.id),
      listing,
      oldest: oldest.id,
      oldestReference: oldest.reference,
      newest: newest.id,
      mine: mine.id,
      due: due.id,
      dueTitle: due.title,
      offered: offered.id,
      offeredTitle: offered.title,
    }),
  );
} finally {
  await connection.end();
}
