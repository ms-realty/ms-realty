// Public shell (spec §06.1, L01): compact header, skip link, landmarks, agency footer.
import Image from "next/image";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { isolateText, Ltr } from "@/i18n/bidi";
import { type PublicLocale, routableLocales } from "@/i18n/config";
import { agencyYear } from "@/i18n/format";
import { ButtonLink, SkipLink } from "@/ui";
import { brandPhone } from "./agency";
import { LanguageSuggestion } from "./language-suggestion";
import { LocaleSwitcher } from "./language-switcher";
import { MenuDisclosure } from "./menu-disclosure";
import { NavLink } from "./nav-link";
import { footerNav, linked, publicPrimaryNav, publicUtilityNav } from "./navigation";
import { languageSuggestionFor } from "./suggestion";

export const mainId = "main";

const navLinkClass =
  "inline-flex min-h-control items-center rounded-control px-3 text-compact font-medium text-text no-underline hover:bg-subtle aria-[current=page]:font-semibold aria-[current=page]:underline aria-[current=page]:decoration-2 aria-[current=page]:underline-offset-8";

export async function PublicShell({
  locale,
  children,
}: {
  locale: PublicLocale;
  children: ReactNode;
}) {
  const t = await getTranslations({ locale, namespace: "nav" });
  const a11y = await getTranslations({ locale, namespace: "a11y" });
  const footer = await getTranslations({ locale, namespace: "footer" });
  const primary = linked(publicPrimaryNav, locale);
  const utilities = linked(publicUtilityNav, locale);
  const footerLinks = linked(footerNav, locale);
  const suggestion = await languageSuggestionFor(locale);

  const primaryList = (
    <ul className="flex flex-col gap-1 lg:flex-row lg:items-center">
      {primary.map((item) => (
        <li key={item.label}>
          <NavLink href={item.href} className={navLinkClass}>
            {t(item.label)}
          </NavLink>
        </li>
      ))}
    </ul>
  );

  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      <SkipLink targetId={mainId}>{a11y("skipToContent")}</SkipLink>
      {suggestion ? (
        <LanguageSuggestion suggested={suggestion.locale} copy={suggestion.copy} />
      ) : null}
      <header className="border-b border-divider bg-surface">
        <div className="mx-auto flex max-w-page flex-wrap items-center gap-x-6 gap-y-2 px-gutter py-2 lg:px-gutter-wide">
          <Link
            href={`/${locale}`}
            aria-label={t("home")}
            className="me-auto inline-flex min-h-control items-center rounded-control lg:me-0"
          >
            <Image src="/brand/logo-ms-realty.png" alt="" width={86} height={44} priority />
          </Link>
          {primary.length > 0 ? (
            <nav aria-label={t("primaryLabel")} className="hidden flex-1 lg:block">
              {primaryList}
            </nav>
          ) : null}
          <ul aria-label={t("utilitiesLabel")} className="flex items-center gap-1 lg:ms-auto">
            {utilities.map((item) => (
              <li key={item.label} className="hidden sm:block">
                <NavLink href={item.href} className={navLinkClass}>
                  {t(item.label)}
                </NavLink>
              </li>
            ))}
            <li>
              <LocaleSwitcher locale={locale} locales={routableLocales()} label={t("language")} />
            </li>
            {utilities.some((item) => item.label === "contact") ? null : (
              <li>
                <ButtonLink href={`tel:${brandPhone.e164}`} variant="secondary">
                  {footer("callLabel")}
                  <span className="hidden text-text md:inline">
                    <Ltr>{brandPhone.display}</Ltr>
                  </span>
                </ButtonLink>
              </li>
            )}
          </ul>
          {primary.length > 0 ? (
            <MenuDisclosure label={t("menu")} className="lg:hidden" panelClassName="lg:hidden pb-3">
              <nav aria-label={t("primaryLabel")}>{primaryList}</nav>
            </MenuDisclosure>
          ) : null}
        </div>
      </header>
      <main id={mainId} tabIndex={-1} className="flex-1 outline-none">
        {children}
      </main>
      <footer className="border-t border-divider bg-surface">
        <div className="mx-auto grid max-w-page gap-6 px-gutter py-8 text-compact sm:grid-cols-[1fr_auto] lg:px-gutter-wide">
          <div className="flex flex-col gap-1">
            <p className="font-semibold text-text">{footer("agencyName")}</p>
            <p className="text-text-muted">{footer("agencyKind")}</p>
            <p className="pt-3">
              <span className="block text-caption text-text-muted">{footer("callLabel")}</span>
              <a
                href={`tel:${brandPhone.e164}`}
                className="text-subheading font-semibold text-link"
              >
                {footer("call", { phone: isolateText(brandPhone.display, "ltr") })}
              </a>
            </p>
          </div>
          {footerLinks.length > 0 ? (
            <nav>
              <ul className="flex flex-col gap-1">
                {footerLinks.map((item) => (
                  <li key={item.label}>
                    <NavLink href={item.href} className="text-link">
                      {footer(item.label)}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </nav>
          ) : null}
          <p className="text-caption text-text-muted sm:col-span-2">
            {footer("copyright", { year: agencyYear() })}
          </p>
        </div>
      </footer>
    </div>
  );
}
