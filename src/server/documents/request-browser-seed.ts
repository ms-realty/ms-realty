// Synthetic fixture only; browser actions perform the new request and document decisions.
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/db/schema";
import { documentRequestFixture } from "./request-testing";

const url = process.env.E2E_DATABASE_URL;
if (!url || !/^\/msr_e2e_[a-f0-9]{32}$/.test(new URL(url).pathname))
  throw new Error("Disposable browser database required");
const connection = postgres(url, { max: 1, onnotice: () => {} }),
  db = drizzle(connection, { schema });
try {
  const f = await documentRequestFixture(db);
  console.log(
    JSON.stringify({
      caseId: f.record.id,
      staffToken: f.staff.token,
      clientToken: f.client.token,
      participantId: f.participant.id,
      policyId: f.policyId,
    }),
  );
} finally {
  await connection.end();
}
