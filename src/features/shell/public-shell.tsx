// Public shell (spec §06.1, L01): compact header, skip link, landmarks, agency footer.
import Image from "next/image";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { type ReactNode, Suspense } from "react";
import { SelectionLink } from "@/features/discovery/selection-link";
import { isolateText, Ltr } from "@/i18n/bidi";
import { type PublicLocale, routableLocales } from "@/i18n/config";
import { agencyYear } from "@/i18n/format";
import { buttonClass } from "@/ui/button-class";
import * as icons from "@/ui/icons";
import { SkipLink } from "@/ui/skip-link";
import { brandPhone } from "./agency";
import { LanguageSuggestion } from "./language-suggestion";
import { LocaleSwitcher } from "./language-switcher";
import { MenuDisclosure } from "./menu-disclosure";
import { footerNav, linked, publicPrimaryNav, publicUtilityNav } from "./navigation";
import { NavigationLoading } from "./navigation-loading";
import { PublicNavLink } from "./public-nav-link";
import { StickyHeader } from "./sticky-header";
import { languageSuggestionFor, publicPageLocaleAvailability } from "./suggestion";

export const mainId = "main";

const navLinkClass =
  "inline-flex min-h-control items-center rounded-control px-3 text-compact font-semibold text-text no-underline transition-colors duration-(--duration-fast) hover:bg-subtle aria-[current=page]:bg-selected aria-[current=page]:text-action";

export async function PublicShell({
  locale,
  children,
  notice,
}: {
  locale: PublicLocale;
  children: ReactNode;
  /** Normal-flow public notices, including the shared consent control. */
  notice?: ReactNode;
}) {
  const t = await getTranslations({ locale, namespace: "nav" });
  const a11y = await getTranslations({ locale, namespace: "a11y" });
  const footer = await getTranslations({ locale, namespace: "footer" });
  const primary = linked(publicPrimaryNav, locale);
  const utilities = linked(publicUtilityNav, locale);
  const footerLinks = linked(footerNav, locale);
  const availability = await publicPageLocaleAvailability(locale);
  const suggestion = await languageSuggestionFor(
    locale,
    availability?.locales ?? routableLocales(),
  );

  const primaryList = (
    <ul className="flex flex-col gap-1 lg:flex-row lg:items-center">
      {primary.map((item) => (
        <li key={item.label}>
          <PublicNavLink href={item.href} className={navLinkClass}>
            {t(item.label)}
          </PublicNavLink>
        </li>
      ))}
    </ul>
  );

  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      <SkipLink targetId={mainId}>{a11y("skipToContent")}</SkipLink>
      {notice}
      {suggestion ? (
        <LanguageSuggestion
          suggested={suggestion.locale}
          copy={suggestion.copy}
          availability={availability}
        />
      ) : null}
      <StickyHeader>
        <div className="mx-auto flex min-h-18 max-w-page flex-wrap items-center gap-x-6 gap-y-2 px-gutter py-2 lg:px-gutter-wide">
          <Link
            href={`/${locale}`}
            aria-label={t("home")}
            className="me-auto inline-flex min-h-control items-center rounded-control lg:me-0"
          >
            <Image src="/brand/logo-ms-realty.png" alt="" width={86} height={44} />
          </Link>
          {primary.length > 0 ? (
            <nav aria-label={t("primaryLabel")} className="hidden flex-1 lg:block">
              {primaryList}
            </nav>
          ) : null}
          <ul aria-label={t("utilitiesLabel")} className="flex items-center gap-1 lg:ms-auto">
            {utilities.map((item) => (
              <li key={item.label} className="hidden sm:block">
                {item.label === "saved" || item.label === "compare" ? (
                  <SelectionLink kind={item.label} locale={locale} className={navLinkClass}>
                    {item.label === "saved" ? <icons.SaveIcon /> : null}
                    {t(item.label)}
                  </SelectionLink>
                ) : (
                  <PublicNavLink href={item.href} className={navLinkClass}>
                    {t(item.label)}
                  </PublicNavLink>
                )}
              </li>
            ))}
            <li>
              <LocaleSwitcher
                locale={locale}
                locales={routableLocales()}
                label={t("language")}
                availability={availability}
              />
            </li>
            <li>
              <a
                href={`tel:${brandPhone.e164}`}
                className={buttonClass("secondary", "px-3 sm:px-4")}
              >
                <icons.PhoneIcon className="size-[1.125rem]" />
                <span className="sr-only">{footer("callLabel")}</span>
                <span className="max-sm:sr-only">
                  <Ltr>{brandPhone.display}</Ltr>
                </span>
              </a>
            </li>
          </ul>
          {primary.length > 0 ? (
            <MenuDisclosure label={t("menu")} className="lg:hidden" panelClassName="lg:hidden pb-3">
              <div className="space-y-3">
                <nav aria-label={t("primaryLabel")}>{primaryList}</nav>
                <nav aria-label={t("utilitiesLabel")} className="border-t border-divider pt-3">
                  <ul className="flex flex-wrap gap-2">
                    {utilities.map((item) => (
                      <li key={item.label}>
                        {item.label === "saved" || item.label === "compare" ? (
                          <SelectionLink kind={item.label} locale={locale} className={navLinkClass}>
                            {t(item.label)}
                          </SelectionLink>
                        ) : (
                          <PublicNavLink href={item.href} className={navLinkClass}>
                            {t(item.label)}
                          </PublicNavLink>
                        )}
                      </li>
                    ))}
                  </ul>
                </nav>
              </div>
            </MenuDisclosure>
          ) : null}
        </div>
      </StickyHeader>
      <main id={mainId} tabIndex={-1} className="flex-1 outline-none">
        <Suspense fallback={null}>
          <NavigationLoading surface="public" />
        </Suspense>
        <div data-route-content="">{children}</div>
      </main>
      <footer className="border-t border-divider bg-surface">
        <div className="mx-auto grid max-w-page gap-10 px-gutter pt-14 pb-10 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] lg:px-gutter-wide">
          <div className="flex max-w-sm flex-col gap-3">
            <Image
              src="/brand/logo-ms-realty.png"
              alt={footer("agencyName")}
              width={86}
              height={44}
            />
            <p className="text-compact text-text-muted">{footer("agencyKind")}</p>
            <a
              href={`tel:${brandPhone.e164}`}
              className="inline-flex w-fit items-center gap-2 text-compact font-semibold text-link no-underline hover:underline"
            >
              <icons.PhoneIcon className="size-[1.125rem]" />
              {footer("call", { phone: isolateText(brandPhone.display, "ltr") })}
            </a>
          </div>
          {footerLinks.length > 0 ? (
            <nav aria-label={footer("label")}>
              <ul className="grid gap-2.5 lg:grid-cols-2">
                {footerLinks.map((item) => (
                  <li key={item.label}>
                    <PublicNavLink
                      href={item.href}
                      className="text-compact text-text no-underline hover:underline"
                    >
                      {footer(item.label)}
                    </PublicNavLink>
                  </li>
                ))}
              </ul>
            </nav>
          ) : null}
          <p className="border-t border-divider pt-6 text-caption text-text-muted sm:col-span-2">
            {footer("copyright", { year: agencyYear() })}
          </p>
        </div>
      </footer>
    </div>
  );
}
