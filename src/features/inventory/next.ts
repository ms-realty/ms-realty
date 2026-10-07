/**
 * A same-host staff path to continue to after a save or a leave; anything else is ignored.
 * The value must already be its own canonical form, so dot segments (also percent-encoded)
 * cannot step out of the locale.
 */
export function safeNext(locale: string, value: unknown): string | null {
  if (typeof value !== "string" || !/^\/[A-Za-z0-9\-._~/?=&%#]*$/.test(value)) return null;
  let url: URL;
  try {
    url = new URL(value, "https://staff.invalid");
  } catch {
    return null;
  }
  const canonical = `${url.pathname}${url.search}${url.hash}`;
  return url.origin === "https://staff.invalid" &&
    canonical === value &&
    url.pathname.startsWith(`/${locale}/`) &&
    !url.pathname.includes("//") &&
    !/%2e|%2f|%5c/i.test(url.pathname)
    ? value
    : null;
}
