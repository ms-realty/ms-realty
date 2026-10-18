// Synthetic release-check viewer in a task-owned disposable browser database only.
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/db/schema";
import { staffFixture } from "../cases/testing";

const url = process.env.E2E_DATABASE_URL;
if (!url || !/^\/msr_e2e_[a-f0-9]{32}$/u.test(new URL(url).pathname))
  throw new Error("Disposable browser database required");
const connection = postgres(url, { max: 1, onnotice: () => {} });
try {
  const db = drizzle(connection, { schema });
  const viewer = await staffFixture(db),
    denied = await staffFixture(db);
  await db.insert(schema.grants).values({
    principalId: viewer.id,
    capability: "report.read",
    reason: "Synthetic release-check browser authority",
  });
  console.log(
    JSON.stringify({ token: viewer.token, deniedToken: denied.token, viewerId: viewer.id }),
  );
} finally {
  await connection.end();
}
