import "server-only";
import { notFound, redirect } from "next/navigation";
import { isRoutableLocale } from "@/i18n/config";
import { currentClientSession } from "@/server/auth/pages";
export async function requireClientPage(locale: string) {
  if (!isRoutableLocale(locale)) notFound();
  const session = await currentClientSession();
  if (!session) return redirect(`/${locale}/access`);
  return session;
}
