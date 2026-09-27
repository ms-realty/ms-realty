// O01 Today — placeholder until slice S2.
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { isStaffLocale } from "@/i18n/config";

export async function generateMetadata({
  params,
}: PageProps<"/staff/[locale]/today">): Promise<Metadata> {
  const { locale } = await params;
  if (!isStaffLocale(locale)) return {};
  const t = await getTranslations({ locale, namespace: "common" });
  return { title: t("workspaceHeading") };
}

export default async function TodayPage({ params }: PageProps<"/staff/[locale]/today">) {
  const { locale } = await params;
  if (!isStaffLocale(locale)) notFound();
  const t = await getTranslations({ locale, namespace: "common" });
  return (
    <div className="flex flex-col gap-3 px-gutter py-8 lg:px-8">
      <h1 className="text-heading font-semibold">{t("workspaceHeading")}</h1>
    </div>
  );
}
