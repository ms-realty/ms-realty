// Disposable browser fixture only; never an agency policy, live erasure or launch receipt.
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/db/schema";
import { syntheticErasureFixture, syntheticErasurePolicy } from "./erasure-testing";

const url = process.env.E2E_DATABASE_URL;
if (!url || !/^\/msr_e2e_[a-f0-9]{32}$/.test(new URL(url).pathname))
  throw new Error("Disposable browser database required");
const connection = postgres(url, { max: 1, onnotice: () => {} }),
  db = drizzle(connection, { schema });
try {
  const fixture = await syntheticErasureFixture(db);
  await syntheticErasurePolicy(db, fixture);
  console.log(
    JSON.stringify({
      staffToken: fixture.staffSession.token,
      clientToken: fixture.clientSession.token,
      requestId: fixture.request.id,
      partyId: fixture.client.partyId,
      otherPartyId: fixture.other.partyId,
    }),
  );
} finally {
  await connection.end();
}
