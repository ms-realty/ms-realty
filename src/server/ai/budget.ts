import "server-only";
import { sql } from "drizzle-orm";
import type { Executor } from "../db";
import { AppError } from "../errors";

/** Call inside the same transaction that inserts the reservation. Both AI families share it. */
export async function reserveAiBudget(
  db: Executor,
  actorId: string,
  amount: number,
  ceiling: number,
) {
  await db.execute(sql`select pg_advisory_xact_lock(hashtextextended('hermes:daily-budget', 0))`);
  const [busy] = await db.execute<{ busy: boolean }>(sql`
    select exists(select 1 from assistance_runs where requested_by_id = ${actorId}::uuid and state in ('queued','running'))
      or exists(select 1 from generative_runs where requested_by_id = ${actorId}::uuid
        and (state in ('queued','running') or (claim_id is not null and actual_cost_micros is null))) as busy`);
  if (busy?.busy)
    throw new AppError("rate_limited", { fieldErrors: { form: ["assistance_in_progress"] } });
  const [usage] = await db.execute<{ used: string }>(sql`
    select coalesce(sum(cost),0)::text as used from (
      select coalesce(actual_cost_micros,reserved_cost_micros) as cost from assistance_runs
        where created_at >= date_trunc('day',now() at time zone 'UTC') at time zone 'UTC'
      union all
      select coalesce(actual_cost_micros,reserved_cost_micros) as cost from generative_runs
        where created_at >= date_trunc('day',now() at time zone 'UTC') at time zone 'UTC'
    ) charges`);
  if (!Number.isSafeInteger(amount) || amount <= 0 || Number(usage?.used ?? 0) + amount > ceiling)
    throw new AppError("rate_limited", { fieldErrors: { form: ["assistance_budget_exhausted"] } });
}
