// C12 / AT18: an exact owner preview has no publication authority.
import { notFound } from "next/navigation";
import { requireClientPage } from "@/features/cases/access";
import { OwnerPreviewScreen } from "@/features/cases/owner-preview-screen";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{ listing?: string | string[] }>;
}) {
  const { locale, id } = await params,
    { listing } = await searchParams;
  const session = await requireClientPage(locale);
  if (typeof listing !== "string") notFound();
  return <OwnerPreviewScreen locale={locale} session={session} id={id} reference={listing} />;
}
