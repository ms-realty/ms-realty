import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { auditEvents, caseParticipants, cases, tasks } from "@/db/schema";
import { createTestDatabase, type TestDatabase } from "@/db/test-utils";
import { type ButlerEvidence, butlerAutomaticActions, butlerHumanActions } from "@/domain/butler";
import type { Actor } from "@/domain/capabilities";
import { caseFixture } from "../cases/testing";
import { hashRequest } from "../crypto";
import { AppError } from "../errors";
import { findOperation, reconcileOperation, runOperation } from "../operations";
import type { ButlerAuthorization } from "./authority";
import { createButlerExecutor, defineButlerAction } from "./executor";
import { readButlerReceipt } from "./receipts";
import { runButlerAction } from "./tasks";

let t: TestDatabase;
let fixture: Awaited<ReturnType<typeof caseFixture>>;
const butler: Actor = { kind: "system", id: "butler" };
beforeAll(async () => {
  t = await createTestDatabase();
  fixture = await caseFixture(t.db);
});
afterAll(async () => {
  await t?.drop();
});

const request = (action: string, body?: Record<string, unknown>) => ({
  action,
  idempotencyKey: randomUUID(),
  body: { caseId: fixture.record.id, ...body },
});
const allTasks = () => t.db.select().from(tasks).where(eq(tasks.caseId, fixture.record.id));

