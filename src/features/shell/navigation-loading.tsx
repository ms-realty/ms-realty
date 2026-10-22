"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { HostContext } from "@/server/config/hosts";
import {
  navigationErrorEvent,
  navigationLoadingTarget,
  navigationStartEvent,
} from "./navigation-loading-state";
import { RouteLoading } from "./route-loading";

type Pending = NonNullable<ReturnType<typeof navigationLoadingTarget>> & { from: string };
const locationKey = (pathname: string, search: string) =>
  `${pathname}?${new URLSearchParams(search)}`;

/**
 * Progressive navigation feedback. Streaming a server Suspense fallback would hide the
 * completed HTML behind a reveal script with JS disabled and could turn later 404s into 200s.
 * This boundary changes only the old page while a GET navigation is pending.
 */
export function NavigationLoading({ surface }: { surface: HostContext }) {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const [pending, setPending] = useState<Pending | null>(null);
  const container = useRef<HTMLDivElement>(null);
  const active = pending?.from === locationKey(pathname, search) ? pending : null;

  useEffect(() => {
    // A completed transition must stay completed when browser history revisits its source.
    setPending((current) => (current?.from === locationKey(pathname, search) ? current : null));
  }, [pathname, search]);

  useEffect(() => {
    function start(href: string) {
      const target = navigationLoadingTarget(surface, href, window.location.href);
      if (target)
        setPending({
          ...target,
          from: locationKey(window.location.pathname, window.location.search),
        });
    }
    function nativeClick(event: MouseEvent) {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      const link = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (
        !(link instanceof HTMLAnchorElement) ||
        link.hasAttribute("download") ||
        (link.target && link.target !== "_self")
      )
        return;
      start(link.href);
    }
    function nativeSubmit(event: SubmitEvent) {
      const form = event.target;
      if (event.defaultPrevented || !(form instanceof HTMLFormElement) || form.method !== "get")
        return;
      if (form.target && form.target !== "_self") return;
      const action = new URL(form.action, window.location.href);
      const fields = new FormData(form, event.submitter);
      action.search = new URLSearchParams(
        [...fields].filter((field): field is [string, string] => typeof field[1] === "string"),
      ).toString();
      start(action.href);
    }
    function clientNavigation(event: Event) {
      if (event instanceof CustomEvent && typeof event.detail?.href === "string")
        start(event.detail.href);
    }
    const clear = () => setPending(null);
    // A page that asks before leaving (unsaved work) may keep the person here. The check runs
    // once every listener has answered, and after the browser's prompt when there is one.
    function beforeUnload(event: BeforeUnloadEvent) {
      setTimeout(() => {
        if (event.defaultPrevented) clear();
      });
    }
    // Escape also stops a document navigation in the browser: show the page again.
    function key(event: KeyboardEvent) {
      if (event.key === "Escape") clear();
    }
    document.addEventListener("click", nativeClick);
    document.addEventListener("submit", nativeSubmit);
    window.addEventListener(navigationStartEvent, clientNavigation);
    window.addEventListener(navigationErrorEvent, clear);
    window.addEventListener("pageshow", clear);
    window.addEventListener("beforeunload", beforeUnload);
    window.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("click", nativeClick);
      document.removeEventListener("submit", nativeSubmit);
      window.removeEventListener(navigationStartEvent, clientNavigation);
      window.removeEventListener(navigationErrorEvent, clear);
      window.removeEventListener("pageshow", clear);
      window.removeEventListener("beforeunload", beforeUnload);
      window.removeEventListener("keydown", key);
    };
  }, [surface]);

  useLayoutEffect(() => {
    if (!active) return;
    const content = container.current?.parentElement?.querySelector<HTMLElement>(
      ":scope > [data-route-content]",
    );
    if (!content) return;
    const hidden = content.hidden;
    const inert = content.inert;
    content.hidden = true;
    content.inert = true;
    return () => {
      content.hidden = hidden;
      content.inert = inert;
    };
  }, [active]);

  return active ? (
    <div ref={container} data-navigation-loading="">
      <RouteLoading locale={active.locale} kind={active.kind} shape={active.shape} />
    </div>
  ) : null;
}
