"use client";

import { useRef, useState, useSyncExternalStore } from "react";
import { buttonClass } from "@/ui/button-class";

const noSubscription = () => () => {};

export type CopyLinkLabels = { address: string; copy: string; copied: string; failed: string };

/**
 * The address is always readable, selectable text; the button is a convenience that appears
 * once scripts run, so nothing here is a dead control without JavaScript. The link is public
 * facts only, but it is still a capability: it never leaves this page except by an action.
 */
export function CopyLink({ url, labels }: { url: string; labels: CopyLinkLabels }) {
  const enhanced = useSyncExternalStore(
    noSubscription,
    () => true,
    () => false,
  );
  const [result, setResult] = useState<"idle" | "copied" | "failed">("idle");
  const address = useRef<HTMLElement>(null);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setResult("copied");
    } catch {
      // Denied or missing clipboard (plain HTTP, embedded view): select the text so a
      // keyboard copy works, and say so.
      const selection = window.getSelection();
      if (address.current && selection) selection.selectAllChildren(address.current);
      setResult("failed");
    }
  }

  return (
    <div className="min-w-0 space-y-2">
      <p className="text-caption text-text-muted">{labels.address}</p>
      <code
        ref={address}
        dir="ltr"
        className="block select-all break-all rounded-control bg-subtle p-3 text-compact"
      >
        {url}
      </code>
      <div className="flex flex-wrap items-center gap-3">
        {enhanced ? (
          <button type="button" className={buttonClass("secondary")} onClick={copy}>
            {labels.copy}
          </button>
        ) : null}
        <p role="status" className="text-compact text-text-muted">
          {result === "copied" ? labels.copied : result === "failed" ? labels.failed : ""}
        </p>
      </div>
    </div>
  );
}
