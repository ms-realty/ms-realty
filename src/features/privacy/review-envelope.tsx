"use client";
// C-11: a privacy review keeps the operation and the version it was reviewed against. The
// private-page guard refreshes the server render when the tab becomes visible again; a fresh
// envelope there would let a dirty review submit against a version its operator never saw.
// Pinned here, a newer version answers with a conflict and nothing is written.
//
// The review is a native form: a conflict, a step-up or a passive reauthorization reloads the
// page. Its text and choices are kept in this tab for this sign-in session and record as they
// are typed, and come back with a notice to check them against the current version. Checked
// confirmations never come back: after any reload a person confirms again. A review whose
// operation the server recorded (even if its answer was lost) is cleared. If this browser
// cannot keep anything, the form says so before the work is at risk.
import { useEffect, useRef, useState } from "react";

const envelope = ["intent", "operationId", "id", "expectedVersion"];

export function ReviewEnvelope(props: {
  id: string;
  version: number;
  operationId: string;
  /** The sign-in session; another session never inherits the review. */
  sessionKey: string;
  /** Operation keys of this staff member's recently recorded privacy reviews. */
  recorded: string[];
  restoredLabel: string;
  unkeptLabel: string;
}) {
  const [review] = useState(props);
  const anchor = useRef<HTMLInputElement>(null);
  const [notice, setNotice] = useState<"restored" | "unkept" | null>(null);
  useEffect(() => {
    const form = anchor.current?.form;
    if (!form) return;
    const key = `privacy-review:${review.sessionKey}:${review.id}`;
    let storage: Storage | null = null;
    try {
      storage = window.sessionStorage;
      storage.setItem(`${key}:probe`, "1");
      storage.removeItem(`${key}:probe`);
    } catch {
      storage = null;
      setNotice("unkept");
    }
    if (storage)
      try {
        const saved = JSON.parse(storage.getItem(key) ?? "null") as {
          operationId: string;
          values: [string, string][];
        } | null;
        if (saved && review.recorded.includes(saved.operationId)) storage.removeItem(key);
        else if (saved?.values.length) {
          for (const element of Array.from(form.elements)) {
            if (
              !(
                element instanceof HTMLSelectElement ||
                element instanceof HTMLTextAreaElement ||
                (element instanceof HTMLInputElement &&
                  element.type !== "checkbox" &&
                  element.type !== "hidden")
              )
            )
              continue;
            const values = saved.values.filter(([name]) => name === element.name);
            const last = values[values.length - 1];
            if (last) element.value = last[1];
          }
          setNotice("restored");
        }
      } catch {}
    const keep = () => {
      try {
        storage?.setItem(
          key,
          JSON.stringify({
            operationId: review.operationId,
            // Confirmations are never kept: they belong to the version a person saw.
            values: [...new FormData(form)]
              .filter(([name]) => !envelope.includes(name))
              .filter(([name]) => {
                const field = form.elements.namedItem(name);
                return !(field instanceof HTMLInputElement && field.type === "checkbox");
              })
              .map(([name, value]) => [name, String(value)]),
          }),
        );
      } catch {
        setNotice("unkept");
      }
    };
    form.addEventListener("input", keep);
    form.addEventListener("change", keep);
    form.addEventListener("submit", keep);
    return () => {
      form.removeEventListener("input", keep);
      form.removeEventListener("change", keep);
      form.removeEventListener("submit", keep);
    };
  }, [review]);
  return (
    <>
      <input ref={anchor} type="hidden" name="intent" value="review" />
      <input type="hidden" name="operationId" value={review.operationId} />
      <input type="hidden" name="id" value={review.id} />
      <input type="hidden" name="expectedVersion" value={review.version} />
      {notice ? (
        <p role="status" className="rounded-control bg-warning-soft p-3 text-dense">
          {notice === "restored" ? review.restoredLabel : review.unkeptLabel}
        </p>
      ) : null}
    </>
  );
}
