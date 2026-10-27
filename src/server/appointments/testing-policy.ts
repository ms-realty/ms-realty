// Explicit synthetic approved input for disposable booking tests, never real policy acceptance.
import { sql } from "drizzle-orm";
import { servicePolicies } from "@/db/schema";
import type { Executor } from "../db";

export async function createSyntheticBookingCalendar(db: Executor, approvedById: string) {
  const [policy] = await db
    .insert(servicePolicies)
    .values({
      // Use insertion time, not now-1s: a preceding unknown policy must not remain current.
      effectiveFrom: sql`clock_timestamp()`,
      timezone: "Europe/Sofia",
      serviceHours: Object.fromEntries(
        ["mon", "tue", "wed", "thu", "fri", "sat", "sun"].map((day) => [day, ["09:00", "18:00"]]),
      ),
      coverage: { source: "synthetic_browser_booking_calendar" },
      responsePolicy: {},
      approvedById,
    })
    .returning();
  if (!policy) throw new Error("Synthetic approved booking calendar insert failed");
  return policy;
}
