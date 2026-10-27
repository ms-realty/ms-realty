// O26/F30 · AT45/UX23: owned human privacy propagation.
import { notFound } from "next/navigation";
import { z } from "zod";
import { privacyPageSession } from "@/features/privacy/access";
import { type ErasureQuery, StaffPrivacyErasureScreen } from "@/features/privacy/erasure-screen";
import { isAppError } from "@/server/errors";

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<ErasureQuery>;
}) {
  const { locale, id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const session = await privacyPageSession(
    locale,
    `/${locale}/operations/privacy/${id}/erasure`,
    true,
  );
  return StaffPrivacyErasureScreen({
    locale,
    requestId: id,
    session,
    query: await searchParams,
  }).catch((error) => {
    if (isAppError(error) && ["forbidden", "not_found"].includes(error.code)) notFound();
    throw error;
  });
}
