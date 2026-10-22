import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/db/schema";
import { staffFixture } from "@/server/cases/testing";
import { reviewContactFixture } from "@/server/duplicate-review/testing";

const url = process.env.E2E_DATABASE_URL;
if (!url || !/^\/msr_e2e_[a-f0-9]{32}$/u.test(new URL(url).pathname))
  throw new Error("Disposable browser database required");
const connection = postgres(url, { max: 1, onnotice: () => {} }),
  db = drizzle(connection, { schema });
try {
  const reviewer = await staffFixture(db),
    denied = await staffFixture(db);
  await db.insert(schema.grants).values({
    principalId: reviewer.id,
    capability: "import.run",
    reason: "Synthetic W12 browser preview authority",
  });
  await db
    .update(schema.principals)
    .set({ displayName: "Synthetic data reviewer" })
    .where(eq(schema.principals.id, reviewer.id));
  const left = await reviewContactFixture(db, "Synthetic comparison contact A"),
    right = await reviewContactFixture(db, "Synthetic comparison contact A alternate");
  console.log(
    JSON.stringify({
      reviewerId: reviewer.id,
      token: reviewer.token,
      deniedToken: denied.token,
      left: left.party.id,
      right: right.party.id,
      leftEmail: left.method.value,
      rightEmail: right.method.value,
      leftInquiry: left.inquiry.id,
    }),
  );
} finally {
  await connection.end();
}
