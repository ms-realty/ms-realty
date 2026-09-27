"use client";

// AT39: restored/hidden private pages stay concealed during a server reauthorization. The
// subtree remains mounted so permitted client drafts survive a successful refresh.
import { useRouter } from "next/navigation";
import { type ReactNode, useCallback, useEffect, useRef, useState, useTransition } from "react";

const labels: Record<string, string> = {
  bg: "Проверка на достъпа…",
  en: "Checking access…",
  ru: "Проверка доступа…",
  de: "Zugriff wird geprüft…",
  nl: "Toegang controleren…",
  el: "Έλεγχος πρόσβασης…",
  he: "בודקים את הגישה…",
};
const retryLabels: Record<string, string> = {
  bg: "Проверете достъпа отново",
  en: "Check access again",
  ru: "Проверить доступ снова",
  de: "Zugriff erneut prüfen",
  nl: "Toegang opnieuw controleren",
  el: "Ελέγξτε ξανά την πρόσβαση",
  he: "בדיקת הגישה שוב",
};

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
  const content = useRef<HTMLDivElement>(null);
  const requested = useRef<string | null>(null);
  const [concealed, setConcealed] = useState(false);
  const [pending, startTransition] = useTransition();
  const conceal = useCallback(() => {
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
      if (document.visibilityState === "visible") revalidate();
      else conceal();
    };
    window.addEventListener("pageshow", onPageShow);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
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
  return (
    <>
      {hidden ? (
        <div className="px-gutter py-6 text-text-muted">
          <p role="status">{labels[locale] ?? labels.en}</p>
          {!pending ? (
            <button type="button" className="mt-3 min-h-control underline" onClick={revalidate}>
              {retryLabels[locale] ?? retryLabels.en}
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
