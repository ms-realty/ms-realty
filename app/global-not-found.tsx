import "./globals.css";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { connection } from "next/server";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { NotFoundContent } from "@/features/shell/not-found-content";
import { PublicShell } from "@/features/shell/public-shell";
import { WorkspaceShell } from "@/features/shell/workspace-shell";
import {
  appSurfaceHeader,
  localeDirection,
  type PublicLocale,
  type StaffLocale,
} from "@/i18n/config";
import { requestLocale } from "@/i18n/request-locale";
import { privateRobots } from "@/i18n/seo";
import { currentStaffLocale } from "@/i18n/staff-locale";
import { CspNonceMeta } from "@/ui/csp-nonce-meta";
import { fontVariables } from "@/ui/fonts";
import { LocaleProvider } from "@/ui/locale-provider";

// Every unknown URL lands here (app/[locale] only matches routable locales and no surface has
// a catch-all). Unlike a notFound() thrown during rendering, this is served as a complete
// server-rendered document: lang/dir, the surface shell and the localized message (§17.1).

type Surface =
  | { readonly workspace: true; readonly locale: StaffLocale }
  | { readonly workspace: false; readonly locale: PublicLocale };

async function notFoundSurface(): Promise<Surface> {
  return (await headers()).get(appSurfaceHeader) === "workspace"
    ? { workspace: true, locale: await currentStaffLocale() }
    : { workspace: false, locale: await requestLocale() };
}

export async function generateMetadata(): Promise<Metadata> {
  const { locale } = await notFoundSurface();
  const t = await getTranslations({ locale, namespace: "errors.notFound" });
  return { title: t("title"), robots: privateRobots, icons: { icon: "/brand/favicon.svg" } };
}

export default async function GlobalNotFound() {
  // Dynamic rendering is required for the per-request CSP nonce.
  await connection();
  const surface = await notFoundSurface();
  const { locale } = surface;
  setRequestLocale(locale);
  return (
    <html
      lang={locale}
      dir={surface.workspace ? "ltr" : localeDirection(locale)}
      className={fontVariables}
    >
      <body>
        <CspNonceMeta />
        <LocaleProvider locale={locale}>
          {surface.workspace ? (
            <WorkspaceShell locale={surface.locale}>
              <NotFoundContent locale={locale} homeHref="/workspace" />
            </WorkspaceShell>
          ) : (
            <PublicShell locale={surface.locale}>
              <NotFoundContent locale={locale} homeHref={`/${locale}`} />
            </PublicShell>
          )}
        </LocaleProvider>
      </body>
    </html>
  );
}
