// O24: only a new human confirmation adopts current policy. Historical evidence is unchanged.
import "server-only";
import type { ListingPurpose } from "@/domain/facts";
import { availabilityReviewIntervalDays } from "@/domain/listing";
import type { Executor } from "../db";
import { captureOperatingPolicy } from "./service";

export async function availabilityReviewPolicy(
  db: Executor,
  purpose: ListingPurpose,
  at = new Date(),
) {
  const snapshot = await captureOperatingPolicy(db, at);
  if (snapshot.kind === "approved_operating_policy_v1") {
    const days = snapshot.document.availabilityReviewDays[purpose];
    return days === null
      ? { status: "unknown" as const, snapshot }
      : { status: "known" as const, days, snapshot };
  }
  if (snapshot.reason !== "no_reviewed_policy") return { status: "unknown" as const, snapshot };
  // Architecture §7.1's pre-existing baseline is explicit legacy policy, not human acceptance.
  const days = availabilityReviewIntervalDays[purpose];
  return {
    status: "known" as const,
    days,
    snapshot: { kind: "legacy_availability_policy_v1", purpose, intervalDays: days },
  };
}
