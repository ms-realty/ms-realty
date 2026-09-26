// Agency workspace shell (spec §06.3, L07). Primary: Today · Inbox · Cases · Properties ·
// Calendar; secondary: Content & approvals · Service operations · Reports · Settings. On
// phones Today, Inbox and Calendar stay on screen and the rest sits under More.

import Image from "next/image";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { localeEndonyms, type StaffLocale, staffLocales } from "@/i18n/config";
import { Button, cx, icons, Select, SkipLink } from "@/ui";
import { MenuDisclosure } from "./menu-disclosure";
import { NavLink } from "./nav-link";
import {
  linked,
  type WorkspaceNavLabel,
  workspacePrimaryNav,
  workspaceSecondaryNav,
} from "./navigation";
import { setStaffLocale } from "./staff-locale-action";

export const workspaceMainId = "main";

const sideLinkClass = cx(
  "flex min-h-10 items-center gap-2.5 rounded-lg border border-transparent px-2.5 text-operational font-medium text-text no-underline",
  "transition-colors duration-(--duration-fast) hover:bg-divider",
  "aria-[current=page]:border-divider aria-[current=page]:bg-surface aria-[current=page]:shadow-raised",
);

const navIcons: Partial<Record<WorkspaceNavLabel, typeof icons.HomeIcon>> = {
  today: icons.HomeIcon,
  inbox: icons.InboxIcon,
  cases: icons.CaseIcon,
  properties: icons.BuildingIcon,
  calendar: icons.CalendarIcon,
  contentApprovals: icons.StampIcon,
  serviceOperations: icons.FolderIcon,
  reports: icons.HistoryIcon,
  settings: icons.FiltersIcon,
};
const tabLinkClass =
  "inline-flex min-h-control items-center border-b-2 border-transparent px-3 text-operational font-medium text-text no-underline aria-[current=page]:border-action aria-[current=page]:font-semibold aria-[current=page]:text-action";

export async function WorkspaceShell({
  locale,
  search,
  counts,
  account,
  children,
}: {
  locale: StaffLocale;
  /** Global search over authorized records (§06.3); supplied once search exists. */
  search?: ReactNode;
  /** Owned, actionable work per destination: navigation aids, never decoration (L07). */
  counts?: Partial<Record<WorkspaceNavLabel, number>>;
  /** Signed-in operator: name and office. */
  account?: { name: string; detail?: string };
  children: ReactNode;
}) {
  const t = await getTranslations({ locale, namespace: "nav.workspace" });
  const a11y = await getTranslations({ locale, namespace: "a11y" });
  const common = await getTranslations({ locale, namespace: "common" });
  const primary = linked(workspacePrimaryNav);
  const secondary = linked(workspaceSecondaryNav);
  const mobileMore = [...primary.filter((item) => !item.mobilePrimary), ...secondary];

  // A preference, not a destination: it sits behind a disclosure under the account.
  const languageForm = (
    <form
      action={setStaffLocale}
      className="flex flex-col gap-3 rounded-card border border-divider bg-surface p-3 text-text"
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

  const list = (items: typeof primary, className: string, withIcons = false) => (
    <ul className="flex flex-col gap-0.5">
      {items.map((item) => {
        const Icon = withIcons ? navIcons[item.label] : null;
        const count = counts?.[item.label];
        return (
          <li key={item.label}>
            <NavLink href={item.href} exact={item.href === "/workspace"} className={className}>
              {Icon ? (
                <Icon className="size-[1.125rem] text-text-muted group-data-current:text-action" />
              ) : null}
              <span className="flex-1">{t(item.label)}</span>
              {count ? (
                <span className="min-w-6 rounded-full bg-subtle px-1.5 text-center text-caption font-semibold text-text-muted tabular-nums group-data-current:bg-action group-data-current:text-text-inverse">
                  {count}
                </span>
              ) : null}
            </NavLink>
          </li>
        );
      })}
    </ul>
  );

  return (
    <div className="min-h-dvh bg-canvas lg:grid lg:grid-cols-[16rem_minmax(0,1fr)]">
      <SkipLink targetId={workspaceMainId}>{a11y("skipToContent")}</SkipLink>

      {/* Wide screens: persistent side navigation on a quiet subtle surface. */}
      <header className="hidden border-e border-divider bg-subtle lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col lg:gap-5 lg:overflow-y-auto lg:px-3 lg:py-4">
        <p className="flex items-center gap-2.5 px-2">
          <Image src="/brand/logo-ms-realty.png" alt={common("brand")} width={56} height={29} />
          <span className="text-dense font-medium text-text-muted">{t("label")}</span>
        </p>
        {search ? <search aria-label={t("search")}>{search}</search> : null}
        <nav aria-label={t("label")}>{list(primary, sideLinkClass, true)}</nav>
        {secondary.length > 0 ? (
          <nav aria-label={t("secondaryLabel")} className="border-t border-divider pt-4">
            {list(secondary, sideLinkClass, true)}
          </nav>
        ) : null}
        <div className="mt-auto flex flex-col gap-3 border-t border-divider pt-4">
          {account ? (
            <p className="flex items-center gap-2.5 px-2">
              <span
                aria-hidden="true"
                className="inline-flex size-8 items-center justify-center rounded-full bg-selected text-dense font-semibold text-action"
              >
                {initials(account.name)}
              </span>
              <span className="flex flex-col">
                <span className="text-operational font-medium text-text">{account.name}</span>
                {account.detail ? (
                  <span className="text-caption text-text-muted">{account.detail}</span>
                ) : null}
              </span>
            </p>
          ) : null}
          <MenuDisclosure
            quiet
            label={
              <span className="flex items-center gap-2.5">
                <icons.LanguageIcon className="size-[1.125rem] text-text-muted" />
                <span className="flex flex-col">
                  <span className="text-caption font-normal text-text-muted">
                    {t("interfaceLanguage")}
                  </span>
                  <span className="text-operational">{localeEndonyms[locale]}</span>
                </span>
              </span>
            }
            panelClassName="pt-2"
          >
            {languageForm}
          </MenuDisclosure>
        </div>
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

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}
