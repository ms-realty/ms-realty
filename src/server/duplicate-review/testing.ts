import { randomUUID } from "node:crypto";
import { contactMethods, inquiries, parties } from "@/db/schema";
import type { Executor } from "@/server/db";
export async function reviewContactFixture(db: Executor, name: string) {
  const [party] = await db
    .insert(parties)
    .values({ kind: "person", displayName: name })
    .returning();
  if (!party) throw new Error("Missing synthetic party");
  const email = `${randomUUID()}@example.test`;
  const [method] = await db
    .insert(contactMethods)
    .values({
      partyId: party.id,
      kind: "email",
      value: email,
      normalizedValue: email,
    })
    .returning();
  const [inquiry] = await db
    .insert(inquiries)
    .values({
      partyId: party.id,
      contactMethodId: method?.id,
      reference: `RQ-REVIEW-${randomUUID()}`,
      source: "website",
      state: "received",
      coverageQueue: "new_inquiries",
      purpose: "question",
      submissionKey: randomUUID(),
      payloadDigest: "synthetic-contact-review",
      message: "Synthetic inquiry for contact review",
      preferredLocale: "bg",
    })
    .returning();
  if (!method || !inquiry) throw new Error("Missing synthetic contact source");
  return { party, method, inquiry };
}
