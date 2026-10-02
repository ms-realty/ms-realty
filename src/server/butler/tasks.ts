import "server-only";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { cases, tasks } from "@/db/schema";
import { recordActivity } from "../activity";
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

// Only open, internal tasks owned by the current case owner. No promise, completion,
// reassignment, cancellation, condition clearance, legal review or monetary effect.
export const butlerTaskAdapter = defineButlerAction("task.create", commandSchema, {
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
  async execute(ctx, command) {
    const [record] = await ctx.tx
      .select({ ownerId: cases.ownerId })
      .from(cases)
      .where(eq(cases.id, command.caseId));
    if (!record?.ownerId) throw new AppError("not_found");
    const [task] = await ctx.tx
      .insert(tasks)
      .values({
        caseId: command.caseId,
        ownerId: record.ownerId,
        title: command.title,
        purpose: command.purpose,
        type: "general",
        state: "open",
        promisedToClient: false,
      })
      .returning({ id: tasks.id, version: tasks.version });
    if (!task) throw new Error("No Butler task result");
    await recordActivity(ctx.tx, {
      recordType: "case",
      recordId: command.caseId,
      audience: "internal",
      messageKey: "butler.task.created",
      summary: "butler.task.created",
      params: { taskId: task.id },
      actor: ctx.actor,
      operationId: ctx.operationId,
    });
    return { taskId: task.id, version: task.version };
  },
});

/** Server worker entry point. No public route / staff impersonation / model evidence inputs. */
export const runButlerAction = createButlerExecutor([butlerTaskAdapter]);
