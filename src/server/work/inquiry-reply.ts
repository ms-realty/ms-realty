import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { assistanceRuns } from "@/db/schema";
import { readAssistanceRun, readAssistanceSource } from "../ai/assistance";
import { draftSchema } from "../ai/draft";
import type { Session } from "../auth/sessions";
import type { Executor } from "../db";

/** Source authorization and digest are rechecked before an accepted draft can reach a composer. */
export async function readReviewedInquiryReply(db: Executor, session: Session, inquiryId: string) {
  await readAssistanceSource(db, session, inquiryId);
  const [latest] = await db
    .select({ id: assistanceRuns.id })
    .from(assistanceRuns)
    .where(
      and(
        eq(assistanceRuns.sourceType, "inquiry"),
        eq(assistanceRuns.sourceId, inquiryId),
        eq(assistanceRuns.task, "reply_draft"),
        eq(assistanceRuns.state, "accepted"),
      ),
    )
    .orderBy(desc(assistanceRuns.reviewedAt), desc(assistanceRuns.id))
    .limit(1);
  if (!latest) return null;
  const { run, sourceCurrent } = await readAssistanceRun(db, session, latest.id);
  const output = draftSchema.safeParse(run.output);
  return sourceCurrent && output.success && run.reviewedAt && run.reviewedById
    ? {
        id: run.id,
        body: output.data.body,
        sourceVersion: run.sourceVersion,
        reviewedAt: run.reviewedAt.toISOString(),
      }
    : null;
}
