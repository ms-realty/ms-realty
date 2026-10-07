import "server-only";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { operations } from "@/db/schema";
import type { ButlerReceipt } from "@/domain/butler";
import type { Session } from "../auth/sessions";
import { caseFor } from "../cases/shared";
import type { Executor } from "../db";
import { AppError } from "../errors";
import { liveStaff } from "../work/shared";

/** Minimal UI contract; never expose raw command bodies, outcomes or the authorization token. */
export async function readButlerReceipt(
  db: Executor,
  session: Session,
  operationId: string,
): Promise<ButlerReceipt> {
  if (!z.uuid().safeParse(operationId).success) throw new AppError("not_found");
  const live = await liveStaff(db, session);
  const [row] = await db.select().from(operations).where(eq(operations.id, operationId));
  if (
    row?.actorKind !== "system" ||
    row.actorId !== "butler" ||
    !row.operationType.startsWith("butler.") ||
    row.resultType !== "case" ||
    !row.resultId
  )
    throw new AppError("not_found");
  await caseFor(db, live, row.resultId);
  const outcome = row.outcome as {
    butlerReceipt?: ButlerReceipt;
    current?: { butlerReceipt?: ButlerReceipt };
  } | null;
  const receipt = outcome?.butlerReceipt ?? outcome?.current?.butlerReceipt;
  if (!receipt) throw new AppError("not_found");
  return receipt;
}
