"use client";

import Image from "next/image";
import { createContext, type ReactNode, useContext, useState } from "react";
import { type SidebarMode, sidebarPreferenceCookie } from "./navigation-preference";

const NavigationContext = createContext<{
  mode: SidebarMode;
  setMode: (mode: SidebarMode) => void;
}>({ mode: "expanded", setMode: () => {} });

export function WorkspaceFrame({
  initialMode = "expanded",
  children,
}: {
  initialMode?: SidebarMode;
  children: ReactNode;
}) {
  const [mode, setMode] = useState(initialMode);
  return (
    <NavigationContext value={{ mode, setMode }}>
      <div
        data-sidebar={mode}
        className="group/shell min-h-dvh bg-canvas lg:grid lg:grid-cols-[15.5rem_minmax(0,1fr)] lg:data-[sidebar=compact]:grid-cols-[5rem_minmax(0,1fr)] has-[[data-focused-state]]:block"
      >
        {children}
      </div>
    </NavigationContext>
  );
}

/** Native POST persists the same preference without JavaScript; enhancement stays immediate. */
export function SidebarToggle({
  locale,
  returnTo,
  expand,
  collapse,
  showLabel = false,
}: {
  locale: string;
  returnTo: string;
  expand: string;
  collapse: string;
  showLabel?: boolean;
}) {
  const { mode, setMode } = useContext(NavigationContext);
  const next = mode === "compact" ? "expanded" : "compact";
  const label = mode === "compact" ? expand : collapse;
  return (
    <form
      method="post"
      action={`/${locale}/settings/navigation`}
      onSubmit={(event) => {
        event.preventDefault();
        setMode(next);
        // biome-ignore lint/suspicious/noDocumentCookie: a non-sensitive UI preference also persists in browsers without Cookie Store; the native POST is the no-JavaScript path.
        document.cookie = `${sidebarPreferenceCookie}=${next}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
      }}
    >
      <input type="hidden" name="mode" value={next} />
      <input type="hidden" name="returnTo" value={returnTo} />
      <button
        type="submit"
        title={label}
        aria-controls="workspace-sidebar"
        aria-expanded={mode !== "compact"}
        className={
          showLabel
            ? "inline-flex min-h-control items-center gap-3 rounded-control border border-border bg-surface px-4 py-2 text-dense font-medium text-action hover:bg-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            : "inline-flex size-control items-center justify-center rounded-control text-text-muted hover:bg-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        }
      >
        <Image src="/brand/workspace/panel-left.svg" alt="" width={20} height={20} />
        <span className={showLabel ? undefined : "sr-only"}>{label}</span>
      </button>
    </form>
  );
}
