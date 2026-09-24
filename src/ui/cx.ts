/** Joins class names, skipping falsy values. Tokens are semantic, so no merge step is needed. */
export function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}
