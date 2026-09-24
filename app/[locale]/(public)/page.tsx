// P01 Home — placeholder until slice S2.
import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { isRoutableLocale } from "@/i18n/config";
import { localizedMetadata, requestHost } from "@/i18n/seo";

export async function generateMetadata({ params }: PageProps<"/[locale]">): Promise<Metadata> {
  const { locale } = await params;
  if (!isRoutableLocale(locale)) return {};
  return localizedMetadata({ locale, path: "/", host: requestHost(await headers()) });
}

export default async function HomePage({ params }: PageProps<"/[locale]">) {
  const { locale } = await params;
  if (!isRoutableLocale(locale)) notFound();
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "common" });

  return (
    <div className="mx-auto flex max-w-page flex-col gap-3 px-gutter py-12 lg:px-gutter-wide">
      <h1 className="text-title font-semibold">{t("homeHeading")}</h1>
      <p className="max-w-prose text-body text-text-muted">{t("homeIntro")}</p>
    </div>
  );
}
