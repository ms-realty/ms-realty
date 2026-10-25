// X02 is the same permission-filtered page directory in the drawer and its native fallback.
import Image from "next/image";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { type StaffLocale, staffLocales } from "@/i18n/config";
import { cx } from "@/ui/cx";
import { CloseIcon } from "@/ui/icons";
import { AccountIdentity, SignOutForm } from "./account";
import { LocaleSwitcher } from "./language-switcher";
import type { AgencyToolGroup } from "./navigation";
import { ToolNavigation } from "./tool-navigation";

const closeClass =
  "inline-flex size-control shrink-0 items-center justify-center rounded-control hover:bg-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";

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
  level: 1 | 2;
  closeHref?: string;
  account?: { name: string; detail?: string };
  search?: ReactNode;
}) {
  const [t, workspace, common] = await Promise.all([
    getTranslations({ locale, namespace: "tools" }),
    getTranslations({ locale, namespace: "workspace" }),
    getTranslations({ locale, namespace: "common" }),
  ]);
  const Title = level === 1 ? "h1" : "h2";
  const pages = groups.map((group) => ({
    section: group.section,
    title: t(`sections.${group.section}`),
    items: group.items.map((item) => ({
      label: item.label,
      href: item.href,
      title: t(`items.${item.label}.title`),
      description: t(`items.${item.label}.description`),
    })),
  }));
  return (
    <div
      className={cx(
        "mx-auto flex w-full max-w-[55rem] flex-col gap-4 bg-canvas p-4 sm:p-6",
        !closeHref && "h-full min-h-0 [@media(max-height:30rem)]:h-auto",
      )}
    >
      <div className="sticky top-0 z-10 flex shrink-0 items-center gap-4 bg-canvas">
        {closeHref ? (
          <Image
            src="/brand/logo-ms-realty.png"
            alt={common("brand")}
            width={86}
            height={44}
            loading="eager"
            className="h-auto shrink-0 object-contain"
          />
        ) : null}
        <Title
          id={`${idPrefix}-title`}
          className="min-w-0 flex-1 text-heading font-semibold wrap-anywhere"
        >
          {t("title")}
        </Title>
        {closeHref ? (
          <a href={closeHref} aria-label={t("close")} className={closeClass}>
            <CloseIcon />
          </a>
        ) : (
          <form method="dialog">
            <button type="submit" aria-label={t("close")} className={closeClass}>
              <CloseIcon />
            </button>
          </form>
        )}
      </div>
      {search ? <search aria-label={workspace("search")}>{search}</search> : null}
      <ToolNavigation
        groups={pages}
        locale={locale}
        idPrefix={idPrefix}
        level={level}
        scrollable={!closeHref}
        copy={{
          search: t("searchPages"),
          clear: t("clearSearch"),
          empty: t("noPages"),
          count: t.raw("pageCount"),
        }}
      />
      <div className="shrink-0 space-y-3 border-t border-divider pt-3">
        {account ? (
          <div className="flex min-w-0 items-center gap-3">
            <a
              href={`/${locale}/settings`}
              className="min-w-0 flex-1 rounded-control p-2 hover:bg-subtle focus-visible:outline-2 focus-visible:outline-focus"
            >
              <span className="sr-only">{workspace("profileSettings")}:</span>{" "}
              <AccountIdentity {...account} as="span" truncate />
            </a>
            <SignOutForm
              locale={locale}
              label={workspace("signOut")}
              className="min-h-control shrink-0 rounded-control px-3 text-dense text-text-muted hover:bg-subtle focus-visible:outline-2 focus-visible:outline-focus"
            />
          </div>
        ) : null}
        <LocaleSwitcher
          locale={locale}
          locales={staffLocales}
          label={workspace("interfaceLanguage")}
          wide
          align="start"
          side="top"
        />
      </div>
    </div>
  );
}
