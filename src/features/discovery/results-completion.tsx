"use client";

import { useEffect, useState } from "react";
import type { PublicLocale } from "@/i18n/config";
import { announce } from "@/ui/announce";
import { Notice } from "@/ui/notice";
import { filterUrl, readFilters } from "./query";

const pendingKey = "ms-realty.search-completion.v1";
export function searchCompletionTarget(locale: PublicLocale, href: string) {
  const url = new URL(href, window.location.href);
  if (url.origin !== window.location.origin || url.pathname !== `/${locale}/properties`)
    return null;
  const params = Object.fromEntries(
    [...new Set(url.searchParams.keys())].map((key) => [
      key,
      url.searchParams.getAll(key).length > 1
        ? url.searchParams.getAll(key)
        : (url.searchParams.get(key) ?? ""),
    ]),
  );
  return filterUrl(locale, readFilters(params), url.searchParams.get("cursor") || undefined);
}

/** M134: announce a completed user-requested search once; direct entry keeps normal focus. */
export function ResultsCompletion({
  locale,
  identity,
  message,
  success,
  offlineTitle,
}: {
  locale: PublicLocale;
  identity: string;
  message: string;
  success: boolean;
  offlineTitle: string;
}) {
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  // Identity is the current committed query/page, not an old asynchronous visit.
  // biome-ignore lint/correctness/useExhaustiveDependencies: identity explicitly scopes each completed result visit.
  useEffect(() => {
    const current = searchCompletionTarget(locale, window.location.href);
    let pending: string | null = null;
    try {
      pending = sessionStorage.getItem(pendingKey);
      sessionStorage.removeItem(pendingKey);
    } catch {
      /* Native navigation remains sufficient when storage is unavailable. */
    }
    if (pending && pending === current) {
      const target = document.getElementById(success ? "results-heading" : "discovery-title");
      target?.focus();
      announce(message);
    } else if (/^#property-result-MS-\d{5,}$/.test(window.location.hash)) {
      (
        document.getElementById(window.location.hash.slice(1)) ??
        document.getElementById("results-heading")
      )?.focus({ preventScroll: false });
    }
    const remember = (href: string) => {
      const target = searchCompletionTarget(locale, href);
      if (!target) return;
      try {
        sessionStorage.setItem(pendingKey, target);
      } catch {
        /* Do not block an ordinary GET. */
      }
    };
    const click = (event: MouseEvent) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
        return;
      const link = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (link instanceof HTMLAnchorElement && !link.hash && link.target !== "_blank")
        remember(link.href);
      else if (
        link instanceof HTMLAnchorElement &&
        link.pathname === `/${locale}/properties` &&
        link.search !== window.location.search
      )
        remember(link.href);
    };
    const submit = (event: SubmitEvent) => {
      const form = event.target;
      if (!(form instanceof HTMLFormElement) || form.method.toLowerCase() !== "get") return;
      const target = new URL(form.action, window.location.href);
      target.search = new URLSearchParams(
        [...new FormData(form)].map(([key, value]) => [key, String(value)]),
      ).toString();
      remember(target.href);
    };
    document.addEventListener("click", click, true);
    document.addEventListener("submit", submit, true);
    return () => {
      document.removeEventListener("click", click, true);
      document.removeEventListener("submit", submit, true);
    };
  }, [identity, locale, message, success]);
  return offline ? <Notice tone="warning" title={offlineTitle} /> : null;
}
