import "server-only";
/** The same immutable asset release must be configured on the gateway. Absent means disabled. */
export function publicMapRelease(): string | null {
  const value = process.env.MAP_RELEASE_ID;
  return value && /^[a-f0-9]{64}$/.test(value) ? value : null;
}
