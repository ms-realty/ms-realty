/** Reference only: no personal data or authority to execute the command. */
export function offboardingReferenceCookie(actorId: string, targetId: string) {
  return `msr_offboard_${actorId}_${targetId}`;
}
