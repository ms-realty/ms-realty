// Universal transition contract (spec §07.7, §19.4, AD4, AD6).
import type { Actor, Capability, CapabilityGrant } from "./capabilities";
import { hasCapability } from "./capabilities";
import type { PublicLocale } from "./ids";
import type { Decision, Machine } from "./state-machine";

export interface TransitionRequest<S extends string, E> {
  readonly actor: Actor;
  /** Grants resolved for this actor and record by the server, never taken from the client. */
  readonly capabilities: readonly CapabilityGrant[];
  readonly expectedVersion: number;
  readonly to: S;
  readonly evidence: E;
  /** Stable logical operation id (idempotency key) shared by every retry of this command. */
  readonly operationId: string;
  /** ISO 8601 instant of the request. */
  readonly at: string;
  readonly reason?: string;
}

export interface VersionedRecord<S extends string> {
  readonly id: string;
  readonly reference?: string;
  readonly state: S;
  readonly version: number;
  /** Locale of a per-locale record, used for locale-scoped capabilities. */
  readonly locale?: PublicLocale;
}

export interface TransitionSpec<S extends string, E> {
  readonly recordType: string;
  readonly machine: Machine<S>;
  /** The actor decides between the staff capability and a client's portal capability. */
  capabilityFor(from: S, to: S, actor: Actor): Capability;
  /** Evidence and business rules beyond the transition table. */
  guard(from: S, to: S, evidence: E, actor: Actor): Decision;
}

/** Human-readable timeline entry (activity), deliberately free of technical detail. */
export interface ActivityDescription {
  readonly recordType: string;
  readonly recordId: string;
  readonly reference?: string;
  readonly messageKey: string;
  readonly summary: string;
  readonly actor: Actor;
  readonly at: string;
  readonly operationId: string;
}

/** Restricted technical audit payload, stored apart from the activity timeline. */
export interface AuditPayload {
  readonly action: string;
  readonly operationId: string;
  readonly actor: Actor;
  readonly capability: Capability;
  readonly recordType: string;
  readonly recordId: string;
  readonly fromState: string;
  readonly toState: string;
  readonly expectedVersion: number;
  readonly newVersion: number;
  readonly evidence: unknown;
  readonly reason?: string;
  readonly at: string;
}

export type TransitionResult<R> =
  | {
      readonly outcome: "applied";
      readonly record: R;
      readonly activity: ActivityDescription;
      readonly audit: AuditPayload;
    }
  | { readonly outcome: "denied"; readonly code: string }
  | { readonly outcome: "version_conflict"; readonly current: R };

export function stateLabel(state: string): string {
  const words = state.replaceAll("_", " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * Validates capability, then record version, then the transition table and guard, and
 * returns the next record with separate activity and audit entries. It never mutates input.
 */
export function applyTransition<S extends string, E, R extends VersionedRecord<S>>(
  spec: TransitionSpec<S, E>,
  record: R,
  request: TransitionRequest<S, E>,
): TransitionResult<R> {
  const from = record.state;
  const { to, actor } = request;
  const capability = spec.capabilityFor(from, to, actor);
  const permitted = hasCapability(actor, request.capabilities, capability, {
    recordType: spec.recordType,
    recordId: record.id,
    now: request.at,
    ...(record.locale ? { locale: record.locale } : {}),
  });
  if (!permitted) return { outcome: "denied", code: "missing_capability" };

  if (request.expectedVersion !== record.version) {
    return { outcome: "version_conflict", current: record };
  }

  const table = spec.machine.check(from, to);
  if (table.outcome === "denied") return table;
  const guard = spec.guard(from, to, request.evidence, actor);
  if (guard.outcome === "denied") return guard;

  const next = { ...record, state: to, version: record.version + 1 };
  const name = `${stateLabel(spec.recordType)} ${record.reference ?? record.id}`;
  const summary = `${name} moved from ${stateLabel(from)} to ${stateLabel(to)}${
    request.reason ? `: ${request.reason}` : ""
  }.`;
  return {
    outcome: "applied",
    record: next,
    activity: {
      recordType: spec.recordType,
      recordId: record.id,
      ...(record.reference ? { reference: record.reference } : {}),
      messageKey: `activity.${spec.recordType}.${to}`,
      summary,
      actor,
      at: request.at,
      operationId: request.operationId,
    },
    audit: {
      action: `${spec.recordType}.transition`,
      operationId: request.operationId,
      actor,
      capability,
      recordType: spec.recordType,
      recordId: record.id,
      fromState: from,
      toState: to,
      expectedVersion: request.expectedVersion,
      newVersion: next.version,
      evidence: request.evidence,
      ...(request.reason ? { reason: request.reason } : {}),
      at: request.at,
    },
  };
}
