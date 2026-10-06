/** A same-host staff path to continue to after a save or a leave; anything else is ignored. */
export function safeNext(locale: string, value: unknown): string | null {
  return typeof value === "string" &&
    value.startsWith(`/${locale}/`) &&
    !value.includes("//") &&
    /^\/[a-z]{2}\/[A-Za-z0-9\-._~/?=&%#]*$/.test(value)
    ? value
    : null;
}
