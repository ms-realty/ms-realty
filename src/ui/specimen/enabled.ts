/** The specimen route exists only when explicitly enabled (local development and e2e). */
export function isDesignSpecimenEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return env.ENABLE_DESIGN_SPECIMEN === "1";
}
