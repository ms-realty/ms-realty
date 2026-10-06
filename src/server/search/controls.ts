/** PostgreSQL text parameters cannot contain NUL; other control text is not a useful search. */
export function containsSearchControl(value: string) {
  for (const character of value) {
    const code = character.charCodeAt(0);
    if (code <= 0x1f || (code >= 0x7f && code <= 0x9f)) return true;
  }
  return false;
}
