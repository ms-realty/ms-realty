// C01 Client access — placeholder until the identity stage (verify identity, accept an
// invitation; F13).
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { isRoutableLocale } from "@/i18n/config";

export async function generateMetadata({
  params,
}: PageProps<"/client/[locale]/access">): Promise<Metadata> {
  const { locale } = await params;
  if (!isRoutableLocale(locale)) return {};
  const t = await getTranslations({ locale, namespace: "common" });
  return { title: t("clientAccessHeading") };
}

export default async function ClientAccessPage({ params }: PageProps<"/client/[locale]/access">) {
  const { locale } = await params;
  if (!isRoutableLocale(locale)) notFound();
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "common" });
  return (
    <div className="mx-auto flex max-w-page flex-col gap-3 px-gutter py-12 lg:px-gutter-wide">
      <h1 className="text-title font-semibold">{t("clientAccessHeading")}</h1>
    </div>
  );
}
