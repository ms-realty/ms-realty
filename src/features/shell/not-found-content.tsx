import { getTranslations } from "next-intl/server";
import type { PublicLocale } from "@/i18n/config";
import { Link } from "@/ui";

/** 404 body in the visitor's language, with a way back home. */
export async function NotFoundContent({
  locale,
  homeHref,
}: {
  locale: PublicLocale;
  homeHref: string;
}) {
  const t = await getTranslations({ locale, namespace: "errors.notFound" });
  return (
    <div className="mx-auto flex max-w-prose flex-col gap-4 px-gutter py-16">
      <h1 className="text-title font-semibold">{t("title")}</h1>
      <p className="text-body text-text-muted">{t("body")}</p>
      <p>
        <Link href={homeHref} variant="standalone">
          {t("home")}
        </Link>
      </p>
    </div>
  );
}
