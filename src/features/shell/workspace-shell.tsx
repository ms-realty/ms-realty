// O01/X02 workspace navigation: everyday work, records and personal controls share one shell.
import { randomUUID } from "node:crypto";
import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { type ReactNode, Suspense } from "react";
import { PrivatePageGuard } from "@/features/identity/private-page-guard";
import { type StaffLocale, staffLocales } from "@/i18n/config";
import { cx } from "@/ui/cx";
import { SearchIcon } from "@/ui/icons";
import { SkipLink } from "@/ui/skip-link";
import { AccountMenu } from "./account";
import { AgencyTools } from "./agency-tools";
import { AgencyToolsBehavior, AgencyToolsMenu } from "./agency-tools-menu";
import { LocaleSwitcher } from "./language-switcher";
import { NavLink } from "./nav-link";
import {
  type AgencyToolGroup,
  linked,
  permittedTools,
  permittedWorkspaceNav,
  type WorkspaceNavItem,
  type WorkspaceNavLabel,
  workspaceSecondaryNav,
} from "./navigation";
import { NavigationIcon } from "./navigation-icons";
import { NavigationLoading } from "./navigation-loading";
import type { SidebarMode } from "./navigation-preference";
import s from "./workspace.module.css";
import { WorkspaceContext } from "./workspace-context";
import { SidebarToggle, WorkspaceFrame } from "./workspace-frame";

export const workspaceMainId = "main";
const toolsMenuId = "agency-tools-menu";
const workLabels = new Set<WorkspaceNavLabel>(["today", "inquiries", "calendar", "tasks"]);
const sideLinkClass = cx(
  "flex min-h-control min-w-0 items-center gap-3 rounded-control px-3 py-2.5 text-dense font-medium text-text-muted no-underline",
  "transition-colors duration-(--duration-fast) hover:bg-divider hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
  "aria-[current=page]:bg-selected aria-[current=page]:font-semibold aria-[current=page]:text-action",
  "lg:group-data-[sidebar=compact]/shell:justify-center lg:group-data-[sidebar=compact]/shell:px-2",
);

