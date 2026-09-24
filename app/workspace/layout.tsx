import "../globals.css";
import type { Metadata } from "next";
import { connection } from "next/server";
import { setRequestLocale } from "next-intl/server";
import { WorkspaceShell } from "@/features/shell/workspace-shell";
import { privateRobots } from "@/i18n/seo";
import { currentStaffLocale } from "@/i18n/staff-locale";
import { CspNonceMeta } from "@/ui/csp-nonce-meta";
import { fontVariables } from "@/ui/fonts";
import { LocaleProvider } from "@/ui/locale-provider";

// Root layout of the staff workspace: lang comes from the staff preference, not the URL.

export const metadata: Metadata = {
  title: { template: "%s · MS Realty workspace", default: "MS Realty workspace" },
  icons: { icon: "/brand/favicon.svg" },
  robots: privateRobots,
};

export default async function WorkspaceLayout({ children }: LayoutProps<"/workspace">) {
  // Dynamic rendering is required for the per-request CSP nonce, 404s included.
  await connection();
  const locale = await currentStaffLocale();
  setRequestLocale(locale);
  return (
    <html lang={locale} dir="ltr" className={fontVariables}>
      <body>
        <CspNonceMeta />
        <LocaleProvider locale={locale}>
          <WorkspaceShell locale={locale}>{children}</WorkspaceShell>
        </LocaleProvider>
      </body>
    </html>
  );
}
