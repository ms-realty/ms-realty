import "server-only";
import { eq } from "drizzle-orm";
import { principals } from "@/db/schema";
import { requireFreshAuth, requireLiveSession, type Session } from "../auth/sessions";
import { assertCan } from "../authz";
import type { Executor } from "../db";
import { AppError } from "../errors";
import { liveStaff } from "../work/shared";

export async function privacyClient(db: Executor, session: Session, fresh = true) {
  const live = await requireLiveSession(db, session);
  if (live.account.kind !== "client") throw new AppError("not_found");
  if (fresh) requireFreshAuth(live);
  const [person] = await db
    .select({ id: principals.id, partyId: principals.partyId, email: principals.email })
    .from(principals)
    .where(eq(principals.id, live.account.id));
  if (!person) throw new AppError("not_found");
  return { live, person };
}

export async function privacyOperator(db: Executor, session: Session, id?: string) {
  const live = await liveStaff(db, session);
  requireFreshAuth(live);
  await assertCan(
    db,
    live.actor,
    "privacy.manage",
    id ? { type: "privacy_request", id } : undefined,
  );
  return live;
}
