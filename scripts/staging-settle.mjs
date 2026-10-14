import { setTimeout as sleep } from "node:timers/promises";

/**
 * Retries `attempt` until it resolves or `ms` has elapsed, then rethrows its last error.
 * A freshly deployed staging adapter needs time to start its container, and a new
 * application version needs time to finish its rolling update; checks run unchanged.
 */
export async function settle(attempt, { ms, every = 5_000, now = Date.now, wait = sleep }) {
  const deadline = now() + ms;
  for (;;) {
    try {
      return await attempt();
    } catch (error) {
      if (now() + every > deadline) throw error;
      await wait(every);
    }
  }
}
