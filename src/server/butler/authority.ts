import "server-only";
import {
  type ButlerEligibility,
  type ButlerEvidence,
  butlerEligibility,
  isButlerRoutineAction,
} from "@/domain/butler";
import type { OperationContext, OperationInput } from "../operations";

declare const authorityBrand: unique symbol;
/** Not serializable authority: a JSON lookalike/cast is rejected by the WeakMap check. */
export interface ButlerAuthorization {
  readonly [authorityBrand]: true;
}
interface Binding {
  readonly input: OperationInput;
  readonly action: string;
  readonly execute: (ctx: OperationContext) => Promise<unknown>;
  readonly readAndLock?: (ctx: OperationContext) => Promise<ButlerEvidence>;
}
const authorities = new WeakMap<ButlerAuthorization, Binding>();

/** Trusted server bootstrap only; never expose this factory as an Action/model tool. */
export function bindButlerAuthorization(binding: Binding): ButlerAuthorization {
  const authority = Object.freeze({}) as ButlerAuthorization;
  authorities.set(authority, binding);
  return authority;
}

export function isButlerOperation(input: OperationInput): boolean {
  return (
    input.actor.kind === "ai_service" ||
    (input.actor.kind === "system" && input.actor.id === "butler") ||
    input.type.startsWith("butler.") ||
    input.butlerAuthorization !== undefined
  );
}

export async function checkButlerAuthorization(
  input: OperationInput,
  execute: Binding["execute"],
  ctx: OperationContext,
): Promise<{ action: string; eligibility: ButlerEligibility }> {
  const binding = input.butlerAuthorization && authorities.get(input.butlerAuthorization);
  const matches =
    binding &&
    input.actor.kind === "system" &&
    input.actor.id === "butler" &&
    binding.execute === execute &&
    binding.input.type === input.type &&
    binding.input.requestHash === input.requestHash &&
    binding.input.idempotencyKey === input.idempotencyKey &&
    binding.input.expectedVersion === input.expectedVersion &&
    binding.input.subject?.type === "case" &&
    input.subject?.type === "case" &&
    binding.input.subject.id === input.subject.id;
  if (!matches) {
    return {
      action: "unclassified",
      eligibility: { decision: "blocked", reason: "server_authority_required" },
    };
  }
  if (isButlerRoutineAction(binding.action) && !binding.readAndLock) {
    return {
      action: binding.action,
      eligibility: { decision: "blocked", reason: "action_not_registered" },
    };
  }
  // Checked after the operation lock in a savepoint; never precomputed from request flags or
  // cached model output. Current evidence can explain a denial, never authorize an effect.
  const evidence = binding.readAndLock ? await binding.readAndLock(ctx) : undefined;
  return {
    action: binding.action,
    eligibility: butlerEligibility(binding.action, input.subject.id, evidence),
  };
}
