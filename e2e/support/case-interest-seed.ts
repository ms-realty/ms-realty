// Records one reviewed property suggestion on a browser-created buyer deal through the real
// `addInterest` command. Every new buyer/tenant suggestion needs structured requirements and the
// exact property review (O07); until the workbench add is bound in the cases Server Action, the
// S4 journey seeds that review here. Disposable E2E database only.
import { randomUUID } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/db/schema";
import { readSession } from "@/server/auth/sessions";
import { addInterest } from "@/server/cases/commands";
import { readCaseCandidate } from "@/server/cases/matching";

const url = process.env.E2E_DATABASE_URL;
if (!url || !/^\/msr_e2e_[a-f0-9]{32}$/.test(new URL(url).pathname))
  throw new Error("The case interest seed requires the generated disposable database.");
const input = JSON.parse(process.env.CASE_INTEREST_SEED ?? "{}") as {
  caseId?: string;
  staffToken?: string;
  reference?: string;
  explanation?: string;
};
if (!input.caseId || !input.staffToken || !input.reference || !input.explanation)
  throw new Error("CASE_INTEREST_SEED needs caseId, staffToken, reference and explanation.");
const connection = postgres(url, { max: 1, onnotice: () => {} });
const db = drizzle(connection, { schema });
try {
  const session = await readSession(db, input.staffToken);
  if (!session) throw new Error("Missing synthetic broker session");
  const [brief] = await db
    .select({ id: schema.briefRevisions.id, revision: schema.briefRevisions.revisionNumber })
    .from(schema.briefRevisions)
    .where(eq(schema.briefRevisions.caseId, input.caseId))
    .orderBy(desc(schema.briefRevisions.revisionNumber))
    .limit(1);
  if (!brief) throw new Error("Missing requirements revision");
  // Structured requirements as the server's own fixture helper records them (purpose only).
  await db
    .update(schema.briefRevisions)
    .set({ criteria: { purpose: "sale" } })
    .where(eq(schema.briefRevisions.id, brief.id));
  const reviewed = await readCaseCandidate(db, session, {
    id: input.caseId,
    reference: input.reference,
    locale: "bg",
    briefRevision: brief.revision,
  });
  if (reviewed.match !== "match") throw new Error("The synthetic listing is not a confirmed match");
  const [deal] = await db
    .select({ version: schema.cases.version })
    .from(schema.cases)
    .where(eq(schema.cases.id, input.caseId));
  if (!deal) throw new Error("Missing synthetic deal");
  const saved = await addInterest(db, session, {
    id: input.caseId,
    operationId: randomUUID(),
    expectedVersion: deal.version,
    reference: input.reference,
    explanation: input.explanation,
    matchReview: {
      briefRevision: reviewed.briefRevision,
      manifestId: reviewed.candidate.manifestId,
      availability: reviewed.candidate.availability.presented,
      violated: [...reviewed.violated],
      unconfirmed: [...reviewed.unconfirmed],
      reviewed: true,
    },
  });
  console.log(JSON.stringify({ interestId: saved.outcome.interestId }));
} finally {
  await connection.end();
}
