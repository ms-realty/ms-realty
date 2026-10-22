// O04 browser seed. Each viewer is a broker whose case access is scoped to its own synthetic
// cases, so records from other Playwright projects never reach its list: six cases of every
// disposition (one owned by a broker who has left, one with a long unbroken title), 51 cases for
// the 50-row bound, and a broker without case access. Disposable browser database only;
// synthetic names and example.test addresses.
import { randomBytes, randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/db/schema";
import { createSession } from "@/server/auth/sessions";
import { createStaff, type GrantSpec } from "@/server/testing";

const url = process.env.E2E_DATABASE_URL;
if (!url || !/^\/msr_e2e_[a-f0-9]{32}$/.test(new URL(url).pathname))
  throw new Error("The case index seed requires the generated disposable database.");
const connection = postgres(url, { max: 1, onnotice: () => {} });
const db = drizzle(connection, { schema });

async function staff(name: string, membership: "active" | "ended", grants: GrantSpec[] = []) {
  const person = await createStaff(db, {
    email: `o04-${randomUUID()}@example.test`,
    membership,
    grants,
  });
  await db
    .update(schema.principals)
    .set({ displayName: name })
    .where(eq(schema.principals.id, person.id));
  return person.id;
}

/** A signed-in broker who may read exactly these cases. */
async function viewer(name: string, caseIds: string[]) {
  const id = await staff(
    name,
    "active",
    caseIds.map((recordId) => ({ role: "assigned_broker", recordType: "case", recordId })),
  );
  await db.insert(schema.passkeys).values(
    [0, 1].map(() => ({
      principalId: id,
      credentialId: randomUUID(),
      publicKey: Buffer.from([1]),
      deviceType: "singleDevice",
      backedUp: false,
    })),
  );
  return { id, token: (await createSession(db, { kind: "staff", id })).token };
}

try {
  const token = randomBytes(4).toString("hex");
  const ownerName = `Synthetic owner ${token}`;
  const formerName = `Synthetic former owner ${token}`;
  const owner = await staff(ownerName, "active");
  const former = await staff(formerName, "ended");
  type NewCase = Omit<typeof schema.cases.$inferInsert, "reference">;
  const insert = async (suffix: string, values: NewCase) => {
    const [row] = await db
      .insert(schema.cases)
      .values({ reference: `CS-O04-${token}-${suffix}`, ...values })
      .returning({ id: schema.cases.id, reference: schema.cases.reference });
    if (!row) throw new Error("Missing synthetic case");
    return { ...row, title: values.title };
  };
  const active = { disposition: "active" as const, ownerId: owner, nextAction: "Synthetic step" };
  const cases = {
    buyer: await insert("B", {
      ...active,
      kind: "buyer",
      stage: "needs_agreed",
      title: `Synthetic home search ${token}`,
    }),
    tenant: await insert("T", {
      ...active,
      kind: "tenant",
      stage: "evaluating",
      title: `Synthetic rental search ${token}`,
    }),
    paused: await insert("P", {
      kind: "seller",
      stage: "preparing",
      disposition: "paused",
      ownerId: owner,
      title: `Synthetic sale instruction ${token}`,
      dispositionReason: "Synthetic pause reason",
      waitingOn: "Synthetic owner documents",
      reviewAt: new Date(Date.now() + 7 * 86400000),
    }),
    closed: await insert("C", {
      kind: "landlord",
      stage: "marketing",
      disposition: "closed",
      ownerId: owner,
      title: `Synthetic letting ${token}`,
      closureOutcome: "Synthetic outcome",
      commitmentDispositions: {},
    }),
    covered: await insert("V", {
      ...active,
      ownerId: former,
      kind: "buyer",
      stage: "viewing",
      title: `Synthetic covered search ${token}`,
    }),
    long: await insert("L", {
      ...active,
      kind: "buyer",
      stage: "needs_agreed",
      title: `Synthetic long title ${token} ${"Дългозаглавиебезинтервали".repeat(5)}`,
    }),
  };
  const main = await viewer(
    `Synthetic viewer ${token}`,
    Object.values(cases).map((item) => item.id),
  );

  // 51 cases a minute apart: the list shows the newest 50, and search reaches the oldest.
  const bulkCases = await db
    .insert(schema.cases)
    .values(
      Array.from({ length: 51 }, (_, index) => ({
        ...active,
        reference: `CS-O04-${token}-N${String(index).padStart(2, "0")}`,
        kind: "buyer" as const,
        stage: "evaluating",
        title: `Synthetic bulk search ${token} ${index}`,
        updatedAt: new Date(Date.now() - index * 60000),
      })),
    )
    .returning({ id: schema.cases.id, reference: schema.cases.reference });
  const bulk = await viewer(
    `Synthetic bulk viewer ${token}`,
    bulkCases.map((item) => item.id),
  );
  const empty = await viewer(`Synthetic new broker ${token}`, []);

  console.log(
    JSON.stringify({
      token,
      ownerName,
      formerName,
      viewer: main,
      bulk: bulk.token,
      empty: empty.token,
      oldest: `CS-O04-${token}-N50`,
      cases,
    }),
  );
} finally {
  await connection.end();
}
