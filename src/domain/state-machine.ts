// Shared shape of every state machine: an exhaustive transition table and guard decisions.

export type Decision =
  | { readonly outcome: "allowed" }
  | { readonly outcome: "denied"; readonly code: string };

export const allowed: Decision = { outcome: "allowed" };

export function denied(code: string): Decision {
  return { outcome: "denied", code };
}

/** Runs checks in order and returns the first denial. */
export function firstDenial(...checks: Array<Decision | false | null | undefined>): Decision {
  for (const check of checks) {
    if (check && check.outcome === "denied") return check;
  }
  return allowed;
}

/** Denies with `code` when `condition` is false. */
export function need(condition: unknown, code: string): Decision {
  return condition ? allowed : denied(code);
}

export interface Machine<S extends string> {
  readonly states: readonly S[];
  /** Exhaustive by construction: every state lists its allowed targets (possibly none). */
  readonly transitions: Readonly<Record<S, readonly S[]>>;
  check(from: S, to: S): Decision;
  isTerminal(state: S): boolean;
}

export function defineMachine<S extends string>(
  states: readonly S[],
  transitions: Readonly<Record<S, readonly S[]>>,
): Machine<S> {
  return {
    states,
    transitions,
    check(from, to) {
      if (from === to) return denied("no_change");
      return transitions[from].includes(to) ? allowed : denied("transition_not_allowed");
    },
    isTerminal(state) {
      return transitions[state].length === 0;
    },
  };
}
