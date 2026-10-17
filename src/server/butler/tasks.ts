import "server-only";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { cases } from "@/db/schema";
import { requireAvailableStaff } from "../auth/availability";
import { AppError } from "../errors";
import { createButlerExecutor, defineButlerAction } from "./executor";

const commandSchema = z
  .object({
    caseId: z.uuid(),
    title: z.string().trim().min(1).max(240),
    purpose: z.string().trim().min(1).max(2000).optional(),
  })
  .strict();

// Preserve the old intent schema and live scope checks for durable denials and readback.
// A human creates the task through a separately authorized command.
const taskIntentAdapter = defineButlerAction("task.create", commandSchema, {
  async readAndLock(ctx, command) {
    const [record] = await ctx.tx
      .select()
      .from(cases)
      .where(eq(cases.id, command.caseId))
      .for("update");
    if (record?.disposition !== "active" || !record.ownerId) throw new AppError("not_found");
    await requireAvailableStaff(ctx.tx, record.ownerId, true);
    return {
      caseId: record.id,
      caseActive: true,
      protectedEffects: [],
      task: { internalCreationOnly: true, ownerAvailable: true, makesClientPromise: false },
    };
  },
  async execute() {
    throw new AppError("forbidden");
  },
});

/** Server worker entry point. No public route / staff impersonation / model evidence inputs. */
export const runButlerAction = createButlerExecutor([taskIntentAdapter]);
