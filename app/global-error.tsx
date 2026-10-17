"use client";

import "./globals.css";
import { useEffect, useState } from "react";
import { ErrorRecoveryContent, type RouteErrorProps } from "@/features/shell/route-error";
import {
  defaultLocale,
  isPublicLocale,
  isStaffLocale,
  localeDirection,
  type PublicLocale,
} from "@/i18n/config";
import type { HostContext } from "@/server/config/hosts";

export default function GlobalError(props: RouteErrorProps) {
  // Root-layout failures have no route props or translation provider. Start with the source
  // locale plus English, then recover the active language from the browser's local URL.
  const [context, setContext] = useState<{
    locale: PublicLocale;
    surface: HostContext;
    path: string | null;
  }>({
    locale: defaultLocale,
    surface: "public",
    path: null,
  });
  useEffect(() => {
    const surface = window.location.hostname.startsWith("app.")
      ? "staff"
      : window.location.hostname.startsWith("my.")
        ? "client"
        : "public";
    const value = window.location.pathname.split("/")[1] ?? "";
    const locale =
      isPublicLocale(value) && (surface !== "staff" || isStaffLocale(value))
        ? value
        : defaultLocale;
    setContext({ locale, surface, path: window.location.pathname });
  }, []);
  return (
    <html lang={context.locale} dir={localeDirection(context.locale)}>
      <body>
        <main id="main" className="min-h-dvh bg-canvas">
          {context.path === null ? (
            <p lang="en" className="px-gutter pt-8">
              This page could not be shown.
            </p>
          ) : null}
          <ErrorRecoveryContent
            {...props}
            locale={context.locale}
            surface={context.surface}
            requested={context.path}
            rootFallback={context.path === null}
          />
        </main>
      </body>
    </html>
  );
}
