// O23 Staff sign-in entry — placeholder until the identity stage (provider handoff,
// enrolment, challenge, denial and recovery; F13 staff variant). Outside the workspace shell:
// nobody is signed in here yet.
import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { isStaffLocale } from "@/i18n/config";

export async function generateMetadata({
  params,
}: PageProps<"/staff/[locale]/access">): Promise<Metadata> {
  const { locale } = await params;
  if (!isStaffLocale(locale)) return {};
  const t = await getTranslations({ locale, namespace: "common" });
  return { title: t("staffAccessHeading") };
}

export default async function StaffAccessPage({ params }: PageProps<"/staff/[locale]/access">) {
  const { locale } = await params;
  if (!isStaffLocale(locale)) notFound();
  const t = await getTranslations({ locale, namespace: "common" });
  return (
    <main className="mx-auto flex min-h-dvh max-w-prose flex-col justify-center gap-6 px-gutter py-12">
      <Image src="/brand/logo-ms-realty.png" alt={t("brand")} width={86} height={44} priority />
      <h1 className="text-title font-semibold">{t("staffAccessHeading")}</h1>
    </main>
  );
}
