let protectedUntil = 0;

function guardUnload(event: BeforeUnloadEvent) {
  if (protectedUntil <= Date.now()) return;
  event.preventDefault();
  event.returnValue = "";
}

/** Memory survives SPA transitions; an actual document unload still needs a leave choice. */
export function protectInquiryMemoryOnUnload(expiresAt: number) {
  if (typeof window === "undefined") return;
  if (expiresAt > Date.now() && !protectedUntil)
    window.addEventListener("beforeunload", guardUnload);
  else if (!expiresAt && protectedUntil) window.removeEventListener("beforeunload", guardUnload);
  protectedUntil = expiresAt;
}
