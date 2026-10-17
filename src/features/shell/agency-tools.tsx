// X02 «Инструменти на агенцията» (Figma 22:1103 desktop, 23:4648 mobile): one card for the
// rail's «Още инструменти» page and the phone menu. Rows come from navigation.ts, already
// narrowed to what this person may open; NavLink marks the current page. Below lg the foot
// keeps the person, the interface language and sign out, which the phone context bar omits.
import Image from "next/image";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { type StaffLocale, staffLocales } from "@/i18n/config";
import { cx } from "@/ui/cx";
import { AccountIdentity, SignOutForm } from "./account";
import { LocaleSwitcher } from "./language-switcher";
import { NavLink } from "./nav-link";
import type { AgencyToolGroup } from "./navigation";

const closeClass =
  "inline-flex size-control shrink-0 items-center justify-center rounded-control hover:bg-subtle";

const rowClass = cx(
  "flex min-h-19 items-center gap-4 rounded-control p-4 text-dense text-text no-underline",
  "transition-colors duration-(--duration-fast) hover:bg-subtle aria-[current=page]:bg-selected",
);

export async function AgencyTools({
  locale,
  groups,
  idPrefix,
  level,
  closeHref,
  account,
  search,
}: {
  locale: StaffLocale;
  groups: readonly AgencyToolGroup[];
  /** Unique per document: the menu dialog and the page can both be present. */
  idPrefix: string;
  /** 1 on the page, 2 inside the menu dialog over another page. */
  level: 1 | 2;
  /** Where Close goes on the page; without it Close dismisses the enclosing dialog. */
  closeHref?: string;
  account?: { name: string; detail?: string };
  search?: ReactNode;
}) {
  const t = await getTranslations({ locale, namespace: "tools" });
  const workspace = await getTranslations({ locale, namespace: "workspace" });
  const common = await getTranslations({ locale, namespace: "common" });
  const Title = level === 1 ? "h1" : "h2";
  const SectionTitle = level === 1 ? "h2" : "h3";
  // Eager: in the closed menu dialog a lazy image would only start loading once it opens.
  const icon = (src: string) => (
    <Image src={src} alt="" width={20} height={20} loading="eager" className="shrink-0" />
  );

  return (
    <div className="mx-auto flex w-full max-w-[55rem] flex-col gap-6 rounded-card bg-canvas p-5 sm:p-10">
      <div className="flex items-start gap-3">
        <p className="flex min-w-0 flex-1 items-center">
          <Image
            src="/brand/logo-ms-realty.png"
            alt={common("brand")}
            width={86}
            height={44}
            loading="eager"
            className="h-auto shrink-0 object-contain"
          />
        </p>
        {closeHref ? (
          <a href={closeHref} aria-label={t("close")} className={closeClass}>
            {icon("/brand/workspace/x.svg")}
          </a>
        ) : (
          <form method="dialog">
            <button type="submit" aria-label={t("close")} className={closeClass}>
              {icon("/brand/workspace/x.svg")}
            </button>
          </form>
        )}
      </div>
      <Title id={`${idPrefix}-title`} className="text-heading font-semibold sm:text-title">
        {t("title")}
      </Title>
      {search ? <search aria-label={workspace("search")}>{search}</search> : null}
      {groups.map((group) => (
        <nav
          key={group.section}
          aria-labelledby={`${idPrefix}-${group.section}`}
          className="flex flex-col gap-4"
        >
          <SectionTitle
            id={`${idPrefix}-${group.section}`}
            className="text-subheading font-semibold"
          >
            {t(`sections.${group.section}`)}
          </SectionTitle>
          <ul className="flex flex-col gap-4">
            {group.items.map((item) => (
              <li key={item.label} className="border-b border-divider pb-4">
                <NavLink href={item.href} className={rowClass}>
                  {icon("/brand/workspace/folder.svg")}
                  <span className="flex min-w-0 flex-1 flex-col gap-1 wrap-anywhere">
                    <span className="font-semibold">{t(`items.${item.label}.title`)}</span>{" "}
                    <span className="font-medium text-text-muted">
                      {t(`items.${item.label}.description`)}
                    </span>
                  </span>
                  {icon("/brand/workspace/chevron-right.svg")}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      ))}
      <div className="flex flex-col gap-4 lg:hidden">
        {account ? <AccountIdentity name={account.name} detail={account.detail} /> : null}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <LocaleSwitcher
            locale={locale}
            locales={staffLocales}
            label={workspace("interfaceLanguage")}
            wide
            align="start"
            side="top"
          />
          {account ? <SignOutForm locale={locale} label={workspace("signOut")} /> : null}
        </div>
      </div>
    </div>
  );
}
