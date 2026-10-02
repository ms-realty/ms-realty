// C03 client composition: persistent desktop rail and a native compact disclosure.
import { randomUUID } from "node:crypto";
import Image from "next/image";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { PrivatePageGuard } from "@/features/identity/private-page-guard";
import { type PublicLocale, routableLocales } from "@/i18n/config";
import { homePaths } from "@/server/config/hosts";
import { SkipLink } from "@/ui/skip-link";
import { LocaleSwitcher } from "./language-switcher";
import { NavLink } from "./nav-link";
import { journeyHelpNav, journeyNav, linked } from "./navigation";

export const journeyMainId = "main";
const linkClass =
  "flex min-h-control min-w-0 items-center gap-3 rounded-control px-3 py-3 text-dense text-text-muted no-underline [overflow-wrap:anywhere] hover:bg-divider aria-[current=page]:bg-surface aria-[current=page]:font-semibold aria-[current=page]:text-text";

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
  const logo = (
    <Link
      href={`/${locale}${homePaths.client}`}
      aria-label={t("home")}
      className="inline-flex min-h-control shrink-0 items-center rounded-control"
    >
      <Image
        src="/brand/logo-ms-realty.png"
        alt=""
        width={86}
        height={44}
        className="h-auto object-contain"
      />
    </Link>
  );
  const navigation = (
    <ul className="flex min-w-0 flex-col gap-2">
      {destinations.map((item) => (
        <li key={item.label} className="min-w-0">
          <NavLink href={item.href} className={linkClass}>
            <Image
              src={`/brand/journey/${item.label}.svg`}
              alt=""
              width={20}
              height={20}
              className="shrink-0"
            />
            <span className="min-w-0">{t(`journey.${item.label}`)}</span>
          </NavLink>
        </li>
      ))}
    </ul>
  );
  const language = (
    <LocaleSwitcher locale={locale} locales={routableLocales()} label={t("language")} />
  );
  const switcher = caseSwitcher ? (
    <div className="flex min-w-0 flex-wrap items-center gap-2 [overflow-wrap:anywhere]">
      <span className="text-caption text-text-muted">{t("journey.caseSwitcher")}</span>
      {caseSwitcher}
    </div>
  ) : null;
  return (
    <PrivatePageGuard locale={locale} verification={randomUUID()}>
      <div className="min-h-dvh min-w-0 bg-canvas lg:grid lg:grid-cols-[14rem_minmax(0,1fr)]">
        <SkipLink targetId={journeyMainId}>{a11y("skipToContent")}</SkipLink>
        <aside
          className="hidden min-w-0 border-e border-divider bg-subtle p-5 lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col lg:gap-5 lg:overflow-y-auto"
          aria-label={t("journey.label")}
        >
          {logo}
          <nav aria-label={t("journey.label")} className="border-t border-divider pt-5">
            {navigation}
          </nav>
          <div className="mt-auto min-w-0 border-t border-divider pt-5">
            <Link href={`/${locale}/messages`} className={linkClass}>
              <Image
                src="/brand/journey/broker.svg"
                alt=""
                width={20}
                height={20}
                className="shrink-0"
              />
              <span className="min-w-0">{t("journey.broker")}</span>
            </Link>
          </div>
        </aside>
        <div className="flex min-w-0 flex-col">
          <header className="border-b border-divider bg-surface">
            <div className="flex min-w-0 items-center justify-between gap-4 p-5 lg:hidden">
              {logo}
              <div className="flex min-w-0 items-center gap-2">
                {language}
                <details data-dismissible="" className="relative [&:not([open])>div]:hidden">
                  {/* biome-ignore lint/a11y/useSemanticElements: native summary must remain operable without JavaScript; explicit role names the control consistently. */}
                  <summary
                    role="button"
                    className="flex min-h-control min-w-control items-center justify-center rounded-control hover:bg-subtle"
                  >
                    <Image src="/brand/journey/menu.svg" alt="" width={20} height={20} />
                    <span className="sr-only">{t("menu")}</span>
                  </summary>
                  <div className="absolute end-0 z-(--z-popover) mt-2 flex w-72 max-w-[calc(100vw-2.5rem)] flex-col gap-4 rounded-panel border border-divider bg-surface p-3 shadow-overlay">
                    <nav aria-label={t("journey.label")}>{navigation}</nav>
                    {switcher}
                    {help ? (
                      <Link href={help.href} className={linkClass}>
                        {t("journey.help")}
                      </Link>
                    ) : null}
                  </div>
                </details>
              </div>
            </div>
            <div className="hidden min-w-0 flex-wrap items-center gap-4 px-8 py-4 lg:flex">
              <p className="me-auto text-dense text-text-muted">{t("journey.label")}</p>
              {switcher}
              {help ? (
                <Link href={help.href} className={linkClass}>
                  {t("journey.help")}
                </Link>
              ) : null}
              {language}
            </div>
          </header>
          <main id={journeyMainId} tabIndex={-1} className="min-w-0 flex-1 outline-none">
            {children}
          </main>
        </div>
      </div>
    </PrivatePageGuard>
  );
}
