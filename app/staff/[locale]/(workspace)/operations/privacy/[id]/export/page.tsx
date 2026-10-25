// O26 · F30 · AT45/UX23: exact frozen dossier review with a native/manual path.
import { notFound } from "next/navigation";
import { z } from "zod";
import { privacyPageSession } from "@/features/privacy/access";
import { StaffPrivacyExportScreen } from "@/features/privacy/export-screen";
import { isAppError } from "@/server/errors";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{ error?: string; receipt?: string; operation?: string }>;
}) {
  const { locale, id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const session = await privacyPageSession(
    locale,
    `/${locale}/operations/privacy/${id}/export`,
    true,
  );
  return StaffPrivacyExportScreen({
    locale,
    requestId: id,
    session,
    query: await searchParams,
  }).catch((error) => {
    if (isAppError(error) && ["forbidden", "not_found"].includes(error.code)) notFound();
    throw error;
  });
}
