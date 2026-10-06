"use client";
// C-11: a privacy review keeps the operation and the version it was reviewed against. The
// private-page guard refreshes the server render when the tab becomes visible again; a fresh
// envelope there would let a dirty review submit against a version its operator never saw.
// Pinned here, a newer version answers with a conflict and nothing is written.
//
// The review is native: a conflict or a step-up reloads the page. What was about to be sent is
// kept in this tab for this staff member and record only, and comes back with a notice so it is
// checked against the current version before it is recorded; its receipt clears it. The section
// is keyed by staff member, so another member never inherits the draft or its operation.
import { useEffect, useRef, useState } from "react";

const envelope = ["intent", "operationId", "id", "expectedVersion"];
const lastSent = "privacy-review:last";

export function ReviewEnvelope(props: {
  id: string;
  version: number;
  operationId: string;
  actorId: string;
  restoredLabel: string;
}) {
  const [review] = useState(props);
  const anchor = useRef<HTMLInputElement>(null);
  const [restored, setRestored] = useState(false);
  useEffect(() => {
    const form = anchor.current?.form;
    if (!form) return;
    const key = `privacy-review:${review.actorId}:${review.id}`;
    let storage: Storage | null = null;
    try {
      storage = window.sessionStorage;
      const saved = JSON.parse(storage.getItem(key) ?? "null") as {
        operationId: string;
        values: [string, string][];
      } | null;
      // A receipt answers the last review this tab sent; that one is recorded, not unsent.
      const receipt = new URL(window.location.href).searchParams.has("receipt");
      if (saved && receipt && storage.getItem(lastSent) === key) {
        storage.removeItem(key);
        storage.removeItem(lastSent);
      } else if (saved) {
        for (const element of Array.from(form.elements)) {
          if (
            !(
              element instanceof HTMLInputElement ||
              element instanceof HTMLSelectElement ||
              element instanceof HTMLTextAreaElement
            )
          )
            continue;
          if (!element.name || envelope.includes(element.name)) continue;
          const values = saved.values.filter(([name]) => name === element.name).map(([, v]) => v);
          if (element instanceof HTMLInputElement && element.type === "checkbox")
            element.checked = values.includes(element.value);
          else if (values.length) element.value = values[values.length - 1] ?? "";
        }
        setRestored(true);
      }
    } catch {}
    const save = () => {
      try {
        storage?.setItem(lastSent, key);
        storage?.setItem(
          key,
          JSON.stringify({
            operationId: review.operationId,
            values: [...new FormData(form)]
              .filter(([name]) => !envelope.includes(name))
              .map(([name, value]) => [name, String(value)]),
          }),
        );
      } catch {}
    };
    form.addEventListener("submit", save);
    return () => form.removeEventListener("submit", save);
  }, [review]);
  return (
    <>
      <input ref={anchor} type="hidden" name="intent" value="review" />
      <input type="hidden" name="operationId" value={review.operationId} />
      <input type="hidden" name="id" value={review.id} />
      <input type="hidden" name="expectedVersion" value={review.version} />
      {restored ? (
        <p role="status" className="rounded-control bg-warning-soft p-3 text-dense">
          {review.restoredLabel}
        </p>
      ) : null}
    </>
  );
}
