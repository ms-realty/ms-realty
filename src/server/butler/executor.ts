import "server-only";
import { z } from "zod";
import type { ButlerAutomaticAction, ButlerEvidence } from "@/domain/butler";
import { hashRequest } from "../crypto";
import type { Executor } from "../db";
import { AppError } from "../errors";
import { type OperationContext, type OperationInput, runOperation } from "../operations";
import { parseInput } from "../work/shared";
import { bindButlerAuthorization } from "./authority";

declare const adapterBrand: unique symbol;
export interface ButlerActionAdapter {
  readonly [adapterBrand]: true;
}
interface Definition {
  readonly action: ButlerAutomaticAction;
  readonly parse: (body: unknown) => { caseId: string };
  readonly readAndLock: (ctx: OperationContext, body: unknown) => Promise<ButlerEvidence>;
  readonly execute: (ctx: OperationContext, body: unknown) => Promise<unknown>;
}
const definitions = new WeakMap<ButlerActionAdapter, Definition>();

/**
 * Register once in trusted server code, never in a route using model-supplied functions/facts.
 * A definition is one fixed action, strict command schema, locked evidence and concrete effect.
 * For sends, execute must return only after a confirmed send, not draft/outbox acceptance;
 * throw AppError with outcome:"unknown" for an unresolved provider result. Existing send
 * deduplication, opt-out/recipient guards and provider reconciliation remain mandatory.
 */
export function defineButlerAction<Command extends { caseId: string }, Result>(
  action: ButlerAutomaticAction,
  schema: z.ZodType<Command>,
  adapter: {
    readonly readAndLock: (ctx: OperationContext, command: Command) => Promise<ButlerEvidence>;
    readonly execute: (ctx: OperationContext, command: Command) => Promise<Result>;
  },
): ButlerActionAdapter {
  const registration = Object.freeze({}) as ButlerActionAdapter;
  definitions.set(registration, {
    action,
    parse: (body) => parseInput(schema, body),
    readAndLock: (ctx, body) => adapter.readAndLock(ctx, body as Command),
    execute: (ctx, body) => adapter.execute(ctx, body as Command),
  });
  return registration;
}

function freezeJson<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.values(value).forEach(freezeJson);
    Object.freeze(value);
  }
  return value;
}

const requestSchema = z
  .object({
    action: z.string().min(1).max(80),
    idempotencyKey: z.string().min(16).max(200),
    body: z.unknown(),
  })
  .strict();
const caseSubject = z.object({ caseId: z.uuid() }).passthrough();

/** The registry is captured at bootstrap. A JSON request cannot register/relabel an adapter. */
export function createButlerExecutor(registrations: readonly ButlerActionAdapter[]) {
  const registry = new Map<ButlerAutomaticAction, Definition>();
  for (const registration of registrations) {
    const definition = definitions.get(registration);
    if (!definition || registry.has(definition.action))
      throw new Error("Invalid Butler adapter registry");
    registry.set(definition.action, definition);
  }
  return async (db: Executor, raw: unknown) => {
    const request = parseInput(requestSchema, raw);
    const definition = registry.get(request.action as ButlerAutomaticAction);
    const body = freezeJson(
      JSON.parse(
        JSON.stringify(
          definition ? definition.parse(request.body) : parseInput(caseSubject, request.body),
        ),
      ) as { caseId: string },
    );
    const input: OperationInput = Object.freeze({
      actor: Object.freeze({ kind: "system" as const, id: "butler" }),
      type: `butler.${request.action}`,
      idempotencyKey: request.idempotencyKey,
      requestHash: hashRequest({ action: request.action, body }),
      subject: Object.freeze({ type: "case", id: body.caseId }),
    });
    const execute = async (ctx: OperationContext) => {
      // A missing adapter cannot execute even if a future policy accidentally admits it.
      if (!definition) throw new AppError("forbidden");
      return definition.execute(ctx, body);
    };
    const authority = bindButlerAuthorization({
      input,
      action: request.action,
      execute,
      ...(definition
        ? { readAndLock: (ctx: OperationContext) => definition.readAndLock(ctx, body) }
        : {}),
    });
    return runOperation(db, { ...input, butlerAuthorization: authority }, execute);
  };
}
