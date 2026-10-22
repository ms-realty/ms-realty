// F29 synthetic UI fixtures only. No provider, queue worker or live database is used.
import { randomUUID } from "node:crypto";
import { eq, sql as querySql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/db/schema";
import { createWorkspace, readWorkspace } from "@/server/ai/workspace";
import { workspaceConfig } from "@/server/ai/workspace-config";
import { caseFixture } from "@/server/cases/testing";
import { createListingFixture, publishForTest } from "@/server/publication/testing";
import { nextReference } from "@/server/references";

const url = process.env.E2E_DATABASE_URL;
if (!url || !/^\/msr_e2e_[a-f0-9]{32}$/.test(new URL(url).pathname))
  throw new Error("Generative UI fixtures require the disposable browser database");
const sql = postgres(url, { max: 2 });
const db = drizzle(sql, { schema });
try {
  const f = await caseFixture(db);
  await db
    .update(schema.cases)
    .set({ title: "Synthetic buyer deal" })
    .where(eq(schema.cases.id, f.record.id));
  const listing = await db.transaction(async (tx) => {
    // Share the browser seeds' lock: the publication helper's temporary references
    // restart in each process and must be replaced before another fixture uses them.
    await tx.execute(
      querySql`select pg_advisory_xact_lock(hashtextextended('discovery-synthetic-fixtures', 0))`,
    );
    const prepared = await createListingFixture(tx, {
      reviewerId: f.staff.id,
      title: "Synthetic approved apartment",
    });
    await tx
      .update(schema.properties)
      .set({ reference: await nextReference(tx, "property") })
      .where(eq(schema.properties.id, prepared.propertyId));
    const [nextListing] = await tx
      .select({
        next: querySql<string>`(coalesce(max(substring(${schema.listings.reference} from '^MS-([0-9]+)$')::numeric), 70000) + 1)::text`,
      })
      .from(schema.listings);
    // Other fixtures use large numeric references. Keep the exact decimal string throughout.
    if (!nextListing?.next || !/^[0-9]+$/.test(nextListing.next))
      throw new Error("Synthetic listing reference allocation failed");
    const reference = `MS-${nextListing.next.padStart(5, "0")}`;
    await tx
      .update(schema.listings)
      .set({ reference })
      .where(eq(schema.listings.id, prepared.listingId));
    await tx
      .update(schema.sellerInstructions)
      .set({ reference: await nextReference(tx, "seller_instruction") })
      .where(eq(schema.sellerInstructions.listingId, prepared.listingId));
    const unique = { ...prepared, reference };
    await publishForTest(tx, f.staff.actor, unique);
    return unique;
  });
  const id = randomUUID();
  await createWorkspace(db, f.staff.session, {
    id,
    operationId: randomUUID(),
    expectedVersion: 1,
    goal: "Synthetic research: compare quiet work locations",
    locale: "en",
    constraints: ["Do not infer availability"],
    selection: { caseId: f.record.id, inquiryId: f.inquiry.id, listingIds: [listing.listingId] },
  });
  const view = await readWorkspace(db, f.staff.session, id);
  const source = view.context.sources.find((item) => item.key === "case:" + f.record.id);
  if (!source?.text) throw new Error("Synthetic case source missing");
  const citations = [{ source: source.key, quote: source.text.split("\n")[0] ?? source.text }];
  const taskId = randomUUID(),
    buyerId = randomUUID();
  await db.insert(schema.generativeArtifacts).values([
    {
      id: taskId,
      sessionId: id,
      proposal: {
        kind: "task",
        title: "Review quiet alternatives",
        body: "Verify street noise and record the evidence. Do not contact anyone.",
        citations,
      },
      contextDigest: view.context.digest,
      contextPins: view.context.pins,
    },
    {
      id: buyerId,
      sessionId: id,
      proposal: {
        kind: "buyer_handoff",
        title: "Buyer research handoff",
        body: "Synthetic comparison for broker review. Availability needs a current check.",
        requirements: "A quiet place for remote work",
        preferences: "Near transport",
        listingIds: [listing.listingId],
        citations,
      },
      contextDigest: view.context.digest,
      contextPins: view.context.pins,
    },
  ]);
  await db
    .update(schema.generativeSessions)
    .set({
      state: "review",
      questions: ["Which matters more: quiet or a shorter commute?"],
      decisions: ["Proposed: compare quiet streets before selecting a home."],
      plan: [
        { id: "compare", title: "Compare approved options", state: "prepared" },
        { id: "review", title: "Broker checks current availability", state: "pending" },
      ],
      conversation: [
        ...view.workspace.conversation,
        { role: "assistant", text: "Synthetic prepared research requires human review." },
      ],
    })
    .where(eq(schema.generativeSessions.id, id));
  let runId: string | null = null;
  const mode = process.argv[2];
  if (mode === "expired" || mode === "active") {
    const config = workspaceConfig();
    const [run] = await db
      .insert(schema.generativeRuns)
      .values({
        sessionId: id,
        requestedById: f.staff.id,
        generation: 1,
        state: "running",
        policyDigest: config.policyDigest,
        budget: { ...config.budget, maxCostMicros: 1000 },
        contextDigest: view.context.digest,
        contextPins: view.context.pins,
        reservedCostMicros: 1000,
        steps: 1,
        claimId: randomUUID(),
        claimedAt:
          mode === "expired" ? new Date(Date.now() - config.budget.timeoutMs - 60_000) : new Date(),
      })
      .returning();
    if (!run) throw new Error("Synthetic run missing");
    runId = run.id;
    await db.insert(schema.generativeCheckpoints).values({
      runId: run.id,
      step: 1,
      costMicros: 0,
      turn: {
        message: "Synthetic saved research step can be resumed.",
        questions: [],
        decisions: [],
        plan: [],
        next: "tool",
        tool: { name: "context.read", source: source.key },
      },
      toolResult: null,
    });
    await db
      .update(schema.generativeSessions)
      .set({ state: "running", generation: 1, activeRunId: run.id })
      .where(eq(schema.generativeSessions.id, id));
  }
  console.log(
    JSON.stringify({
      id,
      actorId: f.staff.id,
      token: f.staff.token,
      caseId: f.record.id,
      caseReference: source.title,
      inquiryId: f.inquiry.id,
      listingId: listing.listingId,
      listingReference: listing.reference,
      taskId,
      buyerId,
      runId,
    }),
  );
} finally {
  await sql.end();
}
