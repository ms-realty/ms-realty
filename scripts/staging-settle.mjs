import { setTimeout as sleep } from "node:timers/promises";

/**
 * Retries `attempt` until it resolves or `ms` has elapsed, then rethrows its last error.
 * A freshly deployed staging adapter needs time to start its container, and a new
 * application version needs time to finish its rolling update; checks run unchanged.
 * An error marked `permanent` (for example a rejected credential) is rethrown at once.
 * Each new error message is logged; staging errors never carry secret values.
 */
export async function settle(
  attempt,
  { ms, every = 5_000, now = Date.now, wait = sleep, log = console.error },
) {
  const deadline = now() + ms;
  let last;
  for (;;) {
    try {
      return await attempt();
    } catch (error) {
      if (error?.permanent || now() + every > deadline) throw error;
      const message = error instanceof Error ? error.message : String(error);
      if (message !== last) log(`Waiting, will retry: ${message}`);
      last = message;
      await wait(every);
    }
  }
}

/** An error settle() must not retry. */
export function permanent(message) {
  return Object.assign(new Error(message), { permanent: true });
}