describe("durable Butler Option 2 authorization", () => {
  it.each([
    { kind: "ai_service", id: "hermes" },
    { kind: "system", id: "butler" },
    { kind: "staff", id: "forged-human" },
  ] as const)("$kind cannot execute a Butler action by claiming authority", async (actor) => {
    let calls = 0;
    const input = {
      actor,
      type: "butler.task.create",
      idempotencyKey: randomUUID(),
      requestHash: hashRequest({}),
      subject: { type: "case", id: fixture.record.id },
      butlerAuthorization: {} as ButlerAuthorization,
    };
    for (let retry = 0; retry < 2; retry++)
      await expect(
        runOperation(t.db, input, async () => {
          calls++;
        }),
      ).rejects.toMatchObject({
        code: "forbidden",
        current: {
          butlerReceipt: {
            verdict: "blocked",
            reason: "server_authority_required",
            manual: { available: true, requiresAuthorization: true },
          },
        },
      });
    expect(calls).toBe(0);
    const saved = await findOperation(t.db, actor, input.type, input.idempotencyKey);
    expect(saved).toMatchObject({ status: "failed", butlerReceipt: { verdict: "blocked" } });
    expect(
      await t.db
        .select()
        .from(auditEvents)
        .where(eq(auditEvents.operationId, saved?.operationId ?? "")),
    ).toHaveLength(1);
  });
  it("raw AI also cannot evade the boundary by choosing an ordinary command name", async () => {
    let calls = 0;
    await expect(
      runOperation(
        t.db,
        {
          actor: { kind: "ai_service", id: "hermes" },
          type: "message.send_external",
          idempotencyKey: randomUUID(),
          requestHash: hashRequest({}),
        },
        async () => {
          calls++;
        },
      ),
    ).rejects.toMatchObject({ code: "forbidden" });
    expect(calls).toBe(0);
  });
  it.each(butlerHumanActions)(
    "%s is awaiting approval; no worker impersonates a reviewer",
    async (action) => {
      const input = request(action, { approved: true, reviewedBy: fixture.staff.id });
      const before = await allTasks();
      await expect(runButlerAction(t.db, input)).rejects.toMatchObject({
        code: "butler_approval_required",
        current: {
          butlerReceipt: {
            action,
            verdict: "awaiting_approval",
            outcome: "not_applied",
            manual: { available: true },
          },
        },
      });
      const receipt = await findOperation(t.db, butler, `butler.${action}`, input.idempotencyKey);
      expect(receipt?.butlerReceipt?.verdict).toBe("awaiting_approval");
      expect(await allTasks()).toHaveLength(before.length);
    },
  );
  it("unrecognized commands are durably blocked rather than implicitly allowed", async () => {
    const input = request("new.action");
    await expect(runButlerAction(t.db, input)).rejects.toMatchObject({
      current: { butlerReceipt: { verdict: "blocked", reason: "action_not_allowlisted" } },
    });
  });
  it.each(butlerAutomaticActions.filter((a) => a !== "task.create"))(
    "%s without a registered guard is blocked",
    async (action) => {
      await expect(runButlerAction(t.db, request(action))).rejects.toMatchObject({
        code: "forbidden",
        current: { butlerReceipt: { verdict: "blocked" } },
      });
    },
  );
  it("creates a real internal task once, with the verdict and effect committed together", async () => {
    const input = request("task.create", {
      title: "Synthetic internal follow-up",
      purpose: "Review source documents",
    });
    const before = await allTasks();
    const first = await runButlerAction(t.db, input);
    expect(first.butlerReceipt).toMatchObject({
      operationId: first.operationId,
      action: "task.create",
      verdict: "done_automatically",
      outcome: "applied",
      manual: { available: true, requiresAuthorization: true },
    });
    expect(await readButlerReceipt(t.db, fixture.staff.session, first.operationId)).toEqual(
      first.butlerReceipt,
    );
    await expect(
      readButlerReceipt(t.db, fixture.client.session, first.operationId),
    ).rejects.toMatchObject({ code: "not_found" });
    const retry = await runButlerAction(t.db, input);
    expect(retry).toEqual({ ...first, replayed: true });
    const created = (await allTasks()).filter(
      (task) => task.title === "Synthetic internal follow-up",
    );
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({
      state: "open",
      promisedToClient: false,
      ownerId: fixture.staff.id,
    });
    expect(await allTasks()).toHaveLength(before.length + 1);
    expect(
      await t.db
        .select()
        .from(auditEvents)
        .where(
          and(
            eq(auditEvents.operationId, first.operationId),
            eq(auditEvents.action, "butler.verdict"),
          ),
        ),
    ).toHaveLength(1);
    expect(
      await findOperation(t.db, butler, "butler.task.create", input.idempotencyKey),
    ).toMatchObject({
      status: "succeeded",
      outcome: first.outcome,
      butlerReceipt: first.butlerReceipt,
    });
    await expect(
      runButlerAction(t.db, { ...input, body: { ...input.body, title: "Changed request" } }),
    ).rejects.toMatchObject({ code: "idempotency_key_reused" });
  });
  it("the task schema cannot smuggle a promise, cancellation or a model's approval facts", async () => {
    for (const extra of [
      { promisedToClient: true },
      { state: "cancelled" },
      { ownerAvailable: true },
      { approved: true },
    ])
      await expect(
        runButlerAction(t.db, request("task.create", { title: "No effect", ...extra })),
      ).rejects.toMatchObject({ code: "validation_failed" });
  });
  it("case closure is checked fresh inside the effect transaction", async () => {
    await t.db
      .update(cases)
      .set({
        disposition: "closed",
        closureOutcome: "Synthetic closeout",
        commitmentDispositions: {},
      })
      .where(eq(cases.id, fixture.record.id));
    const input = request("task.create", { title: "Must not create after closure" });
    const before = await allTasks();
    await expect(runButlerAction(t.db, input)).rejects.toMatchObject({
      code: "not_found",
      current: { butlerReceipt: { verdict: "blocked" } },
    });
    expect(await allTasks()).toHaveLength(before.length);
    await t.db
      .update(cases)
      .set({ disposition: "active", closureOutcome: null, commitmentDispositions: null })
      .where(eq(cases.id, fixture.record.id));
    // A changed precondition needs a new intent/key; a parked failed attempt never changes itself.
    await expect(runButlerAction(t.db, input)).rejects.toMatchObject({ code: "not_found" });
  });
  it("a registered message adapter re-reads live participation, never submitted booleans", async () => {
    let calls = 0;
    const adapter = defineButlerAction(
      "reminder.send",
      z.object({ caseId: z.uuid(), partyId: z.uuid() }).strict(),
      {
        async readAndLock(ctx, command): Promise<ButlerEvidence> {
          const [participant] = await ctx.tx
            .select()
            .from(caseParticipants)
            .where(
              and(
                eq(caseParticipants.caseId, command.caseId),
                eq(caseParticipants.partyId, command.partyId),
              ),
            )
            .for("update");
          return {
            caseId: command.caseId,
            caseActive: true,
            protectedEffects: [],
            message: {
              templateId: "fixture-reviewed-template",
              templateAction: "reminder.send",
              approvedDigest: "fixture-exact-rendering",
              renderedDigest: "fixture-exact-rendering",
              active: true,
              recipients: [
                {
                  partyId: command.partyId,
                  currentCaseParticipant: !!participant && !participant.revokedAt,
                  contactEligible: true,
                  firstContactHumanReceiptId: "fixture-human-contact",
                },
              ],
            },
          };
        },
        async execute() {
          calls++;
          return { providerReceipt: "synthetic-test-only" };
        },
      },
    );
    const execute = createButlerExecutor([adapter]);
    await t.db
      .update(caseParticipants)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(caseParticipants.caseId, fixture.record.id),
          eq(caseParticipants.partyId, fixture.client.partyId),
        ),
      );
    await expect(
      execute(t.db, request("reminder.send", { partyId: fixture.client.partyId })),
    ).rejects.toMatchObject({ current: { butlerReceipt: { reason: "recipient_not_eligible" } } });
    expect(calls).toBe(0);
    await t.db
      .update(caseParticipants)
      .set({ revokedAt: null })
      .where(
        and(
          eq(caseParticipants.caseId, fixture.record.id),
          eq(caseParticipants.partyId, fixture.client.partyId),
        ),
      );
  });
  it("an unknown provider result remains blocked through retries, then retains its reconciled receipt", async () => {
    let calls = 0;
    const adapter = defineButlerAction("chaser.send", z.object({ caseId: z.uuid() }).strict(), {
      async readAndLock(_ctx, command): Promise<ButlerEvidence> {
        return {
          caseId: command.caseId,
          caseActive: true,
          protectedEffects: [],
          message: {
            templateId: "fixture-reviewed-template",
            templateAction: "chaser.send",
            approvedDigest: "fixture-exact-rendering",
            renderedDigest: "fixture-exact-rendering",
            active: true,
            recipients: [
              {
                partyId: fixture.client.partyId,
                currentCaseParticipant: true,
                contactEligible: true,
                firstContactHumanReceiptId: "fixture-human-contact",
              },
            ],
          },
        };
      },
      async execute() {
        calls++;
        throw new AppError("unavailable", { outcome: "unknown" });
      },
    });
    const execute = createButlerExecutor([adapter]);
    const input = request("chaser.send");
    for (let i = 0; i < 2; i++)
      await expect(execute(t.db, input)).rejects.toMatchObject({
        code: "outcome_unknown",
        current: {
          butlerReceipt: {
            verdict: "blocked",
            outcome: "unknown",
            manual: { available: true, requiresReconciliation: true },
          },
        },
      });
    expect(calls).toBe(1);
    const stored = await findOperation(t.db, butler, "butler.chaser.send", input.idempotencyKey);
    expect(stored?.status).toBe("outcome_unknown");
    expect(
      await reconcileOperation(t.db, stored?.operationId ?? "", {
        status: "succeeded",
        outcome: { providerReceipt: "fixture-reconciled-provider" },
      }),
    ).toBe(true);
    const replay = await execute(t.db, input);
    expect(replay).toMatchObject({
      replayed: true,
      outcome: { providerReceipt: "fixture-reconciled-provider" },
      butlerReceipt: {
        verdict: "done_automatically",
        reason: "reconciled_applied",
        manual: { requiresReconciliation: false },
      },
    });
    expect(calls).toBe(1);
  });
  it("a JSON adapter lookalike cannot register an effect", () => {
    expect(() => createButlerExecutor([{} as ReturnType<typeof defineButlerAction>])).toThrow(
      "Invalid Butler adapter registry",
    );
  });
  it("a retryable command failure rolls back its writes but retains a blocked verdict", async () => {
    let calls = 0;
    const execute = createButlerExecutor([
      defineButlerAction("task.create", z.object({ caseId: z.uuid() }).strict(), {
        async readAndLock(_ctx, command): Promise<ButlerEvidence> {
          return {
            caseId: command.caseId,
            caseActive: true,
            protectedEffects: [],
            task: { internalCreationOnly: true, ownerAvailable: true, makesClientPromise: false },
          };
        },
        async execute(ctx, command) {
          calls++;
          await ctx.tx.insert(tasks).values({ caseId: command.caseId, title: "Rolled back task" });
          throw new AppError("unavailable");
        },
      }),
    ]);
    const input = request("task.create");
    const before = await allTasks();
    for (let i = 0; i < 2; i++)
      await expect(execute(t.db, input)).rejects.toMatchObject({
        current: { butlerReceipt: { verdict: "blocked", outcome: "not_applied" } },
      });
    expect(calls).toBe(1);
    expect(await allTasks()).toHaveLength(before.length);
  });
  it("an unclassified exception after execution starts never permits an automatic resend", async () => {
    let calls = 0;
    const execute = createButlerExecutor([
      defineButlerAction("task.create", z.object({ caseId: z.uuid() }).strict(), {
        async readAndLock(_ctx, command): Promise<ButlerEvidence> {
          return {
            caseId: command.caseId,
            caseActive: true,
            protectedEffects: [],
            task: { internalCreationOnly: true, ownerAvailable: true, makesClientPromise: false },
          };
        },
        async execute() {
          calls++;
          throw new Error("Synthetic ambiguous external transport");
        },
      }),
    ]);
    const input = request("task.create");
    for (let i = 0; i < 2; i++)
      await expect(execute(t.db, input)).rejects.toMatchObject({
        code: "outcome_unknown",
        current: { butlerReceipt: { verdict: "blocked", outcome: "unknown" } },
      });
    expect(calls).toBe(1);
    const stored = await findOperation(t.db, butler, "butler.task.create", input.idempotencyKey);
    expect(
      await reconcileOperation(t.db, stored?.operationId ?? "", {
        status: "failed",
        code: "transition_denied",
      }),
    ).toBe(true);
    expect(
      await readButlerReceipt(t.db, fixture.staff.session, stored?.operationId ?? ""),
    ).toMatchObject({
      verdict: "blocked",
      outcome: "not_applied",
      manual: { requiresReconciliation: false },
    });
  });
});
