import { getTranslations } from "next-intl/server";
import { NotFoundContent } from "@/features/shell/not-found-content";
import { currentStaffLocale } from "@/i18n/staff-locale";

export default async function WorkspaceNotFound() {
  const locale = await currentStaffLocale();
  const t = await getTranslations({ locale, namespace: "errors.notFound" });
  return (
    <>
      {/* The page title says what happened (WCAG 2.4.2); not-found cannot export metadata. */}
      <title>{t("title")}</title>
      <NotFoundContent locale={locale} homeHref="/workspace" />
    </>
  );
}
