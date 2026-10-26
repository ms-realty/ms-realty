// Disposable browser fixtures only; no actual offering, customer or provider is asserted.
import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/db/schema";
import { createSession } from "../auth/sessions";
import { createClient } from "../testing";
import { publishSyntheticScope, syntheticServiceFixture } from "./testing";

const url = process.env.E2E_DATABASE_URL;
if (!url || !/^\/msr_e2e_[a-f0-9]{32}$/.test(new URL(url).pathname))
  throw new Error("Disposable E2E database required");
const connection = postgres(url, { max: 2, onnotice: () => {} }),
  db = drizzle(connection, { schema });
try {
  const command = process.argv[2];
  if (command === "read") {
    const [row] = await db
      .select()
      .from(schema.inquiries)
      .where(sql`${schema.inquiries.context}->'content'->>'slug' = ${process.argv[3]}`)
      .orderBy(sql`${schema.inquiries.createdAt} desc`)
      .limit(1);
    const [record] = row?.caseId
      ? await db.select().from(schema.cases).where(eq(schema.cases.id, row.caseId))
      : [];
    console.log(JSON.stringify({ inquiry: row, record }));
  } else if (command === "client") {
    const id = process.argv[3] ?? "";
    const [record] = await db.select().from(schema.cases).where(eq(schema.cases.id, id));
    if (record?.kind !== "service_intake") throw new Error("Synthetic service Case required");
    const client = await createClient(db, {
      email: `synthetic-invited-${randomUUID()}@example.test`,
    });
    // Explicit synthetic invitation scope, separately seeded from the requester's declaration.
    await db.insert(schema.caseParticipants).values({
      caseId: id,
      partyId: client.partyId,
      role: "collaborator",
      authority: "not_claimed",
      scope: { capabilities: ["portal.case.read", "portal.message.write"] },
    });
    const session = await createSession(db, { kind: "client", id: client.id });
    console.log(JSON.stringify({ token: session.token }));
  } else {
    const f = await syntheticServiceFixture(db);
    const offered = f.document.decisions.find((row) => row.state === "offered");
    if (offered?.state !== "offered") throw new Error("Synthetic offering missing");
    const document = {
      ...f.document,
      decisions: [
        offered,
        { ...offered, topic: "short_stay_consultation" as const, mode: "consultation" as const },
      ],
    };
    await publishSyntheticScope(db, f.session, document);
    const issued = await createSession(db, { kind: "staff", id: f.actor.id });
    console.log(
      JSON.stringify({
        token: issued.token,
        actorId: f.actor.id,
        slug: f.source.slug,
        regionId: f.region.id,
      }),
    );
  }
} finally {
  await connection.end();
}
