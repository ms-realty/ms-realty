// Agency shell follows the saved O01 composition on wide screens. Phones and tablets get the
// Figma context bar (O02 18:2906, O04 14:4523): logo, Butler and the X02 agency-tools menu,
// which holds every destination, the person, the interface language and sign out.

import { randomUUID } from "node:crypto";
import Image from "next/image";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { PrivatePageGuard } from "@/features/identity/private-page-guard";
import { type StaffLocale, staffLocales } from "@/i18n/config";
import { cx } from "@/ui/cx";
import { SkipLink } from "@/ui/skip-link";
import { AccountIdentity, SignOutForm } from "./account";
import { AgencyTools } from "./agency-tools";
import { AgencyToolsMenu } from "./agency-tools-menu";
import { LocaleSwitcher } from "./language-switcher";
import { NavLink } from "./nav-link";
import {
  type AgencyToolGroup,
  linked,
  permittedTools,
  type WorkspaceNavLabel,
  workspacePrimaryNav,
  workspaceSecondaryNav,
} from "./navigation";
import { WorkspaceContext } from "./workspace-context";

export const workspaceMainId = "main";
const toolsMenuId = "agency-tools-menu";

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

export async function WorkspaceShell({
  locale,
  search,
  counts,
  account,
  mayManageAccess = false,
  tools,
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
  /** X02 rows this person may open (navigation.ts); signed out, only rows anyone may open. */
  tools?: readonly AgencyToolGroup[];
  children: ReactNode;
}) {
  const t = await getTranslations({ locale, namespace: "workspace" });
  const a11y = await getTranslations({ locale, namespace: "a11y" });
  const common = await getTranslations({ locale, namespace: "common" });
  const toolsCopy = await getTranslations({ locale, namespace: "tools" });
  const primary = linked(workspacePrimaryNav, locale);
  const secondary = linked(workspaceSecondaryNav, locale);
  const butler = secondary.find((item) => item.label === "butler");
  const toolsPage = secondary.find((item) => item.label === "moreTools");
  const accountActions = (
    <div className="flex flex-col gap-2 px-2">
      {mayManageAccess ? (
        <a href={`/${locale}/access/manage`} className="text-compact text-action underline">
          {t("manageAccess")}
        </a>
      ) : null}
      {account ? <SignOutForm locale={locale} label={t("signOut")} /> : null}
    </div>
  );
  // Awaited here, so the shell (and its unit test) renders in one pass.
  const toolsMenu = await AgencyTools({
    locale,
    groups: tools ?? permittedTools(locale, new Set()),
    idPrefix: toolsMenuId,
    level: 2,
    account,
    search,
  });
  const accountIdentity = account ? (
    <AccountIdentity name={account.name} detail={account.detail} className="px-2" />
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
      {/* A focused state (one outcome, one way back) stands alone: the chrome steps aside. */}
      <div className="group/shell min-h-dvh bg-canvas lg:grid lg:grid-cols-[14rem_minmax(0,1fr)] has-[[data-focused-state]]:block">
        <SkipLink targetId={workspaceMainId}>{a11y("skipToContent")}</SkipLink>

        {/* Wide screens: persistent side navigation on a quiet subtle surface. */}
        <header className="hidden bg-subtle lg:sticky lg:top-0 lg:flex lg:h-dvh lg:min-w-0 lg:flex-col lg:gap-5 lg:overflow-y-auto lg:p-5 group-has-[[data-focused-state]]/shell:hidden!">
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

        {/* Phones and tablets: the context bar. No tab row and no inline search: every
            destination, search, the language and sign out live in the X02 menu. */}
        <header className="flex items-center gap-4 border-b border-divider bg-canvas px-gutter py-4 lg:hidden group-has-[[data-focused-state]]/shell:hidden">
          <p className="flex min-w-0 flex-1 items-center">
            <Image
              src="/brand/logo-ms-realty.png"
              alt={common("brand")}
              width={86}
              height={44}
              className="h-auto shrink-0 object-contain"
            />
          </p>
          <nav aria-label={t("label")} className="flex items-center gap-4">
            {butler ? (
              <NavLink
                href={butler.href}
                className="inline-flex h-control items-center gap-2 rounded-control p-3 text-dense text-text-muted no-underline hover:bg-subtle aria-[current=page]:bg-selected aria-[current=page]:text-text"
              >
                <Image
                  src="/brand/workspace/sparkles.svg"
                  alt=""
                  width={20}
                  height={20}
                  className="shrink-0"
                />
                {t("butler")}
              </NavLink>
            ) : null}
            {toolsPage ? (
              <AgencyToolsMenu
                href={toolsPage.href}
                dialogId={toolsMenuId}
                className="inline-flex size-control items-center justify-center rounded-control hover:bg-subtle"
              >
                <Image src="/brand/workspace/panel-left.svg" alt="" width={20} height={20} />
                <span className="sr-only">{toolsCopy("openMenu")}</span>
              </AgencyToolsMenu>
            ) : null}
          </nav>
        </header>
        {/* X02 in place over the page; hidden until the menu control opens it as a modal. */}
        <dialog
          id={toolsMenuId}
          aria-labelledby={`${toolsMenuId}-title`}
          className="fixed inset-0 m-0 h-dvh max-h-none w-full max-w-none overflow-y-auto overscroll-contain bg-subtle p-5 text-text backdrop:bg-transparent sm:p-16"
        >
          {toolsMenu}
        </dialog>

        <div className="min-w-0">
          {/* A named region, so the wide-screen context bar sits inside a landmark like the rest of the page. */}
          <section
            aria-label={t("currentPage")}
            className="hidden min-h-[4.5rem] items-center justify-between gap-4 border-b border-divider px-8 py-3 lg:flex group-has-[[data-focused-state]]/shell:hidden!"
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
