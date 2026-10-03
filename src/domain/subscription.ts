// Subscriptions and consent events (architecture §8.4, §9). Contact verification, service
// communications, saved-search alerts and marketing are distinct purposes; one never implies
// another, and eligibility is rechecked when a job executes (AT44).
import { type Decision, defineMachine, firstDenial, need } from "./state-machine";

export const subscriptionPurposes = ["service_updates", "search_alerts", "marketing"] as const;
export type SubscriptionPurpose = (typeof subscriptionPurposes)[number];

export const subscriptionStates = [
  "pending_verification",
  "active",
  "paused",
  "withdrawn",
] as const;
export type SubscriptionState = (typeof subscriptionStates)[number];

export const subscriptionMachine = defineMachine<SubscriptionState>(subscriptionStates, {
  pending_verification: ["active", "withdrawn"],
  active: ["paused", "withdrawn"],
  paused: ["active", "withdrawn"],
  // A new opt-in is a new subscription with its own consent event.
  withdrawn: [],
});

export const consentEventKinds = [
  "opted_in",
  "channel_verified",
  "criteria_changed",
  "paused",
  "resumed",
  "withdrawn",
] as const;
export type ConsentEventKind = (typeof consentEventKinds)[number];

/** Saved-search alerts default to a daily digest in the subscriber's timezone. */
export const alertFrequencies = ["daily", "weekly"] as const;
export type AlertFrequency = (typeof alertFrequencies)[number];

export interface SubscriptionView {
  readonly purpose: SubscriptionPurpose;
  readonly state: SubscriptionState;
  /** ISO 8601 instant the channel was verified; null when never. */
  readonly verifiedAt: string | null;
}

/** Whether a message for `purpose` may be sent now; queued work calls this at execution. */
export function checkSendEligibility(
  subscription: SubscriptionView | null,
  purpose: SubscriptionPurpose,
): Decision {
  return firstDenial(
    need(subscription, "no_subscription"),
    need(subscription?.purpose === purpose, "purpose_mismatch"),
    need(subscription?.state === "active", "subscription_not_active"),
    need(subscription?.verifiedAt, "channel_not_verified"),
  );
}
