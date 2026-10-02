import "server-only";
import { redirect } from "next/navigation";
import { requireClientPage } from "@/features/cases/access";
import { requireStaffPage } from "@/server/auth/pages";
import { isFresh } from "@/server/auth/sessions";
export async function privacyPageSession(locale: string, path: string, staff = false) {
  const session = staff ? await requireStaffPage(locale) : await requireClientPage(locale);
  if (!isFresh(session)) redirect(`/${locale}/access/reauth?returnTo=${encodeURIComponent(path)}`);
  return session;
}
