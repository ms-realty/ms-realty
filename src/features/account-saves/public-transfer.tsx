"use client";
import { useRef, useState } from "react";
import { buttonClass } from "@/ui/button-class";
import { accountSavesCopy } from "./copy";
import { prepareAccountSaves } from "./public-actions";

type State =
  | { kind: "ready"; signature: string; nonce: string; target: string }
  | { kind: "pending" | "error"; signature: string }
  | null;
/** Explicit selected public IDs only. Local selection is never cleared by this handoff. */
export function AccountSaveTransfer({
  locale,
  references,
}: {
  locale: string;
  references: readonly string[];
}) {
  const c = accountSavesCopy(locale),
    signature = JSON.stringify([locale, references]),
    active = useRef(signature),
    key = useRef<{ signature: string; id: string } | null>(null),
    flight = useRef<string | null>(null);
  active.current = signature;
  const [state, setState] = useState<State>(null),
    current = state?.signature === signature ? state : null;
  if (current?.kind === "ready")
    return (
      <form method="post" action={current.target} className="space-y-3">
        <input type="hidden" name="nonce" value={current.nonce} />
        <input type="hidden" name="target" value={current.target} />
        <p>{c.hint}</p>
        <button className={buttonClass("primary")} type="submit">
          {c.continueLabel}
        </button>
      </form>
    );
  return (
    <div className="space-y-3">
      <button
        type="button"
        className={buttonClass("secondary")}
        disabled={current?.kind === "pending" || references.length === 0 || references.length > 100}
        onClick={async () => {
          if (flight.current === signature) return;
          flight.current = signature;
          if (key.current?.signature !== signature)
            key.current = { signature, id: crypto.randomUUID() };
          const operationId = key.current.id;
          setState({ kind: "pending", signature });
          const result = await prepareAccountSaves(locale, references, operationId).catch(() => ({
            error: true as const,
          }));
          if (flight.current === signature) flight.current = null;
          if (active.current !== signature) return;
          setState(
            "error" in result
              ? { kind: "error", signature }
              : { kind: "ready", signature, ...result },
          );
        }}
      >
        {c.bring}
      </button>
      {current?.kind === "error" ? <p role="status">{c.error}</p> : null}
    </div>
  );
}
