import { getTranslations } from "next-intl/server";
import { NotFoundContent } from "@/features/shell/not-found-content";
import { requestLocale } from "@/i18n/request-locale";
import { homePaths } from "@/server/config/hosts";

export default async function ClientNotFound() {
  const locale = await requestLocale();
  const t = await getTranslations({ locale, namespace: "errors.notFound" });
  return (
    <>
      {/* The page title says what happened (WCAG 2.4.2); not-found cannot export metadata. */}
      <title>{t("title")}</title>
      <NotFoundContent locale={locale} homeHref={`/${locale}${homePaths.client}`} />
    </>
  );
}
