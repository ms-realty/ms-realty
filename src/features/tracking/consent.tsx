"use client";
import { usePathname } from "next/navigation";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import type { PublicLocale } from "@/i18n/config";
import {
  type AnalyticsPreference,
  analyticsConsentCookie,
  analyticsConsentVersion,
  analyticsPagePath,
  validGtmContainerId,
} from "@/i18n/tracking";
import { buttonClass } from "@/ui/button-class";
import { trackingCopy } from "./copy";
import {
  discardAnalyticsDocument,
  installAnalyticsDocumentNavigation,
} from "./document-navigation";

type TrackingWindow = Window & { dataLayer?: unknown[] };
const denied = {
  analytics_storage: "denied",
  ad_storage: "denied",
  ad_user_data: "denied",
  ad_personalization: "denied",
};
export function consentCookie(preference: Exclude<AnalyticsPreference, "unset">, secure: boolean) {
  return `${analyticsConsentCookie}=${analyticsConsentVersion}.${preference}; Path=/; Max-Age=15552000; SameSite=Lax${secure ? "; Secure" : ""}`;
}

export function AnalyticsConsent({
  locale,
  initialPreference,
  containerId,
  nonce,
}: {
  locale: PublicLocale;
  initialPreference: AnalyticsPreference;
  containerId: string;
  nonce?: string;
}) {
  const titleId = useId();
  const copy = trackingCopy[locale];
  const [expanded, setExpanded] = useState(initialPreference === "unset");
  const pathname = usePathname();
  const documentPath = useRef(pathname);
  const runtimeStarted = useRef(false);
  useLayoutEffect(() => {
    if (initialPreference !== "granted" || !validGtmContainerId(containerId)) return;
    // Current public navigation uses native links/forms or captured Next links.
    // Discard the document if a future programmatic router transition bypasses
    // that boundary; removing a script cannot remove already-executed listeners.
    if (pathname !== documentPath.current) {
      discardAnalyticsDocument();
      return;
    }
    return installAnalyticsDocumentNavigation();
  }, [containerId, initialPreference, pathname]);
  useEffect(() => {
    const valid = validGtmContainerId(containerId);
    const path = analyticsPagePath(location.pathname, location.search, location.hash);
    if (
      initialPreference !== "granted" ||
      !valid ||
      !path ||
      pathname !== documentPath.current ||
      runtimeStarted.current
    )
      return;
    const target = window as TrackingWindow;
    target.dataLayer ??= [];
    const layer = target.dataLayer;
    // gtag's standard argument shape is read by the real GTM runtime.
    function command(..._values: unknown[]) {
      // biome-ignore lint/complexity/noArguments: GTM consumes the standard gtag IArguments command shape.
      layer.push(arguments);
    }
    command("consent", "default", denied);
    command("consent", "update", { ...denied, analytics_storage: "granted" });
    layer.push({
      "gtm.start": Date.now(),
      event: "gtm.js",
      page_location: `${location.origin}${path}`,
      page_path: path,
    });
    const script = document.createElement("script");
    script.src = `https://www.googletagmanager.com/gtm.js?id=${valid}`;
    script.async = true;
    script.id = "msr-consented-analytics";
    if (nonce) script.nonce = nonce;
    document.head.append(script);
    runtimeStarted.current = true;
    // A retained layout must never bootstrap another container in this document.
    // The document navigation boundary, rather than script removal, clears GTM.
  }, [containerId, initialPreference, nonce, pathname]);

  const choose = (preference: Exclude<AnalyticsPreference, "unset">) => {
    // biome-ignore lint/suspicious/noDocumentCookie: first-party preference with no visitor ID or personal data.
    document.cookie = consentCookie(preference, location.protocol === "https:");
    if (preference === "denied") {
      const target = window as TrackingWindow;
      if (target.dataLayer) {
        function command(..._values: unknown[]) {
          // biome-ignore lint/complexity/noArguments: same standard consent command consumed by the loaded GTM runtime.
          target.dataLayer?.push(arguments);
        }
        command("consent", "update", denied);
      }
      // Remove analytics cookies in this host's scope and its registrable parent. No
      // customer, session, authentication or form-recovery cookies are touched.
      const domains = [
        "",
        location.hostname,
        location.hostname.replace(/^[^.]+\.(?=[^.]+\.[^.]+$)/, ""),
      ];
      for (const part of document.cookie.split(";")) {
        const name = part.trim().split("=")[0] ?? "";
        if (!/^(_ga(?:_[A-Za-z0-9_-]+)?|_gid|_gat(?:_[A-Za-z0-9_-]+)?|_gcl_au)$/.test(name))
          continue;
        for (const domain of new Set(domains)) {
          // biome-ignore lint/suspicious/noDocumentCookie: delete only the recorded analytics cookie family after withdrawal.
          document.cookie = `${name}=; Path=/; Max-Age=0${domain ? `; Domain=${domain}` : ""}; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
        }
      }
    }
    // A new response installs a CSP matching the updated consent, and discards any
    // already-executed third-party runtime after withdrawal.
    location.reload();
  };
  return (
    <aside
      aria-labelledby={expanded ? titleId : undefined}
      className="border-t border-divider bg-surface"
    >
      <div className="mx-auto flex max-w-page flex-col gap-3 px-gutter py-5 lg:px-gutter-wide">
        {expanded ? (
          <>
            <h2 id={titleId} className="text-compact font-semibold">
              {copy.title}
            </h2>
            <p className="max-w-reading text-compact text-text-muted">{copy.description}</p>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                className={buttonClass("secondary")}
                onClick={() => choose("denied")}
              >
                {initialPreference === "granted" ? copy.withdraw : copy.necessary}
              </button>
              <button
                type="button"
                className={buttonClass("secondary")}
                onClick={() => choose("granted")}
              >
                {copy.allow}
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="text-compact text-text-muted">
              {initialPreference === "granted" ? copy.enabled : copy.disabled}
            </p>
            <button
              type="button"
              className={buttonClass("tertiary", "self-start")}
              aria-expanded={expanded}
              onClick={() => setExpanded(true)}
            >
              {copy.settings}
            </button>
          </>
        )}
      </div>
    </aside>
  );
}
