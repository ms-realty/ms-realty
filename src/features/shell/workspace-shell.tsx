// Agency shell follows the saved O01 composition. Native navigation remains complete on
// phones: Today, Inquiries and Calendar stay visible; the other destinations live in More.

import { randomUUID } from "node:crypto";
import Image from "next/image";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { PrivatePageGuard } from "@/features/identity/private-page-guard";
import { type StaffLocale, staffLocales } from "@/i18n/config";
import { cx } from "@/ui/cx";
import { SkipLink } from "@/ui/skip-link";
import { LocaleSwitcher } from "./language-switcher";
import { MenuDisclosure } from "./menu-disclosure";
import { NavLink } from "./nav-link";
import {
  linked,
  type WorkspaceNavLabel,
  workspacePrimaryNav,
  workspaceSecondaryNav,
} from "./navigation";
import { WorkspaceContext } from "./workspace-context";

export const workspaceMainId = "main";

const sideLinkClass = cx(
  "flex min-h-control min-w-0 items-center gap-3 rounded-control px-3 py-2 text-dense text-text-muted no-underline wrap-anywhere",
  "transition-colors duration-(--duration-fast) hover:bg-divider",
  "aria-[current=page]:bg-surface aria-[current=page]:font-semibold aria-[current=page]:text-text",
);

// Original 20px static assets from get_design_context O01, retained locally without redrawing.
const navIcons: Partial<Record<WorkspaceNavLabel, string>> = {
  today: "/brand/workspace/today.svg",
  inquiries: "/brand/workspace/inquiries.svg",
  cases: "/brand/workspace/cases.svg",
  calendar: "/brand/workspace/calendar.svg",
  inventory: "/brand/workspace/inventory.svg",
  tasks: "/brand/workspace/tasks.svg",
  butler: "/brand/workspace/butler.svg",
  moreTools: "/brand/workspace/more-tools.svg",
};
const tabLinkClass =
  "inline-flex min-h-control items-center border-b-2 border-transparent px-3 text-operational font-medium text-text no-underline aria-[current=page]:border-action aria-[current=page]:font-semibold aria-[current=page]:text-action";

