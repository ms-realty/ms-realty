// Client journey shell (spec §06.2, L06): Overview · Properties · Appointments · Messages ·
// Documents, a case switcher slot naming purpose and property/area, and help.
import Image from "next/image";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { type PublicLocale, routableLocales } from "@/i18n/config";
import { SkipLink } from "@/ui";
import { LocaleSwitcher } from "./language-switcher";
import { NavLink } from "./nav-link";
import { journeyHelpNav, journeyNav, linked } from "./navigation";

export const journeyMainId = "main";

const tabLinkClass =
  "inline-flex min-h-control items-center whitespace-nowrap border-b-2 border-transparent px-3 text-compact font-medium text-text no-underline hover:border-divider aria-[current=page]:border-action aria-[current=page]:font-semibold aria-[current=page]:text-action";

export async function JourneyShell({
  locale,
  caseSwitcher,
  children,
}: {
  locale: PublicLocale;
  /** Names the case's purpose and property/area; one person may hold several cases. */
  caseSwitcher?: ReactNode;
  children: ReactNode;
}) {
  const t = await getTranslations({ locale, namespace: "nav" });
  const a11y = await getTranslations({ locale, namespace: "a11y" });
  const destinations = linked(journeyNav, locale);
  const [help] = linked([journeyHelpNav], locale);

  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      <SkipLink targetId={journeyMainId}>{a11y("skipToContent")}</SkipLink>
      <header className="border-b border-divider bg-surface">
        <div className="mx-auto flex max-w-page flex-wrap items-center gap-x-4 gap-y-2 px-gutter py-2 lg:px-gutter-wide">
          <Link
            href={`/${locale}`}
            aria-label={t("home")}
            className="inline-flex min-h-control items-center rounded-control"
          >
            <Image src="/brand/logo-ms-realty.png" alt="" width={86} height={44} />
          </Link>
          {caseSwitcher ? (
            <div className="flex items-center gap-2">
              <span className="text-caption text-text-muted">{t("journey.caseSwitcher")}</span>
              {caseSwitcher}
            </div>
          ) : null}
          <div className="ms-auto flex items-center gap-1">
            {help ? (
              <NavLink href={help.href} className={tabLinkClass}>
                {t("journey.help")}
              </NavLink>
            ) : null}
            <LocaleSwitcher locale={locale} locales={routableLocales()} label={t("language")} />
          </div>
        </div>
        {destinations.length > 0 ? (
          <nav
            aria-label={t("journey.label")}
            className="mx-auto max-w-page overflow-x-auto px-gutter lg:px-gutter-wide"
          >
            <ul className="flex gap-1">
              {destinations.map((item) => (
                <li key={item.label}>
                  <NavLink href={item.href} className={tabLinkClass}>
                    {t(`journey.${item.label}`)}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
        ) : null}
      </header>
      <main id={journeyMainId} tabIndex={-1} className="flex-1 outline-none">
        {children}
      </main>
    </div>
  );
}