export async function WorkspaceShell({
  locale,
  search,
  counts,
  account,
  mayManageAccess = false,
  tools,
  primary: primaryItems = permittedWorkspaceNav(new Set()),
  initialMode = "expanded",
  returnTo = `/${locale}/today`,
  children,
}: {
  locale: StaffLocale;
  search?: ReactNode;
  counts?: Partial<Record<WorkspaceNavLabel, number>>;
  account?: { name: string; detail?: string };
  mayManageAccess?: boolean;
  tools?: readonly AgencyToolGroup[];
  primary?: readonly WorkspaceNavItem[];
  initialMode?: SidebarMode;
  returnTo?: string;
  children: ReactNode;
}) {
  const t = await getTranslations({ locale, namespace: "workspace" });
  const a11y = await getTranslations({ locale, namespace: "a11y" });
  const common = await getTranslations({ locale, namespace: "common" });
  const primary = linked(primaryItems, locale);
  const secondary = linked(workspaceSecondaryNav, locale);
  const butler = secondary.find((item) => item.label === "butler");
  const toolsPage = secondary.find((item) => item.label === "moreTools");
  const toolsMenu = await AgencyTools({
    locale,
    groups: tools ?? permittedTools(locale, new Set()),
    idPrefix: toolsMenuId,
    level: 2,
    account,
    search,
  });
  const languageSwitcher = (
    <LocaleSwitcher locale={locale} locales={staffLocales} label={t("interfaceLanguage")} />
  );
  const list = (items: typeof primary) => (
    <ul className="flex flex-col gap-1">
      {items.map((item) => {
        const count = counts?.[item.label];
        return (
          <li key={item.label}>
            <NavLink
              href={item.href}
              title={t(item.label)}
              prefetch={false}
              className={cx(s.sideLink, sideLinkClass)}
              excludePaths={item.label === "moreTools" && butler ? [butler.href] : []}
            >
              <NavigationIcon name={item.label} />
              <span className="min-w-0 flex-1 wrap-anywhere lg:group-data-[sidebar=compact]/shell:sr-only">
                {t(item.label)}
              </span>
              {count ? (
                <span className="min-w-6 rounded-full bg-surface px-1.5 text-center text-caption font-semibold tabular-nums lg:group-data-[sidebar=compact]/shell:sr-only">
                  {count}
                </span>
              ) : null}
            </NavLink>
          </li>
        );
      })}
    </ul>
  );
  const work = primary.filter((item) => workLabels.has(item.label));
  const records = primary.filter((item) => !workLabels.has(item.label));
  return (
    <PrivatePageGuard locale={locale} verification={randomUUID()}>
      <WorkspaceFrame initialMode={initialMode}>
        <AgencyToolsBehavior dialogId={toolsMenuId} />
        <SkipLink targetId={workspaceMainId}>{a11y("skipToContent")}</SkipLink>
        <aside
          id="workspace-sidebar"
          aria-label={t("navigation")}
          className={cx(
            s.sidebar,
            "hidden min-w-0 flex-col gap-4 border-e border-divider bg-subtle px-3 py-4 lg:sticky lg:top-0 lg:flex lg:h-dvh group-has-[[data-focused-state]]/shell:hidden!",
          )}
        >
          <a
            href={`/${locale}/today`}
            className={cx(
              s.brand,
              "flex min-h-control items-center gap-3 rounded-control px-3 py-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus lg:group-data-[sidebar=compact]/shell:px-1",
            )}
          >
            <Image
              src="/brand/logo-ms-realty.png"
              alt={common("brand")}
              width={86}
              height={44}
              className="h-auto w-20 shrink-0 object-contain lg:group-data-[sidebar=compact]/shell:w-10"
              priority
            />
            <span
              className={cx(
                s.brandLabel,
                "text-caption font-medium text-text-muted lg:group-data-[sidebar=compact]/shell:sr-only",
              )}
            >
              {t("label")}
            </span>
          </a>
          {search ? (
            <search aria-label={t("search")}>{search}</search>
          ) : toolsPage ? (
            <AgencyToolsMenu
              href={toolsPage.href}
              dialogId={toolsMenuId}
              shortcut
              className="flex min-h-control items-center gap-3 rounded-control border border-divider bg-canvas px-3 text-dense text-text-muted hover:bg-surface lg:group-data-[sidebar=compact]/shell:justify-center lg:group-data-[sidebar=compact]/shell:px-2"
            >
              <SearchIcon />
              <span className="lg:group-data-[sidebar=compact]/shell:sr-only">{t("allPages")}</span>
            </AgencyToolsMenu>
          ) : null}
          <nav
            aria-label={t("label")}
            className="min-h-0 flex-1 space-y-5 overflow-y-auto px-1 py-1"
          >
            {work.length ? (
              <section aria-labelledby="sidebar-work-title">
                <h2
                  id="sidebar-work-title"
                  className={cx(
                    s.groupTitle,
                    "mb-2 px-3 text-caption font-medium text-text-muted lg:group-data-[sidebar=compact]/shell:sr-only",
                  )}
                >
                  {t("workGroup")}
                </h2>
                {list(work)}
              </section>
            ) : null}
            {records.length ? (
              <section aria-labelledby="sidebar-records-title">
                <h2
                  id="sidebar-records-title"
                  className={cx(
                    s.groupTitle,
                    "mb-2 px-3 text-caption font-medium text-text-muted lg:group-data-[sidebar=compact]/shell:sr-only",
                  )}
                >
                  {t("recordsGroup")}
                </h2>
                {list(records)}
              </section>
            ) : null}
          </nav>
          {butler ? (
            <nav aria-label={t("secondaryLabel")} className="border-t border-divider pt-3">
              {list([butler])}
            </nav>
          ) : null}
          {account ? (
            <div className="min-w-0 border-t border-divider pt-3">
              <AccountMenu
                account={account}
                locale={locale}
                id="workspace-account-links"
                label={t("account")}
                settingsLabel={t("profileSettings")}
                manageLabel={mayManageAccess ? t("manageAccess") : undefined}
                signOutLabel={t("signOut")}
              />
            </div>
          ) : null}
        </aside>
        <div className="min-w-0">
          <header
            className={cx(
              s.contextHeader,
              "border-b border-divider bg-canvas group-has-[[data-focused-state]]/shell:hidden!",
            )}
          >
            <div
              className={cx(
                s.mobileBar,
                "flex min-h-18 items-center gap-3 px-gutter py-2 lg:hidden",
              )}
            >
              {toolsPage ? (
                <AgencyToolsMenu
                  href={toolsPage.href}
                  dialogId={toolsMenuId}
                  className="inline-flex size-control shrink-0 items-center justify-center rounded-control hover:bg-subtle"
                >
                  <Image src="/brand/workspace/panel-left.svg" alt="" width={20} height={20} />
                  <span className="sr-only">{t("openNavigation")}</span>
                </AgencyToolsMenu>
              ) : null}
              <a
                href={`/${locale}/today`}
                className="flex min-h-control min-w-0 flex-1 items-center"
              >
                <Image
                  src="/brand/logo-ms-realty.png"
                  alt={common("brand")}
                  width={86}
                  height={44}
                  className="h-auto shrink-0 object-contain"
                />
              </a>
              {butler ? (
                <NavLink
                  href={butler.href}
                  prefetch={false}
                  className="inline-flex min-h-control items-center gap-2 rounded-control px-3 text-dense text-text-muted hover:bg-subtle aria-[current=page]:bg-selected"
                >
                  <Image src="/brand/workspace/sparkles.svg" alt="" width={20} height={20} />
                  {t("butler")}
                </NavLink>
              ) : null}
            </div>
            <div
              className={cx(
                s.desktopBar,
                "hidden min-h-18 items-center justify-between gap-4 px-6 py-2 lg:flex",
              )}
            >
              <div className="flex min-w-0 items-center gap-3">
                <SidebarToggle
                  locale={locale}
                  returnTo={returnTo}
                  expand={t("expandNavigation")}
                  collapse={t("collapseNavigation")}
                />
                <WorkspaceContext
                  label={t("label")}
                  navigationLabel={t("breadcrumb")}
                  items={[
                    ...[...primary, ...secondary].map((item) => ({
                      href: item.href,
                      label: t(item.label),
                    })),
                    { href: `/${locale}/settings`, label: t("settings") },
                    {
                      href: `/${locale}/access/manage`,
                      label: t("manageAccess"),
                      matchPath: `/${locale}/access`,
                    },
                    {
                      href: `/${locale}/settings?section=security`,
                      label: t("personalSettings.securityNav"),
                      matchPath: `/${locale}/access/enrol`,
                    },
                  ]}
                />
              </div>
              {languageSwitcher}
            </div>
          </header>
          <main id={workspaceMainId} tabIndex={-1} className="min-w-0 outline-none">
            <Suspense fallback={null}>
              <NavigationLoading surface="staff" />
            </Suspense>
            <div data-route-content="">{children}</div>
          </main>
        </div>
        <dialog
          id={toolsMenuId}
          aria-labelledby={`${toolsMenuId}-title`}
          className="fixed inset-y-0 start-0 m-0 h-dvh max-h-none w-[min(24rem,calc(100vw-1rem))] max-w-none overflow-hidden overscroll-contain [@media(max-height:30rem)]:overflow-y-auto border-e border-divider bg-canvas p-0 text-text backdrop:bg-text/40 lg:inset-0 lg:m-auto lg:h-[min(44rem,calc(100dvh-3rem))] lg:max-h-[calc(100dvh-3rem)] lg:w-[min(42rem,calc(100vw-3rem))] lg:rounded-panel lg:border"
        >
          {toolsMenu}
        </dialog>
      </WorkspaceFrame>
    </PrivatePageGuard>
  );
}
