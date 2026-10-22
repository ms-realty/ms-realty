"use client";

import { useParams, usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { defaultLocale, isPublicLocale, isStaffLocale, type PublicLocale } from "@/i18n/config";
import type { HostContext } from "@/server/config/hosts";
import { buttonClass } from "@/ui/button-class";
import { EmptyState } from "@/ui/empty-state";
import { navigationErrorEvent } from "./navigation-loading-state";
import { errorReference } from "./recovery";
import { recoveryCopy } from "./recovery-copy";
import { RecoveryNavigation } from "./recovery-navigation";

export type RouteErrorProps = { error: unknown; retry: () => void; reset?: () => void };

export function ErrorRecoveryContent({
  error,
  retry,
  locale,
  surface,
  requested,
  rootFallback,
}: RouteErrorProps & {
  locale: PublicLocale;
  surface: HostContext;
  requested: string | null;
  rootFallback?: boolean;
}) {
  const copy = recoveryCopy(locale);
  const container = useRef<HTMLDivElement>(null);
  const reference = errorReference(error);
  useEffect(() => {
    window.dispatchEvent(new Event(navigationErrorEvent));
    let mounted = true;
    queueMicrotask(() => {
      if (mounted) container.current?.querySelector("h1")?.focus();
    });
    return () => {
      mounted = false;
    };
  }, []);
  return (
    <div ref={container} className="flex flex-col gap-5 px-gutter py-8 sm:px-gutter-wide">
      <title>{copy.generic.title}</title>
      <EmptyState
        kind="failed"
        title={copy.generic.title}
        headingLevel={1}
        action={
          <button type="button" className={buttonClass("primary")} onClick={retry}>
            {copy.generic.retry}
          </button>
        }
        reference={reference ? copy.generic.reference.replace("{reference}", reference) : undefined}
      >
        {/* Visitors and clients call the agency; staff hand the reference to their manager. */}
        <p>{surface === "staff" ? copy.generic.staffBody : copy.generic.body}</p>
        <p className="mt-3">{copy.recovery.actionOutcome}</p>
      </EmptyState>
      <RecoveryNavigation
        locale={locale}
        surface={surface}
        requested={requested}
        rootFallback={rootFallback}
      />
    </div>
  );
}

function RouteError(props: RouteErrorProps & { surface: HostContext; standalone?: boolean }) {
  const params = useParams<{ locale?: string }>();
  const requested = usePathname();
  const value = params?.locale;
  const locale =
    value && isPublicLocale(value) && (props.surface !== "staff" || isStaffLocale(value))
      ? value
      : defaultLocale;
  const content = <ErrorRecoveryContent {...props} locale={locale} requested={requested} />;
  return props.standalone ? (
    <main id="main" className="min-h-dvh bg-canvas">
      {content}
    </main>
  ) : (
    content
  );
}

export const PublicRouteError = (props: RouteErrorProps) => (
  <RouteError {...props} surface="public" />
);
export const ClientRouteError = (props: RouteErrorProps) => (
  <RouteError {...props} surface="client" />
);
export const StaffRouteError = (props: RouteErrorProps) => (
  <RouteError {...props} surface="staff" />
);
export const PublicShellError = (props: RouteErrorProps) => (
  <RouteError {...props} surface="public" standalone />
);
export const ClientShellError = (props: RouteErrorProps) => (
  <RouteError {...props} surface="client" standalone />
);
export const StaffShellError = (props: RouteErrorProps) => (
  <RouteError {...props} surface="staff" standalone />
);