export async function WorkspaceShell({
  locale,
  search,
  counts,
  account,
  mayManageAccess = false,
  children,
}: {
  locale: StaffLocale;
  /** Global search over authorized records (§06.3); supplied once search exists. */
  search?: ReactNode;
  /** Owned, actionable work per destination: navigation aids, never decoration (L07). */
  counts?: Partial<Record<WorkspaceNavLabel, number>>;
  /** Signed-in operator: name and office. */
  account?: { name: string; detail?: string };
  mayManageAccess?: boolean;
  children: ReactNode;
}) {
  const t = await getTranslations({ locale, namespace: "workspace" });
  const a11y = await getTranslations({ locale, namespace: "a11y" });
  const common = await getTranslations({ locale, namespace: "common" });
  const primary = linked(workspacePrimaryNav, locale);
  const secondary = linked(workspaceSecondaryNav, locale);
  const accountActions = (
    <div className="flex flex-col gap-2 px-2">
      {mayManageAccess ? (
        <a href={`/${locale}/access/manage`} className="text-compact text-action underline">
          {t("manageAccess")}
        </a>
      ) : null}
      {account ? (
        <form action={`/${locale}/access/signout`} method="post">
          <button type="submit" className="min-h-control text-compact text-action underline">
            {t("signOut")}
          </button>
        </form>
      ) : null}
    </div>
  );
  const mobileMore = [...primary.filter((item) => !item.mobilePrimary), ...secondary];
  const accountIdentity = account ? (
    <p className="flex min-w-0 items-start gap-2.5 px-2" data-workspace-account>
      <span
        aria-hidden="true"
        className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-selected text-dense font-semibold text-brand"
      >
        {initials(account.name)}
      </span>
      <span className="flex min-w-0 flex-col wrap-anywhere">
        <span className="text-operational font-medium text-text">{account.name}</span>
        {account.detail ? (
          <span className="text-caption text-text-muted">{account.detail}</span>
        ) : null}
      </span>
    </p>
  ) : null;

  // A preference, not a destination. Staff URLs carry the locale (§03.1), so choosing a
  // language opens the same address in it.
  const languageSwitcher = (
    <LocaleSwitcher locale={locale} locales={staffLocales} label={t("interfaceLanguage")} />
  );

  const list = (items: typeof primary, className: string, withIcons = false) => (
    <ul className="flex flex-col gap-0.5">
      {items.map((item) => {
        const icon = withIcons ? navIcons[item.label] : null;
        const count = counts?.[item.label];
        return (
          <li key={item.label}>
            <NavLink
              href={item.href}
              className={className}
              {...(item.label === "moreTools"
                ? { excludePaths: [`/${locale}/operations/assistance`] }
                : {})}
            >
              {icon ? (
                <Image
                  src={icon}
                  alt=""
                  aria-hidden="true"
                  width={20}
                  height={20}
                  className="shrink-0"
                />
              ) : null}
              <span className="min-w-0 flex-1">{t(item.label)}</span>
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
    <PrivatePageGuard locale={locale} verification={randomUUID()}>
      <div className="min-h-dvh bg-canvas lg:grid lg:grid-cols-[14rem_minmax(0,1fr)]">
        <SkipLink targetId={workspaceMainId}>{a11y("skipToContent")}</SkipLink>

        {/* Wide screens: persistent side navigation on a quiet subtle surface. */}
        <header className="hidden bg-subtle lg:sticky lg:top-0 lg:flex lg:h-dvh lg:min-w-0 lg:flex-col lg:gap-5 lg:overflow-y-auto lg:p-5">
          <p className="flex items-center">
            <Image
              src="/brand/logo-ms-realty.png"
              alt={common("brand")}
              width={86}
              height={44}
              className="h-auto shrink-0 object-contain"
            />
          </p>
          {search ? <search aria-label={t("search")}>{search}</search> : null}
          <nav aria-label={t("label")}>{list(primary, sideLinkClass, true)}</nav>
          {secondary.length > 0 ? (
            <nav aria-label={t("secondaryLabel")} className="mt-auto border-t border-divider pt-4">
              {list(secondary, sideLinkClass, true)}
            </nav>
          ) : null}
          <div className="flex min-w-0 flex-col gap-3 border-t border-divider pt-4">
            {accountIdentity}
            {accountActions}
          </div>
        </header>

        {/* Phones and tablets: brand bar, Today/Inquiries/Calendar tabs, the rest under More. */}
        <header className="border-b border-divider bg-surface lg:hidden">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-gutter py-2">
            <p className="me-auto flex items-center gap-2">
              <Image
                src="/brand/logo-ms-realty.png"
                alt={common("brand")}
                width={86}
                height={44}
                className="h-auto shrink-0 object-contain"
              />
              <span className="text-caption text-text-muted">{t("label")}</span>
            </p>
            {mobileMore.length > 0 || account ? (
              <MenuDisclosure
                label={t("more")}
                panelClassName="flex max-h-[calc(100dvh-6rem)] flex-col gap-4 overflow-y-auto pb-3"
              >
                <nav aria-label={t("secondaryLabel")}>{list(mobileMore, tabLinkClass)}</nav>
                {accountIdentity}
                {accountActions}
              </MenuDisclosure>
            ) : null}
            {languageSwitcher}
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
                    <NavLink href={item.href} className={tabLinkClass}>
                      {t(item.label)}
                    </NavLink>
                  </li>
                ))}
            </ul>
          </nav>
        </header>

        <div className="min-w-0">
          {/* A named region, so the wide-screen context bar sits inside a landmark like the rest of the page. */}
          <section
            aria-label={t("currentPage")}
            className="hidden min-h-[4.5rem] items-center justify-between gap-4 border-b border-divider px-8 py-3 lg:flex"
          >
            <WorkspaceContext
              label={t("label")}
              items={[...primary, ...secondary].map((item) => ({
                href: item.href,
                label: t(item.label),
              }))}
            />
            {languageSwitcher}
          </section>
          <main id={workspaceMainId} tabIndex={-1} className="min-w-0 outline-none">
            {children}
          </main>
        </div>
      </div>
    </PrivatePageGuard>
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
