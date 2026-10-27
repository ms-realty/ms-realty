import type postgres from "postgres";

/** Same session-level boundary as operating-policy and privacy-erasure browser journeys. */
export const operatingPolicyFixtureKey = "synthetic-operating-policy-browser";

export async function withOperatingPolicyFixture<T>(
  connection: postgres.Sql,
  journey: () => Promise<T>,
) {
  // Session advisory locks must be acquired and released on the same physical connection.
  const holder = await connection.reserve();
  try {
    await holder`select pg_advisory_lock(hashtextextended(${operatingPolicyFixtureKey}, 0))`;
    try {
      return await journey();
    } finally {
      await holder`select pg_advisory_unlock(hashtextextended(${operatingPolicyFixtureKey}, 0))`;
    }
  } finally {
    holder.release();
  }
}
