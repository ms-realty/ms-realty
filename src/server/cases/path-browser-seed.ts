// Disposable synthetic Deal path fixture (ADR 0013): a buyer Deal whose terms both parties
// agreed through the real decision command, with every recorded step done except the last two.
// No provider, legal or operational proof.
import { randomUUID } from "node:crypto";
import { eq, sql as statement } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { agencyTimeZone } from "@/config/tenant";
import * as schema from "@/db/schema";
import { calendarDate } from "@/domain/deal-path";
import { recordProposalDecision } from "../proposals/service";
import {
  prepareProposalAgreement,
  proposalCounterparty,
  proposalFixture,
  publishProposalForTest,
} from "../proposals/testing";
import { recordPathStep } from "./path";

const url = process.env.E2E_DATABASE_URL;
if (!url || !/^\/msr_e2e_[a-f0-9]{32}$/.test(new URL(url).pathname))
  throw new Error("Disposable browser database required.");
const connection = postgres(url, { max: 1, onnotice: () => {} }),
  db = drizzle(connection, { schema });
try {
  const f = await db.transaction(async (tx) => {
    await tx.execute(
      statement`select pg_advisory_xact_lock(hashtextextended('discovery-synthetic-fixtures', 0))`,
    );
    const f = await proposalFixture(tx);
    const suffix = randomUUID();
    await tx
      .update(schema.listings)
      .set({ reference: `MS-PATH-${suffix}` })
      .where(eq(schema.listings.id, f.listing.listingId));
    await tx
      .update(schema.properties)
      .set({ reference: `PR-PATH-${suffix}` })
      .where(eq(schema.properties.id, f.listing.propertyId));
    await tx
      .update(schema.sellerInstructions)
      .set({ reference: `SI-SYNTHETIC-${randomUUID()}` })
      .where(eq(schema.sellerInstructions.listingId, f.listing.listingId));
    return f;
  });
  const seller = await proposalCounterparty(db, f);
  await publishProposalForTest(db, f);
  await prepareProposalAgreement(db, f);
  const decision = {
    id: f.proposal.id,
    revisionId: f.revision.id,
    state: "agreed_for_next_step" as const,
    reason: "Synthetic exact-terms agreement",
  };
  await recordProposalDecision(db, f.client.session, {
    ...decision,
    expectedVersion: 3,
    operationId: randomUUID(),
  });
  await recordProposalDecision(db, seller.session, {
    ...decision,
    expectedVersion: 4,
    operationId: randomUUID(),
  });
  await db
    .update(schema.tasks)
    .set({ state: "cancelled", cancelReason: "Synthetic intake follow-up no longer needed" })
    .where(eq(schema.tasks.caseId, f.record.id));
  const steps = await db
    .select()
    .from(schema.casePathSteps)
    .where(eq(schema.casePathSteps.caseId, f.record.id))
    .orderBy(schema.casePathSteps.position);
  const today = calendarDate(new Date(), agencyTimeZone);
  for (const step of steps.slice(0, -2)) {
    const [row] = await db
      .select({ version: schema.cases.version })
      .from(schema.cases)
      .where(eq(schema.cases.id, f.record.id));
    await recordPathStep(db, f.staff.session, {
      id: f.record.id,
      expectedVersion: row?.version ?? 0,
      operationId: randomUUID(),
      stepKey: step.stepKey,
      action: "done",
      date: today,
      clientNote: "",
      internalNote: "",
      reason: "",
      evidenceVersionId: "",
    });
  }
  console.log(
    JSON.stringify({
      caseId: f.record.id,
      staffToken: f.staff.token,
      clientToken: f.client.token,
      steps: steps.map((s) => s.stepKey),
    }),
  );
} finally {
  await connection.end();
}
