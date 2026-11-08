// Local synthetic C10/R09 fixture only. The ordinary commands establish proposal visibility.

import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/db/schema";
import {
  prepareProposalAgreement,
  proposalFixture,
  publishProposalForTest,
} from "../proposals/testing";

const url = process.env.E2E_DATABASE_URL;
if (!url || !/^\/msr_e2e_[a-f0-9]{32}$/.test(new URL(url).pathname))
  throw new Error("Reauthentication browser fixture requires the generated disposable database");
const connection = postgres(url, { max: 1, onnotice: () => {} });
try {
  const db = drizzle(connection, { schema });
  const f = await db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended('discovery-synthetic-fixtures', 0))`,
    );
    const f = await proposalFixture(tx);
    // Fixture references use a process-local sequence. Release them before the next seed
    // process, exactly as the existing proposal browser fixture does.
    const suffix = randomUUID();
    await tx
      .update(schema.listings)
      .set({ reference: `MS-REAUTH-${suffix}` })
      .where(eq(schema.listings.id, f.listing.listingId));
    await tx
      .update(schema.properties)
      .set({ reference: `PR-REAUTH-${suffix}` })
      .where(eq(schema.properties.id, f.listing.propertyId));
    await tx
      .update(schema.sellerInstructions)
      .set({ reference: `SI-REAUTH-${suffix}` })
      .where(eq(schema.sellerInstructions.listingId, f.listing.listingId));
    return f;
  });
  await prepareProposalAgreement(db, f);
  await publishProposalForTest(db, f);
  console.log(
    JSON.stringify({
      proposalId: f.proposal.id,
      revisionId: f.revision.id,
      clientId: f.client.id,
      sessionId: f.client.session.id,
      clientToken: f.client.token,
      email: f.client.email,
    }),
  );
} finally {
  await connection.end();
}
