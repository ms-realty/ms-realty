"use client";

import { useRouter } from "next/navigation";
import { type ReactNode, useCallback, useEffect, useRef, useState, useTransition } from "react";
import { privatePageRecheckAfterMs } from "@/config/tenant";
// AT39: a private page restored from the back/forward cache, or hidden for longer than the
// tenant's threshold, stays concealed until the server confirms the session. A shorter absence
// (a broker checking a messenger) is rechecked in the background without concealing; the page is
// concealed only if that check says the session is gone. The subtree stays mounted so permitted
// client drafts survive.
import { privateAccessCopy } from "@/i18n/private-access-copy";
import { privateAccessState } from "./private-access-action";
import { reloadPage } from "./reload";

type Check = "active" | "signed_out" | "error";

async function check(): Promise<Check> {
  try {
    return await privateAccessState();
  } catch {
    // A failed request proves nothing about the session either way.
    return "error";
  }
}

export function PrivatePageGuard({
  children,
  locale = "bg",
  recheckAfterMs = privatePageRecheckAfterMs,
  verification,
}: {
  children: ReactNode;
  locale?: string;
  /** How long a hidden page may stay away before it is concealed until rechecked. */
  recheckAfterMs?: number;
  /** Fresh value from each authorized server render. */
  verification: string;
}) {
  const router = useRouter();
  const copy = privateAccessCopy(locale);
  const restoration = useRef<{ focus: HTMLElement | null; x: number; y: number } | null>(null);
  const hiddenAt = useRef<number | null>(null);
  const content = useRef<HTMLDivElement>(null);
  const requested = useRef<string | null>(null);
  const [concealed, setConcealed] = useState(false);
  const [pending, startTransition] = useTransition();
  const conceal = useCallback(() => {
    if (!restoration.current) {
      const focused = document.activeElement;
      restoration.current = {
        focus:
          focused instanceof HTMLElement && content.current?.contains(focused) ? focused : null,
        x: window.scrollX,
        y: window.scrollY,
      };
    }
    // Hide synchronously before the browser can paint the returned private tab.
    if (content.current) {
      content.current.hidden = true;
      content.current.inert = true;
      content.current.className = "";
    }
    setConcealed(true);
  }, []);
  /** Keep the previous private view concealed until the authorized page is refreshed. */
  const revalidate = useCallback(() => {
    conceal();
    requested.current = verification;
    startTransition(() => router.refresh());
  }, [conceal, router, verification]);
  /** Short absence: keep the page, check in the background, conceal only on a lost session. */
  const recheckInBackground = useCallback(async () => {
    if ((await check()) === "signed_out") {
      conceal();
      reloadPage();
    }
  }, [conceal]);
  useEffect(() => {
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) revalidate();
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        hiddenAt.current = Date.now();
        return;
      }
      if (hiddenAt.current === null) return;
      const away = Date.now() - hiddenAt.current;
      hiddenAt.current = null;
      if (away >= recheckAfterMs) revalidate();
      else void recheckInBackground();
    };
    window.addEventListener("pageshow", onPageShow);
    document.addEventListener("visibilitychange", onVisibility);
    const element = content.current;
    if (element) element.dataset.privateReady = "true";
    return () => {
      if (element) delete element.dataset.privateReady;
      window.removeEventListener("pageshow", onPageShow);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [revalidate, recheckInBackground, recheckAfterMs]);
  useEffect(() => {
    // A completed transition can also mean a failed request. Only a new server render
    // proves which private view may be shown after a session change.
    if (
      !pending &&
      requested.current !== null &&
      requested.current !== verification &&
      document.visibilityState === "visible"
    ) {
      requested.current = null;
      setConcealed(false);
    }
  }, [pending, verification]);
  const hidden = concealed || pending;
  useEffect(() => {
    if (hidden || !restoration.current) return;
    const saved = restoration.current;
    restoration.current = null;
    if (saved.focus?.isConnected) saved.focus.focus({ preventScroll: true });
    window.scrollTo(saved.x, saved.y);
  }, [hidden]);
  return (
    <>
      {hidden ? (
        <div className="px-gutter py-6 text-text-muted">
          <p role="status">{copy.checking}</p>
          {!pending ? (
            <button type="button" className="mt-3 min-h-control underline" onClick={reloadPage}>
              {copy.retry}
            </button>
          ) : null}
        </div>
      ) : null}
      <div
        ref={content}
        data-private-content=""
        hidden={hidden}
        inert={hidden}
        className={hidden ? undefined : "contents"}
      >
        {children}
      </div>
    </>
  );
}
