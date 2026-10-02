import { getTranslations } from "next-intl/server";
import { NotFoundContent } from "@/features/shell/not-found-content";
import { defaultStaffLocale, isStaffLocale } from "@/i18n/config";
import { requestLocale } from "@/i18n/request-locale";
import { homePaths } from "@/server/config/hosts";

export default async function WorkspaceNotFound() {
  const requested = await requestLocale();
  const locale = isStaffLocale(requested) ? requested : defaultStaffLocale;
  const t = await getTranslations({ locale, namespace: "errors.notFound" });
  return (
    <>
      {/* The page title says what happened (WCAG 2.4.2); not-found cannot export metadata. */}
      <title>{t("title")}</title>
      <NotFoundContent locale={locale} homeHref={`/${locale}${homePaths.staff}`} />
    </>
  );
}
