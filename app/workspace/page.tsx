// O01 Today — placeholder until slice S2.
import { getTranslations } from "next-intl/server";
import { currentStaffLocale } from "@/i18n/staff-locale";

export default async function WorkspacePage() {
  const t = await getTranslations({ locale: await currentStaffLocale(), namespace: "common" });
  return (
    <div className="flex flex-col gap-3 px-gutter py-8 lg:px-8">
      <h1 className="text-heading font-semibold">{t("workspaceHeading")}</h1>
    </div>
  );
}
