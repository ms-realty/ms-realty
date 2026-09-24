import { cookies } from "next/headers";
import { defaultStaffLocale, isStaffLocale, type StaffLocale, staffLocaleCookie } from "./config";

/**
 * Staff interface language: the preference cookie, never the URL (spec §18.2). It changes
 * labels and formatting only, not data or permissions. The staff account preference
 * replaces the cookie once sign-in exists (S2).
 */
export async function currentStaffLocale(): Promise<StaffLocale> {
  const value = (await cookies()).get(staffLocaleCookie)?.value;
  return value && isStaffLocale(value) ? value : defaultStaffLocale;
}
