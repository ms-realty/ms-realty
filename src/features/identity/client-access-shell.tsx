import Image from "next/image";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { LocaleSwitcher } from "@/features/shell/language-switcher";
import { type PublicLocale, routableLocales } from "@/i18n/config";
import { SkipLink } from "@/ui/skip-link";

/** C01/C02 signed-out tasks contain no signed-in Case navigation or identity claims. */
export async function ClientAccessShell({
  locale,
  children,
}: {
  locale: PublicLocale;
  children: ReactNode;
}) {
  const a11y = await getTranslations({ locale, namespace: "a11y" }),
    nav = await getTranslations({ locale, namespace: "nav" });
  return (
    <div className="min-h-dvh bg-canvas">
      <SkipLink targetId="main">{a11y("skipToContent")}</SkipLink>
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-divider bg-surface p-5">
        <Image src="/brand/logo-ms-realty.png" alt="MS Realty" width={86} height={44} priority />
        <LocaleSwitcher locale={locale} locales={routableLocales()} label={nav("language")} />
      </header>
      <main id="main" tabIndex={-1}>
        {children}
      </main>
    </div>
  );
}
