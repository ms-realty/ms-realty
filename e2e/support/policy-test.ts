// Only global-policy fixture writers and booking consumers use this narrow boundary.
import { test as base } from "@playwright/test";
import postgres from "postgres";
import { withOperatingPolicyFixture } from "./policy-fixture";

export const test = base.extend<{
  operatingPolicyFixture: undefined;
  policyJourneyTimeout: number | undefined;
}>({
  policyJourneyTimeout: [undefined, { option: true }],
  operatingPolicyFixture: [
    async ({ browserName: _browserName, policyJourneyTimeout }, use, testInfo) => {
      // Some existing journeys have a longer total budget. Apply that same budget before
      // waiting for the lease, rather than waiting until the test body starts.
      if (policyJourneyTimeout !== undefined) testInfo.setTimeout(policyJourneyTimeout);
      const url = process.env.E2E_DATABASE_URL;
      if (!url || !/^\/msr_e2e_[a-f0-9]{32}$/.test(new URL(url).pathname))
        throw new Error("Policy fixture lease requires the generated disposable browser database");
      const connection = postgres(url, { max: 1, onnotice: () => {} });
      try {
        await withOperatingPolicyFixture(connection, () => use(undefined));
      } finally {
        // Closing also releases a session lock if setup or the journey failed unexpectedly.
        await connection.end({ timeout: 2 });
      }
    },
    { auto: true },
  ],
});

export function withPolicyFixtureTimeout(timeout: number) {
  return test.extend({ policyJourneyTimeout: timeout });
}
