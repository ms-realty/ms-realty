"use server";

import { cookies } from "next/headers";
import { isStaffLocale, staffLocaleCookie } from "@/i18n/config";

export async function setStaffLocale(formData: FormData): Promise<void> {
  const value = String(formData.get("locale") ?? "");
  if (!isStaffLocale(value)) return;
  (await cookies()).set(staffLocaleCookie, value, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
    httpOnly: true,
  });
}
