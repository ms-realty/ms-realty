import "server-only";
import { sql } from "drizzle-orm";
import type { AiBillingMode } from "@/domain/generative";
import type { Executor } from "../db";
import { AppError } from "../errors";

/** Takes the one daily-budget lock every AI family shares; held to the end of the transaction. */
async function lockDailyBudget(db: Executor) {
  await db.execute(sql`select pg_advisory_xact_lock(hashtextextended('hermes:daily-budget', 0))`);
}

/** Metered spend of the current UTC day across every AI family, reservations included. */
async function dailyUsage(db: Executor): Promise<number> {
  const [usage] = await db.execute<{ used: string }>(sql`
    select coalesce(sum(cost),0)::text as used from (
      select coalesce(actual_cost_micros,reserved_cost_micros) as cost from assistance_runs
        where billing_mode = 'metered_usd' and created_at >= date_trunc('day',now() at time zone 'UTC') at time zone 'UTC'
      union all
      select coalesce(actual_cost_micros,reserved_cost_micros) as cost from generative_runs
        where billing_mode = 'metered_usd' and created_at >= date_trunc('day',now() at time zone 'UTC') at time zone 'UTC'
      union all
      select coalesce(actual_cost_micros,reserved_cost_micros) as cost from butler_answers
        where billing_mode = 'metered_usd' and created_at >= date_trunc('day',now() at time zone 'UTC') at time zone 'UTC'
    ) charges`);
  return Number(usage?.used ?? 0);
}

function withinBudget(used: number, amount: number | null, ceiling: number | null) {
  return (
    amount !== null &&
    ceiling !== null &&
    Number.isSafeInteger(amount) &&
    amount > 0 &&
    used + amount <= ceiling
  );
}

/** Call inside the same transaction that inserts the reservation. Every AI family shares it. */
export async function reserveAiBudget(
  db: Executor,
  actorId: string,
  amount: number | null,
  ceiling: number | null,
  mode: AiBillingMode = "metered_usd",
) {
  await lockDailyBudget(db);
  const [busy] = await db.execute<{ busy: boolean }>(sql`
    select exists(select 1 from assistance_runs where requested_by_id = ${actorId}::uuid and state in ('queued','running'))
      or exists(select 1 from generative_runs where requested_by_id = ${actorId}::uuid
        and (state in ('queued','running') or (claim_id is not null and inference_outcome in ('pending','unknown')))) as busy`);
  if (busy?.busy)
    throw new AppError("rate_limited", { fieldErrors: { form: ["assistance_in_progress"] } });
  if (mode === "chatgpt_subscription") {
    if (amount !== null || ceiling !== null) throw new Error("subscription_money_not_applicable");
    return;
  }
  if (!withinBudget(await dailyUsage(db), amount, ceiling))
    throw new AppError("rate_limited", { fieldErrors: { form: ["assistance_budget_exhausted"] } });
}

/**
 * The visitor-answer reservation (ADR 0017): same lock and same daily ceiling, no staff actor.
 * Returns false instead of throwing, so the caller records a "limited" receipt in the same
 * transaction. Call inside the transaction that inserts the reservation.
 */
export async function reservePublicAnswerBudget(
  db: Executor,
  amount: number | null,
  ceiling: number | null,
  mode: AiBillingMode,
): Promise<boolean> {
  await lockDailyBudget(db);
  if (mode === "chatgpt_subscription") {
    if (amount !== null || ceiling !== null) throw new Error("subscription_money_not_applicable");
    return true;
  }
  return withinBudget(await dailyUsage(db), amount, ceiling);
}
