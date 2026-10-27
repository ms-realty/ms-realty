import { z } from "zod";
/** A recorded verified method only; a link opens a native app and never records a send/call. */
export function nativeContactHref(kind: string, value: string, verification: string) {
  if (verification !== "verified") return null;
  if (kind === "email" && z.email().safeParse(value).success)
    return `mailto:${encodeURIComponent(value)}`;
  const phone = value.replace(/[\s().-]/g, "");
  return kind === "phone" && /^\+[1-9]\d{6,14}$/.test(phone) ? `tel:${phone}` : null;
}
