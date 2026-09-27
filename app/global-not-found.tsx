import "./globals.css";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { connection } from "next/server";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { ReactNode } from "react";
import { JourneyShell } from "@/features/shell/journey-shell";
import { NotFoundContent } from "@/features/shell/not-found-content";
import { PublicShell } from "@/features/shell/public-shell";
import { WorkspaceShell } from "@/features/shell/workspace-shell";
import {
  appSurfaceHeader,
  defaultStaffLocale,
  isStaffLocale,
  localeDirection,
  type PublicLocale,
} from "@/i18n/config";
import { requestLocale } from "@/i18n/request-locale";
import { privateRobots } from "@/i18n/seo";
import { type HostContext, homePaths } from "@/server/config/hosts";
import { CspNonceMeta } from "@/ui/csp-nonce-meta";
import { fontVariables } from "@/ui/fonts";
import { LocaleProvider } from "@/ui/locale-provider";

// Every unknown URL lands here: proxy.ts rewrites a path whose first segment is not a locale
// of its host to Next's not-found route, and an unknown path under a locale matches no route
// of app/{public,client,staff}/[locale]. Unlike a notFound() thrown during rendering, this is
// served as a complete server-rendered document: lang/dir, the host's shell and the localized
// message (§11.4).

async function notFoundSurface(): Promise<{ context: HostContext; locale: PublicLocale }> {
  const surface = (await headers()).get(appSurfaceHeader);
  const context: HostContext = surface === "client" || surface === "staff" ? surface : "public";
  const locale = await requestLocale();
  if (context === "staff" && !isStaffLocale(locale)) return { context, locale: defaultStaffLocale };
  return { context, locale };
}

export async function generateMetadata(): Promise<Metadata> {
  const { locale } = await notFoundSurface();
  const t = await getTranslations({ locale, namespace: "errors.notFound" });
  return { title: t("title"), robots: privateRobots, icons: { icon: "/brand/favicon.svg" } };
}

export default async function GlobalNotFound() {
  // Dynamic rendering is required for the per-request CSP nonce.
  await connection();
  const { context, locale } = await notFoundSurface();
  setRequestLocale(locale);
  const content = <NotFoundContent locale={locale} homeHref={`/${locale}${homePaths[context]}`} />;
  let page: ReactNode;
  if (context === "staff" && isStaffLocale(locale)) {
    page = <WorkspaceShell locale={locale}>{content}</WorkspaceShell>;
  } else if (context === "client") {
    page = <JourneyShell locale={locale}>{content}</JourneyShell>;
  } else {
    page = <PublicShell locale={locale}>{content}</PublicShell>;
  }
  return (
    <html lang={locale} dir={localeDirection(locale)} className={fontVariables}>
      <body>
        <CspNonceMeta />
        <LocaleProvider locale={locale}>{page}</LocaleProvider>
      </body>
    </html>
  );
}
