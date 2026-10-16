"use client";

import { useRouter } from "next/navigation";
import { type ReactNode, useCallback, useEffect, useRef, useState, useTransition } from "react";
// AT39: restored/hidden private pages stay concealed during a server reauthorization. The
// subtree remains mounted so permitted client drafts survive a successful refresh.
import { privateAccessCopy } from "@/i18n/private-access-copy";

export function PrivatePageGuard({
  children,
  locale = "bg",
  verification,
}: {
  children: ReactNode;
  locale?: string;
  /** A fresh value from each authorized server render, never a client-generated value. */
  verification: string;
}) {
  const router = useRouter();
  const copy = privateAccessCopy(locale);
  const restoration = useRef<{ focus: HTMLElement | null; x: number; y: number } | null>(null);
  const wasHidden = useRef(false);
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
  const revalidate = useCallback(() => {
    conceal();
    requested.current = verification;
    startTransition(() => router.refresh());
  }, [conceal, router, verification]);
  useEffect(() => {
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) revalidate();
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        wasHidden.current = true;
        conceal();
      } else if (wasHidden.current) {
        wasHidden.current = false;
        revalidate();
      }
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
  }, [conceal, revalidate]);
  useEffect(() => {
    // A failed refresh also ends a transition. Only a new, authorized server render
    // may reveal the mounted subtree; network failures must leave it concealed.
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
            <button type="button" className="mt-3 min-h-control underline" onClick={revalidate}>
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
