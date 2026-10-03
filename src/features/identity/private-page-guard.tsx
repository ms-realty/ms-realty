"use client";

// Private pages re-authorize before showing anything again (§12, AT39): a page restored from
// the back/forward cache reloads from the server, and returning to a hidden tab re-renders
// the server components, whose guards redirect a revoked or expired session.
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export function PrivatePageGuard() {
  const router = useRouter();
  useEffect(() => {
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) window.location.reload();
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    window.addEventListener("pageshow", onPageShow);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pageshow", onPageShow);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [router]);
  return null;
}
