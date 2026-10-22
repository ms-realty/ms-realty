/** Reference only: no personal data or authority to execute the command. */
export function absenceReferenceCookie(actorId: string, targetId: string) {
  return `msr_absence_${actorId}_${targetId}`;
}
