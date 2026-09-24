// Agency workspace shell (spec §06.3, L07). Primary: Today · Inbox · Cases · Properties ·
// Calendar; secondary: Content & approvals · Service operations · Reports · Settings. On
// phones Today, Inbox and Calendar stay on screen and the rest sits under More.

import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { localeEndonyms, type StaffLocale, staffLocales } from "@/i18n/config";
import { Button, Select, SkipLink } from "@/ui";
import { MenuDisclosure } from "./menu-disclosure";
import { NavLink } from "./nav-link";
import { linked, workspacePrimaryNav, workspaceSecondaryNav } from "./navigation";
import { setStaffLocale } from "./staff-locale-action";

export const workspaceMainId = "main";

const sideLinkClass =
  "flex min-h-control items-center rounded-control px-3 text-operational font-medium text-text-inverse no-underline hover:bg-white/10 focus-visible:outline-white aria-[current=page]:bg-white/15 aria-[current=page]:font-semibold";
const tabLinkClass =
  "inline-flex min-h-control items-center border-b-2 border-transparent px-3 text-operational font-medium text-text no-underline aria-[current=page]:border-action aria-[current=page]:font-semibold aria-[current=page]:text-action";

export async function WorkspaceShell({
  locale,
  search,
  children,
}: {
  locale: StaffLocale;
  /** Global search over authorized records (§06.3); supplied once search exists. */
  search?: ReactNode;
  children: ReactNode;
}) {
  const t = await getTranslations({ locale, namespace: "nav.workspace" });
  const a11y = await getTranslations({ locale, namespace: "a11y" });
  const common = await getTranslations({ locale, namespace: "common" });
  const primary = linked(workspacePrimaryNav);
  const secondary = linked(workspaceSecondaryNav);
  const mobileMore = [...primary.filter((item) => !item.mobilePrimary), ...secondary];

  // Design-system controls are drawn for light surfaces, so the form keeps its own panel.
  const languageForm = (
    <form
      action={setStaffLocale}
      className="flex flex-col gap-3 rounded-card bg-surface p-3 text-text"
    >
      <Select
        name="locale"
        label={t("interfaceLanguage")}
        defaultSelectedKey={locale}
        options={staffLocales.map((option) => ({
          id: option,
          label: localeEndonyms[option],
          lang: option,
        }))}
      />
      <Button type="submit" variant="secondary" className="self-start">
        {t("applyLanguage")}
      </Button>
    </form>
  );

  const list = (items: typeof primary, className: string) => (
    <ul className="flex flex-col gap-0.5">
      {items.map((item) => (
        <li key={item.label}>
          <NavLink href={item.href} exact={item.href === "/workspace"} className={className}>
            {t(item.label)}
          </NavLink>
        </li>
      ))}
    </ul>
  );

  return (
    <div className="min-h-dvh bg-canvas lg:grid lg:grid-cols-[16rem_minmax(0,1fr)]">
      <SkipLink targetId={workspaceMainId}>{a11y("skipToContent")}</SkipLink>

      {/* Wide screens: persistent side navigation. */}
      <header className="hidden bg-text text-text-inverse lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col lg:gap-6 lg:overflow-y-auto lg:p-4">
        <p className="px-3 pt-2">
          <span className="block text-subheading font-semibold">{common("brand")}</span>
          <span className="block text-caption text-white/80">{t("label")}</span>
        </p>
        {search ? <search aria-label={t("search")}>{search}</search> : null}
        <nav aria-label={t("label")}>{list(primary, sideLinkClass)}</nav>
        {secondary.length > 0 ? (
          <nav aria-label={t("secondaryLabel")} className="border-t border-white/20 pt-4">
            {list(secondary, sideLinkClass)}
          </nav>
        ) : null}
        <div className="mt-auto border-t border-white/20 px-1 pt-4">{languageForm}</div>
      </header>

      {/* Phones and tablets: brand bar, Today/Inbox/Calendar tabs, everything else under More. */}
      <header className="border-b border-divider bg-surface lg:hidden">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-gutter py-2">
          <p className="me-auto">
            <span className="font-semibold">{common("brand")}</span>{" "}
            <span className="text-caption text-text-muted">{t("label")}</span>
          </p>
          <MenuDisclosure label={t("more")} panelClassName="flex flex-col gap-4 pb-3">
            {mobileMore.length > 0 ? (
              <nav aria-label={t("secondaryLabel")}>{list(mobileMore, tabLinkClass)}</nav>
            ) : null}
            {languageForm}
          </MenuDisclosure>
        </div>
        {search ? (
          <search aria-label={t("search")} className="block px-gutter pb-2">
            {search}
          </search>
        ) : null}
        <nav aria-label={t("label")} className="overflow-x-auto px-gutter">
          <ul className="flex gap-1">
            {primary
              .filter((item) => item.mobilePrimary)
              .map((item) => (
                <li key={item.label}>
                  <NavLink
                    href={item.href}
                    exact={item.href === "/workspace"}
                    className={tabLinkClass}
                  >
                    {t(item.label)}
                  </NavLink>
                </li>
              ))}
          </ul>
        </nav>
      </header>

      <main id={workspaceMainId} tabIndex={-1} className="min-w-0 outline-none">
        {children}
      </main>
    </div>
  );
}
