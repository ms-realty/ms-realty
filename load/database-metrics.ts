import assert from "node:assert/strict";
import postgres from "postgres";

/** Sample aggregate waits in this run's database; no SQL text, credentials or record data. */
export function databaseMetrics() {
  const url = new URL(process.env.E2E_DATABASE_URL ?? "invalid:");
  assert(/^\/msr_e2e_[a-f0-9]{32}$/.test(url.pathname));
  assert(["localhost", "127.0.0.1", "[::1]", "host.docker.internal"].includes(url.hostname));
  const client = postgres(url.toString(), { max: 1, connect_timeout: 5, onnotice: () => {} });
  const samples: { at: string; durationMs: number; states: unknown }[] = [];
  const errors: string[] = [];
  let pending: Promise<void> | undefined;
  const timer = setInterval(() => {
    if (pending) return;
    const at = new Date().toISOString(),
      start = performance.now();
    pending = (async () => {
      try {
        const states = await client`
          select state, wait_event_type, wait_event, count(*)::int as connections
          from pg_stat_activity
          where datname = current_database() and pid <> pg_backend_pid()
          group by state, wait_event_type, wait_event`;
        samples.push({ at, durationMs: performance.now() - start, states });
      } catch {
        errors.push(`Database sampling failed at ${at}`);
      } finally {
        pending = undefined;
      }
    })();
  }, 1000);
  timer.unref();
  return {
    samples,
    errors,
    async stop() {
      clearInterval(timer);
      await pending;
      await client.end({ timeout: 5 });
    },
  };
}
