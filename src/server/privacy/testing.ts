// Synthetic content decisions for isolated tests. Never a deployment policy seed.
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { passkeys } from "@/db/schema";
import { createSession } from "../auth/sessions";
import { createContent, decideContent, readContentWorkbench } from "../content/commands";
import type { Executor } from "../db";
import { createStaff } from "../testing";
import { consentTerms } from "./preferences";

export async function syntheticServiceEmailTerms(db: Executor) {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended('synthetic-service-email-terms',0))`,
    );
    const existing = await consentTerms(tx, "service_updates", "bg");
    if (existing) return existing;
    const staff = await createStaff(tx, {
      grants: ["content.edit", "listing.review_facts", "claim.approve", "publication.release"].map(
        (capability) => ({ capability: capability as "content.edit" }),
      ),
    });
    await tx.insert(passkeys).values(
      [0, 1].map(() => ({
        principalId: staff.id,
        credentialId: randomUUID(),
        publicKey: Buffer.from([1]),
        deviceType: "singleDevice",
        backedUp: false,
      })),
    );
    const { session } = await createSession(tx, { kind: "staff", id: staff.id });
    const created = await createContent(tx, session, {
      operationId: randomUUID(),
      kind: "help",
      slug: "service-email-preferences",
      title: "Синтетични условия за имейл",
      text: "Само тест: изричен избор за имейли по случай. Това не е реална правна политика.",
      jurisdiction: "Synthetic test only",
      reviewScope: "Disposable fixture only",
    });
    for (const decision of ["claims", "editorial", "publish"] as const) {
      const { page } = await readContentWorkbench(tx, session, created.outcome.id);
      await decideContent(tx, session, {
        operationId: randomUUID(),
        id: page.id,
        expectedVersion: page.version,
        decision,
        note: "Explicit synthetic fixture review",
        reviewed: true,
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      });
    }
    const terms = await consentTerms(tx, "service_updates", "bg");
    if (!terms) throw new Error("No synthetic service terms");
    return terms;
  });
}
